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
import { buildAnomalyMethodology } from '$lib/server/analytics/analysis-methodology';

const SIX_HOURS = 21600;
const DATE_RE = /^\d{8}$/;
const MAX_CERT = 9_999_999;

export const GET: RequestHandler = async ({ params, platform, url, locals }) => {
  if (!/^[1-9]\d*$/.test(params.cert)) {
    return errorResponse('cert must be a positive integer', 400);
  }
  const cert = Number(params.cert);
  if (!Number.isSafeInteger(cert) || cert > MAX_CERT) {
    return errorResponse(`cert must not exceed ${MAX_CERT}`, 400);
  }

  const repdteParam = url.searchParams.get('repdte');
  if (repdteParam && !DATE_RE.test(repdteParam)) {
    return errorResponse('repdte must be YYYYMMDD format', 400);
  }

  const db = getDB(platform);
  const kv = platform?.env?.CACHE;
  const cacheKey = `anomalies:v2:${cert}:${repdteParam || 'all'}`;

  try {
    const loadAnomalies = async (): Promise<AnomalyResponse> => {
      let sql = 'SELECT * FROM published_anomalies WHERE cert = ?';
      const bindParams: unknown[] = [cert];

      if (repdteParam) {
        sql += ' AND repdte = ?';
        bindParams.push(repdteParam);
      }

      sql += ' ORDER BY repdte DESC, severity ASC, metric ASC';

      let coverageSql = `SELECT MIN(repdte) AS from_repdte,
                                MAX(repdte) AS to_repdte,
                                COUNT(DISTINCT repdte) AS quarter_count
                         FROM published_financials WHERE cert = ?`;
      const coverageParams: unknown[] = [cert];
      if (repdteParam) {
        coverageSql += ' AND repdte = ?';
        coverageParams.push(repdteParam);
      }

      const [anomalies, coverageRows] = await Promise.all([
        queryAll<Anomaly>(db, sql, bindParams),
        queryAll<{
          from_repdte: string | null;
          to_repdte: string | null;
          quarter_count: number;
        }>(db, coverageSql, coverageParams)
      ]);

      const counts = { critical: 0, warning: 0, info: 0 };
      for (const a of anomalies) {
        if (a.severity === 'critical') counts.critical++;
        else if (a.severity === 'warning') counts.warning++;
        else counts.info++;
      }

      const coverage = coverageRows[0] ?? {
        from_repdte: null,
        to_repdte: null,
        quarter_count: 0
      };

      return {
        cert,
        anomalies,
        counts,
        methodology: buildAnomalyMethodology({
          ...coverage,
          quarter_count: Number(coverage.quarter_count) || 0,
          requested_repdte: repdteParam
        })
      };
    };
    const result = repdteParam === null
      ? await cacheWrap<AnomalyResponse>(kv, cacheKey, SIX_HOURS, loadAnomalies, locals?.liveDataGeneration)
      : await loadAnomalies();

    return jsonResponse(result);
  } catch (err) {
    console.error(`Failed to load anomalies for cert ${cert}:`, err);
    return errorResponse('Failed to load anomaly data', 500);
  }
};
