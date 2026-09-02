import type { RequestHandler } from './$types';
import { getDB } from '$lib/server/db';
import { logError, logInfo, logWarn } from '$lib/server/observability';
import { verifyPipelineBearer } from '$lib/server/pipeline/auth';
import {
  acquirePipelineStageLease,
  parsePipelineRunId,
  releasePipelineStageLease,
  startPipelineLeaseHeartbeat,
  type PipelineLeaseHeartbeat,
  type PipelineStageLease
} from '$lib/server/pipeline/stage-lease';
import {
  assertPublicationBarrierClosed,
  closePublicationBarrier,
  recordPipelineStageCompletion
} from '$lib/server/publication-barrier';
import {
  D1FDICIngestStore,
  FDICPartitionError,
  parseFDICDataset,
  resolveFDICPartition,
  runFDICPartition
} from '$lib/server/pipeline/fdic-partitioned-ingest';

function adminJson(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
  });
}

/**
 * Process a bounded number of pages for exactly one FDIC partition.
 * Repeating the same request resumes its checkpoint until `done` is true.
 */
export const POST: RequestHandler = async ({ platform, request, url }) => {
  const secret = platform?.env?.PIPELINE_SECRET;
  if (!secret) {
    logError('fdic_partition_secret_missing', { route: '/api/v1/pipeline/fdic/backfill' });
    return adminJson({ ok: false, error: 'PIPELINE_SECRET not configured on server' }, 500);
  }
  if (!(await verifyPipelineBearer(request.headers.get('Authorization'), secret))) {
    logWarn('fdic_partition_auth_rejected', { route: '/api/v1/pipeline/fdic/backfill' });
    return adminJson({ ok: false, error: 'Unauthorized' }, 401);
  }

  let lease: PipelineStageLease | null = null;
  let heartbeat: PipelineLeaseHeartbeat | null = null;
  let db: D1Database | null = null;
  let runId: string | null = null;
  let dataset: ReturnType<typeof parseFDICDataset> | null = null;
  let partition: string | null = null;
  try {
    dataset = parseFDICDataset(url.searchParams.get('dataset'));
    const rawPartition = url.searchParams.get('partition');
    if (!rawPartition) throw new FDICPartitionError('partition is required');
    partition = await resolveFDICPartition(dataset, rawPartition);
    const maxPagesRaw = url.searchParams.get('max_pages');
    const maxPages = maxPagesRaw == null ? 1 : Number(maxPagesRaw);
    const refresh = url.searchParams.get('refresh') === 'true';
    runId = parsePipelineRunId(request.headers.get('X-Pipeline-Run-Id'));
    db = getDB(platform);
    lease = await acquirePipelineStageLease(db, `fdic-${dataset}:${partition}`, runId);
    if (!lease) {
      logWarn('fdic_partition_lease_conflict', { dataset, partition, run_id: runId });
      return adminJson({ ok: false, error: 'Another pipeline stage is already running' }, 409);
    }
    heartbeat = startPipelineLeaseHeartbeat(db, lease);

    await heartbeat.assertOwned();
    await closePublicationBarrier(db);
    await assertPublicationBarrierClosed(db);

    const result = await runFDICPartition({
      dataset,
      partition,
      refresh,
      maxPages,
      store: new D1FDICIngestStore(db)
    });
    await heartbeat.assertOwned();
    await assertPublicationBarrierClosed(db);
    if (result.done) {
      await recordPipelineStageCompletion(db, runId, `fdic-${dataset}`, partition);
    }
    logInfo('fdic_partition_step_completed', {
      dataset,
      partition,
      run_id: result.run_id,
      status: result.status,
      rows_seen: result.rows_seen,
      source_total: result.source_total,
      publication_phase: result.publication_phase,
      rows_materialized: result.rows_materialized
    });
    return adminJson({ ok: true, result }, result.done ? 200 : 202);
  } catch (error) {
    const status = error instanceof FDICPartitionError ? error.status : 500;
    const message = error instanceof Error ? error.message : 'Unknown FDIC ingestion error';
    logError('fdic_partition_step_failed', { error: message, status });
    return adminJson({ ok: false, error: message }, status);
  } finally {
    if (db && lease) {
      try {
		await heartbeat?.stop();
        await releasePipelineStageLease(db, lease);
      } catch (error) {
        logError('fdic_partition_lease_release_failed', {
          dataset,
          partition,
          run_id: runId,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }
  }
};
