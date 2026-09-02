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
import { encodeCsvRow } from '$lib/server/csv';
import {
  BankListQueryError,
  buildBankListCacheKey,
  parseBankListQuery,
  shouldCacheBankList
} from '$lib/server/bank-list-query';
import type { Institution, BankListResponse } from '$lib/types';
import type { ReleaseLineage } from '$lib/types';
import {
  releaseLineage,
  setReleaseLineageHeaders,
  stalePageReleaseResponse
} from '$lib/server/release-lineage';
import { buildInstitutionSearchSql } from '$lib/server/institution-search';

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
const MAX_EXPORT_ROWS = 50_000;

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

export const GET: RequestHandler = async (event) => {
  const { url, platform, locals, request } = event;

  let parsed;
  try {
    parsed = parseBankListQuery(url.searchParams);
  } catch (err) {
    if (err instanceof BankListQueryError) return errorResponse(err.message, 400);
    throw err;
  }
  const staleResponse = stalePageReleaseResponse({ locals, url, request });
  if (staleResponse) return staleResponse;
  const lineage = releaseLineage(locals);
  const {
    q,
    states,
    assetMin,
    assetMax,
    active,
    sort,
    order,
    page,
    limit,
    format,
    download
  } = parsed;

  const kv = platform?.env?.CACHE;
  const cacheKey = buildBankListCacheKey(parsed);

  try {
    const db = getDB(platform);

    const conditions: string[] = [];
    const params: unknown[] = [];
    let relevanceOrder = '';
    let relevanceParams: unknown[] = [];

    if (q) {
      const search = buildInstitutionSearchSql(q);
      conditions.push(search.condition);
      params.push(...search.conditionParams);
      relevanceOrder = search.orderPrefix;
      relevanceParams = search.orderParams;
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

    if (active !== 'all') {
      conditions.push('active = ?');
      params.push(active);
    }

    const whereClause = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';
    const sortColumn = SORT_COLUMN_MAP[sort];

    // For CSV/download exports, fetch all matching rows (no pagination)
    if (format === 'csv') {
      const dataSql = `SELECT ${CSV_COLUMNS.join(', ')} FROM published_institutions ${whereClause} ORDER BY ${relevanceOrder} ${sortColumn} ${order.toUpperCase()} LIMIT ?`;
      const data = await queryAll<Institution>(db, dataSql, [...params, ...relevanceParams, MAX_EXPORT_ROWS + 1]);
      if (data.length > MAX_EXPORT_ROWS) {
        return errorResponse(`Export exceeds the ${MAX_EXPORT_ROWS.toLocaleString('en-US')} row limit; narrow the filters`, 413);
      }

      const rows = [
        encodeCsvRow(CSV_HEADERS),
        ...data.map((row) => encodeCsvRow(CSV_COLUMNS.map((col) => row[col])))
      ];
      return setReleaseLineageHeaders(new Response(rows.join('\n'), {
        status: 200,
        headers: {
          'Content-Type': 'text/csv',
          'Content-Disposition': 'attachment; filename="banks.csv"',
          'Access-Control-Allow-Origin': '*'
        }
      }), lineage);
    }

    if (format === 'json' && download) {
      const dataSql = `SELECT * FROM published_institutions ${whereClause} ORDER BY ${relevanceOrder} ${sortColumn} ${order.toUpperCase()} LIMIT ?`;
      const data = await queryAll<Institution>(db, dataSql, [...params, ...relevanceParams, MAX_EXPORT_ROWS + 1]);
      if (data.length > MAX_EXPORT_ROWS) {
        return errorResponse(`Export exceeds the ${MAX_EXPORT_ROWS.toLocaleString('en-US')} row limit; narrow the filters`, 413);
      }

      return new Response(JSON.stringify({ data, ...lineage }, null, 2), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Content-Disposition': 'attachment; filename="banks.json"',
          'Access-Control-Allow-Origin': '*'
        }
      });
    }

    // Standard paginated JSON response
    type BankListPage = Omit<BankListResponse, keyof ReleaseLineage>;
    const loadBankList = async (): Promise<BankListPage> => {
      const offset = (page - 1) * limit;

      // SAFETY: sortColumn and order are interpolated directly into SQL, but both are
      // validated against allowlists above (SORT_COLUMN_MAP keys and 'asc'/'desc')
      // so there is no SQL injection risk here.
      const countSql = `SELECT COUNT(*) as total FROM published_institutions ${whereClause}`;
      const dataSql = `SELECT * FROM published_institutions ${whereClause} ORDER BY ${relevanceOrder} ${sortColumn} ${order.toUpperCase()} LIMIT ? OFFSET ?`;

      const [countRow, data] = await Promise.all([
        queryOne<{ total: number }>(db, countSql, params),
        queryAll<Institution>(db, dataSql, [...params, ...relevanceParams, limit, offset])
      ]);

      const total = countRow?.total ?? 0;
      return { data, total, page, limit };
    };
    const result = shouldCacheBankList(parsed)
      ? await cacheWrap<BankListPage>(kv, cacheKey, ONE_HOUR, loadBankList, locals?.liveDataGeneration)
      : await loadBankList();

    return jsonResponse({ ...result, ...lineage } satisfies BankListResponse);
  } catch (err) {
    console.error('Failed to list banks:', err);
    return errorResponse('Failed to load bank list', 500);
  }
};
