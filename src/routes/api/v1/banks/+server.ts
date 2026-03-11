import type { RequestHandler } from './$types';
import { getDB, queryAll, queryOne } from '$lib/server/db';
import { cacheWrap } from '$lib/server/cache';
import type { Institution, BankListResponse } from '$lib/types';

const VALID_SORT_COLUMNS = new Set(['name', 'assets', 'deposits']);
const SORT_COLUMN_MAP: Record<string, string> = {
  name: 'name',
  assets: 'total_assets',
  deposits: 'total_deposits'
};

const ONE_HOUR = 3600;

function corsJson(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*'
    }
  });
}

function hashParams(url: URL): string {
  const params = new URLSearchParams(url.searchParams);
  // Sort keys for deterministic hashing
  const sorted = [...params.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  return 'banks:list:' + sorted.map(([k, v]) => `${k}=${v}`).join('&');
}

export const GET: RequestHandler = async (event) => {
  const { url, platform } = event;

  // Parse and validate params
  const q = url.searchParams.get('q')?.trim() || undefined;
  const state = url.searchParams.get('state')?.trim().toUpperCase() || undefined;

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

  if (isNaN(page) || page < 1) {
    return corsJson({ error: 'page must be a positive integer' }, 400);
  }
  if (isNaN(limit) || limit < 1 || limit > 100) {
    return corsJson({ error: 'limit must be between 1 and 100' }, 400);
  }

  let assetMin: number | undefined;
  if (assetMinRaw !== null) {
    assetMin = parseInt(assetMinRaw, 10);
    if (isNaN(assetMin)) return corsJson({ error: 'asset_min must be a number' }, 400);
  }

  let assetMax: number | undefined;
  if (assetMaxRaw !== null) {
    assetMax = parseInt(assetMaxRaw, 10);
    if (isNaN(assetMax)) return corsJson({ error: 'asset_max must be a number' }, 400);
  }

  let active: number | undefined;
  if (activeRaw !== null) {
    active = parseInt(activeRaw, 10);
    if (active !== 0 && active !== 1) {
      return corsJson({ error: 'active must be 0 or 1' }, 400);
    }
  } else {
    active = 1; // default
  }

  const sort = sortRaw.toLowerCase();
  if (!VALID_SORT_COLUMNS.has(sort)) {
    return corsJson({ error: `sort must be one of: ${[...VALID_SORT_COLUMNS].join(', ')}` }, 400);
  }

  const order = orderRaw.toLowerCase();
  if (order !== 'asc' && order !== 'desc') {
    return corsJson({ error: 'order must be asc or desc' }, 400);
  }

  const kv = platform?.env?.CACHE;
  const cacheKey = hashParams(url);

  const result = await cacheWrap<BankListResponse>(kv, cacheKey, ONE_HOUR, async () => {
    const db = getDB(platform);

    const conditions: string[] = [];
    const params: unknown[] = [];

    if (q) {
      conditions.push('LOWER(name) LIKE LOWER(?)');
      params.push(`%${q}%`);
    }

    if (state) {
      conditions.push('state = ?');
      params.push(state);
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
    const offset = (page - 1) * limit;

    // Get total count
    const countSql = `SELECT COUNT(*) as total FROM institutions ${whereClause}`;
    const countRow = await queryOne<{ total: number }>(db, countSql, params);
    const total = countRow?.total ?? 0;

    // Get page of results
    const dataSql = `SELECT * FROM institutions ${whereClause} ORDER BY ${sortColumn} ${order.toUpperCase()} LIMIT ? OFFSET ?`;
    const data = await queryAll<Institution>(db, dataSql, [...params, limit, offset]);

    return { data, total, page, limit };
  });

  return corsJson(result);
};
