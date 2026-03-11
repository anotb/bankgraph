/**
 * GET /api/v1/industry
 * Returns industry aggregate metrics over time.
 *
 * Query params:
 *   segment - 'all' | 'community' | 'regional' | 'large' (default: 'all')
 *   repdte  - specific quarter YYYYMMDD (optional, returns all quarters if omitted)
 *   limit   - max quarters to return (default: 20, max: 100)
 */

import type { RequestHandler } from './$types';
import { getDB, queryAll } from '$lib/server/db';
import { cacheWrap } from '$lib/server/cache';
import { jsonResponse, errorResponse } from '$lib/server/response';
import type { IndustryAggregate } from '$lib/types';

const TWELVE_HOURS = 43200;
const VALID_SEGMENTS = new Set(['all', 'community', 'regional', 'large']);
const DATE_RE = /^\d{8}$/;

export const GET: RequestHandler = async ({ platform, url }) => {
  const segment = url.searchParams.get('segment') || 'all';
  if (!VALID_SEGMENTS.has(segment)) {
    return errorResponse(`segment must be one of: ${[...VALID_SEGMENTS].join(', ')}`, 400);
  }

  const repdteParam = url.searchParams.get('repdte');
  if (repdteParam && !DATE_RE.test(repdteParam)) {
    return errorResponse('repdte must be YYYYMMDD format', 400);
  }

  const limitRaw = url.searchParams.get('limit') || '20';
  let limit = parseInt(limitRaw, 10);
  if (isNaN(limit) || limit < 1) {
    return errorResponse('limit must be a positive integer', 400);
  }
  if (limit > 100) limit = 100;

  const db = getDB(platform);
  const kv = platform?.env?.CACHE;
  const cacheKey = `industry:${segment}:${repdteParam || 'all'}:${limit}`;

  const result = await cacheWrap(kv, cacheKey, TWELVE_HOURS, async () => {
    let rows: IndustryAggregate[];

    if (repdteParam) {
      rows = await queryAll<IndustryAggregate>(
        db,
        'SELECT * FROM agg_industry WHERE segment = ? AND repdte = ?',
        [segment, repdteParam]
      );
    } else {
      // Get distinct quarters (latest first), limited
      const quarters = await queryAll<{ repdte: string }>(
        db,
        'SELECT DISTINCT repdte FROM agg_industry WHERE segment = ? ORDER BY repdte DESC LIMIT ?',
        [segment, limit]
      );

      if (quarters.length === 0) {
        return { segment, data: [] };
      }

      const placeholders = quarters.map(() => '?').join(',');
      const repdtes = quarters.map((q) => q.repdte);

      rows = await queryAll<IndustryAggregate>(
        db,
        `SELECT * FROM agg_industry WHERE segment = ? AND repdte IN (${placeholders}) ORDER BY repdte DESC`,
        [segment, ...repdtes]
      );
    }

    // Group by repdte, pivot metrics into an object
    const byQuarter = new Map<string, { repdte: string; metrics: Record<string, number> }>();
    for (const row of rows) {
      if (!byQuarter.has(row.repdte)) {
        byQuarter.set(row.repdte, { repdte: row.repdte, metrics: {} });
      }
      const entry = byQuarter.get(row.repdte)!;
      if (row.value !== null) {
        entry.metrics[row.metric] = row.value;
      }
    }

    // Sort by repdte descending
    const data = [...byQuarter.values()].sort((a, b) => b.repdte.localeCompare(a.repdte));

    return { segment, data };
  });

  return jsonResponse(result);
};
