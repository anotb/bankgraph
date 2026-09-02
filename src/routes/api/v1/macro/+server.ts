import type { RequestHandler } from './$types';
import { getDB, queryAll } from '$lib/server/db';
import { jsonResponse, errorResponse } from '$lib/server/response';
import { MACRO_SERIES } from '$lib/server/pipeline/macro-sources';

interface CoverageRow {
  series_id: string;
  retrieved_at: string | null;
  observed_through: string | null;
  coverage_start: string | null;
  coverage_end: string | null;
}

export const GET: RequestHandler = async ({ platform }) => {
  try {
    const db = getDB(platform);
    const coverageRows = await queryAll<CoverageRow>(
      db,
      `SELECT series_id, retrieved_at, observed_through, coverage_start, coverage_end
       FROM macro_series`
    );
    const coverage = new Map(coverageRows.map((row) => [row.series_id, row]));
    return jsonResponse({
      default_window_years: 10,
      max_points_per_series: 5000,
      series: MACRO_SERIES.map((definition) => {
        const state = coverage.get(definition.seriesId);
        return {
          series_id: definition.seriesId,
          title: definition.title,
          category: definition.category,
          source_agency: definition.sourceAgency,
          source_series: definition.sourceSeries,
          source_available_from: definition.sourceStartDate,
          source_url: definition.sourceUrl,
          source_page_url: definition.sourcePageUrl,
          rights_url: definition.rightsUrl,
          rights_note: definition.rightsNote,
          cadence: definition.cadence,
          units: definition.units,
          transform: definition.transform,
          seasonal_adjustment: definition.seasonalAdjustment,
          retrieved_at: state?.retrieved_at ?? null,
          observed_through: state?.observed_through ?? null,
          coverage: {
            start: state?.coverage_start ?? null,
            end: state?.coverage_end ?? null
          }
        };
      })
    });
  } catch (error) {
    console.error('Failed to load macro catalog:', error);
    return errorResponse('Failed to load macro catalog', 500);
  }
};
