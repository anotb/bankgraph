/**
 * GET /api/v1/banks
 * Returns paginated bank list with search/filter/sort.
 *
 * Query params:
 *   format   - 'json' (default) | 'csv'
 *   download - present triggers JSON download with Content-Disposition header
 */

import type { RequestHandler } from './$types';
import { getDB, queryAll, queryOne } from '$lib/server/db';
import { cacheWrap } from '$lib/server/cache';
import { jsonResponse, errorResponse } from '$lib/server/response';
import type { Institution, BankListResponse } from '$lib/types';

const VALID_SORT_COLUMNS = new Set(['name', 'assets', 'deposits', 'roe', 'nim', 'npl', 'tier1']);
const SORT_COLUMN_MAP: Record<string, string> = {
  name: 'name',
  assets: 'total_assets',
  deposits: 'total_deposits',
  roe: 'latest_roe',
  nim: 'latest_nim',
  npl: 'latest_npl_ratio',
  tier1: 'latest_tier1_ratio'
};

const ONE_HOUR = 3600;

const CSV_COLUMNS: Array<keyof Institution> = [
  'cert',
  'name',
  'state',
  'city',
  'active',
  'total_assets',
  'latest_roa',
  'latest_roe',
  'latest_nim'
];

const CSV_HEADERS = [
  'cert',
  'name',
  'state',
  'city',
  'active',
  'asset',
  'latest_roa',
  'latest_roe',
  'latest_nim'
];

function csvEscape(val: unknown): string {
  if (val === null || val === undefined) return '';
  const s = String(val);
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

function hashParams(url: URL): string {
  const params = new URLSearchParams(url.searchParams);
  // Sort keys for deterministic hashing
  const sorted = [...params.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  return 'banks:list:' + sorted.map(([k, v]) => `${k}=${v}`).join('&');
}

export const GET: RequestHandler = async (event) => {
  const { url, platform } = event;

  const format = url.searchParams.get('format') || 'json';
  const isExport = format === 'csv' || url.searchParams.has('download');

  // Parse and validate params
  const q = url.searchParams.get('q')?.trim() || undefined;
  const stateRaw = url.searchParams.get('state')?.trim().toUpperCase() || undefined;
  const states = stateRaw
    ? stateRaw.split(',').map(s => s.trim()).filter(Boolean)
    : undefined;

  const assetMinRaw = url.searchParams.get('asset_min');
  const assetMaxRaw = url.searchParams.get('asset_max');
  const activeRaw = url.searchParams.get('active');
  const sortRaw = url.searchParams.get('sort') || 'assets';
  const orderRaw = url.searchParams.get('order') || 'desc';
  const pageRaw = url.searchParams.get('page') || '1';
  const limitRaw = url.searchParams.get('limit') || '25';

  // Validate numeric params
  const page = parseInt(pageRaw, 10);
  const limit = parseInt(limitRaw, 10);

  if (!isExport) {
    if (isNaN(page) || page < 1) {
      return errorResponse('page must be a positive integer', 400);
    }
    if (isNaN(limit) || limit < 1 || limit > 100) {
      return errorResponse('limit must be between 1 and 100', 400);
    }
  }

  let assetMin: number | undefined;
  if (assetMinRaw !== null) {
    assetMin = parseInt(assetMinRaw, 10);
    if (isNaN(assetMin)) return errorResponse('asset_min must be a number', 400);
  }

  let assetMax: number | undefined;
  if (assetMaxRaw !== null) {
    assetMax = parseInt(assetMaxRaw, 10);
    if (isNaN(assetMax)) return errorResponse('asset_max must be a number', 400);
  }

  let active: number | undefined;
  if (activeRaw !== null) {
    active = parseInt(activeRaw, 10);
    if (active !== 0 && active !== 1) {
      return errorResponse('active must be 0 or 1', 400);
    }
  } else {
    active = 1; // default
  }

  const sort = sortRaw.toLowerCase();
  if (!VALID_SORT_COLUMNS.has(sort)) {
    return errorResponse(`sort must be one of: ${[...VALID_SORT_COLUMNS].join(', ')}`, 400);
  }

  const order = orderRaw.toLowerCase();
  if (order !== 'asc' && order !== 'desc') {
    return errorResponse('order must be asc or desc', 400);
  }

  const kv = platform?.env?.CACHE;
  const cacheKey = hashParams(url);

  try {
    const db = getDB(platform);

    const conditions: string[] = [];
    const params: unknown[] = [];

    if (q) {
      conditions.push('LOWER(name) LIKE LOWER(?)');
      params.push(`%${q}%`);
    }

    if (states && states.length > 0) {
      const placeholders = states.map(() => '?').join(', ');
      conditions.push(`state IN (${placeholders})`);
      params.push(...states);
    }

    if (assetMin !== undefined) {
      conditions.push('total_assets >= ?');
      params.push(assetMin);
    }

    if (assetMax !== undefined) {
      conditions.push('total_assets <= ?');
      params.push(assetMax);
    }

    if (active !== undefined) {
      conditions.push('active = ?');
      params.push(active);
    }

    const whereClause = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';
    const sortColumn = SORT_COLUMN_MAP[sort];

    // For CSV/download exports, fetch all matching rows (no pagination)
    if (format === 'csv') {
      const dataSql = `SELECT * FROM institutions ${whereClause} ORDER BY ${sortColumn} ${order.toUpperCase()}`;
      const data = await queryAll<Institution>(db, dataSql, params);

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
          'Content-Disposition': 'attachment; filename="banks.csv"',
          'Access-Control-Allow-Origin': '*'
        }
      });
    }

    if (format === 'json' && url.searchParams.has('download')) {
      const dataSql = `SELECT * FROM institutions ${whereClause} ORDER BY ${sortColumn} ${order.toUpperCase()}`;
      const data = await queryAll<Institution>(db, dataSql, params);

      return new Response(JSON.stringify({ data }, null, 2), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Content-Disposition': 'attachment; filename="banks.json"',
          'Access-Control-Allow-Origin': '*'
        }
      });
    }

    // Standard paginated JSON response
    const result = await cacheWrap<BankListResponse>(kv, cacheKey, ONE_HOUR, async () => {
      const offset = (page - 1) * limit;

      // SAFETY: sortColumn and order are interpolated directly into SQL, but both are
      // validated against allowlists above (SORT_COLUMN_MAP keys and 'asc'/'desc')
      // so there is no SQL injection risk here.
      const countSql = `SELECT COUNT(*) as total FROM institutions ${whereClause}`;
      const dataSql = `SELECT * FROM institutions ${whereClause} ORDER BY ${sortColumn} ${order.toUpperCase()} LIMIT ? OFFSET ?`;

      const [countRow, data] = await Promise.all([
        queryOne<{ total: number }>(db, countSql, params),
        queryAll<Institution>(db, dataSql, [...params, limit, offset])
      ]);

      const total = countRow?.total ?? 0;
      return { data, total, page, limit };
    });

    return jsonResponse(result);
  } catch (err) {
    console.error('Failed to list banks:', err);
    return errorResponse('Failed to load bank list', 500);
  }
};
