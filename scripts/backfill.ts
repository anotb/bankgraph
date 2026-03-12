#!/usr/bin/env npx tsx

/**
 * Local backfill script for the Bank Data Explorer.
 * Calls the pipeline sync endpoint repeatedly to populate all tables.
 *
 * Usage: npm run backfill
 *        npm run backfill -- financials   # start from a specific stage
 *
 * Requires: dev server running on localhost:5173
 */

import { readFileSync } from 'fs';

const BASE_URL = 'http://localhost:5173';

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

async function callSync(
  stage: string,
  params: Record<string, string> = {}
): Promise<Record<string, unknown>> {
  const secret = getSecret();
  const qs = new URLSearchParams({ stage, ...params }).toString();
  const res = await fetch(`${BASE_URL}/api/v1/pipeline/sync?${qs}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${secret}` }
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Sync ${stage} failed (${res.status}): ${text}`);
  }
  return res.json() as Promise<Record<string, unknown>>;
}

async function runStage(name: string): Promise<Record<string, unknown>> {
  console.log(`\n=== ${name} ===`);
  const start = Date.now();
  const result = await callSync(name);
  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  console.log(`  Done in ${elapsed}s:`, JSON.stringify(result, null, 2));
  return result;
}

async function main(): Promise<void> {
  const startFrom = process.argv[2];
  let startIndex = 0;

  if (startFrom) {
    startIndex = STAGES.indexOf(startFrom as (typeof STAGES)[number]);
    if (startIndex === -1) {
      console.error(`Unknown stage: ${startFrom}. Available: ${STAGES.join(', ')}`);
      process.exit(1);
    }
    console.log(`Starting from stage: ${startFrom}`);
  }

  for (let i = startIndex; i < STAGES.length; i++) {
    const stage = STAGES[i];

    if (stage === 'financials') {
      // Financials needs chunked invocation: loop until done
      let done = false;
      let round = 0;
      while (!done) {
        round++;
        console.log(`\n=== financials (round ${round}) ===`);
        const start = Date.now();
        const result = await callSync('financials');
        const elapsed = ((Date.now() - start) / 1000).toFixed(1);
        const fin = result.financials as Record<string, unknown> | undefined;
        console.log(
          `  Round ${round} done in ${elapsed}s: processed=${fin?.processed}`
        );
        done = fin?.done !== false;
        if (!done) {
          console.log(`  Continuing... offset=${fin?.offset}`);
          await new Promise((r) => setTimeout(r, 1000));
        }
      }
    } else {
      await runStage(stage);
    }
  }

  console.log('\n=== All stages complete! ===');
}

main().catch((err) => {
  console.error('Backfill failed:', err.message);
  process.exit(1);
});
