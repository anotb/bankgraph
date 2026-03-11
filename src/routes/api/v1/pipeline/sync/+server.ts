/**
 * POST /api/v1/pipeline/sync
 * Admin endpoint to trigger FDIC data sync.
 *
 * Query params:
 *   ?stage=institutions  - run only institution sync
 *   ?stage=financials    - run only financials backfill
 *   ?stage=snapshot      - run only latest-quarter snapshot
 *   (no stage)           - run all stages in order
 */

import type { RequestHandler } from './$types';
import { getDB } from '$lib/server/db';
import { syncInstitutions } from '$lib/server/pipeline/fdic-institutions';
import { syncLatestFinancials } from '$lib/server/pipeline/fdic-financials-snapshot';
import { syncFinancials } from '$lib/server/pipeline/fdic-financials';

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
