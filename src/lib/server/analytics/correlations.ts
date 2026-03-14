/**
 * Compute Pearson correlations between FRED macro series
 * and bank industry aggregates.
 */

import { queryAll, execute } from '$lib/server/db';

/** Correlation pairs: [FRED series, industry metric name, agg_industry metric key] */
const CORRELATION_PAIRS: Array<[string, string, string]> = [
  ['FEDFUNDS', 'median_nim', 'median_nim'],
  ['UNRATE', 'median_npl', 'median_npl'],
  ['T10Y2Y', 'median_roa', 'median_roa'],
  ['DGS10', 'median_nim', 'median_nim']
];

/** Max lag in quarters to test */
const MAX_LAG_QUARTERS = 4;

/**
 * Compute Pearson correlation coefficient between two arrays.
 * Returns NaN if arrays are too short or have zero variance.
 */
export function pearsonCorrelation(x: number[], y: number[]): number {
  const n = Math.min(x.length, y.length);
  if (n < 3) return NaN;

  const xs = x.slice(0, n);
  const ys = y.slice(0, n);

  const meanX = xs.reduce((a, b) => a + b, 0) / n;
  const meanY = ys.reduce((a, b) => a + b, 0) / n;

  let sumXY = 0;
  let sumX2 = 0;
  let sumY2 = 0;

  for (let i = 0; i < n; i++) {
    const dx = xs[i] - meanX;
    const dy = ys[i] - meanY;
    sumXY += dx * dy;
    sumX2 += dx * dx;
    sumY2 += dy * dy;
  }

  if (sumX2 === 0 || sumY2 === 0) return NaN;
  return sumXY / Math.sqrt(sumX2 * sumY2);
}

/**
 * Convert a YYYYMMDD reporting date to the start of its quarter as YYYY-MM-DD.
 */
export function repdteToQuarterStart(repdte: string): string {
  const year = repdte.slice(0, 4);
  const month = parseInt(repdte.slice(4, 6), 10);
  const q = Math.ceil(month / 3);
  const qMonth = String((q - 1) * 3 + 1).padStart(2, '0');
  return `${year}-${qMonth}-01`;
}

/**
 * Get quarterly average of a FRED series, keyed by quarter start date (YYYY-MM-DD).
 */
async function getQuarterlyFredValues(
  db: D1Database,
  seriesId: string
): Promise<Map<string, number>> {
  const rows = await queryAll<{ q: string; avg_val: number }>(
    db,
    `SELECT
       substr(date, 1, 4) || '-' ||
       CASE
         WHEN CAST(substr(date, 6, 2) AS INTEGER) <= 3 THEN '01-01'
         WHEN CAST(substr(date, 6, 2) AS INTEGER) <= 6 THEN '04-01'
         WHEN CAST(substr(date, 6, 2) AS INTEGER) <= 9 THEN '07-01'
         ELSE '10-01'
       END AS q,
       AVG(value) AS avg_val
     FROM macro_data
     WHERE series_id = ? AND value IS NOT NULL
     GROUP BY q
     ORDER BY q`,
    [seriesId]
  );

  const map = new Map<string, number>();
  for (const row of rows) {
    map.set(row.q, row.avg_val);
  }
  return map;
}

/**
 * Get quarterly industry aggregate values, keyed by quarter start date (YYYY-MM-DD).
 * Uses the 'all' segment from agg_industry.
 */
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

  const map = new Map<string, number>();
  for (const row of rows) {
    const qStart = repdteToQuarterStart(row.repdte);
    map.set(qStart, row.value);
  }
  return map;
}

/**
 * Compute correlations between FRED series and bank industry metrics.
 * Tests lag 0 through MAX_LAG_QUARTERS.
 * Returns total number of correlation rows inserted.
 *
 * Prerequisites:
 *   - macro_data table must be populated (run `fred` pipeline stage)
 *   - agg_industry table must have rows for segment='all' with metrics:
 *     median_nim, median_npl, median_roa (run `analytics` pipeline stage)
 *   If agg_industry is empty, all correlation pairs will be skipped and
 *   the macro page will fall back to hardcoded representative values.
 */
export async function computeCorrelations(db: D1Database): Promise<number> {
  let totalInserted = 0;
  const insights: string[] = [];

  for (const [fredSeries, metricLabel, aggMetric] of CORRELATION_PAIRS) {
    const fredValues = await getQuarterlyFredValues(db, fredSeries);
    const industryValues = await getQuarterlyIndustryValues(db, aggMetric);

    if (fredValues.size === 0 || industryValues.size === 0) {
      console.log(`Skipping ${fredSeries} vs ${metricLabel}: no data`);
      continue;
    }

    // Get sorted quarter keys that appear in both datasets
    const allQuarters = [...new Set([...fredValues.keys(), ...industryValues.keys()])].sort();

    for (let lag = 0; lag <= MAX_LAG_QUARTERS; lag++) {
      // Build aligned arrays: fred[t] vs industry[t + lag quarters]
      const x: number[] = [];
      const y: number[] = [];

      for (let i = 0; i < allQuarters.length - lag; i++) {
        const fredQ = allQuarters[i];
        const industryQ = allQuarters[i + lag];
        const fredVal = fredValues.get(fredQ);
        const industryVal = industryValues.get(industryQ);

        if (fredVal !== undefined && industryVal !== undefined) {
          x.push(fredVal);
          y.push(industryVal);
        }
      }

      const corr = pearsonCorrelation(x, y);
      if (isNaN(corr)) continue;

      // Use earliest common quarter as period_start
      const periodStart = allQuarters[0];

      await execute(
        db,
        `INSERT OR REPLACE INTO correlations (metric_a, metric_b, period_start, correlation, lag_quarters)
         VALUES (?, ?, ?, ?, ?)`,
        [fredSeries, metricLabel, periodStart, Math.round(corr * 10000) / 10000, lag]
      );
      totalInserted++;

      // Track strongest correlation for insights
      if (lag === 0 && Math.abs(corr) > 0.5) {
        const direction = corr > 0 ? 'positive' : 'negative';
        insights.push(
          `${fredSeries} shows ${direction} correlation (${corr.toFixed(2)}) with ${metricLabel}`
        );
      }
    }
  }

  // Store insights in pipeline_state
  if (insights.length > 0) {
    const now = new Date().toISOString();
    await execute(
      db,
      `INSERT OR REPLACE INTO pipeline_state (key, value, updated_at) VALUES (?, ?, ?)`,
      ['correlation_insights', JSON.stringify(insights), now]
    );
  }

  console.log(`Correlations computed: ${totalInserted} rows`);
  return totalInserted;
}

/**
 * Noncurrent loans ratio has a different metric name in the industry agg.
 * Map "median_npl" to "median_npl" in agg_industry; we need to create this
 * aggregate if it doesn't exist. For now, we derive it from existing data.
 *
 * NOTE: The industry-agg module computes median_roa, median_roe, median_nim.
 * We'll need to add median_npl there in a follow-up, or compute it inline.
 * For now, correlations against median_npl will produce empty results unless
 * the agg_industry table has that metric.
 */
