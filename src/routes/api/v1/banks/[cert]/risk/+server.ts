/**
 * GET /api/v1/banks/[cert]/risk
 * Returns analytical risk-proxy scores for a specific bank.
 *
 * Query params:
 *   repdte  - reporting date YYYYMMDD (default: latest available)
 */

import type { RequestHandler } from './$types';
import { getDB, queryOne } from '$lib/server/db';
import { cacheWrap } from '$lib/server/cache';
import { jsonResponse, errorResponse } from '$lib/server/response';
import type { RiskScore, RiskResponse } from '$lib/types';
import {
  buildRiskMethodology,
  MIN_RISK_COMPOSITE_COMPONENTS
} from '$lib/server/analytics/analysis-methodology';

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
  const cacheKey = `risk:v3:${cert}:${repdteParam || 'latest'}`;

  try {
    const loadRisk = async (): Promise<RiskResponse | null> => {
      let sql: string;
      let bindParams: unknown[];

      if (repdteParam) {
        sql = 'SELECT * FROM published_risk_scores WHERE cert = ? AND repdte = ?';
        bindParams = [cert, repdteParam];
      } else {
        sql = 'SELECT * FROM published_risk_scores WHERE cert = ? ORDER BY repdte DESC LIMIT 1';
        bindParams = [cert];
      }

      const score = await queryOne<RiskScore>(db, sql, bindParams);
      if (!score) return null;

      const componentScores = {
        capital: score.capital_score,
        asset_quality: score.asset_quality_score,
        earnings: score.earnings_score,
        liquidity: score.liquidity_score
      };
      const availableComponents = Object.values(componentScores).filter((value) => value != null).length;
      const scores = {
        ...componentScores,
        // Suppress composites written by an older method when fewer than three
        // dimensions were available. The next risk stage rewrites the stored row.
        composite: availableComponents >= MIN_RISK_COMPOSITE_COMPONENTS
          ? score.composite_score
          : null
      };
      const capitalRatioScreen = score.pca_category === 'critically_undercapitalized'
        ? 'significantly_undercapitalized'
        : score.pca_category;

      return {
        cert,
        repdte: score.repdte,
        scores,
        capital_ratio_screen: capitalRatioScreen,
        // Kept for v1 clients; this is the same deterministic screen, not PCA status.
        pca_category: capitalRatioScreen,
        methodology: buildRiskMethodology(scores)
      };
    };
    const result = repdteParam === null
      ? await cacheWrap<RiskResponse | null>(kv, cacheKey, SIX_HOURS, loadRisk, locals?.liveDataGeneration)
      : await loadRisk();

    if (!result) {
      return errorResponse('No risk score data found for this bank', 404);
    }

    return jsonResponse(result);
  } catch (err) {
    console.error(`Failed to load risk data for cert ${cert}:`, err);
    return errorResponse('Failed to load risk score data', 500);
  }
};
