/**
 * POST /api/v1/pipeline/sync
 * Admin endpoint to trigger FDIC data sync.
 *
 * Query params:
 *   ?stage=institutions  - run only institution sync
 *   ?stage=financials    - run only financials backfill
 *   ?stage=failures      - run only failures sync
 *   ?stage=snapshot      - run only latest-quarter snapshot
 *   ?stage=analytics     - run peer stats and industry aggregates
 *   ?stage=trends        - run trend computation
 *   ?stage=anomalies     - run anomaly detection
 *   ?stage=risk          - run risk score computation
 *   ?stage=fred          - run FRED macro data sync
 *   ?stage=correlations  - run correlation computation
 *   (no stage)           - run all stages in order
 */

import type { RequestHandler } from './$types';
import { getDB, queryOne } from '$lib/server/db';
import { syncInstitutions } from '$lib/server/pipeline/fdic-institutions';
import { syncLatestFinancials } from '$lib/server/pipeline/fdic-financials-snapshot';
import { syncFinancials } from '$lib/server/pipeline/fdic-financials';
import { syncFailures } from '$lib/server/pipeline/fdic-failures';
import { computePeerStats } from '$lib/server/analytics/peer-stats';
import { computeIndustryAggregates } from '$lib/server/analytics/industry-agg';
import { computeAllTrends } from '$lib/server/analytics/trends';
import { detectAnomalies } from '$lib/server/analytics/anomalies';
import { computeRiskScores } from '$lib/server/analytics/risk-scores';
import { syncFredData } from '$lib/server/pipeline/fred-sync';
import { computeCorrelations } from '$lib/server/analytics/correlations';

/** No CORS headers on this endpoint (server-to-server only). */
function pipelineJson(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

export const POST: RequestHandler = async ({ platform, url, request }) => {
  // --- Auth: require Bearer token matching PIPELINE_SECRET ---
  const secret = platform?.env?.PIPELINE_SECRET;
  if (!secret) {
    return pipelineJson({ ok: false, error: 'PIPELINE_SECRET not configured on server' }, 500);
  }

  const authHeader = request.headers.get('Authorization');
  if (!authHeader || authHeader !== `Bearer ${secret}`) {
    return pipelineJson({ ok: false, error: 'Unauthorized' }, 401);
  }
  const startTime = Date.now();
  const stage = url.searchParams.get('stage');

  const VALID_STAGES = ['institutions', 'financials', 'failures', 'snapshot', 'analytics', 'trends', 'anomalies', 'risk', 'fred', 'correlations'];
  if (stage && !VALID_STAGES.includes(stage)) {
    return pipelineJson({ ok: false, error: `Unknown stage: ${stage}` }, 400);
  }

  try {
    const db = getDB(platform);
    const results: Record<string, unknown> = {};

    // Stage: institutions
    if (!stage || stage === 'institutions') {
      console.log('=== Stage: institutions ===');
      const t0 = Date.now();
      const institutionResult = await syncInstitutions(db);
      results.institutions = {
        ...institutionResult,
        elapsed_seconds: Number(((Date.now() - t0) / 1000).toFixed(1))
      };
    }

    // Stage: financials backfill (all historical data)
    if (!stage || stage === 'financials') {
      console.log('=== Stage: financials backfill ===');
      const t0 = Date.now();
      const financialsResult = await syncFinancials(db);
      results.financials = {
        ...financialsResult,
        elapsed_seconds: Number(((Date.now() - t0) / 1000).toFixed(1))
      };
    }

    // Stage: failures (bank failure records)
    if (!stage || stage === 'failures') {
      console.log('=== Stage: failures ===');
      const t0 = Date.now();
      const failuresResult = await syncFailures(db);
      results.failures = {
        ...failuresResult,
        elapsed_seconds: Number(((Date.now() - t0) / 1000).toFixed(1))
      };
    }

    // Stage: snapshot (latest quarter into institutions table)
    if (!stage || stage === 'snapshot') {
      console.log('=== Stage: financial snapshot ===');
      const t0 = Date.now();
      const snapshotUpdated = await syncLatestFinancials(db);
      results.snapshot = {
        updated: snapshotUpdated,
        elapsed_seconds: Number(((Date.now() - t0) / 1000).toFixed(1))
      };
    }

    // Stage: analytics (peer stats and industry aggregates)
    if (!stage || stage === 'analytics') {
      console.log('=== Stage: analytics ===');
      const t0 = Date.now();

      // Find the latest quarter with financial data
      const latestQ = await queryOne<{ repdte: string }>(
        db,
        'SELECT repdte FROM financials ORDER BY repdte DESC LIMIT 1'
      );

      if (latestQ) {
        const peerRows = await computePeerStats(db, latestQ.repdte);
        const industryRows = await computeIndustryAggregates(db, latestQ.repdte);
        results.analytics = {
          repdte: latestQ.repdte,
          peer_stats_rows: peerRows,
          industry_agg_rows: industryRows,
          elapsed_seconds: Number(((Date.now() - t0) / 1000).toFixed(1))
        };
      } else {
        results.analytics = {
          skipped: true,
          reason: 'No financial data found',
          elapsed_seconds: Number(((Date.now() - t0) / 1000).toFixed(1))
        };
      }
    }

    // Stage: trends (compute trend analytics)
    if (!stage || stage === 'trends') {
      console.log('=== Stage: trends ===');
      const t0 = Date.now();

      const latestQ = await queryOne<{ repdte: string }>(
        db,
        'SELECT repdte FROM financials ORDER BY repdte DESC LIMIT 1'
      );

      if (latestQ) {
        const trendRows = await computeAllTrends(db, latestQ.repdte);
        results.trends = {
          repdte: latestQ.repdte,
          rows_inserted: trendRows,
          elapsed_seconds: Number(((Date.now() - t0) / 1000).toFixed(1))
        };
      } else {
        results.trends = {
          skipped: true,
          reason: 'No financial data found',
          elapsed_seconds: Number(((Date.now() - t0) / 1000).toFixed(1))
        };
      }
    }

    // Stage: anomalies (detect anomalies)
    if (!stage || stage === 'anomalies') {
      console.log('=== Stage: anomalies ===');
      const t0 = Date.now();

      const latestQ = await queryOne<{ repdte: string }>(
        db,
        'SELECT repdte FROM financials ORDER BY repdte DESC LIMIT 1'
      );

      if (latestQ) {
        const anomalyCount = await detectAnomalies(db, latestQ.repdte);
        results.anomalies = {
          repdte: latestQ.repdte,
          anomalies_detected: anomalyCount,
          elapsed_seconds: Number(((Date.now() - t0) / 1000).toFixed(1))
        };
      } else {
        results.anomalies = {
          skipped: true,
          reason: 'No financial data found',
          elapsed_seconds: Number(((Date.now() - t0) / 1000).toFixed(1))
        };
      }
    }

    // Stage: risk (compute risk scores)
    if (!stage || stage === 'risk') {
      console.log('=== Stage: risk ===');
      const t0 = Date.now();

      const latestQ = await queryOne<{ repdte: string }>(
        db,
        'SELECT repdte FROM financials ORDER BY repdte DESC LIMIT 1'
      );

      if (latestQ) {
        const riskRows = await computeRiskScores(db, latestQ.repdte);
        results.risk = {
          repdte: latestQ.repdte,
          scores_computed: riskRows,
          elapsed_seconds: Number(((Date.now() - t0) / 1000).toFixed(1))
        };
      } else {
        results.risk = {
          skipped: true,
          reason: 'No financial data found',
          elapsed_seconds: Number(((Date.now() - t0) / 1000).toFixed(1))
        };
      }
    }

    // Stage: fred (sync FRED macro data)
    if (!stage || stage === 'fred') {
      console.log('=== Stage: fred ===');
      const t0 = Date.now();

      const fredApiKey = platform?.env?.FRED_API_KEY;
      if (fredApiKey) {
        const fredResult = await syncFredData(db, fredApiKey);
        results.fred = {
          ...fredResult,
          elapsed_seconds: Number(((Date.now() - t0) / 1000).toFixed(1))
        };
      } else {
        results.fred = {
          skipped: true,
          reason: 'FRED_API_KEY not configured',
          elapsed_seconds: Number(((Date.now() - t0) / 1000).toFixed(1))
        };
      }
    }

    // Stage: correlations (compute macro vs bank metric correlations)
    if (!stage || stage === 'correlations') {
      console.log('=== Stage: correlations ===');
      const t0 = Date.now();

      const corrRows = await computeCorrelations(db);
      results.correlations = {
        rows_inserted: corrRows,
        elapsed_seconds: Number(((Date.now() - t0) / 1000).toFixed(1))
      };
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`=== Sync complete in ${elapsed}s ===`);

    return pipelineJson({
      ok: true,
      stage: stage ?? 'all',
      elapsed_seconds: Number(elapsed),
      ...results
    });
  } catch (err) {
    console.error('Pipeline error:', err);
    return pipelineJson({ ok: false, stage: stage ?? 'all', error: 'Internal pipeline error' }, 500);
  }
};
