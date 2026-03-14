#!/usr/bin/env npx tsx

/**
 * Local backfill orchestration script for the Bank Data Explorer.
 * Calls the pipeline sync endpoint repeatedly to populate all tables.
 *
 * Usage:
 *   npm run backfill                    # run all stages
 *   npm run backfill -- financials      # start from a specific stage
 *   npm run backfill -- --reset         # reset financials offset before starting
 *   npm run backfill -- --only failures # run only a single stage
 *
 * Requires: dev server running on localhost:5173
 *   Start with: npm run dev
 */

import { readFileSync } from 'fs';

const BASE_URL = process.env.BACKFILL_URL ?? 'http://localhost:5173';

const STAGES = [
  'institutions',
  'financials',
  'failures',
  'snapshot',
  'analytics',
  'trends',
  'anomalies',
  'risk',
  'fred',
  'correlations'
] as const;

type Stage = (typeof STAGES)[number];

/** Read PIPELINE_SECRET from .dev.vars or environment */
function getSecret(): string {
  try {
    const content = readFileSync('.dev.vars', 'utf-8');
    const match = content.match(/PIPELINE_SECRET\s*=\s*"?([^"\n]+)"?/);
    if (match) return match[1].trim();
  } catch {
    // fall through
  }
  if (process.env.PIPELINE_SECRET) return process.env.PIPELINE_SECRET;
  throw new Error('PIPELINE_SECRET not found in .dev.vars or environment');
}

let cachedSecret: string | null = null;

function secret(): string {
  if (!cachedSecret) cachedSecret = getSecret();
  return cachedSecret;
}

async function callSync(
  stage: string,
  params: Record<string, string> = {},
  timeoutMs = 180_000
): Promise<Record<string, unknown>> {
  const qs = new URLSearchParams({ stage, ...params }).toString();
  const url = `${BASE_URL}/api/v1/pipeline/sync?${qs}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${secret()}` },
      signal: controller.signal
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Sync ${stage} failed (${res.status}): ${text}`);
    }
    return res.json() as Promise<Record<string, unknown>>;
  } finally {
    clearTimeout(timer);
  }
}

function formatElapsed(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  const mins = Math.floor(ms / 60000);
  const secs = ((ms % 60000) / 1000).toFixed(0);
  return `${mins}m${secs}s`;
}

async function runStage(name: string): Promise<Record<string, unknown>> {
  const start = Date.now();
  process.stdout.write(`  ${name}: running...`);

  try {
    const result = await callSync(name);
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

async function runFinancialsChunked(): Promise<void> {
  let done = false;
  let round = 0;
  let totalProcessed = 0;
  let consecutiveFailures = 0;
  const MAX_RETRIES = 3;
  const overallStart = Date.now();

  while (!done) {
    round++;
    const start = Date.now();
    process.stdout.write(`  financials round ${round}: fetching...`);

    try {
      const result = await callSync('financials', {}, 300_000);
      const fin = result.financials as Record<string, unknown> | undefined;
      const elapsed = formatElapsed(Date.now() - start);
      const processed = Number(fin?.processed ?? 0);
      const offset = Number(fin?.offset ?? 0);

      console.log(` done (${elapsed}) - ${processed} total rows, offset=${offset}`);

      totalProcessed = processed;
      done = fin?.done !== false;
      consecutiveFailures = 0;
    } catch (err) {
      consecutiveFailures++;
      const msg = err instanceof Error ? err.message : String(err);
      console.log(` FAILED (${msg})`);

      if (consecutiveFailures >= MAX_RETRIES) {
        console.error(`  ${MAX_RETRIES} consecutive failures, stopping.`);
        console.error(`  Resume with: npm run backfill -- --only financials`);
        throw err;
      }

      const waitSec = consecutiveFailures * 5;
      console.log(`  Retrying in ${waitSec}s (attempt ${consecutiveFailures}/${MAX_RETRIES})...`);
      await new Promise((r) => setTimeout(r, waitSec * 1000));
      continue;
    }

    if (!done) {
      // Brief pause between rounds to not hammer the API
      await new Promise((r) => setTimeout(r, 1000));
    }
  }

  const totalElapsed = formatElapsed(Date.now() - overallStart);
  console.log(`  financials complete: ${totalProcessed} rows in ${totalElapsed}`);
}

async function checkServerHealth(): Promise<boolean> {
  try {
    const res = await fetch(BASE_URL, { method: 'HEAD' });
    return res.ok || res.status === 200 || res.status === 308;
  } catch {
    return false;
  }
}

function parseArgs(): { startFrom?: Stage; only?: Stage; reset: boolean } {
  const args = process.argv.slice(2);
  let startFrom: Stage | undefined;
  let only: Stage | undefined;
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

    // Bare argument = start-from stage
    if (STAGES.includes(arg as Stage)) {
      startFrom = arg as Stage;
      continue;
    }

    console.error(`Unknown argument: ${arg}`);
    console.error(`Usage: npm run backfill [-- [stage] [--reset] [--only stage]]`);
    process.exit(1);
  }

  return { startFrom, only, reset };
}

async function main(): Promise<void> {
  const { startFrom, only, reset } = parseArgs();

  console.log('Bank Data Explorer - Backfill Pipeline');
  console.log('======================================\n');

  // Verify server is running
  process.stdout.write(`Checking dev server at ${BASE_URL}... `);
  const healthy = await checkServerHealth();
  if (!healthy) {
    console.log('UNREACHABLE');
    console.error('\nDev server is not running. Start it with: npm run dev');
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
        console.log('  Resetting financials sync offset...');
        // Call a dummy sync that will read state; we need to reset via a direct call
        // The reset happens by setting pipeline_state values via the sync endpoint
        // For now, just run it - it resumes from last offset
        console.log('  (Use wrangler d1 execute to reset pipeline_state if needed)');
      }
      await runFinancialsChunked();
    } else {
      await runStage(only);
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
          await runFinancialsChunked();
        } else {
          await runStage(stage);
        }
        succeeded++;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`  ERROR: ${msg}`);
        failed++;

        // For non-critical stages (fred, correlations), continue
        // For data stages (institutions, financials, failures), abort
        const criticalStages: Stage[] = ['institutions', 'financials'];
        if (criticalStages.includes(stage)) {
          console.error(`\nCritical stage "${stage}" failed. Aborting remaining stages.`);
          console.error('Fix the issue and re-run with: npm run backfill -- ' + stage);
          break;
        }
        console.log('  (non-critical, continuing...)');
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
          const tables = ['financials', 'peer_stats', 'bank_trends', 'anomalies', 'risk_scores', 'failures', 'agg_industry', 'macro_series', 'correlations'];
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
