/**
 * GET /api/v1/compare
 * Multi-bank comparison endpoint.
 *
 * Query params:
 *   certs    - comma-separated cert numbers (max 10, required)
 *   metrics  - comma-separated metric names (default: roa,roe,nimy)
 *   from     - start date YYYYMMDD (optional)
 *   to       - end date YYYYMMDD (optional)
 */

import type { RequestHandler } from './$types';
import { getDB, queryAll } from '$lib/server/db';
import { cacheWrap } from '$lib/server/cache';
import { jsonResponse, errorResponse } from '$lib/server/response';
import type { Financial, CompareResponse } from '$lib/types';

const ONE_HOUR = 3600;
const DATE_RE = /^\d{8}$/;

const VALID_METRICS = new Set([
  'roa', 'roe', 'nimy', 'eeffr', 'rbcrwaj', 'rbc1rwaj', 'rbc1aaj',
  'eqv', 'nclnlsr', 'lnatresr', 'nco_ratio', 'lnlsdepr',
  'asset', 'dep', 'eq', 'lnlsnet', 'netinc', 'nim', 'numemp'
]);

export const GET: RequestHandler = async ({ platform, url }) => {
  const certsRaw = url.searchParams.get('certs');
  if (!certsRaw) {
    return errorResponse('certs parameter is required (comma-separated)', 400);
  }

  const certs = certsRaw.split(',').map((c) => parseInt(c.trim(), 10)).filter((c) => !isNaN(c) && c > 0);
  if (certs.length === 0) {
    return errorResponse('certs must contain valid positive integers', 400);
  }
  if (certs.length > 10) {
    return errorResponse('Maximum 10 certs allowed', 400);
  }

  const metricsRaw = url.searchParams.get('metrics') || 'roa,roe,nimy';
  const metrics = metricsRaw.split(',').map((m) => m.trim()).filter(Boolean);
  const invalidMetrics = metrics.filter((m) => !VALID_METRICS.has(m));
  if (invalidMetrics.length > 0) {
    return errorResponse(`Invalid metrics: ${invalidMetrics.join(', ')}`, 400);
  }

  const from = url.searchParams.get('from');
  const to = url.searchParams.get('to');
  if (from && !DATE_RE.test(from)) {
    return errorResponse('from must be YYYYMMDD format', 400);
  }
  if (to && !DATE_RE.test(to)) {
    return errorResponse('to must be YYYYMMDD format', 400);
  }

  const kv = platform?.env?.CACHE;
  const sortedCerts = [...certs].sort((a, b) => a - b);
  const cacheKey = `compare:${sortedCerts.join(',')}:${metrics.join(',')}:${from || ''}:${to || ''}`;

  const result = await cacheWrap<CompareResponse>(kv, cacheKey, ONE_HOUR, async () => {
    const db = getDB(platform);

    // Build select columns: always include cert + repdte + requested metrics
    const columns = ['cert', 'repdte', ...metrics];
    const selectFields = columns.join(', ');

    const data: Record<number, Financial[]> = {};

    for (const cert of certs) {
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
      const rows = await queryAll<Financial>(
        db,
        `SELECT ${selectFields} FROM financials WHERE ${where} ORDER BY repdte ASC`,
        bindParams
      );

      data[cert] = rows;
    }

    return {
      certs: sortedCerts,
      metrics,
      data
    } as CompareResponse;
  });

  const format = url.searchParams.get('format') || 'json';

  if (format === 'csv') {
    // Flatten: one row per cert+repdte, columns = cert, repdte, metric1, metric2...
    const flatRows = result.certs.flatMap(cert =>
      (result.data[cert] ?? []).map(r => r as unknown as Record<string, unknown>)
    );

    if (flatRows.length === 0) {
      return new Response('', {
        status: 200,
        headers: { 'Content-Type': 'text/csv', 'Content-Disposition': 'attachment; filename="comparison.csv"' }
      });
    }

    const csvHeaders = ['cert', 'repdte', ...result.metrics];
    const csvLines = [
      csvHeaders.join(','),
      ...flatRows.map(row =>
        csvHeaders.map(h => {
          const val = row[h];
          return val === null || val === undefined ? '' : String(val);
        }).join(',')
      )
    ];
    return new Response(csvLines.join('\n'), {
      status: 200,
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': 'attachment; filename="comparison.csv"',
        'Access-Control-Allow-Origin': '*'
      }
    });
  }

  if (format === 'json' && url.searchParams.has('download')) {
    return new Response(JSON.stringify(result, null, 2), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': 'attachment; filename="comparison.json"',
        'Access-Control-Allow-Origin': '*'
      }
    });
  }

  return jsonResponse(result);
};
