/**
 * Sync FDIC bank failure data into D1.
 * Fetches all ~4,100 failure records from the FDIC BankFind failures endpoint.
 */

import { batchInsert } from '$lib/server/db';
import { delay } from './fdic-api';

const FDIC_BASE_URL = 'https://banks.data.fdic.gov/api';
const PAGE_SIZE = 10_000;
const MAX_RETRIES = 3;
const INITIAL_BACKOFF_MS = 500;

const FAILURE_FIELDS = [
  'CERT', 'NAME', 'CITYST', 'FAILDATE', 'SAVR', 'COST', 'QBFASSET', 'QBFDEP'
].join(',');

/** Fetch with retry + exponential backoff */
async function fetchWithRetry(url: string): Promise<Response> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const response = await fetch(url);
      if (response.ok) return response;

      if (response.status !== 429 && response.status < 500) {
        throw new Error(`FDIC API returned ${response.status}: ${await response.text()}`);
      }
      lastError = new Error(`FDIC API returned ${response.status}`);
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
    }

    if (attempt < MAX_RETRIES - 1) {
      const backoff = INITIAL_BACKOFF_MS * Math.pow(2, attempt);
      await new Promise((resolve) => setTimeout(resolve, backoff));
    }
  }

  throw lastError ?? new Error('FDIC failures API request failed after retries');
}

interface FDICFailuresResponse {
  data: Array<{ data: Record<string, unknown> }>;
  totals: { count: number };
}

/** Map a raw FDIC failure record to our schema */
export function mapFailure(raw: Record<string, unknown>): Record<string, unknown> {
  const cityst = String(raw.CITYST ?? '');
  const parts = cityst.split(', ');
  const city = parts[0] || null;
  const state = parts.length > 1 ? parts[parts.length - 1] : null;

  return {
    cert: Number(raw.CERT),
    name: raw.NAME != null ? String(raw.NAME) : null,
    city,
    state,
    fail_date: raw.FAILDATE != null ? String(raw.FAILDATE) : null,
    acquiring_institution: raw.SAVR != null ? String(raw.SAVR) : null,
    cost: raw.COST != null ? Number(raw.COST) : null,
    total_deposits: raw.QBFDEP != null ? Number(raw.QBFDEP) : null,
    total_assets: raw.QBFASSET != null ? Number(raw.QBFASSET) : null
  };
}

export interface SyncFailuresResult {
  processed: number;
}

/**
 * Fetch all bank failures from FDIC and insert into D1.
 * Only ~4,100 records total, so this completes in one or two pages.
 */
export async function syncFailures(db: D1Database): Promise<SyncFailuresResult> {
  let offset = 0;
  let totalProcessed = 0;

  console.log('Failures: starting sync...');

  while (true) {
    const url = `${FDIC_BASE_URL}/failures?limit=${PAGE_SIZE}&offset=${offset}&fields=${FAILURE_FIELDS}&sort_by=FAILDATE&sort_order=DESC`;
    const response = await fetchWithRetry(url);
    const json = (await response.json()) as FDICFailuresResponse;

    if (offset === 0) {
      console.log(`Failures: total records in FDIC: ${json.totals.count}`);
    }

    if (json.data.length === 0) break;

    const rows = json.data.map((item) => mapFailure(item.data));
    await batchInsert(db, 'failures', rows, ['cert']);

    totalProcessed += rows.length;
    console.log(`Failures: processed ${totalProcessed} rows`);

    if (json.data.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
    await delay(100);
  }

  console.log(`Failures: sync complete, ${totalProcessed} total rows`);
  return { processed: totalProcessed };
}
