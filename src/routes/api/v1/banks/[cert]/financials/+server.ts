import type { RequestHandler } from './$types';
import { getDB, queryAll } from '$lib/server/db';
import { cacheWrap } from '$lib/server/cache';
import { jsonResponse, errorResponse } from '$lib/server/response';
import { encodeCsvRow } from '$lib/server/csv';
import type { Financial, FinancialsResponse } from '$lib/types';
import {
  releaseLineage,
  setReleaseLineageHeaders,
  stalePageReleaseResponse
} from '$lib/server/release-lineage';

const SIX_HOURS = 21600;

const VALID_FIELDS = new Set([
  'cert', 'repdte', 'asset', 'dep', 'eq', 'lnlsnet', 'lnre', 'lnci', 'lncon', 'sec',
  'chbal', 'frepo', 'trade', 'ore', 'bkprem', 'intan', 'oa',
  'frepp', 'othbor', 'subnd', 'tradel', 'allothl',
  'netinc', 'intinc', 'eintexp', 'nim', 'nonii', 'nonix', 'elnatr',
  'netincq', 'nimq', 'noniiq', 'nonixq', 'elnatq', 'iglsecq', 'itaxq', 'extraq',
  'roa', 'roe', 'nimy', 'eeffr', 'rbcrwaj', 'rbc1rwaj', 'rbc1aaj', 'eqv',
  'nclnlsr', 'lnatresr', 'nco_ratio', 'lnlsdepr', 'othbfhlb', 'numemp', 'asset_bucket'
]);

const DATE_RE = /^\d{8}$/;
const MAX_CERT = 9_999_999;

export function _buildFinancialsCacheKey(
  cert: number,
  fields: string,
  from: string | null,
  to: string | null,
  limit: number
): string {
  return `fin:${cert}:${fields}:${from || ''}:${to || ''}:${limit}`;
}

export const GET: RequestHandler = async ({ params, platform, url, locals, request }) => {
  if (!/^[1-9]\d*$/.test(params.cert)) {
    return errorResponse('cert must be a positive integer', 400);
  }
  const cert = Number(params.cert);
  if (!Number.isSafeInteger(cert) || cert > MAX_CERT) {
    return errorResponse(`cert must not exceed ${MAX_CERT}`, 400);
  }

  // Parse and validate query params
  const fieldsRaw = url.searchParams.get('fields');
  const from = url.searchParams.get('from');
  const to = url.searchParams.get('to');
  const limitRaw = url.searchParams.get('limit');
  const format = url.searchParams.get('format') || 'json';
  const download = url.searchParams.has('download');
  const staleResponse = stalePageReleaseResponse({ locals, url, request });
  if (staleResponse) return staleResponse;
  const lineage = releaseLineage(locals);

  // Validate dates
  if (from && !DATE_RE.test(from)) {
    return errorResponse('from must be YYYYMMDD format (8 digits)', 400);
  }
  if (to && !DATE_RE.test(to)) {
    return errorResponse('to must be YYYYMMDD format (8 digits)', 400);
  }

  // Validate limit
  let limit = 200;
  if (limitRaw !== null) {
    limit = parseInt(limitRaw, 10);
    if (isNaN(limit) || limit < 1) {
      return errorResponse('limit must be a positive integer', 400);
    }
    if (limit > 1000) limit = 1000;
  }

  // Validate and build field list
  let selectFields = '*';
  let fieldsSorted = '';
  if (fieldsRaw) {
    const requested = fieldsRaw.split(',').map((f) => f.trim()).filter(Boolean);
    const invalid = requested.filter((f) => !VALID_FIELDS.has(f));
    if (invalid.length > 0) {
      return errorResponse(`Invalid fields: ${invalid.join(', ')}`, 400);
    }
    if (requested.length === 0) {
      return errorResponse('fields parameter must not be empty', 400);
    }
    // Always include cert and repdte for meaningful results
    const fieldSet = new Set(requested);
    fieldSet.add('cert');
    fieldSet.add('repdte');
    const sorted = [...fieldSet].sort();
    selectFields = sorted.join(', ');
    fieldsSorted = sorted.join(',');
  }

  const kv = platform?.env?.CACHE;
  const cacheKey = _buildFinancialsCacheKey(cert, fieldsSorted, from, to, limit);

  try {
    const loadFinancials = async (): Promise<Financial[]> => {
      const db = getDB(platform);

      const conditions: string[] = ['cert = ?'];
      const bindParams: unknown[] = [cert];

      if (from) {
        conditions.push('repdte >= ?');
        bindParams.push(from);
      }
      if (to) {
        conditions.push('repdte <= ?');
        bindParams.push(to);
      }

      const where = conditions.join(' AND ');
      const sql = `SELECT ${selectFields} FROM published_financials WHERE ${where} ORDER BY repdte ASC LIMIT ?`;
      bindParams.push(limit);

      return queryAll<Financial>(db, sql, bindParams);
    };
    // Date ranges and field subsets are combinatorial. Only the canonical
    // latest-history request is shared enough to merit a KV entry.
    const shouldCache = fieldsRaw === null
      && from === null
      && to === null
      && limitRaw === null
      && format === 'json'
      && !download;
    const data = shouldCache
      ? await cacheWrap<Financial[]>(kv, cacheKey, SIX_HOURS, loadFinancials, locals?.liveDataGeneration)
      : await loadFinancials();

    const response: FinancialsResponse = {
      data,
      cert,
      from: from || null,
      to: to || null,
      ...lineage
    };

    if (format === 'csv') {
      if (data.length === 0) {
        return setReleaseLineageHeaders(new Response('', {
          status: 200,
          headers: {
            'Content-Type': 'text/csv',
            'Content-Disposition': `attachment; filename="bank_${cert}_financials.csv"`
          }
        }), lineage);
      }
      const csvHeaders = Object.keys(data[0]);
      const csvRows = [
        encodeCsvRow(csvHeaders),
        ...data.map(row => encodeCsvRow(csvHeaders.map(h =>
          (row as unknown as Record<string, unknown>)[h]
        )))
      ];
      return setReleaseLineageHeaders(new Response(csvRows.join('\n'), {
        status: 200,
        headers: {
          'Content-Type': 'text/csv',
          'Content-Disposition': `attachment; filename="bank_${cert}_financials.csv"`,
          'Access-Control-Allow-Origin': '*'
        }
      }), lineage);
    }

    if (format === 'json' && download) {
      return new Response(JSON.stringify(response, null, 2), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Content-Disposition': `attachment; filename="bank_${cert}_financials.json"`,
          'Access-Control-Allow-Origin': '*'
        }
      });
    }

    return jsonResponse(response);
  } catch (err) {
    console.error(`Failed to load financials for cert ${cert}:`, err);
    return errorResponse('Failed to load financial data', 500);
  }
};
