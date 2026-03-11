/**
 * POST /api/v1/pipeline/sync
 * Admin endpoint to trigger a full FDIC data sync (institutions + financials).
 */

import type { RequestHandler } from './$types';
import { getDB } from '$lib/server/db';
import { syncInstitutions } from '$lib/server/pipeline/fdic-institutions';
import { syncLatestFinancials } from '$lib/server/pipeline/fdic-financials-snapshot';

function corsJson(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*'
    }
  });
}

export const POST: RequestHandler = async ({ platform }) => {
  const startTime = Date.now();

  try {
    const db = getDB(platform);

    // Phase 1: sync institutions
    console.log('=== Starting full FDIC sync ===');
    const institutionResult = await syncInstitutions(db);

    // Phase 2: sync financial snapshot
    const financialsUpdated = await syncLatestFinancials(db);

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`=== Full sync complete in ${elapsed}s ===`);

    return corsJson({
      ok: true,
      elapsed_seconds: Number(elapsed),
      institutions: institutionResult,
      financials_updated: financialsUpdated
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`Pipeline sync failed: ${message}`);

    return corsJson(
      {
        ok: false,
        error: message,
        elapsed_seconds: Number(((Date.now() - startTime) / 1000).toFixed(1))
      },
      500
    );
  }
};
