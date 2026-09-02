/**
 * GET /api/v1/banks/[cert]/peers
 * Returns peer comparison data for a specific bank against its asset bucket peers.
 *
 * Query params:
 *   metrics  - comma-separated metric names (default: roa,roe,nimy,eeffr,nclnlsr,rbcrwaj)
 *   repdte   - reporting date YYYYMMDD (default: latest available)
 *   format   - 'json' (default) | 'csv'
 *   download - present triggers JSON download with Content-Disposition header
 */

import type { RequestHandler } from './$types';
import { getDB, queryOne, queryAll } from '$lib/server/db';
import { cacheWrap } from '$lib/server/cache';
import { jsonResponse, errorResponse } from '$lib/server/response';
import { encodeCsvRow } from '$lib/server/csv';
import {
  parsePeerMetrics,
  PeerMetricsQueryError,
  shouldCachePeerRequest
} from '$lib/server/peer-query';
import type { PeerComparison, PeerMetricComparison, PeerStats } from '$lib/types';

const PEER_CSV_HEADERS = [
  'metric',
  'bank_value',
  'peer_median',
  'peer_mean',
  'p10',
  'p25',
  'p75',
  'p90',
  'peer_count',
  'percentile'
];

const SIX_HOURS = 21600;
const DATE_RE = /^\d{8}$/;
const MAX_CERT = 9_999_999;

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
): Promise<number | null> {
  if (!/^[a-z_][a-z0-9_]*$/i.test(metric)) throw new Error(`Invalid metric: ${metric}`);
  const bucket = parseInt(peerGroup.split(':')[1], 10);
  const counts = await queryOne<{ total: number; below: number | null; equal: number | null }>(
    db,
    `SELECT COUNT(${metric}) AS total,
            SUM(CASE WHEN ${metric} < ? THEN 1 ELSE 0 END) AS below,
            SUM(CASE WHEN ${metric} = ? THEN 1 ELSE 0 END) AS equal
       FROM published_financials
      WHERE asset_bucket = ? AND repdte = ? AND ${metric} IS NOT NULL`,
    [bankValue, bankValue, bucket, repdte]
  );

  if (!counts || counts.total === 0) return null;

  // Percentile = (count below + 0.5 * count equal) / total * 100. Aggregate
  // inside D1 so a request never materializes an unbounded peer value array.
  return Math.round((((counts.below ?? 0) + 0.5 * (counts.equal ?? 0)) / counts.total) * 100 * 10) / 10;
}

function assetBucketLabel(bucket: number): string {
  return ({
    1: 'Under $100M',
    2: '$100M–$300M',
    3: '$300M–$1B',
    4: '$1B–$10B',
    5: '$10B–$50B',
    6: '$50B–$250B',
    7: 'Over $250B'
  } as Record<number, string>)[bucket] ?? `Asset bucket ${bucket}`;
}

export const GET: RequestHandler = async ({ params, platform, url, locals }) => {
  if (!/^[1-9]\d*$/.test(params.cert)) {
    return errorResponse('cert must be a positive integer', 400);
  }
  const cert = Number(params.cert);
  if (!Number.isSafeInteger(cert) || cert > MAX_CERT) {
    return errorResponse(`cert must not exceed ${MAX_CERT}`, 400);
  }

  let metrics: string[];
  try {
    metrics = parsePeerMetrics(url.searchParams);
  } catch (err) {
    if (err instanceof PeerMetricsQueryError) return errorResponse(err.message, 400);
    throw err;
  }

  // Parse repdte
  const repdteParam = url.searchParams.get('repdte');
  if (repdteParam && !DATE_RE.test(repdteParam)) {
    return errorResponse('repdte must be YYYYMMDD format', 400);
  }

  const db = getDB(platform);
  const kv = platform?.env?.CACHE;
  const cacheKey = `peers:v2:${cert}:${metrics.join(',')}:${repdteParam || 'latest'}`;

  try {
  const loadPeerComparison = async (): Promise<PeerComparison | null> => {
    // Resolve repdte (use latest if not specified)
    let repdte = repdteParam;
    if (!repdte) {
      const latest = await queryOne<{ repdte: string }>(
        db,
        'SELECT repdte FROM published_financials WHERE cert = ? ORDER BY repdte DESC LIMIT 1',
        [cert]
      );
      if (!latest) return null;
      repdte = latest.repdte;
    }

    // Get the bank's own period values and its size cohort for that same period.
    const selectCols = metrics.join(', ');
    const bankRow = await queryOne<Record<string, number | null> & { asset_bucket: number | null }>(
      db,
      `SELECT asset_bucket, ${selectCols} FROM published_financials WHERE cert = ? AND repdte = ?`,
      [cert, repdte]
    );
    if (!bankRow || bankRow.asset_bucket === null) return null;

    const assetBucket = bankRow.asset_bucket;
    const peerGroup = `asset_bucket:${assetBucket}`;
    const cohortCount = await queryOne<{ count: number }>(
      db,
      'SELECT COUNT(*) AS count FROM published_financials WHERE repdte = ? AND asset_bucket = ?',
      [repdte, assetBucket]
    );

    // Get peer_stats for matching peer_group and quarter
    const peerRows = await queryAll<PeerStats>(
      db,
      `SELECT * FROM published_peer_stats WHERE peer_group = ? AND repdte = ? AND metric IN (${metrics.map(() => '?').join(',')})`,
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
        p90: peer?.p90 ?? null,
        peer_count: peer?.count ?? null
      });
    }

    return {
      cert,
      repdte,
      peer_group: peerGroup,
      cohort: {
        basis: 'same_period_asset_bucket',
        asset_bucket: assetBucket,
        label: assetBucketLabel(assetBucket),
        population: 'Institutions reporting in the same FDIC-derived total-asset bucket for this reporting period',
        institution_count: cohortCount?.count ?? 0,
        percentile_method: 'exact_rank'
      },
      metrics: comparisons
    };
  };
  const result = shouldCachePeerRequest(url.searchParams)
    ? await cacheWrap<PeerComparison | null>(kv, cacheKey, SIX_HOURS, loadPeerComparison, locals?.liveDataGeneration)
    : await loadPeerComparison();

  if (!result) {
    return errorResponse('Bank not found or no financial data available', 404);
  }

  const format = url.searchParams.get('format') || 'json';

  if (format === 'csv') {
    const rows = [
      encodeCsvRow(PEER_CSV_HEADERS),
      ...result.metrics.map((m) =>
        encodeCsvRow([
          m.metric,
          m.bank_value,
          m.peer_median,
          m.peer_mean,
          m.p10,
          m.p25,
          m.p75,
          m.p90,
          m.peer_count,
          m.percentile
        ])
      )
    ];
    return new Response(rows.join('\n'), {
      status: 200,
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="peers_${cert}.csv"`,
        'Access-Control-Allow-Origin': '*'
      }
    });
  }

  if (format === 'json' && url.searchParams.has('download')) {
    return new Response(JSON.stringify(result, null, 2), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="peers_${cert}.json"`,
        'Access-Control-Allow-Origin': '*'
      }
    });
  }

  return jsonResponse(result);
  } catch (err) {
    console.error(`Failed to load peers for cert ${cert}:`, err);
    return errorResponse('Failed to load peer comparison data', 500);
  }
};
