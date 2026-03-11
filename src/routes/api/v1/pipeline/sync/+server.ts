/**
 * POST /api/v1/pipeline/sync
 * Admin endpoint to trigger FDIC data sync.
 *
 * Query params:
 *   ?stage=institutions  - run only institution sync
 *   ?stage=financials    - run only financials backfill
 *   ?stage=snapshot      - run only latest-quarter snapshot
 *   ?stage=analytics     - run peer stats and industry aggregates
 *   (no stage)           - run all stages in order
 */

import type { RequestHandler } from './$types';
import { getDB, queryOne } from '$lib/server/db';
import { syncInstitutions } from '$lib/server/pipeline/fdic-institutions';
import { syncLatestFinancials } from '$lib/server/pipeline/fdic-financials-snapshot';
import { syncFinancials } from '$lib/server/pipeline/fdic-financials';
import { computePeerStats } from '$lib/server/analytics/peer-stats';
import { computeIndustryAggregates } from '$lib/server/analytics/industry-agg';

function corsJson(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*'
    }
  });
}

export const POST: RequestHandler = async ({ platform, url }) => {
  const startTime = Date.now();
  const stage = url.searchParams.get('stage');

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

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`=== Sync complete in ${elapsed}s ===`);

    return corsJson({
      ok: true,
      stage: stage ?? 'all',
      elapsed_seconds: Number(elapsed),
      ...results
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`Pipeline sync failed: ${message}`);

    return corsJson(
      {
        ok: false,
        stage: stage ?? 'all',
        error: message,
        elapsed_seconds: Number(((Date.now() - startTime) / 1000).toFixed(1))
      },
      500
    );
  }
};
