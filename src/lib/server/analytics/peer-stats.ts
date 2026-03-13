/**
 * Compute peer group statistics for each asset bucket and key metric.
 * Results are written to the peer_stats table.
 */

import { queryAll, execute } from '$lib/server/db';

const METRICS = ['roa', 'roe', 'nimy', 'eeffr', 'nclnlsr', 'rbcrwaj', 'lnlsdepr', 'eqv'] as const;
const BUCKETS = [1, 2, 3, 4, 5, 6, 7] as const;

/** Compute interpolated percentile from a sorted array of numbers. */
export function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  if (sorted.length === 1) return sorted[0];

  const rank = (p / 100) * (sorted.length - 1);
  const lower = Math.floor(rank);
  const upper = Math.ceil(rank);
  const frac = rank - lower;

  if (lower === upper) return sorted[lower];
  return sorted[lower] + frac * (sorted[upper] - sorted[lower]);
}

export function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

export function stddev(values: number[], avg: number): number {
  if (values.length < 2) return 0;
  const sumSqDiff = values.reduce((sum, v) => sum + (v - avg) ** 2, 0);
  return Math.sqrt(sumSqDiff / (values.length - 1));
}

export function median(sorted: number[]): number {
  if (sorted.length === 0) return 0;
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid];
  return (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Compute peer stats for all buckets and metrics for a given quarter.
 * Processes one bucket+metric at a time to manage memory.
 * Returns total rows inserted.
 */
export async function computePeerStats(db: D1Database, repdte: string): Promise<number> {
  let totalInserted = 0;

  for (const bucket of BUCKETS) {
    for (const metric of METRICS) {
      const rows = await queryAll<Record<string, number>>(
        db,
        `SELECT ${metric} FROM financials WHERE asset_bucket = ? AND repdte = ? AND ${metric} IS NOT NULL ORDER BY ${metric}`,
        [bucket, repdte]
      );

      const values = rows.map((r) => r[metric]);
      if (values.length === 0) continue;

      const avg = mean(values);
      const peerGroup = `asset_bucket:${bucket}`;

      await execute(
        db,
        `INSERT OR REPLACE INTO peer_stats (peer_group, repdte, metric, count, mean, median, stddev, p10, p25, p75, p90, min_val, max_val)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          peerGroup,
          repdte,
          metric,
          values.length,
          avg,
          median(values),
          stddev(values, avg),
          percentile(values, 10),
          percentile(values, 25),
          percentile(values, 75),
          percentile(values, 90),
          values[0],
          values[values.length - 1]
        ]
      );

      totalInserted++;
    }
  }

  return totalInserted;
}
