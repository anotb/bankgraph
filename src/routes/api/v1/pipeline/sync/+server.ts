/**
 * POST /api/v1/pipeline/sync
 * Admin endpoint to trigger FDIC data sync.
 *
 * SECURITY: this authenticated mutation route is intentionally excluded from
 * WebMCP tool registration. It is server-to-server only and must remain absent
 * from browser-discoverable tool manifests.
 *
 * Query params:
 *   ?stage=institutions  - run only institution sync
 *   ?stage=financials    - run only financials backfill
 *   ?stage=failures      - run only failures sync
 *   ?stage=snapshot      - run only latest-quarter snapshot
 *   ?stage=analytics     - run peer stats and industry aggregates
 *   ?stage=industry-history - fill one missing quarter in the ten-year aggregate window
 *   ?stage=trends        - run trend computation
 *   ?stage=anomalies     - run anomaly detection
 *   ?stage=risk          - run risk score computation
 *   ?stage=macro&series=UST10Y - sync one bounded direct-source series window;
 *     an authenticated release runner may attach an exact BLS API slice,
 *     allowlisted CPI bulk-file slice, or Federal Reserve CSV slice when
 *     Cloudflare cannot retrieve it
 *   ?stage=correlations  - run correlation computation
 *   ?stage=coverage-audit - pin and verify all extended FDIC coverage
 *   ?stage=publish       - publish a complete release to public readers
 *
 * A stage is always required. The scheduler runs stages as separate bounded
 * requests so one accidental call cannot execute the entire pipeline.
 */

import type { RequestHandler } from './$types';
import { getDB, queryOne, queryAll } from '$lib/server/db';
import { logError, logInfo, logWarn } from '$lib/server/observability';
import { syncInstitutions } from '$lib/server/pipeline/fdic-institutions';
import { syncLatestFinancials } from '$lib/server/pipeline/fdic-financials-snapshot';
import {
  CANONICAL_FINANCIAL_SCOPE,
  CANONICAL_FINANCIAL_START,
  ensureCanonicalFinancialCoverage,
  resetFinancialSyncCheckpoint,
  syncFinancials,
  syncLatestQuarterFinancials
} from '$lib/server/pipeline/fdic-financials';
import { syncFailures } from '$lib/server/pipeline/fdic-failures';
import { computePeerStats } from '$lib/server/analytics/peer-stats';
import { computeIndustryAggregates } from '$lib/server/analytics/industry-agg';
import { backfillIndustryAggregateHistory } from '$lib/server/analytics/industry-history';
import { computeAllTrends } from '$lib/server/analytics/trends';
import { detectAnomalies } from '$lib/server/analytics/anomalies';
import { computeRiskScores } from '$lib/server/analytics/risk-scores';
import { MacroSyncError, syncMacroSeries } from '$lib/server/pipeline/macro-sync';
import { computeCorrelations } from '$lib/server/analytics/correlations';
import {
  acquirePipelineStageLease,
  parsePipelineRunId,
  releasePipelineStageLease,
  startPipelineLeaseHeartbeat,
  type PipelineLeaseHeartbeat,
  type PipelineStageLease
} from '$lib/server/pipeline/stage-lease';
import { verifyPipelineBearer } from '$lib/server/pipeline/auth';
import { parsePipelineStage, PipelineStageError } from '$lib/server/pipeline/stages';
import {
  closeBarrierUnlessPublished,
  closePublicationBarrier,
  readPublicationControl,
  recordPipelineStageCompletion
} from '$lib/server/publication-barrier';
import { coordinatePublication } from '$lib/server/publication-coordinator';
import { auditFDICCoverage } from '$lib/server/pipeline/fdic-coverage-audit';

/** No CORS headers on this endpoint (server-to-server only). */
function pipelineJson(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

const MAX_MACRO_SOURCE_PAYLOAD_BYTES = 256_000;

interface UploadedMacroSource {
  sourcePayload: unknown;
  sourceTransport: 'bls_api' | 'bls_bulk' | 'frb_csv';
  startYear: number;
  endYear: number;
}

class MacroSourcePayloadError extends Error {
  constructor(message: string, public readonly status = 400) {
    super(message);
    this.name = 'MacroSourcePayloadError';
  }
}

async function readUploadedMacroSource(request: Request, stage: string): Promise<UploadedMacroSource | undefined> {
  const contentType = request.headers.get('Content-Type')?.toLowerCase() ?? '';
  if (!contentType.includes('application/json')) return undefined;
  if (stage !== 'macro') throw new MacroSourcePayloadError('A source payload is only valid for the macro stage');
  const contentLength = Number(request.headers.get('Content-Length') ?? 0);
  if (contentLength > MAX_MACRO_SOURCE_PAYLOAD_BYTES) {
    throw new MacroSourcePayloadError('Macro source payload exceeded 256 KB', 413);
  }
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > MAX_MACRO_SOURCE_PAYLOAD_BYTES) {
    throw new MacroSourcePayloadError('Macro source payload exceeded 256 KB', 413);
  }
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    throw new MacroSourcePayloadError('Macro source payload was not valid JSON');
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new MacroSourcePayloadError('Macro source payload must be an object');
  }
  const candidate = body as Record<string, unknown>;
  if (
    !Number.isInteger(candidate.startYear)
    || !Number.isInteger(candidate.endYear)
    || (candidate.startYear as number) < 1900
    || (candidate.endYear as number) > 2100
    || (candidate.endYear as number) < (candidate.startYear as number)
    || !['bls_api', 'bls_bulk', 'frb_csv'].includes(String(candidate.sourceTransport))
    || candidate.sourcePayload === undefined
  ) {
    throw new MacroSourcePayloadError('Macro source payload range or sourcePayload was invalid');
  }
  return {
    sourcePayload: candidate.sourcePayload,
    sourceTransport: candidate.sourceTransport as UploadedMacroSource['sourceTransport'],
    startYear: candidate.startYear as number,
    endYear: candidate.endYear as number
  };
}

function boundedStageFinished(stage: string, results: Record<string, unknown>): boolean {
  if (stage !== 'financials' && stage !== 'industry-history' && stage !== 'trends' && stage !== 'macro') return true;
  const result = results[stage];
  return typeof result === 'object' && result !== null
    && 'done' in result && result.done === true;
}

export const POST: RequestHandler = async ({ platform, url, request }) => {
  // --- Auth: require Bearer token matching PIPELINE_SECRET ---
  const secret = platform?.env?.PIPELINE_SECRET;
  if (!secret) {
    logError('pipeline_secret_missing', { route: '/api/v1/pipeline/sync' });
    return pipelineJson({ ok: false, error: 'PIPELINE_SECRET not configured on server' }, 500);
  }

  const authHeader = request.headers.get('Authorization');
  if (!(await verifyPipelineBearer(authHeader, secret))) {
    logWarn('pipeline_auth_rejected', { route: '/api/v1/pipeline/sync' });
    return pipelineJson({ ok: false, error: 'Unauthorized' }, 401);
  }
  const startTime = Date.now();
  let stage;
  try {
    stage = parsePipelineStage(url.searchParams.get('stage'));
  } catch (err) {
    if (err instanceof PipelineStageError) {
      logWarn('pipeline_stage_rejected', { reason: err.message });
      return pipelineJson({ ok: false, error: err.message }, 400);
    }
    throw err;
  }
  const resetParam = url.searchParams.get('reset');
  const macroSeriesId = stage === 'macro' ? url.searchParams.get('series') : null;
  if (stage === 'macro' && !macroSeriesId) {
    logWarn('pipeline_macro_series_rejected', { stage, reason: 'missing_series' });
    return pipelineJson({ ok: false, stage, error: 'series is required for the macro stage' }, 400);
  }
  let uploadedMacroSource: UploadedMacroSource | undefined;
  try {
    uploadedMacroSource = await readUploadedMacroSource(request, stage);
  } catch (error) {
    if (error instanceof MacroSourcePayloadError) {
      logWarn('pipeline_macro_source_payload_rejected', { stage, reason: error.message });
      return pipelineJson({ ok: false, stage, error: error.message }, error.status);
    }
    throw error;
  }

  let runId: string;
  try {
    runId = parsePipelineRunId(request.headers.get('X-Pipeline-Run-Id'));
  } catch (err) {
    logWarn('pipeline_run_id_rejected', {});
    return pipelineJson({ ok: false, error: err instanceof Error ? err.message : 'Invalid run id' }, 400);
  }

  let db: D1Database;
  let lease: PipelineStageLease | null;
  let heartbeat: PipelineLeaseHeartbeat | null = null;
  try {
    db = getDB(platform);
    lease = await acquirePipelineStageLease(db, stage, runId);
  } catch (err) {
    logError('pipeline_lease_acquire_failed', {
      stage,
      run_id: runId,
      error: err instanceof Error ? err.message : 'Unknown error'
    });
    return pipelineJson({ ok: false, stage, error: 'Pipeline lease unavailable' }, 500);
  }
  if (!lease) {
    logWarn('pipeline_lease_conflict', { stage, run_id: runId });
    return pipelineJson({ ok: false, stage, error: 'Another pipeline stage is already running' }, 409);
  }
  heartbeat = startPipelineLeaseHeartbeat(db, lease);

  try {
    logInfo('pipeline_stage_started', { stage, run_id: runId });
    const results: Record<string, unknown> = {};
	const publicationControl = await readPublicationControl(db);

    if (stage !== 'publish' && stage !== 'coverage-audit') {
      // Full-history repair and legacy date normalization can rewrite rows in
      // the elected release. They remain explicit maintenance operations.
      if (stage === 'financials' || stage === 'fix-dates') {
        await closePublicationBarrier(db);
      } else {
        await closeBarrierUnlessPublished(db);
      }
    }

    const canonicalCoverageStages = new Set([
      'snapshot', 'analytics', 'industry-history', 'trends', 'anomalies', 'risk', 'correlations', 'publish'
    ]);
    if (canonicalCoverageStages.has(stage)) {
      if (stage === 'publish') {
        const [historyStart, scope] = await Promise.all([
          queryOne<{ repdte: string | null }>(db, 'SELECT MIN(repdte) AS repdte FROM financials'),
          queryOne<{ value: string }>(
            db,
            "SELECT value FROM pipeline_state WHERE key = 'financials_sync_scope'"
          )
        ]);
        if (historyStart?.repdte !== CANONICAL_FINANCIAL_START
          || scope?.value !== CANONICAL_FINANCIAL_SCOPE) {
          await closePublicationBarrier(db);
        }
      }
      const canonicalCoverage = await ensureCanonicalFinancialCoverage(db);
      results.canonical_financial_coverage = canonicalCoverage;
    }

    // Reset financials sync offset if requested
    if (resetParam === 'financials' || (resetParam === 'true' && stage === 'financials')) {
      await resetFinancialSyncCheckpoint(db);
      logInfo('pipeline_financials_reset', { stage, run_id: runId });
      results.reset = { financials: true };
    }

    // Stage: institutions
    if (stage === 'institutions') {
      const t0 = Date.now();
      const institutionResult = await syncInstitutions(db);
      results.institutions = {
        ...institutionResult,
        elapsed_seconds: Number(((Date.now() - t0) / 1000).toFixed(1))
      };
    }

    // Stage: financials backfill (all historical data)
    if (stage === 'financials') {
      const t0 = Date.now();
      const financialsResult = await syncFinancials(db, { runId });
      results.financials = {
        ...financialsResult,
        elapsed_seconds: Number(((Date.now() - t0) / 1000).toFixed(1))
      };
    }

    // Stage: financials-latest (incremental — upsert ONLY the newest quarter into
    // the financials time series). Explicit-only: the "all" path uses the full
    // backfill above. Run this nightly to pick up a freshly-published quarter
    // without re-fetching the full history; follow with analytics/trends/anomalies.
    if (stage === 'financials-latest') {
      const t0 = Date.now();
      const latestResult = await syncLatestQuarterFinancials(db, undefined, {
        publishedRelease: publicationControl?.state === 'ready'
          ? publicationControl.release
          : null
      });
      results['financials-latest'] = {
        ...latestResult,
        elapsed_seconds: Number(((Date.now() - t0) / 1000).toFixed(1))
      };
    }

    // Stage: failures (bank failure records)
    if (stage === 'failures') {
      const t0 = Date.now();
      const failuresResult = await syncFailures(db);
      results.failures = {
        ...failuresResult,
        elapsed_seconds: Number(((Date.now() - t0) / 1000).toFixed(1))
      };
    }

    // Stage: snapshot (latest quarter into institutions table)
    if (stage === 'snapshot') {
      const t0 = Date.now();
      const snapshotUpdated = await syncLatestFinancials(db);
      results.snapshot = {
        updated: snapshotUpdated,
        elapsed_seconds: Number(((Date.now() - t0) / 1000).toFixed(1))
      };
    }

    // Stage: analytics (peer stats and industry aggregates)
    if (stage === 'analytics') {
      const t0 = Date.now();

      // Seed the visible four-year window; the bounded history stage extends it.
      const quarters = await queryAll<{ repdte: string }>(
        db,
        'SELECT DISTINCT repdte FROM financials ORDER BY repdte DESC LIMIT 16'
      );

      if (quarters.length > 0 && quarters[0].repdte === publicationControl?.release) {
        results.analytics = {
          repdte: quarters[0].repdte,
          already_published: true,
          quarters_processed: 0,
          peer_stats_rows: 0,
          industry_agg_rows: 0,
          elapsed_seconds: Number(((Date.now() - t0) / 1000).toFixed(1))
        };
      } else if (quarters.length > 0) {
        // Peer stats only for latest quarter
        const peerRows = await computePeerStats(db, quarters[0].repdte);

        // Historical published aggregates are immutable during routine work.
        // Initial population still fills the full 16-quarter chart window.
        const candidateQuarters = publicationControl?.release ? quarters.slice(0, 1) : quarters;
        let totalIndustryRows = 0;
        for (const q of candidateQuarters) totalIndustryRows += await computeIndustryAggregates(db, q.repdte);

        results.analytics = {
          repdte: quarters[0].repdte,
          quarters_processed: candidateQuarters.length,
          peer_stats_rows: peerRows,
          industry_agg_rows: totalIndustryRows,
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

    // Stage: industry-history. Each request derives one missing quarter in the
    // latest ten-year aggregate window from financial rows already in D1.
    if (stage === 'industry-history') {
      const t0 = Date.now();
      const history = await backfillIndustryAggregateHistory(db);
      results['industry-history'] = {
        target_quarters: history.targetQuarters,
        complete_quarters: history.completeQuarters,
        processed_periods: history.processedPeriods,
        rows_inserted: history.rowsInserted,
        earliest_period: history.earliestPeriod,
        latest_period: history.latestPeriod,
        done: history.done,
        elapsed_seconds: Number(((Date.now() - t0) / 1000).toFixed(1))
      };
    }

    // Stage: trends (compute trend analytics)
    if (stage === 'trends') {
      const t0 = Date.now();

      const latestQ = await queryOne<{ repdte: string }>(
        db,
        'SELECT repdte FROM financials ORDER BY repdte DESC LIMIT 1'
      );

      if (latestQ && latestQ.repdte === publicationControl?.release) {
        results.trends = {
          repdte: latestQ.repdte,
          processed: 0,
          rows_inserted: 0,
          done: true,
          cursor: 0,
          already_published: true,
          elapsed_seconds: Number(((Date.now() - t0) / 1000).toFixed(1))
        };
      } else if (latestQ) {
        const trendResult = await computeAllTrends(db, latestQ.repdte, { runId });
        results.trends = {
          ...trendResult,
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
    if (stage === 'anomalies') {
      const t0 = Date.now();

      const latestQ = await queryOne<{ repdte: string }>(
        db,
        'SELECT repdte FROM financials ORDER BY repdte DESC LIMIT 1'
      );

      if (latestQ && latestQ.repdte === publicationControl?.release) {
        results.anomalies = {
          repdte: latestQ.repdte,
          anomalies_detected: 0,
          already_published: true,
          elapsed_seconds: Number(((Date.now() - t0) / 1000).toFixed(1))
        };
      } else if (latestQ) {
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
    if (stage === 'risk') {
      const t0 = Date.now();

      const latestQ = await queryOne<{ repdte: string }>(
        db,
        'SELECT repdte FROM financials ORDER BY repdte DESC LIMIT 1'
      );

      if (latestQ && latestQ.repdte === publicationControl?.release) {
        results.risk = {
          repdte: latestQ.repdte,
          scores_computed: 0,
          already_published: true,
          elapsed_seconds: Number(((Date.now() - t0) / 1000).toFixed(1))
        };
      } else if (latestQ) {
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

    // Stage: macro. One request writes one authoritative bounded source window
    // for one allowlisted series, so initial backfills remain resumable.
    if (stage === 'macro') {
      const t0 = Date.now();

      try {
        const macroResult = await syncMacroSeries(db, macroSeriesId!, uploadedMacroSource ? {
          sourcePayload: uploadedMacroSource.sourcePayload,
          sourceTransport: uploadedMacroSource.sourceTransport,
          sourceRange: {
            startYear: uploadedMacroSource.startYear,
            endYear: uploadedMacroSource.endYear
          }
        } : undefined);
        results.macro = {
          ...macroResult,
          source_transport: uploadedMacroSource?.sourceTransport ?? 'worker_fetch',
          elapsed_seconds: Number(((Date.now() - t0) / 1000).toFixed(1))
        };
      } catch (error) {
        if (error instanceof MacroSyncError) {
          logWarn('pipeline_macro_source_failed', {
            stage,
            run_id: runId,
            series_id: error.seriesId,
            error: error.message
          });
          return pipelineJson({
            ok: false,
            stage,
            series_id: error.seriesId,
            start_year: error.range?.startYear ?? null,
            end_year: error.range?.endYear ?? null,
            error: error.message
          }, 502);
        }
        throw error;
      }
    }

    // Stage: correlations (compute macro vs bank metric correlations)
    if (stage === 'correlations') {
      const t0 = Date.now();

      const corrRows = await computeCorrelations(db);
      results.correlations = {
        rows_inserted: corrRows,
        elapsed_seconds: Number(((Date.now() - t0) / 1000).toFixed(1))
      };
    }

    // Stage: coverage-audit. This is an idempotent owner gate rather than a
    // live-table mutation, so it may preflight while the prior release remains
    // open. Publication re-verifies this exact same-run manifest.
    if (stage === 'coverage-audit') {
      const exportsBucket = platform?.env?.EXPORTS;
      if (!exportsBucket) throw new Error('EXPORTS binding is required for the coverage audit');
      const t0 = Date.now();
      const coverage = await auditFDICCoverage(db, exportsBucket, runId);
      results['coverage-audit'] = {
        ...coverage,
        elapsed_seconds: Number(((Date.now() - t0) / 1000).toFixed(1))
      };
    }

    // Stage: fix-dates (normalize fail_date from M/D/YYYY to YYYYMMDD)
    if (stage === 'fix-dates') {
      const t0 = Date.now();
      const { execute } = await import('$lib/server/db');

      // Fetch all rows with non-YYYYMMDD fail_dates
      const badRows = await queryAll<{ cert: number; fail_date: string }>(
        db,
        `SELECT cert, fail_date FROM failures WHERE fail_date IS NOT NULL AND fail_date NOT GLOB '[0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9]'`
      );

      let fixed = 0;
      for (const row of badRows) {
        const d = new Date(row.fail_date);
        if (isNaN(d.getTime())) continue;
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        const normalized = `${y}${m}${day}`;
        await execute(db, 'UPDATE failures SET fail_date = ? WHERE cert = ? AND fail_date = ?', [normalized, row.cert, row.fail_date]);
        fixed++;
      }

      results['fix-dates'] = {
        total_bad: badRows.length,
        fixed,
        elapsed_seconds: Number(((Date.now() - t0) / 1000).toFixed(1))
      };
    }

    if (stage !== 'publish' && boundedStageFinished(stage, results)) {
      await heartbeat.assertOwned();
      await recordPipelineStageCompletion(
        db,
        runId,
        stage,
        stage === 'macro'
          ? macroSeriesId!
          : stage === 'coverage-audit'
            ? String((results['coverage-audit'] as { manifest_sha256: string }).manifest_sha256)
            : ''
      );
    }

    // Stage: publish. D1 reserves one stable generation, KV receives that
    // generation, and only then does D1 atomically open the public gate.
    if (stage === 'publish') {
	  await heartbeat.assertOwned();
      const cache = platform?.env?.CACHE;
      if (!cache) throw new Error('CACHE binding is required to publish a release');
      const exportsBucket = platform?.env?.EXPORTS;
      if (!exportsBucket) throw new Error('EXPORTS binding is required to publish a release');
      const release = await coordinatePublication(db, cache, exportsBucket, runId);
      results.publish = {
        release: release.repdte,
        published_at: release.publishedAt,
        generation: release.generation,
        already_ready: release.alreadyReady,
        cache_version_updated: true
      };
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    logInfo('pipeline_stage_completed', {
      stage,
      run_id: runId,
      elapsed_seconds: Number(elapsed)
    });

    return pipelineJson({
      ok: true,
      stage,
      elapsed_seconds: Number(elapsed),
      ...results
    });
  } catch (err) {
    logError('pipeline_stage_failed', {
      stage,
      run_id: runId,
      error: err instanceof Error ? err.message : 'Unknown error'
    });
    return pipelineJson({ ok: false, stage, error: 'Internal pipeline error' }, 500);
  } finally {
    try {
	  await heartbeat?.stop();
      await releasePipelineStageLease(db, lease);
    } catch (err) {
      logError('pipeline_lease_release_failed', {
        stage,
        run_id: runId,
        error: err instanceof Error ? err.message : 'Unknown error'
      });
    }
  }
};
