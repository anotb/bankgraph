import { queryAll } from '$lib/server/db';
import {
  computeIndustryAggregates,
  INDUSTRY_AGGREGATE_ROWS_PER_QUARTER
} from './industry-agg';

export const INDUSTRY_ANALYSIS_QUARTERS = 40;
export const INDUSTRY_HISTORY_BATCH_SIZE = 1;

export interface IndustryHistoryResult {
  targetQuarters: number;
  completeQuarters: number;
  processedPeriods: string[];
  rowsInserted: number;
  earliestPeriod: string | null;
  latestPeriod: string | null;
  done: boolean;
}

export function selectIndustryHistoryBatch(
  targetPeriods: string[],
  completePeriods: ReadonlySet<string>,
  batchSize = INDUSTRY_HISTORY_BATCH_SIZE
): string[] {
  return targetPeriods.filter((period) => !completePeriods.has(period)).slice(0, batchSize);
}

/**
 * Fill a bounded ten-year aggregate window from financial rows already in D1.
 * One quarter per request keeps Worker memory, D1 reads, and writes predictable;
 * repeated calls are idempotent because aggregate rows use INSERT OR REPLACE.
 */
export async function backfillIndustryAggregateHistory(
  db: D1Database,
  options: { targetQuarters?: number; batchSize?: number } = {}
): Promise<IndustryHistoryResult> {
  const targetCount = options.targetQuarters ?? INDUSTRY_ANALYSIS_QUARTERS;
  const batchSize = options.batchSize ?? INDUSTRY_HISTORY_BATCH_SIZE;
  const targetRows = await queryAll<{ repdte: string }>(
    db,
    'SELECT DISTINCT repdte FROM financials ORDER BY repdte DESC LIMIT ?',
    [targetCount]
  );
  const targetPeriods = targetRows.map((row) => row.repdte);
  if (targetPeriods.length === 0) {
    return {
      targetQuarters: 0,
      completeQuarters: 0,
      processedPeriods: [],
      rowsInserted: 0,
      earliestPeriod: null,
      latestPeriod: null,
      done: true
    };
  }

  const placeholders = targetPeriods.map(() => '?').join(',');
  const completedRows = await queryAll<{ repdte: string }>(
    db,
    `SELECT repdte
       FROM agg_industry
      WHERE repdte IN (${placeholders})
      GROUP BY repdte
     HAVING COUNT(*) >= ?`,
    [...targetPeriods, INDUSTRY_AGGREGATE_ROWS_PER_QUARTER]
  );
  const completePeriods = new Set(completedRows.map((row) => row.repdte));
  const processedPeriods = selectIndustryHistoryBatch(targetPeriods, completePeriods, batchSize);
  let rowsInserted = 0;
  for (const period of processedPeriods) {
    rowsInserted += await computeIndustryAggregates(db, period);
    completePeriods.add(period);
  }

  return {
    targetQuarters: targetPeriods.length,
    completeQuarters: completePeriods.size,
    processedPeriods,
    rowsInserted,
    earliestPeriod: targetPeriods.at(-1) ?? null,
    latestPeriod: targetPeriods[0] ?? null,
    done: completePeriods.size === targetPeriods.length
  };
}
