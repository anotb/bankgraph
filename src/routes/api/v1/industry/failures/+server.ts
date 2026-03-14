/**
 * GET /api/v1/industry/failures
 * Returns all bank failure records.
 *
 * Query params:
 *   format   - 'json' (default) | 'csv'
 *   download - present triggers JSON download with Content-Disposition header
 */

import type { RequestHandler } from './$types';
import { getDB, queryAll } from '$lib/server/db';
import { cacheWrap } from '$lib/server/cache';
import { jsonResponse, errorResponse } from '$lib/server/response';
import type { Failure } from '$lib/types';

const SIX_HOURS = 21600;

const CSV_COLUMNS: Array<keyof Failure> = [
  'name',
  'cert',
  'state',
  'fail_date',
  'acquiring_institution',
  'cost',
  'total_assets',
  'total_deposits'
];

const CSV_HEADERS = [
  'name',
  'cert',
  'state',
  'fail_date',
  'acquirer',
  'cost',
  'total_assets',
  'total_deposits'
];

function csvEscape(val: unknown): string {
  if (val === null || val === undefined) return '';
  const s = String(val);
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

export const GET: RequestHandler = async ({ platform, url }) => {
  const kv = platform?.env?.CACHE;
  const cacheKey = 'industry:failures:all';

  try {
    const data = await cacheWrap<Failure[]>(kv, cacheKey, SIX_HOURS, async () => {
      const db = getDB(platform);
      return queryAll<Failure>(db, 'SELECT * FROM failures ORDER BY fail_date DESC');
    });

    const format = url.searchParams.get('format') || 'json';

    if (format === 'csv') {
      const rows = [
        CSV_HEADERS.join(','),
        ...data.map((row) =>
          CSV_COLUMNS.map((col) => csvEscape(row[col])).join(',')
        )
      ];
      return new Response(rows.join('\n'), {
        status: 200,
        headers: {
          'Content-Type': 'text/csv',
          'Content-Disposition': 'attachment; filename="bank_failures.csv"',
          'Access-Control-Allow-Origin': '*'
        }
      });
    }

    if (format === 'json' && url.searchParams.has('download')) {
      return new Response(JSON.stringify({ data }, null, 2), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Content-Disposition': 'attachment; filename="bank_failures.json"',
          'Access-Control-Allow-Origin': '*'
        }
      });
    }

    return jsonResponse({ data });
  } catch (err) {
    console.error('Failed to load failures data:', err);
    return errorResponse('Failed to load failures data', 500);
  }
};
