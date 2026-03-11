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
import type { Financial, CompareResponse } from '$lib/types';

const ONE_HOUR = 3600;
const DATE_RE = /^\d{8}$/;

const VALID_METRICS = new Set([
  'roa', 'roe', 'nimy', 'eeffr', 'rbcrwaj', 'rbc1rwaj', 'rbc1aaj',
  'eqv', 'nclnlsr', 'lnatresr', 'nco_ratio', 'lnlsdepr',
  'asset', 'dep', 'eq', 'lnlsnet', 'netinc', 'nim', 'numemp'
]);

function corsJson(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*'
    }
  });
}

export const GET: RequestHandler = async ({ platform, url }) => {
  const certsRaw = url.searchParams.get('certs');
  if (!certsRaw) {
    return corsJson({ error: 'certs parameter is required (comma-separated)' }, 400);
  }

  const certs = certsRaw.split(',').map((c) => parseInt(c.trim(), 10)).filter((c) => !isNaN(c) && c > 0);
  if (certs.length === 0) {
    return corsJson({ error: 'certs must contain valid positive integers' }, 400);
  }
  if (certs.length > 10) {
    return corsJson({ error: 'Maximum 10 certs allowed' }, 400);
  }

  const metricsRaw = url.searchParams.get('metrics') || 'roa,roe,nimy';
  const metrics = metricsRaw.split(',').map((m) => m.trim()).filter(Boolean);
  const invalidMetrics = metrics.filter((m) => !VALID_METRICS.has(m));
  if (invalidMetrics.length > 0) {
    return corsJson({ error: `Invalid metrics: ${invalidMetrics.join(', ')}` }, 400);
  }

  const from = url.searchParams.get('from');
  const to = url.searchParams.get('to');
  if (from && !DATE_RE.test(from)) {
    return corsJson({ error: 'from must be YYYYMMDD format' }, 400);
  }
  if (to && !DATE_RE.test(to)) {
    return corsJson({ error: 'to must be YYYYMMDD format' }, 400);
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

  return corsJson(result);
};
