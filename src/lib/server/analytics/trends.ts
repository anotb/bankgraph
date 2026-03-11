/**
 * Compute trend analytics for bank financial metrics.
 * Calculates moving averages, period-over-period changes, and linear regression
 * on 8-quarter rolling windows.
 */

import { queryAll, batchInsert } from '$lib/server/db';

const METRICS = ['roa', 'roe', 'nimy', 'eeffr', 'nclnlsr', 'rbcrwaj', 'lnlsdepr', 'eqv'] as const;
const BANK_BATCH_SIZE = 200;

interface RegressionResult {
  slope: number;
  intercept: number;
  r_squared: number;
}

/** Ordinary least squares linear regression. Pure JS, no dependencies. */
export function linearRegression(points: { x: number; y: number }[]): RegressionResult {
  const n = points.length;
  if (n < 2) return { slope: 0, intercept: 0, r_squared: 0 };

  let sumX = 0;
  let sumY = 0;
  let sumXY = 0;
  let sumX2 = 0;
  let sumY2 = 0;

  for (const { x, y } of points) {
    sumX += x;
    sumY += y;
    sumXY += x * y;
    sumX2 += x * x;
    sumY2 += y * y;
  }

  const denom = n * sumX2 - sumX * sumX;
  if (denom === 0) return { slope: 0, intercept: sumY / n, r_squared: 0 };

  const slope = (n * sumXY - sumX * sumY) / denom;
  const intercept = (sumY - slope * sumX) / n;

  // R-squared
  const yMean = sumY / n;
  let ssTot = 0;
  let ssRes = 0;
  for (const { x, y } of points) {
    ssTot += (y - yMean) ** 2;
    const predicted = slope * x + intercept;
    ssRes += (y - predicted) ** 2;
  }

  const r_squared = ssTot === 0 ? 0 : 1 - ssRes / ssTot;

  return { slope, intercept, r_squared };
}

/**
 * Compute trends for a single bank for a given quarter.
 * Fetches up to 8 quarters of history and computes all trend metrics.
 * Returns the trend rows to insert.
 */
export async function computeTrendsForBank(
  db: D1Database,
  cert: number,
  repdte: string
): Promise<Record<string, unknown>[]> {
  // Fetch last 8 quarters of data for this bank (including the target quarter)
  const history = await queryAll<Record<string, unknown>>(
    db,
    `SELECT repdte, asset_bucket, ${METRICS.join(', ')}
     FROM financials
     WHERE cert = ? AND repdte <= ?
     ORDER BY repdte DESC
     LIMIT 8`,
    [cert, repdte]
  );

  if (history.length === 0) return [];

  // Reverse so index 0 is oldest
  history.reverse();

  const current = history[history.length - 1];
  const peerGroup = current.asset_bucket != null ? `asset_bucket:${current.asset_bucket}` : null;

  const trendRows: Record<string, unknown>[] = [];

  for (const metric of METRICS) {
    const currentVal = current[metric] as number | null;
    if (currentVal === null || currentVal === undefined) continue;

    // Values in chronological order (oldest first)
    const values = history
      .map((row) => row[metric] as number | null)
      .filter((v): v is number => v !== null && v !== undefined);

    if (values.length === 0) continue;

    // MA-4Q: average of last 4 quarters
    const last4 = values.slice(-4);
    const ma_4q = last4.length > 0 ? last4.reduce((s, v) => s + v, 0) / last4.length : null;

    // MA-8Q: average of all available (up to 8)
    const ma_8q = values.length > 0 ? values.reduce((s, v) => s + v, 0) / values.length : null;

    // QoQ change: current minus previous quarter
    let qoq_change: number | null = null;
    if (values.length >= 2) {
      qoq_change = values[values.length - 1] - values[values.length - 2];
    }

    // YoY change: current minus same quarter last year (4 quarters ago)
    let yoy_change: number | null = null;
    if (values.length >= 5) {
      yoy_change = values[values.length - 1] - values[values.length - 5];
    }

    // Linear regression on all available points
    const points = values.map((y, i) => ({ x: i, y }));
    const reg = linearRegression(points);

    trendRows.push({
      cert,
      metric,
      repdte,
      ma_4q: ma_4q !== null ? Math.round(ma_4q * 10000) / 10000 : null,
      ma_8q: ma_8q !== null ? Math.round(ma_8q * 10000) / 10000 : null,
      qoq_change: qoq_change !== null ? Math.round(qoq_change * 10000) / 10000 : null,
      yoy_change: yoy_change !== null ? Math.round(yoy_change * 10000) / 10000 : null,
      trend_slope: Math.round(reg.slope * 10000) / 10000,
      trend_r_squared: Math.round(reg.r_squared * 10000) / 10000,
      peer_group: peerGroup,
      peer_percentile: null // Computed separately if needed
    });
  }

  return trendRows;
}

/**
 * Compute trends for all banks for a given quarter.
 * Processes in batches of 200 banks. Returns total rows inserted.
 */
export async function computeAllTrends(db: D1Database, repdte: string): Promise<number> {
  let totalInserted = 0;
  let offset = 0;

  while (true) {
    const banks = await queryAll<{ cert: number }>(
      db,
      'SELECT cert FROM institutions WHERE active = 1 ORDER BY cert LIMIT ? OFFSET ?',
      [BANK_BATCH_SIZE, offset]
    );

    if (banks.length === 0) break;

    const allRows: Record<string, unknown>[] = [];

    for (const { cert } of banks) {
      const rows = await computeTrendsForBank(db, cert, repdte);
      allRows.push(...rows);
    }

    if (allRows.length > 0) {
      await batchInsert(db, 'bank_trends', allRows);
      totalInserted += allRows.length;
    }

    offset += BANK_BATCH_SIZE;
    if (banks.length < BANK_BATCH_SIZE) break;
  }

  return totalInserted;
}
