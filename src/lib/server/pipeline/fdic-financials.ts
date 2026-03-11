/**
 * Backfill ALL historical FDIC financials into D1.
 * Paginates through ~614K bank-quarter records (1992-present),
 * 10,000 per page, inserting into the financials table.
 * Supports resumable backfill via pipeline_state offsets.
 */

import { batchInsert, execute, queryOne } from '$lib/server/db';
import { delay } from './fdic-api';

const PAGE_SIZE = 10_000;
const DELAY_BETWEEN_PAGES_MS = 100;

const FDIC_BASE_URL = 'https://banks.data.fdic.gov/api';
const MAX_RETRIES = 3;
const INITIAL_BACKOFF_MS = 500;

const FINANCIAL_FIELDS = [
  'CERT', 'REPDTE', 'ASSET', 'DEP', 'EQ', 'LNLSNET',
  'LNRE', 'LNCI', 'LNCON', 'SC', 'NETINC', 'INTINC',
  'EINTEXP', 'NIM', 'NONII', 'NONIX', 'ELNATR',
  'ROA', 'ROE', 'NIMY', 'EEFFR',
  'RBCRWAJ', 'RBC1RWAJ', 'RBC1AAJ', 'EQV',
  'NCLNLSR', 'LNATRESR', 'NTLNLSR',
  'LNLSDEPR', 'OTHBFHLB', 'NUMEMP'
].join(',');

interface FDICFinancialsResponse {
  data: Array<{ data: Record<string, unknown> }>;
  totals: { count: number };
}

/** Fetch with retry + exponential backoff (local copy to keep module self-contained) */
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

  throw lastError ?? new Error('FDIC API request failed after retries');
}

/** Fetch a page of financials sorted by REPDTE ASC */
async function fetchFinancialsPage(
  offset: number,
  limit: number
): Promise<FDICFinancialsResponse> {
  const url = `${FDIC_BASE_URL}/financials?limit=${limit}&offset=${offset}&sort_by=REPDTE&sort_order=ASC&fields=${FINANCIAL_FIELDS}`;
  const response = await fetchWithRetry(url);
  return response.json() as Promise<FDICFinancialsResponse>;
}

/** Compute asset tier bucket from ASSET (in thousands of dollars) */
function computeAssetBucket(asset: number | null): number | null {
  if (asset == null) return null;
  if (asset < 100_000) return 1;
  if (asset < 300_000) return 2;
  if (asset < 1_000_000) return 3;
  if (asset < 10_000_000) return 4;
  if (asset < 50_000_000) return 5;
  if (asset < 250_000_000) return 6;
  return 7;
}

/** Safely convert to number or null */
function toNum(v: unknown): number | null {
  return v != null ? Number(v) : null;
}

/** Map a raw FDIC financials record to our schema */
function mapFinancial(raw: Record<string, unknown>): Record<string, unknown> {
  const asset = toNum(raw.ASSET);
  return {
    cert: Number(raw.CERT),
    repdte: String(raw.REPDTE ?? ''),
    asset: asset,
    dep: toNum(raw.DEP),
    eq: toNum(raw.EQ),
    lnlsnet: toNum(raw.LNLSNET),
    lnre: toNum(raw.LNRE),
    lnci: toNum(raw.LNCI),
    lncon: toNum(raw.LNCON),
    sec: toNum(raw.SC),
    netinc: toNum(raw.NETINC),
    intinc: toNum(raw.INTINC),
    eintexp: toNum(raw.EINTEXP),
    nim: toNum(raw.NIM),
    nonii: toNum(raw.NONII),
    nonix: toNum(raw.NONIX),
    elnatr: toNum(raw.ELNATR),
    roa: toNum(raw.ROA),
    roe: toNum(raw.ROE),
    nimy: toNum(raw.NIMY),
    eeffr: toNum(raw.EEFFR),
    rbcrwaj: toNum(raw.RBCRWAJ),
    rbc1rwaj: toNum(raw.RBC1RWAJ),
    rbc1aaj: toNum(raw.RBC1AAJ),
    eqv: toNum(raw.EQV),
    nclnlsr: toNum(raw.NCLNLSR),
    lnatresr: toNum(raw.LNATRESR),
    nco_ratio: toNum(raw.NTLNLSR),
    lnlsdepr: toNum(raw.LNLSDEPR),
    othbfhlb: toNum(raw.OTHBFHLB),
    numemp: toNum(raw.NUMEMP),
    asset_bucket: computeAssetBucket(asset)
  };
}

export interface SyncFinancialsResult {
  processed: number;
}

/** Read a pipeline_state value */
async function getState(db: D1Database, key: string): Promise<string | null> {
  const row = await queryOne<{ value: string }>(
    db,
    'SELECT value FROM pipeline_state WHERE key = ?',
    [key]
  );
  return row?.value ?? null;
}

/** Write a pipeline_state value */
async function setState(db: D1Database, key: string, value: string): Promise<void> {
  const now = new Date().toISOString();
  await execute(
    db,
    'INSERT OR REPLACE INTO pipeline_state (key, value, updated_at) VALUES (?, ?, ?)',
    [key, value, now]
  );
}

/**
 * Fetch ALL historical financials from FDIC and insert into D1.
 * Resumes from last saved offset if a previous run was interrupted.
 */
export async function syncFinancials(db: D1Database): Promise<SyncFinancialsResult> {
  // Check for resumable state
  const savedOffset = await getState(db, 'financials_sync_offset');
  const savedCount = await getState(db, 'financials_sync_count');
  let offset = savedOffset ? Number(savedOffset) : 0;
  let totalProcessed = savedCount ? Number(savedCount) : 0;
  let pageNum = Math.floor(offset / PAGE_SIZE) + 1;

  if (offset > 0) {
    console.log(`Financials: resuming from offset ${offset}, previously processed ${totalProcessed} rows`);
  } else {
    console.log('Financials: starting full backfill...');
  }

  await setState(db, 'financials_sync_status', 'running');

  while (true) {
    console.log(`Financials: page ${pageNum}, offset ${offset}, processed ${totalProcessed} rows`);

    const response = await fetchFinancialsPage(offset, PAGE_SIZE);

    if (pageNum === 1 && offset === 0) {
      console.log(`Financials: total records in FDIC: ${response.totals.count}`);
    }

    if (response.data.length === 0) break;

    const rows = response.data.map((item) => mapFinancial(item.data));
    await batchInsert(db, 'financials', rows);

    totalProcessed += rows.length;

    // Save progress after each page for resumability
    await setState(db, 'financials_sync_offset', String(offset + response.data.length));
    await setState(db, 'financials_sync_count', String(totalProcessed));

    if (response.data.length < PAGE_SIZE) break;

    offset += PAGE_SIZE;
    pageNum++;
    await delay(DELAY_BETWEEN_PAGES_MS);
  }

  // Mark complete
  await setState(db, 'financials_sync_status', 'complete');
  await setState(db, 'financials_sync_offset', '0');
  console.log(`Financials: backfill complete, ${totalProcessed} total rows`);

  return { processed: totalProcessed };
}
