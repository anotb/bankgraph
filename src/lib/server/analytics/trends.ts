/**
 * Compute trend analytics for bank financial metrics.
 * Calculates moving averages, period-over-period changes, and linear regression
 * on 8-quarter rolling windows.
 */

import { bulkUpsert, execute, queryAll, queryOne } from '$lib/server/db';
import { fdicQuarterIndex } from '$lib/utils/fdic-quarter';

const METRICS = ['roa', 'roe', 'nimy', 'eeffr', 'nclnlsr', 'rbcrwaj', 'lnlsdepr', 'eqv'] as const;
export const TREND_BANK_BATCH_SIZE = 80;
export const TREND_MAX_BATCHES_PER_REQUEST = 5;
const TREND_STATE_KEY = 'trends_sync_state';

interface TrendHistoryRow extends Record<string, unknown> {
  cert: number;
  repdte: string | null;
  asset_bucket: number | null;
}

interface TrendSyncState {
  runId: string;
  repdte: string;
  status: 'running' | 'complete';
  cursor: number;
  banksProcessed: number;
  rowsInserted: number;
}

export interface TrendSyncOptions {
  runId?: string;
  maxBatches?: number;
}

export interface TrendSyncResult {
  repdte: string;
  processed: number;
  rows_inserted: number;
  done: boolean;
  cursor: number;
}

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

/** Build all metric rows from an already-loaded bank history. */
export function buildTrendRowsForHistory(
  cert: number,
  repdte: string,
  sourceHistory: TrendHistoryRow[]
): Record<string, unknown>[] {
  const requestedQuarter = fdicQuarterIndex(repdte);
  if (sourceHistory.length === 0 || requestedQuarter === null) return [];

  const history = sourceHistory
    .map((row) => ({ row, quarter: fdicQuarterIndex(row.repdte) }))
    .filter((entry): entry is { row: TrendHistoryRow & { repdte: string }; quarter: number } =>
      entry.quarter !== null && entry.quarter <= requestedQuarter
    )
    .sort((a, b) => a.quarter - b.quarter);
  if (history.length === 0) return [];

  const current = history[history.length - 1];
  const peerGroup = current.row.asset_bucket != null ? `asset_bucket:${current.row.asset_bucket}` : null;
  const trendRows: Record<string, unknown>[] = [];

  for (const metric of METRICS) {
    const currentVal = current.row[metric] as number | null;
    if (typeof currentVal !== 'number' || !Number.isFinite(currentVal)) continue;

    const observations = history
      .map(({ row, quarter }) => ({ quarter, value: row[metric] }))
      .filter((entry): entry is { quarter: number; value: number } =>
        typeof entry.value === 'number' && Number.isFinite(entry.value)
      );
    const byQuarter = new Map(observations.map((entry) => [entry.quarter, entry.value]));
    const completeAverage = (quarterCount: number): number | null => {
      const values = Array.from(
        { length: quarterCount },
        (_, offset) => byQuarter.get(current.quarter - offset)
      );
      return values.every((value): value is number => value !== undefined)
        ? values.reduce((sum, value) => sum + value, 0) / quarterCount
        : null;
    };

    const previousQuarter = byQuarter.get(current.quarter - 1);
    const yearAgoQuarter = byQuarter.get(current.quarter - 4);
    const qoqChange = previousQuarter === undefined ? null : currentVal - previousQuarter;
    const yoyChange = yearAgoQuarter === undefined ? null : currentVal - yearAgoQuarter;
    const ma4q = completeAverage(4);
    const ma8q = completeAverage(8);
    const regressionPoints = observations
      .filter(({ quarter }) => quarter >= current.quarter - 7)
      .map(({ quarter, value }) => ({ x: quarter - current.quarter, y: value }));
    const regression = regressionPoints.length >= 2 ? linearRegression(regressionPoints) : null;

    trendRows.push({
      cert,
      metric,
      // A bank that has not filed for the requested release keeps the date of
      // its actual latest observation. The release writer filters these rows
      // instead of relabeling stale data as the requested quarter.
      repdte: current.row.repdte,
      ma_4q: ma4q !== null ? Math.round(ma4q * 10000) / 10000 : null,
      ma_8q: ma8q !== null ? Math.round(ma8q * 10000) / 10000 : null,
      qoq_change: qoqChange !== null ? Math.round(qoqChange * 10000) / 10000 : null,
      yoy_change: yoyChange !== null ? Math.round(yoyChange * 10000) / 10000 : null,
      trend_slope: regression !== null ? Math.round(regression.slope * 10000) / 10000 : null,
      trend_r_squared: regression !== null ? Math.round(regression.r_squared * 10000) / 10000 : null,
      peer_group: peerGroup,
      peer_percentile: null
    });
  }

  return trendRows;
}

/**
 * Compute trends for a single bank for a given quarter.
 * Fetches up to 8 reported observations and computes metrics over their exact
 * calendar-quarter positions.
 * Returns the trend rows to insert.
 */
export async function computeTrendsForBank(
  db: D1Database,
  cert: number,
  repdte: string
): Promise<Record<string, unknown>[]> {
  // Fetch the last 8 reported observations (including the target when present).
  const history = await queryAll<TrendHistoryRow>(
    db,
    `SELECT repdte, asset_bucket, ${METRICS.join(', ')}
     FROM financials
     WHERE cert = ? AND repdte <= ?
     ORDER BY repdte DESC
     LIMIT 8`,
    [cert, repdte]
  );

  return buildTrendRowsForHistory(cert, repdte, history);
}

function parseTrendState(value: string | null): TrendSyncState | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as Partial<TrendSyncState>;
    if (
      typeof parsed.runId !== 'string' ||
      typeof parsed.repdte !== 'string' ||
      (parsed.status !== 'running' && parsed.status !== 'complete') ||
      !Number.isInteger(parsed.cursor) ||
      !Number.isInteger(parsed.banksProcessed) ||
      !Number.isInteger(parsed.rowsInserted)
    ) return null;
    return parsed as TrendSyncState;
  } catch {
    return null;
  }
}

async function loadTrendState(db: D1Database): Promise<TrendSyncState | null> {
  const row = await queryOne<{ value: string }>(
    db,
    'SELECT value FROM pipeline_state WHERE key = ?',
    [TREND_STATE_KEY]
  );
  return parseTrendState(row?.value ?? null);
}

async function saveTrendState(db: D1Database, state: TrendSyncState): Promise<void> {
  await execute(
    db,
    `INSERT INTO pipeline_state (key, value, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    [TREND_STATE_KEY, JSON.stringify(state), new Date().toISOString()]
  );
}

async function reconcileTrendRows(db: D1Database, state: TrendSyncState): Promise<void> {
  const stored = await queryOne<{ row_count: number }>(
    db,
    'SELECT COUNT(*) AS row_count FROM bank_trends WHERE repdte = ?',
    [state.repdte]
  );
  if (Number(stored?.row_count) !== state.rowsInserted) {
    throw new Error(
      `Trend reconciliation failed for ${state.repdte}: expected ${state.rowsInserted} rows, `
      + `stored ${stored?.row_count ?? 'invalid'}`
    );
  }
}

/**
 * Compute a bounded, resumable slice of bank trends. Each bank batch uses one
 * history query for up to 80 banks (81 bind variables including `repdte`), then
 * compact JSON1 upserts. Five batches use fewer than 40 D1 statements.
 */
export async function computeAllTrends(
  db: D1Database,
  repdte: string,
  options: TrendSyncOptions = {}
): Promise<TrendSyncResult> {
  const runId = options.runId ?? 'standalone';
  const maxBatches = options.maxBatches ?? TREND_MAX_BATCHES_PER_REQUEST;
  if (!Number.isInteger(maxBatches) || maxBatches < 1 || maxBatches > TREND_MAX_BATCHES_PER_REQUEST) {
    throw new Error(`maxBatches must be between 1 and ${TREND_MAX_BATCHES_PER_REQUEST}`);
  }

  let state = await loadTrendState(db);
  if (!state || state.runId !== runId || state.repdte !== repdte) {
    state = {
      runId,
      repdte,
      status: 'running',
      cursor: 0,
      banksProcessed: 0,
      rowsInserted: 0
    };
    // A new generation replaces the target quarter so inactive/removed banks
    // cannot leave stale trend rows behind. Delete before checkpointing cursor 0
    // so an interruption safely repeats the delete on retry.
    await execute(db, 'DELETE FROM bank_trends WHERE repdte = ?', [repdte]);
    await saveTrendState(db, state);
  } else if (state.status === 'complete') {
    await reconcileTrendRows(db, state);
    return {
      repdte,
      processed: state.banksProcessed,
      rows_inserted: state.rowsInserted,
      done: true,
      cursor: state.cursor
    };
  }

  for (let batch = 0; batch < maxBatches; batch++) {
    const banks: Array<{ cert: number }> = await queryAll<{ cert: number }>(
      db,
      `SELECT cert FROM institutions
       WHERE active = 1 AND cert > ?
       ORDER BY cert LIMIT ?`,
      [state.cursor, TREND_BANK_BATCH_SIZE]
    );
    if (banks.length === 0) {
      await reconcileTrendRows(db, state);
      state = { ...state, status: 'complete' };
      await saveTrendState(db, state);
      return {
        repdte,
        processed: state.banksProcessed,
        rows_inserted: state.rowsInserted,
        done: true,
        cursor: state.cursor
      };
    }

    const certs = banks.map(({ cert }) => cert);
    const placeholders = certs.map(() => '?').join(', ');
    const history = await queryAll<TrendHistoryRow>(
      db,
      `SELECT cert, repdte, asset_bucket, ${METRICS.join(', ')}
       FROM (
         SELECT cert, repdte, asset_bucket, ${METRICS.join(', ')},
                ROW_NUMBER() OVER (PARTITION BY cert ORDER BY repdte DESC) AS row_number
         FROM financials
         WHERE cert IN (${placeholders}) AND repdte <= ?
       )
       WHERE row_number <= 8
       ORDER BY cert, repdte`,
      [...certs, repdte]
    );
    const historyByCert = new Map<number, TrendHistoryRow[]>();
    for (const row of history) {
      const rows = historyByCert.get(row.cert) ?? [];
      rows.push(row);
      historyByCert.set(row.cert, rows);
    }

    const trendRows = banks.flatMap(({ cert }) =>
      buildTrendRowsForHistory(cert, repdte, historyByCert.get(cert) ?? [])
        .filter((row) => row.repdte === repdte)
    );
    if (trendRows.length > 0) {
      await bulkUpsert(db, 'bank_trends', trendRows, ['cert', 'metric', 'repdte']);
    }

    state = {
      ...state,
      status: banks.length < TREND_BANK_BATCH_SIZE ? 'complete' : 'running',
      cursor: certs[certs.length - 1],
      banksProcessed: state.banksProcessed + banks.length,
      rowsInserted: state.rowsInserted + trendRows.length
    };
    if (state.status === 'complete') {
      await reconcileTrendRows(db, state);
      await saveTrendState(db, state);
      return {
        repdte,
        processed: state.banksProcessed,
        rows_inserted: state.rowsInserted,
        done: true,
        cursor: state.cursor
      };
    }
    await saveTrendState(db, state);
  }

  return {
    repdte,
    processed: state.banksProcessed,
    rows_inserted: state.rowsInserted,
    done: false,
    cursor: state.cursor
  };
}
