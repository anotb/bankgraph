/**
 * GET /api/v1/macro/:series_id
 * Returns macro data for a FRED series with optional date filter.
 *
 * Query params:
 *   ?from=YYYY-MM-DD  - start date (inclusive)
 */

import type { RequestHandler } from './$types';
import { getDB, queryAll, queryOne } from '$lib/server/db';
import { cacheWrap } from '$lib/server/cache';
import { jsonResponse, errorResponse } from '$lib/server/response';
import type { MacroResponse } from '$lib/types';

const SIX_HOURS = 21600;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export const GET: RequestHandler = async ({ params, platform, url }) => {
  const seriesId = params.series_id.toUpperCase();

  const from = url.searchParams.get('from');
  if (from && !DATE_RE.test(from)) {
    return errorResponse('from must be YYYY-MM-DD format', 400);
  }

  const kv = platform?.env?.CACHE;
  const cacheKey = `macro:${seriesId}:${from || ''}`;

  const result = await cacheWrap<MacroResponse>(kv, cacheKey, SIX_HOURS, async () => {
    const db = getDB(platform);

    // Fetch series metadata
    const meta = await queryOne<{ series_id: string; title: string; frequency: string; units: string }>(
      db,
      'SELECT series_id, title, frequency, units FROM fred_series WHERE series_id = ?',
      [seriesId]
    );

    if (!meta) {
      return {
        series_id: seriesId,
        title: null,
        frequency: null,
        units: null,
        data: []
      } as MacroResponse;
    }

    // Fetch observation data
    const conditions: string[] = ['series_id = ?'];
    const bindParams: unknown[] = [seriesId];

    if (from) {
      conditions.push('date >= ?');
      bindParams.push(from);
    }

    const where = conditions.join(' AND ');
    const data = await queryAll<{ date: string; value: number }>(
      db,
      `SELECT date, value FROM macro_data WHERE ${where} ORDER BY date ASC`,
      bindParams
    );

    return {
      series_id: meta.series_id,
      title: meta.title,
      frequency: meta.frequency,
      units: meta.units,
      data
    } as MacroResponse;
  });

  return jsonResponse(result);
};
