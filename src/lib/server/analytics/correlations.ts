/**
 * Descriptive, noncausal co-movement between direct-agency macro series and
 * FDIC industry aggregates. The model is deliberately fixed before it sees
 * the data: same-quarter year-over-year changes, one result per named pair,
 * and no search across lags or windows.
 */

import { queryAll } from '$lib/server/db';
import { MIN_CALCULABLE_CORRELATION_OBSERVATIONS } from '$lib/analytics/correlation-policy';

export const CORRELATION_METHOD = 'pearson_yoy_change_contemporaneous' as const;
// Interpretation is tiered at the public surface; the deterministic calculation
// remains available from Pearson's mathematical minimum.
export const MIN_CORRELATION_OBSERVATIONS = MIN_CALCULABLE_CORRELATION_OBSERVATIONS;

/**
 * These relationships are selected for their economic interpretation rather
 * than their observed correlation. Keeping the plan explicit prevents the
 * pipeline from testing every combination and publishing only the winners.
 */
export const CORRELATION_PLAN = [
  { macroSeries: 'FRB_FEDFUNDS', bankMetric: 'median_nim' },
  { macroSeries: 'BLS_UNRATE', bankMetric: 'median_npl' },
  { macroSeries: 'UST10Y2Y', bankMetric: 'median_roa' },
  { macroSeries: 'UST10Y', bankMetric: 'median_nim' }
] as const;

export function pearsonCorrelation(x: number[], y: number[]): number {
  if (x.length !== y.length || x.length < 2) return NaN;
  const n = x.length;
  const meanX = x.reduce((sum, value) => sum + value, 0) / n;
  const meanY = y.reduce((sum, value) => sum + value, 0) / n;
  let sumXY = 0;
  let sumX2 = 0;
  let sumY2 = 0;
  for (let index = 0; index < n; index++) {
    const dx = x[index] - meanX;
    const dy = y[index] - meanY;
    sumXY += dx * dy;
    sumX2 += dx * dx;
    sumY2 += dy * dy;
  }
  if (sumX2 === 0 || sumY2 === 0) return NaN;
  return sumXY / Math.sqrt(sumX2 * sumY2);
}

export function repdteToQuarterStart(repdte: string): string {
  const year = Number(repdte.slice(0, 4));
  const month = Number(repdte.slice(4, 6));
  const quarterMonth = Math.floor((month - 1) / 3) * 3 + 1;
  return `${year}-${String(quarterMonth).padStart(2, '0')}-01`;
}

export function addQuarters(quarterStart: string, count: number): string {
  const date = new Date(`${quarterStart}T00:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() + count * 3);
  return date.toISOString().slice(0, 10);
}

export function alignQuarterlySeries(
  macro: Map<string, number>,
  bank: Map<string, number>,
  lagQuarters: number
): { x: number[]; y: number[]; macroQuarters: string[]; bankQuarters: string[] } {
  const x: number[] = [];
  const y: number[] = [];
  const macroQuarters: string[] = [];
  const bankQuarters: string[] = [];
  for (const macroQuarter of [...macro.keys()].sort()) {
    const bankQuarter = addQuarters(macroQuarter, lagQuarters);
    const macroValue = macro.get(macroQuarter);
    const bankValue = bank.get(bankQuarter);
    if (macroValue === undefined || bankValue === undefined) continue;
    x.push(macroValue);
    y.push(bankValue);
    macroQuarters.push(macroQuarter);
    bankQuarters.push(bankQuarter);
  }
  return { x, y, macroQuarters, bankQuarters };
}

/**
 * Difference each quarterly value from the same quarter one year earlier.
 * A missing comparison quarter produces no change, so a gap is never treated
 * as if it were a one-year interval. Year-over-year changes also avoid the
 * recurring Q1 reset in year-to-date FDIC performance ratios.
 */
export function yearOverYearChanges(values: Map<string, number>): Map<string, number> {
  const changes = new Map<string, number>();
  for (const quarter of [...values.keys()].sort()) {
    const current = values.get(quarter);
    const prior = values.get(addQuarters(quarter, -4));
    if (current === undefined || prior === undefined) continue;
    const change = current - prior;
    if (Number.isFinite(change)) changes.set(quarter, change);
  }
  return changes;
}

export interface CorrelationAnalysis {
  correlation: number;
  observations: number;
  windowStart: string;
  windowEnd: string;
}

/** Analyze one predeclared relationship without trying alternate lags. */
export function analyzeContemporaneousYearOverYearChanges(
  macroLevels: Map<string, number>,
  bankLevels: Map<string, number>,
  minimumObservations = MIN_CORRELATION_OBSERVATIONS
): CorrelationAnalysis | null {
  const macroChanges = yearOverYearChanges(macroLevels);
  const bankChanges = yearOverYearChanges(bankLevels);
  const aligned = alignQuarterlySeries(macroChanges, bankChanges, 0);
  if (aligned.x.length < minimumObservations) return null;

  const correlation = pearsonCorrelation(aligned.x, aligned.y);
  if (!Number.isFinite(correlation)) return null;

  return {
    correlation,
    observations: aligned.x.length,
    windowStart: aligned.macroQuarters[0],
    windowEnd: aligned.macroQuarters[aligned.macroQuarters.length - 1]
  };
}

async function getQuarterlyMacroValues(
  db: D1Database,
  seriesId: string
): Promise<Map<string, number>> {
  const rows = await queryAll<{ quarter_start: string; average_value: number }>(
    db,
    `SELECT
       substr(date, 1, 4) || '-' ||
       CASE
         WHEN CAST(substr(date, 6, 2) AS INTEGER) <= 3 THEN '01-01'
         WHEN CAST(substr(date, 6, 2) AS INTEGER) <= 6 THEN '04-01'
         WHEN CAST(substr(date, 6, 2) AS INTEGER) <= 9 THEN '07-01'
         ELSE '10-01'
       END AS quarter_start,
       AVG(value) AS average_value
     FROM macro_observations
     WHERE series_id = ?
     GROUP BY quarter_start
     ORDER BY quarter_start`,
    [seriesId]
  );
  return new Map(rows.map((row) => [row.quarter_start, row.average_value]));
}

async function getQuarterlyIndustryValues(
  db: D1Database,
  metric: string
): Promise<Map<string, number>> {
  const rows = await queryAll<{ repdte: string; value: number }>(
    db,
    `SELECT repdte, value FROM agg_industry
     WHERE segment = 'all' AND metric = ? AND value IS NOT NULL
     ORDER BY repdte`,
    [metric]
  );
  return new Map(rows.map((row) => [repdteToQuarterStart(row.repdte), row.value]));
}

export async function computeCorrelations(db: D1Database): Promise<number> {
  const computedAt = new Date().toISOString();
  const statements: D1PreparedStatement[] = [db.prepare('DELETE FROM macro_correlations')];
  let rowsInserted = 0;

  for (const { macroSeries, bankMetric } of CORRELATION_PLAN) {
    const [macroValues, industryValues] = await Promise.all([
      getQuarterlyMacroValues(db, macroSeries),
      getQuarterlyIndustryValues(db, bankMetric)
    ]);
    const analysis = analyzeContemporaneousYearOverYearChanges(macroValues, industryValues);
    if (!analysis) continue;

    statements.push(
      db.prepare(
        `INSERT INTO macro_correlations (
           metric_a, metric_b, window_start, window_end, observations,
           correlation, lag_quarters, alignment_direction, method, computed_at
         ) VALUES (?, ?, ?, ?, ?, ?, 0, 'contemporaneous', ?, ?)`
      ).bind(
        macroSeries,
        bankMetric,
        analysis.windowStart,
        analysis.windowEnd,
        analysis.observations,
        Math.round(analysis.correlation * 10_000) / 10_000,
        CORRELATION_METHOD,
        computedAt
      )
    );
    rowsInserted++;
  }

  await db.batch(statements);
  return rowsInserted;
}
