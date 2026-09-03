#!/usr/bin/env npx tsx

/**
 * Local backfill orchestration script for Bankgraph.
 * Calls the pipeline sync endpoint repeatedly to populate all tables.
 *
 * Usage:
 *   npm run backfill                    # run all stages
 *   npm run backfill -- financials      # start from a specific stage
 *   npm run backfill -- --reset         # reset the financial checkpoint before starting
 *   npm run backfill -- --only failures # run only a single stage
 *
 * Requires: dev server running on localhost:5173
 *   Start with: npm run dev
 */

import { readFileSync } from 'fs';
import { BLS_CPI_BULK_URL, parseBlsBulkRange } from '../src/lib/server/pipeline/bls-bulk';
import { frbRangeSourceUrl, MACRO_SERIES_BY_ID } from '../src/lib/server/pipeline/macro-sources';

const BASE_URL = process.env.BACKFILL_URL ?? 'http://localhost:5173';

const STAGES = [
  'institutions',
  'financials',
  'failures',
  'snapshot',
  'analytics',
  'industry-history',
  'trends',
  'anomalies',
  'risk',
  'macro',
  'correlations',
  'coverage-audit',
  'publish'
] as const;

const MACRO_SERIES = [
  'UST10Y', 'UST2Y', 'UST10Y2Y', 'BLS_UNRATE',
  'BLS_CPI_U', 'BLS_CPI_YOY', 'FRB_FEDFUNDS',
  'FRB_H8_BANK_CREDIT', 'FRB_H8_LOANS_LEASES', 'FRB_H8_CI_LOANS',
  'FRB_H8_REAL_ESTATE', 'FRB_H8_CRE', 'FRB_H8_CONSUMER', 'FRB_H8_DEPOSITS'
] as const;

const BLS_API_URL = 'https://api.bls.gov/publicAPI/v2/timeseries/data/';
const BLS_SOURCE_SERIES: Readonly<Record<string, string>> = {
  BLS_UNRATE: 'LNS14000000',
  BLS_CPI_U: 'CUUR0000SA0'
};
const MAX_UPLOADED_SOURCE_BYTES = 256_000;

type MacroSourceTransport = 'bls_api' | 'bls_bulk' | 'frb_csv';

interface MacroSourceSlice {
  payload: unknown;
  transport: MacroSourceTransport;
}

let cachedBlsCpiBulkText: Promise<string> | null = null;

type Stage = (typeof STAGES)[number];

function getRunId(): string {
  const runId = process.env.BACKFILL_RUN_ID?.trim()
    || `backfill-${Date.now()}-${crypto.randomUUID()}`;
  if (runId.length > 128 || !/^[A-Za-z0-9._:-]+$/.test(runId)) {
    throw new Error('BACKFILL_RUN_ID must be 1-128 URL-safe characters');
  }
  return runId;
}

const PIPELINE_RUN_ID = getRunId();

/** Read PIPELINE_SECRET from .dev.vars or environment */
function getSecret(): string {
  // An explicit process value is needed for production backfills and must win
  // over a developer's unrelated local secret file.
  if (process.env.PIPELINE_SECRET) return process.env.PIPELINE_SECRET;
  try {
    const content = readFileSync('.dev.vars', 'utf-8');
    const match = content.match(/PIPELINE_SECRET\s*=\s*"?([^"\n]+)"?/);
    if (match) return match[1].trim();
  } catch {
    // fall through
  }
  throw new Error('PIPELINE_SECRET not found in .dev.vars or environment');
}

let cachedSecret: string | null = null;

function secret(): string {
  if (!cachedSecret) cachedSecret = getSecret();
  return cachedSecret;
}

async function fetchBlsCpiBulkSlice(
  sourceSeries: string,
  startYear: number,
  endYear: number
): Promise<MacroSourceSlice> {
  cachedBlsCpiBulkText ??= (async () => {
    const response = await fetch(BLS_CPI_BULK_URL, {
      headers: {
        Accept: 'text/plain,*/*;q=0.8',
        Referer: 'https://www.bls.gov/',
        'User-Agent': 'Mozilla/5.0 (compatible; Bankgraph/1.0; +https://bankgraph.app)'
      }
    });
    if (!response.ok) throw new Error(`Official BLS CPI bulk request failed (${response.status})`);
    return response.text();
  })();
  return {
    payload: parseBlsBulkRange(await cachedBlsCpiBulkText, sourceSeries, startYear, endYear),
    transport: 'bls_bulk'
  };
}

async function fetchBlsSourcePayload(
  series: string,
  startYear: number,
  endYear: number
): Promise<MacroSourceSlice> {
  const sourceSeries = BLS_SOURCE_SERIES[series];
  if (!sourceSeries) throw new Error(`No local BLS source mapping exists for ${series}`);
  if (!Number.isInteger(startYear) || !Number.isInteger(endYear) || endYear < startYear || endYear - startYear + 1 > 10) {
    throw new Error(`Worker requested an invalid BLS range for ${series}: ${startYear}-${endYear}`);
  }
  try {
    const response = await fetch(BLS_API_URL, {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        seriesid: [sourceSeries],
        startyear: String(startYear),
        endyear: String(endYear)
      })
    });
    if (!response.ok) throw new Error(`Local BLS source request failed (${response.status})`);
    const text = await response.text();
    if (new TextEncoder().encode(text).byteLength > MAX_UPLOADED_SOURCE_BYTES) {
      throw new Error('Local BLS source response exceeded 256 KB');
    }
    const payload = JSON.parse(text) as { status?: unknown };
    if (payload.status !== 'REQUEST_SUCCEEDED') {
      throw new Error('Local BLS API quota was unavailable');
    }
    return { payload, transport: 'bls_api' };
  } catch (error) {
    if (series !== 'BLS_CPI_U') throw error;
    console.log(' Local BLS API was unavailable; reading the exact CPI-U slice from the official BLS bulk file');
    return fetchBlsCpiBulkSlice(sourceSeries, startYear, endYear);
  }
}

async function fetchFrbSourcePayload(
  series: string,
  startYear: number,
  endYear: number
): Promise<MacroSourceSlice> {
  const definition = MACRO_SERIES_BY_ID.get(series);
  if (definition?.provider !== 'frb') throw new Error(`No Federal Reserve source mapping exists for ${series}`);
  const response = await fetch(frbRangeSourceUrl(definition, startYear, endYear), {
    headers: {
      Accept: 'text/csv',
      'User-Agent': 'Bankgraph/1.0 (+https://bankgraph.app)'
    }
  });
  if (!response.ok) throw new Error(`Local Federal Reserve source request failed (${response.status})`);
  const text = await response.text();
  if (new TextEncoder().encode(text).byteLength > MAX_UPLOADED_SOURCE_BYTES) {
    throw new Error('Local Federal Reserve source response exceeded 256 KB');
  }
  return { payload: text, transport: 'frb_csv' };
}

async function callSync(
  stage: string,
  params: Record<string, string> = {},
  timeoutMs = 180_000
): Promise<Record<string, unknown>> {
  const qs = new URLSearchParams({ stage, ...params }).toString();
  const url = `${BASE_URL}/api/v1/pipeline/sync?${qs}`;
  const maxAttempts = 5;
  let lastError: Error | null = null;
  let requestBody: string | undefined;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const headers: Record<string, string> = {
        Authorization: `Bearer ${secret()}`,
        'X-Pipeline-Run-Id': PIPELINE_RUN_ID
      };
      if (requestBody) headers['Content-Type'] = 'application/json';
      const res = await fetch(url, {
        method: 'POST',
        headers,
        body: requestBody,
        signal: controller.signal
      });
      const text = await res.text();
      if (res.ok) return JSON.parse(text) as Record<string, unknown>;
      let failure: Record<string, unknown> | null = null;
      try {
        const parsed = JSON.parse(text);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          failure = parsed as Record<string, unknown>;
        }
      } catch {
        // The bounded error excerpt below remains useful for a non-JSON failure.
      }
      const series = params.series;
      const sourceDefinition = typeof series === 'string' ? MACRO_SERIES_BY_ID.get(series) : undefined;
      if (
        stage === 'macro'
        && res.status === 502
        && !requestBody
        && typeof series === 'string'
        && (series in BLS_SOURCE_SERIES || sourceDefinition?.provider === 'frb')
        && typeof failure?.start_year === 'number'
        && typeof failure?.end_year === 'number'
      ) {
        const sourceSlice = sourceDefinition?.provider === 'frb'
          ? await fetchFrbSourcePayload(series, failure.start_year, failure.end_year)
          : await fetchBlsSourcePayload(series, failure.start_year, failure.end_year);
        requestBody = JSON.stringify({
          sourcePayload: sourceSlice.payload,
          sourceTransport: sourceSlice.transport,
          startYear: failure.start_year,
          endYear: failure.end_year
        });
        console.log(` Cloudflare could not retrieve this source window; uploading the validated ${failure.start_year}-${failure.end_year} ${sourceDefinition?.sourceAgency ?? 'BLS'} slice from this release runner`);
        attempt--;
        continue;
      }
      const retryable = res.status === 409 || res.status === 429 || res.status >= 500;
      lastError = new Error(`Sync ${stage} failed (${res.status}): ${text.slice(0, 1_000)}`);
      if (!retryable || attempt === maxAttempts) throw lastError;
      const retryAfter = Number(res.headers.get('Retry-After'));
      const waitMs = Number.isFinite(retryAfter) && retryAfter >= 0
        ? Math.min(retryAfter * 1_000, 15_000)
        : Math.min(1_000 * 2 ** (attempt - 1), 15_000);
      console.log(` retryable HTTP ${res.status}; retry ${attempt + 1}/${maxAttempts} in ${waitMs / 1_000}s`);
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      const nonRetryableStatus = lastError.message.match(/failed \((\d{3})\)/)?.[1];
      if (nonRetryableStatus && !['409', '429'].includes(nonRetryableStatus)
        && Number(nonRetryableStatus) < 500) throw lastError;
      if (attempt === maxAttempts) throw lastError;
      const waitMs = Math.min(1_000 * 2 ** (attempt - 1), 15_000);
      console.log(` ambiguous request failure; retry ${attempt + 1}/${maxAttempts} in ${waitMs / 1_000}s`);
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastError ?? new Error(`Sync ${stage} failed`);
}

function formatElapsed(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  const mins = Math.floor(ms / 60000);
  const secs = ((ms % 60000) / 1000).toFixed(0);
  return `${mins}m${secs}s`;
}

async function runStage(name: string, params: Record<string, string> = {}): Promise<Record<string, unknown>> {
  const start = Date.now();
  process.stdout.write(`  ${name}: running...`);

  try {
    const result = await callSync(name, params);
    const elapsed = formatElapsed(Date.now() - start);
    const stageData = result[name] as Record<string, unknown> | undefined;

    // Extract the most useful stat from the result
    let stat = '';
    if (stageData) {
      if ('inserted' in stageData) stat = `${stageData.inserted} inserted`;
      else if ('processed' in stageData) stat = `${stageData.processed} processed`;
      else if ('updated' in stageData) stat = `${stageData.updated} updated`;
      else if ('rows_inserted' in stageData) stat = `${stageData.rows_inserted} rows`;
      else if ('scores_computed' in stageData) stat = `${stageData.scores_computed} scores`;
      else if ('anomalies_detected' in stageData) stat = `${stageData.anomalies_detected} anomalies`;
      else if ('skipped' in stageData) stat = `skipped (${stageData.reason})`;
    }

    console.log(` done (${elapsed})${stat ? ' - ' + stat : ''}`);
    return result;
  } catch (err) {
    console.log(` FAILED`);
    throw err;
  }
}

async function runMacroBackfill(startFrom?: (typeof MACRO_SERIES)[number]): Promise<void> {
  const startIndex = startFrom ? MACRO_SERIES.indexOf(startFrom) : 0;
  for (const series of MACRO_SERIES.slice(startIndex)) {
    let done = false;
    let previousCursor: number | null = null;
    while (!done) {
      const result = await runStage('macro', { series });
      const macro = result.macro as Record<string, unknown> | undefined;
      const cursor = macro?.cursor_year;
      if (typeof cursor !== 'number' || !Number.isInteger(cursor)) {
        throw new Error(`Macro series ${series} returned no valid yearly cursor`);
      }
      done = macro?.done === true;
      if (!done && cursor === previousCursor) {
        throw new Error(`Macro series ${series} made no progress at ${cursor}`);
      }
      previousCursor = cursor;
    }
  }
}

async function runFinancialsChunked(): Promise<void> {
  let done = false;
  let round = 0;
  let totalProcessed = 0;
  let previousProcessed: number | null = null;
  let expectedSourceTotal: number | null = null;
  const overallStart = Date.now();

  while (!done) {
    round++;
    const start = Date.now();
    process.stdout.write(`  financials round ${round}: fetching...`);

    try {
      const result = await callSync('financials', {}, 300_000);
      const fin = result.financials as Record<string, unknown> | undefined;
      const elapsed = formatElapsed(Date.now() - start);
      if (
        !fin ||
        typeof fin.processed !== 'number' || !Number.isInteger(fin.processed) ||
        typeof fin.offset !== 'number' || !Number.isInteger(fin.offset) ||
        typeof fin.quarter !== 'string' || !/^\d{8}$/.test(fin.quarter) ||
        typeof fin.source_total !== 'number' || !Number.isInteger(fin.source_total) || fin.source_total <= 0 ||
        typeof fin.done !== 'boolean'
      ) {
        throw new Error('Financials stage returned an invalid checkpoint');
      }
      const processed = fin.processed;
      const offset = fin.offset;
      const quarter = fin.quarter;
      const sourceTotal = fin.source_total;

      console.log(
        ` done (${elapsed}) - ${processed}/${sourceTotal} rows, quarter=${quarter}, offset=${offset}`
      );

      totalProcessed = processed;
      done = fin.done;
      if (expectedSourceTotal != null && sourceTotal !== expectedSourceTotal) {
        throw new Error(`Financials source total changed from ${expectedSourceTotal} to ${sourceTotal}`);
      }
      expectedSourceTotal = sourceTotal;
      if (!done && previousProcessed != null && processed <= previousProcessed) {
        throw new Error(`Financials stage made no progress at ${quarter}:${offset}`);
      }
      previousProcessed = processed;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.log(` FAILED (${msg})`);
      console.error(`  Resume with BACKFILL_RUN_ID=${PIPELINE_RUN_ID} and --only financials.`);
      throw err;
    }

    if (!done) {
      // Brief pause between rounds to not hammer the API
      await new Promise((r) => setTimeout(r, 1000));
    }
  }

  const totalElapsed = formatElapsed(Date.now() - overallStart);
  console.log(`  financials complete: ${totalProcessed} rows in ${totalElapsed}`);
}

async function runIndustryHistoryChunked(): Promise<void> {
  let done = false;
  let previousComplete = -1;

  while (!done) {
    const result = await runStage('industry-history');
    const history = result['industry-history'] as Record<string, unknown> | undefined;
    const complete = history?.complete_quarters;
    const target = history?.target_quarters;
    if (
      !history
      || typeof complete !== 'number' || !Number.isInteger(complete)
      || typeof target !== 'number' || !Number.isInteger(target)
      || typeof history.done !== 'boolean'
    ) {
      throw new Error('Industry-history stage returned an invalid checkpoint');
    }
    done = history.done;
    if (!done && complete <= previousComplete) {
      throw new Error(`Industry-history stage made no progress at ${complete}/${target} quarters`);
    }
    previousComplete = complete;
  }
}

async function runTrendsChunked(): Promise<void> {
  let done = false;
  let previousCursor: number | null = null;

  while (!done) {
    const result = await runStage('trends');
    const trends = result.trends as Record<string, unknown> | undefined;
    const cursor = trends?.cursor;
    if (typeof cursor !== 'number' || !Number.isInteger(cursor)) {
      throw new Error('Trends stage returned no valid bank cursor');
    }
    done = trends?.done === true;
    if (!done && cursor === previousCursor) {
      throw new Error(`Trends stage made no progress after bank certificate ${cursor}`);
    }
    previousCursor = cursor;
  }
}

async function checkServerHealth(): Promise<boolean> {
  try {
    // Initial population and explicit maintenance can return 503. A routine
    // post-launch refresh keeps the prior release available, but readiness is
    // still the authoritative reachability check for both states.
    const res = await fetch(`${BASE_URL}/api/v1/ready`, { method: 'GET' });
    return res.status === 200 || res.status === 503;
  } catch {
    return false;
  }
}

async function waitForPublishedReadiness(maxAttempts = 12): Promise<void> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15_000);
    try {
      const response = await fetch(`${BASE_URL}/api/v1/ready`, {
        method: 'GET',
        signal: controller.signal,
        headers: { 'Cache-Control': 'no-cache' }
      });
      const body = await response.json() as { ready?: boolean; status?: string };
      if (response.status === 200 && body.ready === true && body.status === 'ready') return;
      if (response.status !== 503 && response.status < 500) {
        throw new Error(`Non-retryable readiness response HTTP ${response.status}`);
      }
    } catch (error) {
      if (error instanceof Error && error.message.startsWith('Non-retryable readiness')) throw error;
      if (attempt === maxAttempts) throw error;
    } finally {
      clearTimeout(timer);
    }
    if (attempt < maxAttempts) await new Promise((resolve) => setTimeout(resolve, 5_000));
  }
  throw new Error(`Readiness did not become healthy after ${maxAttempts} checks`);
}

function parseArgs(): {
  startFrom?: Stage;
  only?: Stage;
  macroFrom?: (typeof MACRO_SERIES)[number];
  reset: boolean;
} {
  const args = process.argv.slice(2);
  let startFrom: Stage | undefined;
  let only: Stage | undefined;
  let macroFrom: (typeof MACRO_SERIES)[number] | undefined;
  let reset = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '--reset') {
      reset = true;
      continue;
    }

    if (arg === '--only') {
      const next = args[++i];
      if (!next || !STAGES.includes(next as Stage)) {
        console.error(`Unknown stage for --only: ${next}. Available: ${STAGES.join(', ')}`);
        process.exit(1);
      }
      only = next as Stage;
      continue;
    }

    if (arg === '--macro-from') {
      const next = args[++i];
      if (!next || !MACRO_SERIES.includes(next as (typeof MACRO_SERIES)[number])) {
        console.error(`Unknown series for --macro-from: ${next}. Available: ${MACRO_SERIES.join(', ')}`);
        process.exit(1);
      }
      macroFrom = next as (typeof MACRO_SERIES)[number];
      continue;
    }

    // Bare argument = start-from stage
    if (STAGES.includes(arg as Stage)) {
      startFrom = arg as Stage;
      continue;
    }

    console.error(`Unknown argument: ${arg}`);
    console.error(`Usage: npm run backfill [-- [stage] [--reset] [--only stage] [--macro-from series]]`);
    process.exit(1);
  }

  if (macroFrom && only !== 'macro' && startFrom !== 'macro') {
    console.error('--macro-from requires --only macro or a macro start stage');
    process.exit(1);
  }
  return { startFrom, only, macroFrom, reset };
}

async function main(): Promise<void> {
  const { startFrom, only, macroFrom, reset } = parseArgs();

  console.log('Bankgraph - Backfill Pipeline');
  console.log('======================================\n');
  console.log(`Pipeline run ID: ${PIPELINE_RUN_ID}`);
  console.log('Reuse BACKFILL_RUN_ID with this value to resume the same release generation.\n');

  // Verify server is running
  process.stdout.write(`Checking pipeline target at ${BASE_URL}... `);
  const healthy = await checkServerHealth();
  if (!healthy) {
    console.log('UNREACHABLE');
    console.error('\nPipeline target is unreachable. For local use, start it with: npm run dev');
    process.exit(1);
  }
  console.log('OK\n');

  // Verify auth works
  try {
    secret();
  } catch (err) {
    console.error((err as Error).message);
    process.exit(1);
  }

  const overallStart = Date.now();

  if (only) {
    // Run a single stage
    console.log(`Running single stage: ${only}`);
    if (only === 'financials') {
      if (reset) {
        console.log('  Resetting the financials checkpoint...');
        await callSync('financials', { reset: 'financials' });
        console.log(`  Reset applied; continuing from canonical quarter 19920331`);
      }
      await runFinancialsChunked();
    } else if (only === 'macro') {
      await runMacroBackfill(macroFrom);
    } else if (only === 'industry-history') {
      await runIndustryHistoryChunked();
    } else if (only === 'trends') {
      await runTrendsChunked();
    } else {
      await runStage(only);
    }
    if (only === 'publish') {
      process.stdout.write('Waiting for published readiness... ');
      await waitForPublishedReadiness();
      console.log('ready');
    }
  } else {
    // Run stages in order
    let startIndex = 0;
    if (startFrom) {
      startIndex = STAGES.indexOf(startFrom);
      console.log(`Starting from stage: ${startFrom} (${startIndex + 1}/${STAGES.length})\n`);
    } else {
      console.log(`Running all ${STAGES.length} stages\n`);
    }

    let succeeded = 0;
    let failed = 0;

    for (let i = startIndex; i < STAGES.length; i++) {
      const stage = STAGES[i];
      const stageNum = i + 1;

      console.log(`[${stageNum}/${STAGES.length}] ${stage}`);

      try {
        if (stage === 'financials') {
          if (reset) {
            console.log('  Resetting the financials checkpoint...');
            await callSync('financials', { reset: 'financials' });
            console.log('  Reset applied; continuing the canonical financial load.');
          }
          await runFinancialsChunked();
        } else if (stage === 'macro') {
          await runMacroBackfill(macroFrom);
        } else if (stage === 'industry-history') {
          await runIndustryHistoryChunked();
        } else if (stage === 'trends') {
          await runTrendsChunked();
        } else {
          await runStage(stage);
        }
        if (stage === 'publish') {
          process.stdout.write('  readiness: polling...');
          await waitForPublishedReadiness();
          console.log(' ready');
        }
        succeeded++;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`  ERROR: ${msg}`);
        failed++;

        // Every listed stage is a strict input to the final publication. Never
        // skip a failed generation step and continue to `publish`.
        console.error(`\nRequired stage "${stage}" failed. Publication was not attempted.`);
        console.error(`Resume with BACKFILL_RUN_ID=${PIPELINE_RUN_ID} after fixing the issue.`);
        throw err;
      }

      console.log('');
    }

    const totalElapsed = formatElapsed(Date.now() - overallStart);
    console.log('======================================');
    console.log(`Backfill complete in ${totalElapsed}`);
    console.log(`  Succeeded: ${succeeded}`);
    if (failed > 0) console.log(`  Failed: ${failed}`);

    // Show table health summary
    console.log('\nTable health check:');
    try {
      const res = await fetch(`${BASE_URL}/api/v1/meta`);
      if (res.ok) {
        const meta = await res.json() as Record<string, unknown>;
        console.log(`  institutions:  ${meta.bank_count ?? '?'} rows`);
        console.log(`  active banks:  ${meta.active_count ?? '?'}`);
        console.log(`  latest quarter: ${meta.latest_quarter ?? '?'}`);

        const tc = meta.table_counts as Record<string, number> | undefined;
        if (tc) {
          console.log('\n  Table row counts:');
          const tables = ['financials', 'peer_stats', 'bank_trends', 'anomalies', 'risk_scores', 'failures', 'agg_industry', 'macro_observations', 'macro_correlations'];
          for (const t of tables) {
            const count = tc[t] ?? 0;
            const status = count > 0 ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m';
            console.log(`    ${status} ${t.padEnd(16)} ${count.toLocaleString()}`);
          }
        }
      }
    } catch {
      console.log('  (could not fetch table stats)');
    }
  }
}

main().catch((err) => {
  console.error('\nBackfill failed:', err.message);
  process.exit(1);
});
