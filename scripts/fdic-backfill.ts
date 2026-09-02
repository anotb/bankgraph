#!/usr/bin/env npx tsx

/**
 * Repeatable orchestrator for the partitioned FDIC ingestion endpoint.
 * It runs one partition at a time and repeats bounded Worker requests until
 * the server reports that partition as published.
 */

import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import {
  buildAnnualSummaryRange,
  discoverAnnualSummaryBounds,
  latestAnnualSummaryPartitions,
  validatePipelineRunId
} from './fdic-backfill-plan';

const DEFAULT_BASE_URL = 'http://localhost:5173';
const HISTORY_FIRST_PROCESS_YEAR = 1900;
const HISTORY_REFRESH_LOOKBACK_YEARS = 1;
const DATASETS = ['annual-summary', 'sod', 'history', 'locations', 'institutions'] as const;
type Dataset = (typeof DATASETS)[number];

interface Options {
  dataset: Dataset;
  partitions: string[];
  baseUrl: string;
  maxPages: number;
  maxSteps: number;
  maxPartitions: number;
  refresh: boolean;
  planOnly: boolean;
  pipelineRunId: string;
}

function pipelineRunId(raw: string | undefined): string {
  return validatePipelineRunId(raw?.trim() || `fdic-${randomUUID()}`);
}

function secret(): string {
  if (process.env.PIPELINE_SECRET) return process.env.PIPELINE_SECRET;
  try {
    const content = readFileSync('.dev.vars', 'utf8');
    const match = content.match(/^\s*PIPELINE_SECRET\s*=\s*"?([^"\r\n]+)"?/m);
    if (match) return match[1].trim();
  } catch {
    // The actionable error below is the same whether the file is absent or unreadable.
  }
  throw new Error('PIPELINE_SECRET is required in the environment or .dev.vars');
}

function integerFlag(value: string | undefined, name: string, minimum: number, maximum: number): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error(`${name} must be between ${minimum} and ${maximum}`);
  }
  return parsed;
}

function yearRange(from: string | undefined, to: string | undefined, minimum: number): number[] {
  const start = integerFlag(from, '--from', minimum, new Date().getUTCFullYear() + 1);
  const end = integerFlag(to, '--to', start, new Date().getUTCFullYear() + 1);
  return Array.from({ length: end - start + 1 }, (_, index) => start + index);
}

function values(args: string[], flag: string): string[] {
  const result: string[] = [];
  for (let index = 0; index < args.length; index++) {
    if (args[index] === flag && args[index + 1]) result.push(args[index + 1]);
  }
  return result;
}

function value(args: string[], flag: string): string | undefined {
  return values(args, flag).at(-1);
}

function has(args: string[], flag: string): boolean {
  return args.includes(flag);
}

function usage(): never {
  console.error(`Usage:
  npm run backfill:fdic -- annual-summary --initial
  npm run backfill:fdic -- annual-summary --latest
  npm run backfill:fdic -- sod --latest
  npm run backfill:fdic -- history --initial
  npm run backfill:fdic -- history --quarterly
  npm run backfill:fdic -- history --from 2025 --to 2026 --refresh
  npm run backfill:fdic -- locations --snapshot latest
  npm run backfill:fdic -- institutions --snapshot latest
  npm run backfill:fdic -- sod --partition 2024 --partition 2025

  Common flags: --refresh --max-pages 1..5 --max-steps 1..10000
               --max-partitions 1..5000 --run-id ID --url URL --plan
  Annual modes: --initial discovers class-specific source bounds;
                --latest refreshes the latest CB and SI source years.
  History modes: --initial loads process years ${HISTORY_FIRST_PROCESS_YEAR}..current;
                 --quarterly refreshes current and prior process years.`);
  process.exit(1);
}

async function parseArgs(): Promise<Options> {
  const args = process.argv.slice(2);
  const dataset = args[0] as Dataset | undefined;
  if (!dataset || !DATASETS.includes(dataset)) usage();
  const explicit = values(args, '--partition');
  const initial = has(args, '--initial');
  const historyQuarterly = has(args, '--quarterly');
  const sourceLatest = has(args, '--latest');
  if (initial && historyQuarterly) {
    throw new Error('Choose only one history mode: --initial or --quarterly');
  }
  if (initial && dataset !== 'history' && dataset !== 'annual-summary') {
    throw new Error('--initial is only valid for history or annual-summary');
  }
  if (historyQuarterly && dataset !== 'history') {
    throw new Error('--quarterly is only valid for history');
  }
  if (sourceLatest && dataset !== 'annual-summary' && dataset !== 'sod') {
    throw new Error('--latest is only valid for annual-summary or SOD');
  }
  if (initial && sourceLatest) {
    throw new Error('Choose only one annual mode: --initial or --latest');
  }
  if (explicit.length > 0 && (initial || historyQuarterly || sourceLatest)) {
    throw new Error('--partition cannot be combined with an orchestration mode');
  }
  let partitions: string[];
  if (explicit.length > 0) {
    partitions = explicit;
  } else if (dataset === 'annual-summary') {
    if (sourceLatest) {
      partitions = latestAnnualSummaryPartitions();
    } else {
      const bounds = await discoverAnnualSummaryBounds();
      const sourceMin = Math.min(bounds.CB.min, bounds.SI.min);
      const sourceMax = Math.max(bounds.CB.max, bounds.SI.max);
      const from = initial
        ? sourceMin
        : integerFlag(value(args, '--from'), '--from', sourceMin, sourceMax);
      const to = initial
        ? sourceMax
        : integerFlag(value(args, '--to'), '--to', from, sourceMax);
      partitions = buildAnnualSummaryRange(from, to, bounds);
    }
  } else if (dataset === 'sod') {
    partitions = sourceLatest
      ? ['latest']
      : yearRange(value(args, '--from'), value(args, '--to'), 1994).map(String);
  } else if (dataset === 'history') {
    const currentYear = new Date().getUTCFullYear();
    const from = initial
      ? String(HISTORY_FIRST_PROCESS_YEAR)
      : historyQuarterly
        ? String(currentYear - HISTORY_REFRESH_LOOKBACK_YEARS)
        : value(args, '--from');
    const to = initial || historyQuarterly ? String(currentYear) : value(args, '--to');
    partitions = yearRange(from, to, HISTORY_FIRST_PROCESS_YEAR).map(String);
  } else {
    const snapshot = value(args, '--snapshot');
    if (!snapshot) throw new Error('--snapshot is required for locations and institutions');
    partitions = [snapshot];
  }

  const maxPartitions = integerFlag(value(args, '--max-partitions') ?? '500', '--max-partitions', 1, 5_000);
  if (partitions.length > maxPartitions) {
    throw new Error(`Plan contains ${partitions.length} partitions, above --max-partitions ${maxPartitions}`);
  }
  return {
    dataset,
    partitions,
    baseUrl: (value(args, '--url') ?? process.env.BACKFILL_URL ?? DEFAULT_BASE_URL).replace(/\/$/, ''),
    maxPages: integerFlag(value(args, '--max-pages') ?? '1', '--max-pages', 1, 5),
    maxSteps: integerFlag(value(args, '--max-steps') ?? '1000', '--max-steps', 1, 10_000),
    maxPartitions,
    refresh: has(args, '--refresh') || historyQuarterly || sourceLatest,
    planOnly: has(args, '--plan'),
    pipelineRunId: pipelineRunId(value(args, '--run-id') ?? process.env.BACKFILL_RUN_ID)
  };
}

interface StepResponse {
  ok: boolean;
  error?: string;
  result?: {
    partition: string;
    run_id: string;
    done: boolean;
    checkpoint: number;
    rows_seen: number;
    source_total: number | null;
      rows_deleted: number;
      publication_phase: string | null;
      rows_materialized: number;
  };
}

async function callStep(options: Options, partition: string, refresh: boolean): Promise<StepResponse['result']> {
  const params = new URLSearchParams({
    dataset: options.dataset,
    partition,
    max_pages: String(options.maxPages)
  });
  if (refresh) params.set('refresh', 'true');
  const maxAttempts = 5;
  let lastError: Error | null = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    let retryableFailure = true;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 180_000);
    try {
      const response = await fetch(`${options.baseUrl}/api/v1/pipeline/fdic/backfill?${params.toString()}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${secret()}`,
          'X-Pipeline-Run-Id': options.pipelineRunId
        },
        signal: controller.signal
      });
      const text = await response.text();
      let body: StepResponse | null = null;
      try {
        body = JSON.parse(text) as StepResponse;
      } catch {
        // An invalid response body is ambiguous and safe to retry with this run ID.
      }
      if (response.ok && body?.ok && body.result) return body.result;
      const retryable = response.status === 409 || response.status === 429 || response.status >= 500;
      retryableFailure = retryable;
      lastError = new Error(body?.error ?? `HTTP ${response.status}: ${text.slice(0, 1_000)}`);
      if (!retryable || attempt === maxAttempts) throw lastError;
      const retryAfter = Number(response.headers.get('Retry-After'));
      const waitMs = Number.isFinite(retryAfter) && retryAfter >= 0
        ? Math.min(retryAfter * 1_000, 15_000)
        : Math.min(1_000 * 2 ** (attempt - 1), 15_000);
      console.log(`\nretryable HTTP ${response.status}; retry ${attempt + 1}/${maxAttempts} in ${waitMs / 1_000}s`);
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (!retryableFailure) throw lastError;
      if (attempt === maxAttempts) throw lastError;
      const waitMs = Math.min(1_000 * 2 ** (attempt - 1), 15_000);
      console.log(`\nambiguous request failure; retry ${attempt + 1}/${maxAttempts} in ${waitMs / 1_000}s`);
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    } finally {
      clearTimeout(timeout);
    }
  }
  throw lastError ?? new Error('FDIC backfill request failed');
}

async function runPartition(options: Options, partition: string): Promise<void> {
  let activePartition = partition;
  for (let step = 1; step <= options.maxSteps; step++) {
    const result = await callStep(options, activePartition, options.refresh && step === 1);
    if (result?.partition) activePartition = result.partition;
    const publication = result?.publication_phase
      ? `; ${result.publication_phase} ${result.rows_materialized}/${result.source_total ?? '?'} rows`
      : '';
    process.stdout.write(
      `\r${options.dataset} ${result?.partition ?? activePartition}: ${result?.rows_seen ?? 0}/${result?.source_total ?? '?'} rows${publication}`
    );
    if (result?.done) {
      console.log(`; published run ${result.run_id}; removed ${result.rows_deleted} stale rows`);
      return;
    }
  }
  throw new Error(`${options.dataset} ${partition} exceeded --max-steps ${options.maxSteps}`);
}

async function main(): Promise<void> {
  const options = await parseArgs();
  console.log(`FDIC ${options.dataset}: ${options.partitions.length} partition(s)`);
  console.log(`Pipeline run: ${options.pipelineRunId}`);
  if (options.planOnly) {
    for (const partition of options.partitions) console.log(partition);
    return;
  }
  for (const partition of options.partitions) await runPartition(options, partition);
}

main().catch((error) => {
  console.error(`\nFDIC backfill failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
