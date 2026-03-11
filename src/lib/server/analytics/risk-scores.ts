/**
 * CAMELS-proxy risk scoring for banks.
 * Computes scores for Capital, Asset Quality, Earnings, and Liquidity
 * based on regulatory thresholds, peer percentiles, and trend data.
 */

import { queryAll, batchInsert } from '$lib/server/db';

const BANK_BATCH_SIZE = 200;

// --- PCA Classification ---

interface PCAInput {
  rbcrwaj: number | null;
  rbc1rwaj: number | null;
  rbc1aaj: number | null;
}

type PCACategory =
  | 'well_capitalized'
  | 'adequately_capitalized'
  | 'undercapitalized'
  | 'significantly_undercapitalized'
  | 'critically_undercapitalized';

function classifyPCA(data: PCAInput): PCACategory {
  const { rbcrwaj, rbc1rwaj, rbc1aaj } = data;

  // Can't classify without data
  if (rbcrwaj == null && rbc1rwaj == null && rbc1aaj == null) {
    return 'well_capitalized'; // Default assumption if no data
  }

  // Critically undercapitalized: tangible equity/assets <= 2%
  // We approximate with leverage ratio
  if (rbc1aaj != null && rbc1aaj <= 2) return 'critically_undercapitalized';

  // Significantly undercapitalized: any ratio below undercapitalized threshold by more
  if (
    (rbcrwaj != null && rbcrwaj < 6) ||
    (rbc1rwaj != null && rbc1rwaj < 4) ||
    (rbc1aaj != null && rbc1aaj < 3)
  ) {
    return 'significantly_undercapitalized';
  }

  // Undercapitalized: below adequately capitalized
  if (
    (rbcrwaj != null && rbcrwaj < 8) ||
    (rbc1rwaj != null && rbc1rwaj < 6) ||
    (rbc1aaj != null && rbc1aaj < 4)
  ) {
    return 'undercapitalized';
  }

  // Adequately capitalized: meets minimums but not well-capitalized
  if (
    (rbcrwaj != null && rbcrwaj < 10) ||
    (rbc1rwaj != null && rbc1rwaj < 8) ||
    (rbc1aaj != null && rbc1aaj < 5)
  ) {
    return 'adequately_capitalized';
  }

  return 'well_capitalized';
}

// --- Capital Score (0-100) ---

function computeCapitalScore(data: PCAInput): number {
  const category = classifyPCA(data);
  const { rbcrwaj, rbc1rwaj, rbc1aaj } = data;

  if (category === 'critically_undercapitalized') return 5;
  if (category === 'significantly_undercapitalized') return 15;
  if (category === 'undercapitalized') return 30;

  if (category === 'adequately_capitalized') {
    // Score 40-60 based on how close to well-capitalized
    let avgBuffer = 0;
    let count = 0;
    if (rbcrwaj != null) { avgBuffer += rbcrwaj - 8; count++; }
    if (rbc1rwaj != null) { avgBuffer += rbc1rwaj - 6; count++; }
    if (rbc1aaj != null) { avgBuffer += rbc1aaj - 4; count++; }
    if (count > 0) avgBuffer /= count;
    // Buffer of 0 = score 40, buffer of 2 = score 60
    return Math.min(60, Math.max(40, 40 + avgBuffer * 10));
  }

  // Well-capitalized: score 60-100 based on buffer above thresholds
  let avgBuffer = 0;
  let count = 0;
  if (rbcrwaj != null) { avgBuffer += rbcrwaj - 10; count++; }
  if (rbc1rwaj != null) { avgBuffer += rbc1rwaj - 8; count++; }
  if (rbc1aaj != null) { avgBuffer += rbc1aaj - 5; count++; }
  if (count > 0) avgBuffer /= count;

  // Buffer of 0 = score 60, buffer of 2 = score 80, buffer of 5+ = score 100
  if (avgBuffer >= 2) {
    return Math.min(100, 80 + (avgBuffer - 2) * (20 / 3));
  }
  return Math.min(80, Math.max(60, 60 + avgBuffer * 10));
}

// --- Asset Quality Score (0-100) ---
// Based on NPL ratio peer percentile (inverted: low NPL = high score)

function computeAssetQualityScore(nclnlsrPercentile: number | null): number {
  if (nclnlsrPercentile == null) return 50; // default

  // Invert: high percentile (high NPL, bad) = low score
  if (nclnlsrPercentile > 75) {
    // 75-100th percentile -> score 0-25
    return Math.max(0, 25 - ((nclnlsrPercentile - 75) / 25) * 25);
  }
  if (nclnlsrPercentile > 50) {
    // 50-75th percentile -> score 25-50
    return 25 + ((75 - nclnlsrPercentile) / 25) * 25;
  }
  if (nclnlsrPercentile > 25) {
    // 25-50th percentile -> score 50-75
    return 50 + ((50 - nclnlsrPercentile) / 25) * 25;
  }
  // 0-25th percentile (low NPL, good) -> score 75-100
  return 75 + ((25 - nclnlsrPercentile) / 25) * 25;
}

// --- Earnings Score (0-100) ---
// Based on ROA peer percentile, with trend penalty

function computeEarningsScore(
  roaPercentile: number | null,
  roaTrendSlope: number | null
): number {
  if (roaPercentile == null) return 50;

  // Base score directly from percentile
  let score = roaPercentile;

  // Penalty for declining trend
  if (roaTrendSlope != null && roaTrendSlope < 0) {
    // Penalty proportional to slope magnitude, max 15 points
    const penalty = Math.min(15, Math.abs(roaTrendSlope) * 50);
    score = Math.max(0, score - penalty);
  }

  return Math.min(100, Math.max(0, score));
}

// --- Liquidity Score (0-100) ---
// Based on loan-to-deposit ratio peer percentile (inverted: high LTD = lower score)

function computeLiquidityScore(lnlsdeprPercentile: number | null): number {
  if (lnlsdeprPercentile == null) return 50;

  // Invert: high LTD percentile = lower score (less liquid)
  return Math.min(100, Math.max(0, 100 - lnlsdeprPercentile));
}

// --- Main Entry Point ---

/**
 * Compute risk scores for all banks for a given quarter.
 * Requires peer_stats and bank_trends to be computed first.
 * Returns total rows inserted.
 */
export async function computeRiskScores(db: D1Database, repdte: string): Promise<number> {
  let totalInserted = 0;
  let offset = 0;

  // Pre-load peer stats for percentile computation
  // We need nclnlsr, roa, lnlsdepr stats per peer group
  const peerStatsRows = await queryAll<{
    peer_group: string;
    metric: string;
    mean: number;
    stddev: number;
    p25: number;
    p75: number;
    min_val: number;
    max_val: number;
    count: number;
  }>(
    db,
    `SELECT peer_group, metric, mean, stddev, p25, p75, min_val, max_val, count
     FROM peer_stats
     WHERE repdte = ? AND metric IN ('nclnlsr', 'roa', 'lnlsdepr')`,
    [repdte]
  );

  const peerMap = new Map<string, { mean: number; stddev: number; count: number }>();
  for (const ps of peerStatsRows) {
    peerMap.set(`${ps.peer_group}:${ps.metric}`, {
      mean: ps.mean,
      stddev: ps.stddev,
      count: ps.count
    });
  }

  while (true) {
    // Get banks with financial data for this quarter
    const banks = await queryAll<{
      cert: number;
      asset_bucket: number | null;
      rbcrwaj: number | null;
      rbc1rwaj: number | null;
      rbc1aaj: number | null;
      nclnlsr: number | null;
      roa: number | null;
      lnlsdepr: number | null;
    }>(
      db,
      `SELECT cert, asset_bucket, rbcrwaj, rbc1rwaj, rbc1aaj, nclnlsr, roa, lnlsdepr
       FROM financials WHERE repdte = ?
       ORDER BY cert LIMIT ? OFFSET ?`,
      [repdte, BANK_BATCH_SIZE, offset]
    );

    if (banks.length === 0) break;

    // Batch-fetch trend slopes for ROA for these banks
    const certs = banks.map((b) => b.cert);
    const trendRows = await queryAll<{
      cert: number;
      trend_slope: number | null;
    }>(
      db,
      `SELECT cert, trend_slope FROM bank_trends
       WHERE repdte = ? AND metric = 'roa' AND cert IN (${certs.map(() => '?').join(',')})`,
      [repdte, ...certs]
    );

    const trendMap = new Map<number, number | null>();
    for (const tr of trendRows) {
      trendMap.set(tr.cert, tr.trend_slope);
    }

    const scoreRows: Record<string, unknown>[] = [];

    for (const bank of banks) {
      const peerGroup = bank.asset_bucket != null ? `asset_bucket:${bank.asset_bucket}` : null;

      // Compute peer percentiles using z-score approximation
      const nclnlsrPercentile = computePercentileFromPeer(
        bank.nclnlsr, peerGroup, 'nclnlsr', peerMap
      );
      const roaPercentile = computePercentileFromPeer(
        bank.roa, peerGroup, 'roa', peerMap
      );
      const lnlsdeprPercentile = computePercentileFromPeer(
        bank.lnlsdepr, peerGroup, 'lnlsdepr', peerMap
      );

      const roaTrendSlope = trendMap.get(bank.cert) ?? null;

      const capitalScore = computeCapitalScore({
        rbcrwaj: bank.rbcrwaj,
        rbc1rwaj: bank.rbc1rwaj,
        rbc1aaj: bank.rbc1aaj
      });

      const assetQualityScore = computeAssetQualityScore(nclnlsrPercentile);
      const earningsScore = computeEarningsScore(roaPercentile, roaTrendSlope);
      const liquidityScore = computeLiquidityScore(lnlsdeprPercentile);

      // Weighted composite: Capital 30%, Asset Quality 25%, Earnings 25%, Liquidity 20%
      const compositeScore =
        capitalScore * 0.30 +
        assetQualityScore * 0.25 +
        earningsScore * 0.25 +
        liquidityScore * 0.20;

      const pcaCategory = classifyPCA({
        rbcrwaj: bank.rbcrwaj,
        rbc1rwaj: bank.rbc1rwaj,
        rbc1aaj: bank.rbc1aaj
      });

      scoreRows.push({
        cert: bank.cert,
        repdte,
        capital_score: Math.round(capitalScore * 100) / 100,
        asset_quality_score: Math.round(assetQualityScore * 100) / 100,
        earnings_score: Math.round(earningsScore * 100) / 100,
        liquidity_score: Math.round(liquidityScore * 100) / 100,
        composite_score: Math.round(compositeScore * 100) / 100,
        pca_category: pcaCategory
      });
    }

    if (scoreRows.length > 0) {
      await batchInsert(db, 'risk_scores', scoreRows);
      totalInserted += scoreRows.length;
    }

    offset += BANK_BATCH_SIZE;
    if (banks.length < BANK_BATCH_SIZE) break;
  }

  return totalInserted;
}

/**
 * Approximate a value's percentile within its peer group using z-score
 * and normal CDF approximation. Returns 0-100.
 */
function computePercentileFromPeer(
  value: number | null,
  peerGroup: string | null,
  metric: string,
  peerMap: Map<string, { mean: number; stddev: number; count: number }>
): number | null {
  if (value == null || peerGroup == null) return null;

  const stats = peerMap.get(`${peerGroup}:${metric}`);
  if (!stats || stats.stddev === 0) return 50;

  const z = (value - stats.mean) / stats.stddev;

  // Normal CDF approximation (Abramowitz and Stegun)
  return normalCDF(z) * 100;
}

/** Approximate standard normal CDF using rational approximation. */
function normalCDF(z: number): number {
  if (z < -6) return 0;
  if (z > 6) return 1;

  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;

  const sign = z < 0 ? -1 : 1;
  const x = Math.abs(z) / Math.sqrt(2);
  const t = 1 / (1 + p * x);
  const t2 = t * t;
  const t3 = t2 * t;
  const t4 = t3 * t;
  const t5 = t4 * t;
  const y = 1 - (a1 * t + a2 * t2 + a3 * t3 + a4 * t4 + a5 * t5) * Math.exp(-x * x);

  return 0.5 * (1 + sign * y);
}
