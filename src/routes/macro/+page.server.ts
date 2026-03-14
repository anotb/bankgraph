import type { PageServerLoad } from './$types';
import type { MacroResponse, CorrelationResult } from '$lib/types';
import { getDB, queryAll } from '$lib/server/db';

export interface MacroSeriesData {
  [seriesId: string]: MacroResponse | null;
}

const SERIES_IDS = [
  'FEDFUNDS', 'DGS10', 'DGS2', 'T10Y2Y', 'MORTGAGE30US',
  'UNRATE', 'GDP', 'CPIAUCSL',
  'TOTBKCR', 'DRCCLACBS',
  'USREC'
];

export const load: PageServerLoad = async ({ fetch, platform }) => {
  // Fetch macro series data via API
  const results = await Promise.all(
    SERIES_IDS.map(async (id) => {
      try {
        const res = await fetch(`/api/v1/macro/${id}`);
        if (!res.ok) return [id, null] as const;
        const data: MacroResponse = await res.json();
        if (!data.data || data.data.length === 0) return [id, null] as const;
        return [id, data] as const;
      } catch {
        return [id, null] as const;
      }
    })
  );

  const series: MacroSeriesData = {};
  for (const [id, data] of results) {
    series[id] = data;
  }

  // Query computed correlations from DB
  // These are Pearson correlations between FRED macro series and bank industry aggregates,
  // computed by the correlations pipeline stage (requires agg_industry data).
  let correlations: CorrelationResult[] = [];
  try {
    const db = getDB(platform);
    correlations = await queryAll<CorrelationResult>(
      db,
      `SELECT metric_a, metric_b, period_start, correlation, lag_quarters
       FROM correlations
       WHERE correlation IS NOT NULL
       ORDER BY ABS(correlation) DESC`
    );
  } catch {
    // DB not available or table doesn't exist yet
  }

  return { series, correlations };
};
