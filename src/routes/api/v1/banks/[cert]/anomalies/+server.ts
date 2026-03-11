/**
 * GET /api/v1/banks/[cert]/anomalies
 * Returns anomaly detections for a specific bank.
 *
 * Query params:
 *   repdte  - reporting date YYYYMMDD (default: all available)
 */

import type { RequestHandler } from './$types';
import { getDB, queryAll } from '$lib/server/db';
import { cacheWrap } from '$lib/server/cache';
import { jsonResponse, errorResponse } from '$lib/server/response';
import type { Anomaly, AnomalyResponse } from '$lib/types';

const SIX_HOURS = 21600;
const DATE_RE = /^\d{8}$/;

export const GET: RequestHandler = async ({ params, platform, url }) => {
  const cert = parseInt(params.cert, 10);
  if (isNaN(cert) || cert < 1) {
    return errorResponse('cert must be a positive integer', 400);
  }

  const repdteParam = url.searchParams.get('repdte');
  if (repdteParam && !DATE_RE.test(repdteParam)) {
    return errorResponse('repdte must be YYYYMMDD format', 400);
  }

  const db = getDB(platform);
  const kv = platform?.env?.CACHE;
  const cacheKey = `anomalies:${cert}:${repdteParam || 'all'}`;

  const result = await cacheWrap<AnomalyResponse>(kv, cacheKey, SIX_HOURS, async () => {
    let sql = 'SELECT * FROM anomalies WHERE cert = ?';
    const bindParams: unknown[] = [cert];

    if (repdteParam) {
      sql += ' AND repdte = ?';
      bindParams.push(repdteParam);
    }

    sql += ' ORDER BY repdte DESC, severity ASC, metric ASC';

    const anomalies = await queryAll<Anomaly>(db, sql, bindParams);

    const counts = { critical: 0, warning: 0, info: 0 };
    for (const a of anomalies) {
      if (a.severity === 'critical') counts.critical++;
      else if (a.severity === 'warning') counts.warning++;
      else counts.info++;
    }

    return { cert, anomalies, counts };
  });

  return jsonResponse(result);
};
