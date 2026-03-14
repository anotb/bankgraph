/**
 * GET /api/v1/banks/[cert]/risk/history
 * Returns risk score history for the last N quarters.
 *
 * Query params:
 *   limit - number of quarters (default: 8, max: 20)
 */

import type { RequestHandler } from './$types';
import { getDB, queryAll } from '$lib/server/db';
import { cacheWrap } from '$lib/server/cache';
import { jsonResponse, errorResponse } from '$lib/server/response';
import type { RiskScore } from '$lib/types';

const SIX_HOURS = 21600;

export const GET: RequestHandler = async ({ params, platform, url }) => {
  const cert = parseInt(params.cert, 10);
  if (isNaN(cert) || cert < 1) {
    return errorResponse('cert must be a positive integer', 400);
  }

  const limitParam = url.searchParams.get('limit');
  const limit = Math.min(20, Math.max(1, parseInt(limitParam || '8', 10) || 8));

  const db = getDB(platform);
  const kv = platform?.env?.CACHE;
  const cacheKey = `risk-history:${cert}:${limit}`;

  try {
    const rows = await cacheWrap<RiskScore[]>(kv, cacheKey, SIX_HOURS, async () => {
      return queryAll<RiskScore>(
        db,
        `SELECT cert, repdte, capital_score, asset_quality_score,
                earnings_score, liquidity_score, composite_score, pca_category
         FROM risk_scores
         WHERE cert = ?
         ORDER BY repdte DESC
         LIMIT ?`,
        [cert, limit]
      );
    });

    // Return chronological order (oldest first)
    const history = rows.reverse().map((r) => ({
      repdte: r.repdte,
      composite: r.composite_score,
      capital: r.capital_score,
      asset_quality: r.asset_quality_score,
      earnings: r.earnings_score,
      liquidity: r.liquidity_score
    }));

    return jsonResponse({ cert, history });
  } catch (err) {
    console.error(`Failed to load risk history for cert ${cert}:`, err);
    return errorResponse('Failed to load risk history', 500);
  }
};
