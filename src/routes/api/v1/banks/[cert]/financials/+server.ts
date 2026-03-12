import type { RequestHandler } from './$types';
import { getDB, queryAll } from '$lib/server/db';
import { cacheWrap } from '$lib/server/cache';
import { jsonResponse, errorResponse } from '$lib/server/response';
import type { Financial, FinancialsResponse } from '$lib/types';

const SIX_HOURS = 21600;

const VALID_FIELDS = new Set([
  'cert', 'repdte', 'asset', 'dep', 'eq', 'lnlsnet', 'lnre', 'lnci', 'lncon', 'sec',
  'netinc', 'intinc', 'eintexp', 'nim', 'nonii', 'nonix', 'elnatr',
  'roa', 'roe', 'nimy', 'eeffr', 'rbcrwaj', 'rbc1rwaj', 'rbc1aaj', 'eqv',
  'nclnlsr', 'lnatresr', 'nco_ratio', 'lnlsdepr', 'othbfhlb', 'numemp', 'asset_bucket'
]);

const DATE_RE = /^\d{8}$/;

export const GET: RequestHandler = async ({ params, platform, url }) => {
  const cert = parseInt(params.cert, 10);
  if (isNaN(cert) || cert < 1) {
    return errorResponse('cert must be a positive integer', 400);
  }

  // Parse and validate query params
  const fieldsRaw = url.searchParams.get('fields');
  const from = url.searchParams.get('from');
  const to = url.searchParams.get('to');
  const limitRaw = url.searchParams.get('limit');

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
  const cacheKey = `fin:${cert}:${fieldsSorted}:${from || ''}:${to || ''}`;

  const data = await cacheWrap<Financial[]>(kv, cacheKey, SIX_HOURS, async () => {
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
    const sql = `SELECT ${selectFields} FROM financials WHERE ${where} ORDER BY repdte ASC LIMIT ?`;
    bindParams.push(limit);

    return queryAll<Financial>(db, sql, bindParams);
  });

  const response: FinancialsResponse = {
    data,
    cert,
    from: from || null,
    to: to || null
  };

  const format = url.searchParams.get('format') || 'json';

  if (format === 'csv') {
    if (data.length === 0) {
      return new Response('', {
        status: 200,
        headers: {
          'Content-Type': 'text/csv',
          'Content-Disposition': `attachment; filename="bank_${cert}_financials.csv"`
        }
      });
    }
    const csvHeaders = Object.keys(data[0]);
    const csvRows = [
      csvHeaders.join(','),
      ...data.map(row => csvHeaders.map(h => {
        const val = (row as unknown as Record<string, unknown>)[h];
        return val === null || val === undefined ? '' : String(val);
      }).join(','))
    ];
    return new Response(csvRows.join('\n'), {
      status: 200,
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="bank_${cert}_financials.csv"`,
        'Access-Control-Allow-Origin': '*'
      }
    });
  }

  if (format === 'json' && url.searchParams.has('download')) {
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
};
