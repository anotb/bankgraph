/**
 * GET /api/v1/macro/:series_id
 * Returns a bounded window of direct-agency macro observations.
 *
 * Query params:
 *   ?from=YYYY-MM-DD  - start date (inclusive; defaults to ten years before `to`)
 *   ?to=YYYY-MM-DD    - end date (inclusive; defaults to today)
 *   ?limit=1..5000    - row bound (defaults to 5000)
 */

import type { RequestHandler } from './$types';
import { getDB, queryAll, queryOne } from '$lib/server/db';
import { cacheWrap } from '$lib/server/cache';
import { jsonResponse, errorResponse } from '$lib/server/response';
import { MacroQueryError, parseMacroQuery } from '$lib/server/macro-query';
import { MACRO_SERIES_BY_ID } from '$lib/server/pipeline/macro-sources';
import type { MacroApiResponse, MacroResponse } from '$lib/types';
import { releaseLineage, stalePageReleaseResponse } from '$lib/server/release-lineage';

const SIX_HOURS = 21600;

export const GET: RequestHandler = async ({ params, platform, url, locals, request }) => {
  let parsed;
  try {
    parsed = parseMacroQuery(params.series_id, url.searchParams);
  } catch (error) {
    if (error instanceof MacroQueryError) return errorResponse(error.message, 400);
    throw error;
  }
  const staleResponse = stalePageReleaseResponse({ locals, url, request });
  if (staleResponse) return staleResponse;
  const { seriesId, from, to, limit } = parsed;

  const kv = platform?.env?.CACHE;
  const cacheKey = `macro:direct:v1:${seriesId}:${from}:${to}:${limit}`;

  try {
    const loadMacro = async (): Promise<MacroResponse> => {
      const db = getDB(platform);

      const catalog = MACRO_SERIES_BY_ID.get(seriesId)!;
      const meta = await queryOne<{
        series_id: string;
        title: string;
        category: string;
        source_agency: string;
        source_series: string;
        source_url: string;
        source_page_url: string;
        rights_url: string;
        rights_note: string;
        cadence: 'daily' | 'weekly' | 'monthly' | 'quarterly';
        units: string;
        transform: string;
        seasonal_adjustment: string;
        retrieved_at: string | null;
        observed_through: string | null;
        coverage_start: string | null;
        coverage_end: string | null;
      }>(
        db,
        `SELECT series_id, title, category, source_agency, source_series, source_url,
                source_page_url, rights_url, rights_note, cadence, units, transform,
                seasonal_adjustment, retrieved_at, observed_through, coverage_start, coverage_end
         FROM macro_series WHERE series_id = ?`,
        [seriesId]
      );

      if (!meta) {
        return {
          series_id: seriesId,
          title: catalog.title,
          category: catalog.category,
          source_agency: catalog.sourceAgency,
          source_series: catalog.sourceSeries,
          source_url: catalog.sourceUrl,
          source_page_url: catalog.sourcePageUrl,
          rights_url: catalog.rightsUrl,
          rights_note: catalog.rightsNote,
          cadence: catalog.cadence,
          frequency: catalog.cadence,
          units: catalog.units,
          transform: catalog.transform,
          seasonal_adjustment: catalog.seasonalAdjustment,
          retrieved_at: null,
          observed_through: null,
          coverage: { start: null, end: null },
          query: { from, to, limit, default_window_years: 10 },
          data: []
        } as MacroResponse;
      }

      const data = await queryAll<{ date: string; value: number }>(
        db,
        `SELECT date, value FROM macro_observations
         WHERE series_id = ? AND date >= ? AND date <= ?
         ORDER BY date ASC LIMIT ?`,
        [seriesId, from, to, limit]
      );

      return {
        series_id: meta.series_id,
        title: meta.title,
        category: meta.category,
        source_agency: meta.source_agency,
        source_series: meta.source_series,
        source_url: meta.source_url,
        source_page_url: meta.source_page_url,
        rights_url: meta.rights_url,
        rights_note: meta.rights_note,
        cadence: meta.cadence,
        frequency: meta.cadence,
        units: meta.units,
        transform: meta.transform,
        seasonal_adjustment: meta.seasonal_adjustment,
        retrieved_at: meta.retrieved_at,
        observed_through: meta.observed_through,
        coverage: { start: meta.coverage_start, end: meta.coverage_end },
        query: { from, to, limit, default_window_years: 10 },
        data
      } as MacroResponse;
    };
    // Arbitrary date windows create a high-cardinality cache space. The
    // catalog's finite default views are the only shared KV entries.
    const hasExplicitWindow = ['from', 'to', 'limit'].some((key) => url.searchParams.has(key));
    const result = !hasExplicitWindow
      ? await cacheWrap<MacroResponse>(kv, cacheKey, SIX_HOURS, loadMacro, locals?.liveDataGeneration)
      : await loadMacro();

    return jsonResponse({ ...result, ...releaseLineage(locals) } satisfies MacroApiResponse);
  } catch (err) {
    console.error(`Failed to load macro data for ${seriesId}:`, err);
    return errorResponse('Failed to load macro data', 500);
  }
};
