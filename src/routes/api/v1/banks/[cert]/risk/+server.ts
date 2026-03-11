/**
 * GET /api/v1/banks/[cert]/risk
 * Returns CAMELS-proxy risk scores for a specific bank.
 *
 * Query params:
 *   repdte  - reporting date YYYYMMDD (default: latest available)
 */

import type { RequestHandler } from './$types';
import { getDB, queryOne } from '$lib/server/db';
import { cacheWrap } from '$lib/server/cache';
import { jsonResponse, errorResponse } from '$lib/server/response';
import type { RiskScore, RiskResponse } from '$lib/types';

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
  const cacheKey = `risk:${cert}:${repdteParam || 'latest'}`;

  const result = await cacheWrap<RiskResponse | null>(kv, cacheKey, SIX_HOURS, async () => {
    let sql: string;
    let bindParams: unknown[];

    if (repdteParam) {
      sql = 'SELECT * FROM risk_scores WHERE cert = ? AND repdte = ?';
      bindParams = [cert, repdteParam];
    } else {
      sql = 'SELECT * FROM risk_scores WHERE cert = ? ORDER BY repdte DESC LIMIT 1';
      bindParams = [cert];
    }

    const score = await queryOne<RiskScore>(db, sql, bindParams);
    if (!score) return null;

    return {
      cert,
      repdte: score.repdte,
      scores: {
        capital: score.capital_score,
        asset_quality: score.asset_quality_score,
        earnings: score.earnings_score,
        liquidity: score.liquidity_score,
        composite: score.composite_score
      },
      pca_category: score.pca_category
    };
  });

  if (!result) {
    return errorResponse('No risk score data found for this bank', 404);
  }

  return jsonResponse(result);
};
