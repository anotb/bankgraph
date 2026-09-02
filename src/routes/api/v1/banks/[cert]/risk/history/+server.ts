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
import {
  buildRiskHistoryComparison,
  MIN_RISK_COMPOSITE_COMPONENTS,
  riskComponentCoverage
} from '$lib/server/analytics/analysis-methodology';

const SIX_HOURS = 21600;
const MAX_CERT = 9_999_999;

export const GET: RequestHandler = async ({ params, platform, url, locals }) => {
  if (!/^[1-9]\d*$/.test(params.cert)) {
    return errorResponse('cert must be a positive integer', 400);
  }
  const cert = Number(params.cert);
  if (!Number.isSafeInteger(cert) || cert > MAX_CERT) {
    return errorResponse(`cert must not exceed ${MAX_CERT}`, 400);
  }

  const limitParam = url.searchParams.get('limit');
  const limit = Math.min(20, Math.max(1, parseInt(limitParam || '8', 10) || 8));

  const db = getDB(platform);
  const kv = platform?.env?.CACHE;
  const cacheKey = `risk-history:v2:${cert}:${limit}`;

  try {
    const rows = await cacheWrap<RiskScore[]>(kv, cacheKey, SIX_HOURS, async () => {
      return queryAll<RiskScore>(
        db,
        `SELECT cert, repdte, capital_score, asset_quality_score,
                earnings_score, liquidity_score, composite_score, pca_category
         FROM published_risk_scores
         WHERE cert = ?
         ORDER BY repdte DESC
         LIMIT ?`,
        [cert, limit]
      );
    }, locals?.liveDataGeneration);

    // Return chronological order (oldest first)
    const chronologicalRows = rows.reverse();
    const pointScores = chronologicalRows.map((row) => {
      const components = {
        capital: row.capital_score,
        asset_quality: row.asset_quality_score,
        earnings: row.earnings_score,
        liquidity: row.liquidity_score
      };
      const availableComponents = Object.values(components).filter((value) => value != null).length;
      return {
        ...components,
        composite: availableComponents >= MIN_RISK_COMPOSITE_COMPONENTS
          ? row.composite_score
          : null
      };
    });
    const comparison = buildRiskHistoryComparison(pointScores);

    const history = chronologicalRows.map((row, index) => {
      const scores = pointScores[index];
      const coverage = riskComponentCoverage(scores);
      const signature = coverage.included_components.join('|');
      const priorCoverage = index > 0 ? riskComponentCoverage(pointScores[index - 1]) : null;

      return {
        repdte: row.repdte,
        ...scores,
        coverage: {
          ...coverage,
          signature,
          comparable_to_previous: priorCoverage === null
            ? null
            : scores.composite != null
              && pointScores[index - 1].composite != null
              && signature === priorCoverage.included_components.join('|')
        }
      };
    });

    return jsonResponse({ cert, history, comparison });
  } catch (err) {
    console.error(`Failed to load risk history for cert ${cert}:`, err);
    return errorResponse('Failed to load risk history', 500);
  }
};
