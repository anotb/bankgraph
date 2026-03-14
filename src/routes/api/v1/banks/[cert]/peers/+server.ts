/**
 * GET /api/v1/banks/[cert]/peers
 * Returns peer comparison data for a specific bank against its asset bucket peers.
 *
 * Query params:
 *   metrics  - comma-separated metric names (default: roa,roe,nimy,eeffr,nclnlsr,rbcrwaj)
 *   repdte   - reporting date YYYYMMDD (default: latest available)
 */

import type { RequestHandler } from './$types';
import { getDB, queryOne, queryAll } from '$lib/server/db';
import { cacheWrap } from '$lib/server/cache';
import { jsonResponse, errorResponse } from '$lib/server/response';
import type { PeerComparison, PeerMetricComparison, PeerStats } from '$lib/types';

const SIX_HOURS = 21600;
const DEFAULT_METRICS = ['roa', 'roe', 'nimy', 'eeffr', 'nclnlsr', 'rbcrwaj'];
const VALID_METRICS = new Set(['roa', 'roe', 'nimy', 'eeffr', 'nclnlsr', 'rbcrwaj', 'lnlsdepr', 'eqv']);
const DATE_RE = /^\d{8}$/;

/**
 * Calculate a bank's percentile within the peer group for a given metric value.
 * Uses the sorted values from the financials table to determine position.
 */
async function calcPercentile(
  db: D1Database,
  peerGroup: string,
  repdte: string,
  metric: string,
  bankValue: number
): Promise<number> {
  const bucket = parseInt(peerGroup.split(':')[1], 10);
  const rows = await queryAll<Record<string, number>>(
    db,
    `SELECT ${metric} FROM financials WHERE asset_bucket = ? AND repdte = ? AND ${metric} IS NOT NULL ORDER BY ${metric}`,
    [bucket, repdte]
  );

  if (rows.length === 0) return 50; // default if no peers

  const values = rows.map((r) => r[metric]);
  const below = values.filter((v) => v < bankValue).length;
  const equal = values.filter((v) => v === bankValue).length;

  // Percentile = (count below + 0.5 * count equal) / total * 100
  return Math.round(((below + 0.5 * equal) / values.length) * 100 * 10) / 10;
}

export const GET: RequestHandler = async ({ params, platform, url }) => {
  const cert = parseInt(params.cert, 10);
  if (isNaN(cert) || cert < 1) {
    return errorResponse('cert must be a positive integer', 400);
  }

  // Parse metrics
  const metricsRaw = url.searchParams.get('metrics');
  let metrics = DEFAULT_METRICS;
  if (metricsRaw) {
    metrics = metricsRaw.split(',').map((m) => m.trim()).filter(Boolean);
    const invalid = metrics.filter((m) => !VALID_METRICS.has(m));
    if (invalid.length > 0) {
      return errorResponse(`Invalid metrics: ${invalid.join(', ')}`, 400);
    }
    if (metrics.length === 0) {
      return errorResponse('metrics parameter must not be empty', 400);
    }
  }

  // Parse repdte
  const repdteParam = url.searchParams.get('repdte');
  if (repdteParam && !DATE_RE.test(repdteParam)) {
    return errorResponse('repdte must be YYYYMMDD format', 400);
  }

  const db = getDB(platform);
  const kv = platform?.env?.CACHE;
  const cacheKey = `peers:${cert}:${metrics.join(',')}:${repdteParam || 'latest'}`;

  try {
  const result = await cacheWrap<PeerComparison | null>(kv, cacheKey, SIX_HOURS, async () => {
    // Get the bank's asset_bucket
    const institution = await queryOne<{ asset_tier: number | null }>(
      db,
      'SELECT asset_tier FROM institutions WHERE cert = ?',
      [cert]
    );

    if (!institution || institution.asset_tier === null) return null;

    const peerGroup = `asset_bucket:${institution.asset_tier}`;

    // Resolve repdte (use latest if not specified)
    let repdte = repdteParam;
    if (!repdte) {
      const latest = await queryOne<{ repdte: string }>(
        db,
        'SELECT repdte FROM financials WHERE cert = ? ORDER BY repdte DESC LIMIT 1',
        [cert]
      );
      if (!latest) return null;
      repdte = latest.repdte;
    }

    // Get the bank's own metric values
    const selectCols = metrics.join(', ');
    const bankRow = await queryOne<Record<string, number | null>>(
      db,
      `SELECT ${selectCols} FROM financials WHERE cert = ? AND repdte = ?`,
      [cert, repdte]
    );

    // Get peer_stats for matching peer_group and quarter
    const peerRows = await queryAll<PeerStats>(
      db,
      `SELECT * FROM peer_stats WHERE peer_group = ? AND repdte = ? AND metric IN (${metrics.map(() => '?').join(',')})`,
      [peerGroup, repdte, ...metrics]
    );

    const peerMap = new Map<string, PeerStats>();
    for (const row of peerRows) {
      peerMap.set(row.metric, row);
    }

    // Build comparison for each metric
    const comparisons: PeerMetricComparison[] = [];
    for (const metric of metrics) {
      const bankValue = bankRow?.[metric] ?? null;
      const peer = peerMap.get(metric);

      let pctile: number | null = null;
      if (bankValue !== null && peer) {
        pctile = await calcPercentile(db, peerGroup, repdte, metric, bankValue);
      }

      comparisons.push({
        metric,
        bank_value: bankValue,
        peer_median: peer?.median ?? null,
        peer_mean: peer?.mean ?? null,
        percentile: pctile,
        p10: peer?.p10 ?? null,
        p25: peer?.p25 ?? null,
        p75: peer?.p75 ?? null,
        p90: peer?.p90 ?? null
      });
    }

    return {
      cert,
      repdte,
      peer_group: peerGroup,
      metrics: comparisons
    };
  });

  if (!result) {
    return errorResponse('Bank not found or no financial data available', 404);
  }

  return jsonResponse(result);
  } catch (err) {
    console.error(`Failed to load peers for cert ${cert}:`, err);
    return errorResponse('Failed to load peer comparison data', 500);
  }
};
