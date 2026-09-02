/**
 * Analytical financial-risk proxy scoring for banks.
 * Computes scores for Capital, Asset Quality, Earnings, and Liquidity
 * based on disclosed reference thresholds, peer percentiles, and trend data.
 */

import { queryAll, batchInsert } from '$lib/server/db';
import type { CapitalAdequacyCategory } from '$lib/types';
import { MIN_RISK_COMPOSITE_COMPONENTS } from './analysis-methodology';

const BANK_BATCH_SIZE = 80; // D1 limits ~100 SQL variables; trend query uses cert IN(...) + 1
const RISK_PEER_METRICS = ['nclnlsr', 'roa', 'lnlsdepr'] as const;
type RiskPeerMetric = (typeof RISK_PEER_METRICS)[number];
type PeerDistributions = Map<string, number[]>;
interface RiskScoringRow {
  cert: number;
  asset_bucket: number | null;
  rbcrwaj: number | null;
  rbc1rwaj: number | null;
  rbc1aaj: number | null;
  nclnlsr: number | null;
  roa: number | null;
  lnlsdepr: number | null;
}

// --- Deterministic capital-ratio threshold screen ---

export interface CapitalRatioInput {
  rbcrwaj: number | null;
  rbc1rwaj: number | null;
  rbc1aaj: number | null;
}

/**
 * Screen the three reported capital ratios against fixed reference thresholds.
 * This is not an official Prompt Corrective Action classification: the source
 * data do not establish institution-specific framework applicability,
 * supervisory restrictions, CET1/SLR/CBLR status, or tangible equity.
 */
export function screenCapitalRatios(data: CapitalRatioInput): CapitalAdequacyCategory {
  // Treat 0 as unreported (many institutions don't report risk-weighted ratios)
  const rbcrwaj = data.rbcrwaj && data.rbcrwaj > 0 ? data.rbcrwaj : null;
  const rbc1rwaj = data.rbc1rwaj && data.rbc1rwaj > 0 ? data.rbc1rwaj : null;
  const rbc1aaj = data.rbc1aaj && data.rbc1aaj > 0 ? data.rbc1aaj : null;

  // No screen result without a reported ratio.
  if (rbcrwaj == null && rbc1rwaj == null && rbc1aaj == null) {
    return 'unclassified';
  }

  // Materially below a minimum reference threshold.
  if (
    (rbcrwaj != null && rbcrwaj < 6) ||
    (rbc1rwaj != null && rbc1rwaj < 4) ||
    (rbc1aaj != null && rbc1aaj < 3)
  ) {
    return 'significantly_undercapitalized';
  }

  // Below a minimum reference threshold.
  if (
    (rbcrwaj != null && rbcrwaj < 8) ||
    (rbc1rwaj != null && rbc1rwaj < 6) ||
    (rbc1aaj != null && rbc1aaj < 4)
  ) {
    return 'undercapitalized';
  }

  // Meets minimum references but not every upper reference.
  if (
    (rbcrwaj != null && rbcrwaj < 10) ||
    (rbc1rwaj != null && rbc1rwaj < 8) ||
    (rbc1aaj != null && rbc1aaj < 5)
  ) {
    return 'adequately_capitalized';
  }

  return 'well_capitalized';
}

/** @deprecated Use screenCapitalRatios; retained for internal compatibility. */
export const classifyPCA = screenCapitalRatios;

// --- Capital Score (0-100) ---

export function computeCapitalScore(data: CapitalRatioInput): number | null {
  const category = screenCapitalRatios(data);
  const rbcrwaj = data.rbcrwaj && data.rbcrwaj > 0 ? data.rbcrwaj : null;
  const rbc1rwaj = data.rbc1rwaj && data.rbc1rwaj > 0 ? data.rbc1rwaj : null;
  const rbc1aaj = data.rbc1aaj && data.rbc1aaj > 0 ? data.rbc1aaj : null;

  if (category === 'unclassified') return null;
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

export interface CompositeRiskScores {
  capital: number | null;
  assetQuality: number | null;
  earnings: number | null;
  liquidity: number | null;
}

/** Weighted average when at least three dimensions are classified. */
export function computeCompositeScore(scores: CompositeRiskScores): number | null {
  const dimensions = [
    { score: scores.capital, weight: 0.30 },
    { score: scores.assetQuality, weight: 0.25 },
    { score: scores.earnings, weight: 0.25 },
    { score: scores.liquidity, weight: 0.20 }
  ];
  const available = dimensions.filter(
    (dimension): dimension is { score: number; weight: number } => dimension.score != null
  );
  const availableWeight = available.reduce((sum, dimension) => sum + dimension.weight, 0);

  if (available.length < MIN_RISK_COMPOSITE_COMPONENTS) return null;
  return available.reduce(
    (sum, dimension) => sum + dimension.score * dimension.weight,
    0
  ) / availableWeight;
}

// --- Asset Quality Score (0-100) ---
// Based on NPL ratio peer percentile (inverted: low NPL = high score)

export function computeAssetQualityScore(nclnlsrPercentile: number | null): number | null {
  if (nclnlsrPercentile == null) return null;

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

export function computeEarningsScore(
  roaPercentile: number | null,
  roaTrendSlope: number | null
): number | null {
  if (roaPercentile == null) return null;

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

export function computeLiquidityScore(lnlsdeprPercentile: number | null): number | null {
  if (lnlsdeprPercentile == null) return null;

  // Invert: high LTD percentile = lower score (less liquid)
  return Math.min(100, Math.max(0, 100 - lnlsdeprPercentile));
}

// --- Main Entry Point ---

/**
 * Compute risk scores for all banks for a given quarter.
 * Requires bank_trends to be computed first.
 * Returns total rows inserted.
 */
export async function computeRiskScores(db: D1Database, repdte: string): Promise<number> {
  let totalInserted = 0;
  let offset = 0;

  // Read the quarter once, then rank each reported value against its exact
  // same-quarter asset cohort. This avoids distribution assumptions and keeps
  // D1 reads bounded to one narrow pass over the quarter.
  const quarterRows = await queryAll<RiskScoringRow>(
    db,
    `SELECT cert, asset_bucket, rbcrwaj, rbc1rwaj, rbc1aaj, nclnlsr, roa, lnlsdepr
       FROM financials
      WHERE repdte = ?
      ORDER BY cert`,
    [repdte]
  );

  const peerDistributions: PeerDistributions = new Map();
  for (const row of quarterRows) {
    if (row.asset_bucket == null) continue;
    for (const metric of RISK_PEER_METRICS) {
      const value = row[metric];
      if (value == null || !Number.isFinite(value)) continue;
      const key = `asset_bucket:${row.asset_bucket}:${metric}`;
      const values = peerDistributions.get(key) ?? [];
      values.push(value);
      peerDistributions.set(key, values);
    }
  }
  for (const values of peerDistributions.values()) {
    values.sort((a, b) => a - b);
  }

  while (true) {
    const banks = quarterRows.slice(offset, offset + BANK_BATCH_SIZE);

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

      const nclnlsrPercentile = computePeerPercentile(
        bank.nclnlsr, peerGroup, 'nclnlsr', peerDistributions
      );
      const roaPercentile = computePeerPercentile(
        bank.roa, peerGroup, 'roa', peerDistributions
      );
      const lnlsdeprPercentile = computePeerPercentile(
        bank.lnlsdepr, peerGroup, 'lnlsdepr', peerDistributions
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

      const compositeScore = computeCompositeScore({
        capital: capitalScore,
        assetQuality: assetQualityScore,
        earnings: earningsScore,
        liquidity: liquidityScore
      });

      const capitalRatioScreen = screenCapitalRatios({
        rbcrwaj: bank.rbcrwaj,
        rbc1rwaj: bank.rbc1rwaj,
        rbc1aaj: bank.rbc1aaj
      });

      scoreRows.push({
        cert: bank.cert,
        repdte,
        capital_score: capitalScore == null ? null : Math.round(capitalScore * 100) / 100,
        asset_quality_score: assetQualityScore == null ? null : Math.round(assetQualityScore * 100) / 100,
        earnings_score: earningsScore == null ? null : Math.round(earningsScore * 100) / 100,
        liquidity_score: liquidityScore == null ? null : Math.round(liquidityScore * 100) / 100,
        composite_score: compositeScore == null ? null : Math.round(compositeScore * 100) / 100,
        // Legacy storage column; values represent the ratio screen above.
        pca_category: capitalRatioScreen
      });
    }

    if (scoreRows.length > 0) {
      await batchInsert(db, 'risk_scores', scoreRows, ['cert', 'repdte']);
      totalInserted += scoreRows.length;
    }

    offset += BANK_BATCH_SIZE;
    if (banks.length < BANK_BATCH_SIZE) break;
  }

  return totalInserted;
}

/**
 * Return an exact empirical percentile from a sorted cohort. Tied values share
 * the midpoint of their occupied positions: (below + 0.5 * equal) / N.
 */
export function computeEmpiricalPercentile(
  value: number | null,
  sortedValues: readonly number[] | null | undefined
): number | null {
  if (value == null || !Number.isFinite(value) || !sortedValues || sortedValues.length < 2) {
    return null;
  }

  let lowerStart = 0;
  let lowerEnd = sortedValues.length;
  while (lowerStart < lowerEnd) {
    const middle = Math.floor((lowerStart + lowerEnd) / 2);
    if (sortedValues[middle] < value) lowerStart = middle + 1;
    else lowerEnd = middle;
  }

  let upperStart = lowerStart;
  let upperEnd = sortedValues.length;
  while (upperStart < upperEnd) {
    const middle = Math.floor((upperStart + upperEnd) / 2);
    if (sortedValues[middle] <= value) upperStart = middle + 1;
    else upperEnd = middle;
  }

  const below = lowerStart;
  const equal = upperStart - lowerStart;
  return ((below + 0.5 * equal) / sortedValues.length) * 100;
}

function computePeerPercentile(
  value: number | null,
  peerGroup: string | null,
  metric: RiskPeerMetric,
  distributions: PeerDistributions
): number | null {
  if (peerGroup == null) return null;
  return computeEmpiricalPercentile(value, distributions.get(`${peerGroup}:${metric}`));
}
