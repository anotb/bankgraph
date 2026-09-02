/**
 * Sync FDIC failure and assistance transactions into D1.
 * The source includes both failed institutions and assistance transactions.
 */

import { bulkUpsert, execute } from '$lib/server/db';
import { delay } from './fdic-api';

const FDIC_BASE_URL = 'https://api.fdic.gov/banks';
const PAGE_SIZE = 10_000;
const MAX_RETRIES = 3;
const INITIAL_BACKOFF_MS = 500;

const FAILURE_FIELDS = [
  'ID', 'CERT', 'NAME', 'CITYST', 'FAILDATE', 'RESTYPE', 'RESTYPE1', 'SAVR', 'BIDNAME',
  'COST', 'QBFASSET', 'QBFDEP'
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

/** Convert FDIC date formats (M/D/YYYY, MM/DD/YYYY, etc.) to YYYYMMDD for sortable storage */
function normalizeDate(raw: unknown): string | null {
  if (raw == null) return null;
  const s = String(raw).trim();
  if (!s) return null;

  // Already YYYYMMDD
  if (/^\d{8}$/.test(s)) return s;

  // Try parsing as a date (handles M/D/YYYY, YYYY-MM-DD, etc.)
  const d = new Date(s);
  if (!isNaN(d.getTime())) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}${m}${day}`;
  }

  return null;
}

function optionalString(value: unknown): string | null {
  if (value == null) return null;
  const text = String(value).trim();
  return text || null;
}

function optionalNumber(value: unknown): number | null {
  if (value == null || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

/** Map a raw FDIC failure or assistance record to our schema. */
export function mapFailure(raw: Record<string, unknown>): Record<string, unknown> {
  const sourceId = optionalString(raw.ID);
  if (!sourceId) throw new Error('FDIC failure record is missing its source ID');

  const cityst = String(raw.CITYST ?? '');
  const parts = cityst.split(', ');
  const city = parts[0] || null;
  const state = parts.length > 1 ? parts[parts.length - 1] : null;
  const rawTransactionType = optionalString(raw.RESTYPE)?.toUpperCase() ?? null;
  const transactionType = rawTransactionType === 'FAILURE' || rawTransactionType === 'ASSISTANCE'
    ? rawTransactionType
    : null;

  return {
    source_id: sourceId,
    cert: optionalNumber(raw.CERT),
    name: optionalString(raw.NAME),
    city,
    state,
    fail_date: normalizeDate(raw.FAILDATE),
    transaction_type: transactionType,
    resolution_type: optionalString(raw.RESTYPE1),
    insurance_fund: optionalString(raw.SAVR),
    acquiring_institution: optionalString(raw.BIDNAME),
    cost: optionalNumber(raw.COST),
    total_deposits: optionalNumber(raw.QBFDEP),
    total_assets: optionalNumber(raw.QBFASSET)
  };
}

export interface SyncFailuresResult {
  processed: number;
  failures: number;
  assistanceTransactions: number;
  unclassified: number;
}

/**
 * Fetch all FDIC failure and assistance transactions and insert them into D1.
 * Only a few thousand records exist, so this completes in one or two pages.
 */
export async function syncFailures(db: D1Database): Promise<SyncFailuresResult> {
  let offset = 0;
  let totalProcessed = 0;
  let failureCount = 0;
  let assistanceCount = 0;
  let unclassifiedCount = 0;
  let expectedTotal: number | null = null;

  console.log('Failures and assistance: starting sync...');

  while (true) {
    const url = `${FDIC_BASE_URL}/failures?limit=${PAGE_SIZE}&offset=${offset}&fields=${FAILURE_FIELDS}&sort_by=FAILDATE&sort_order=DESC`;
    const response = await fetchWithRetry(url);
    const json = (await response.json()) as FDICFailuresResponse;

    if (offset === 0) {
      expectedTotal = json.totals.count;
      if (!Number.isSafeInteger(expectedTotal) || expectedTotal < 0 || expectedTotal > PAGE_SIZE) {
        throw new Error(
          `FDIC failures sync requires one atomic page; source reported ${expectedTotal}`
        );
      }
      console.log(`Failures and assistance: total records in FDIC: ${json.totals.count}`);
    }

    if (json.data.length === 0) break;

    const rows = json.data.map((item) => mapFailure(item.data));
    // The full source currently fits in one page and one compact D1 batch.
    // Keeping the page atomic prevents a failed routine refresh from exposing
    // a partially revised failure history while the prior bank release stays live.
    await bulkUpsert(db, 'failures', rows, ['source_id']);

    for (const row of rows) {
      if (row.transaction_type === 'FAILURE') failureCount++;
      else if (row.transaction_type === 'ASSISTANCE') assistanceCount++;
      else unclassifiedCount++;
    }

    totalProcessed += rows.length;
    console.log(`Failures and assistance: processed ${totalProcessed} rows`);

    if (json.data.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
    await delay(100);
  }

  if (expectedTotal === null || totalProcessed !== expectedTotal) {
    throw new Error(
      `FDIC failures sync was incomplete: expected ${expectedTotal ?? 'an unknown number of'} rows, received ${totalProcessed}`
    );
  }

  // Migration 0012 preserves pre-source-ID rows under a legacy key so the
  // table is never emptied before a successful refresh. Remove those rows only
  // after every source page has been fetched and persisted.
  await execute(db, "DELETE FROM failures WHERE source_id LIKE 'legacy-cert:%'");

  console.log(
    `Failures and assistance: sync complete, ${failureCount} failures, ` +
    `${assistanceCount} assistance transactions, ${unclassifiedCount} unclassified`
  );
  return {
    processed: totalProcessed,
    failures: failureCount,
    assistanceTransactions: assistanceCount,
    unclassified: unclassifiedCount
  };
}
