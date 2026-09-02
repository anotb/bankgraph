/**
 * Backfill ALL historical FDIC financials into D1.
 * Paginates through the supported 1992-present records (1,140,484 source rows
 * on 2026-08-30; the total grows as new quarters are published),
 * 1,000 per page, compact-upserting into the financials table.
 * Supports resumable backfill via pipeline_state quarter/page checkpoints.
 */

import { bulkUpsert, execute, queryAll, queryOne } from '$lib/server/db';
import { delay } from './fdic-api';
import { parseFdicReportingDate } from './fdic-reporting-date';

/**
 * Keep one source page small enough to map and serialize inside the Worker memory
 * limit. `bulkUpsert` packs each page into five D1 statements (200 rows each),
 * instead of issuing one D1 statement per financial row.
 */
export const FINANCIAL_PAGE_SIZE = 1_000;
export const FINANCIAL_MAX_PAGES_PER_REQUEST = 5;
export const CANONICAL_FINANCIAL_START = '19920331';
export const CANONICAL_FINANCIAL_SCOPE = `repdte>=${CANONICAL_FINANCIAL_START}:quarter-cert:v2`;
export const FINANCIAL_SYNC_SCOPE_KEY = 'financials_sync_scope';
export const FINANCIAL_SYNC_STATUS_KEY = 'financials_sync_status';
export const FINANCIAL_SYNC_SOURCE_TOTAL_KEY = 'financials_sync_source_total';
export const FINANCIAL_SYNC_RECONCILED_TOTAL_KEY = 'financials_sync_reconciled_total';
const FINANCIAL_SYNC_RUN_ID_KEY = 'financials_sync_run_id';
const FINANCIAL_SYNC_SOURCE_LATEST_KEY = 'financials_sync_source_latest';
const FINANCIAL_SYNC_QUARTER_KEY = 'financials_sync_quarter';
const FINANCIAL_SYNC_PARTITION_TOTAL_KEY = 'financials_sync_partition_total';
const FINANCIAL_SYNC_LAST_CERT_KEY = 'financials_sync_last_cert';
const FINANCIAL_SYNC_OFFSET_KEY = 'financials_sync_offset';
const FINANCIAL_SYNC_COUNT_KEY = 'financials_sync_count';
const DELAY_BETWEEN_PAGES_MS = 100;

const FDIC_BASE_URL = 'https://api.fdic.gov/banks';
const MAX_RETRIES = 3;
const INITIAL_BACKOFF_MS = 500;

const FINANCIAL_FIELDS = [
  'CERT', 'REPDTE', 'ASSET', 'DEP', 'EQ', 'LNLSNET',
  'LNRE', 'LNCI', 'LNCON', 'SC',
  'CHBAL', 'FREPO', 'TRADE', 'ORE', 'BKPREM', 'INTAN', 'OA',
  'FREPP', 'OTHBOR', 'SUBND', 'TRADEL', 'ALLOTHL',
  'NETINC', 'INTINC', 'EINTEXP', 'NIM', 'NONII', 'NONIX', 'ELNATR',
  'NETINCQ', 'NIMQ', 'NONIIQ', 'NONIXQ', 'ELNATQ', 'IGLSECQ', 'ITAXQ', 'EXTRAQ',
  'ROA', 'ROE', 'NIMY', 'EEFFR',
  'RBCRWAJ', 'RBC1RWAJ', 'RBC1AAJ', 'EQV',
  'NCLNLSR', 'LNATRESR', 'NTLNLSR',
  'LNLSDEPR', 'OTHBFHLB', 'NUMEMP'
].join(',');

interface FDICFinancialsResponse {
  data: Array<{ data: Record<string, unknown> }>;
  totals: { count: number };
}

interface FinancialSourceMetadata {
  total: number;
  latestQuarter: string;
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

/**
 * Pin the filtered source cardinality and latest reporting quarter. The full
 * sync rechecks this metadata on every bounded invocation and at completion.
 */
async function fetchFinancialSourceMetadata(): Promise<FinancialSourceMetadata> {
  const params = new URLSearchParams({
    filters: `REPDTE:[${CANONICAL_FINANCIAL_START} TO *]`,
    limit: '1',
    offset: '0',
    sort_by: 'REPDTE',
    sort_order: 'DESC',
    fields: 'REPDTE'
  });
  const response = await fetchWithRetry(`${FDIC_BASE_URL}/financials?${params}`);
  const payload = await response.json() as FDICFinancialsResponse;
  const total = payload.totals?.count;
  if (!Number.isSafeInteger(total) || total <= 0 || payload.data.length !== 1) {
    throw new Error('FDIC canonical financial source metadata is empty or malformed');
  }
  const latestQuarter = parseFdicReportingDate(
    payload.data[0].data.REPDTE,
    'latest financial quarter'
  );
  if (
    latestQuarter < CANONICAL_FINANCIAL_START
    || !['0331', '0630', '0930', '1231'].includes(latestQuarter.slice(4))
  ) {
    throw new Error(`FDIC returned an invalid latest canonical financial quarter: ${latestQuarter}`);
  }
  return { total, latestQuarter };
}

/**
 * Fetch one reporting-quarter partition sorted by CERT. CERT is the natural
 * unique key within a REPDTE partition, unlike the former non-unique global
 * REPDTE sort, so an offset page boundary is deterministic and auditable.
 */
async function fetchFinancialsPage(
  repdte: string,
  offset: number,
  limit: number
): Promise<FDICFinancialsResponse> {
  const params = new URLSearchParams({
    filters: `REPDTE:${repdte}`,
    limit: String(limit),
    offset: String(offset),
    sort_by: 'CERT',
    sort_order: 'ASC',
    fields: FINANCIAL_FIELDS
  });
  const response = await fetchWithRetry(`${FDIC_BASE_URL}/financials?${params}`);
  return response.json() as Promise<FDICFinancialsResponse>;
}

/** Compute asset tier bucket from ASSET (in thousands of dollars) */
export function computeAssetBucket(asset: number | null): number | null {
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
export function toNum(v: unknown): number | null {
  return v != null ? Number(v) : null;
}

/** Map a raw FDIC financials record to our schema */
export function mapFinancial(raw: Record<string, unknown>): Record<string, unknown> {
  const asset = toNum(raw.ASSET);
  return {
    cert: Number(raw.CERT),
    repdte: parseFdicReportingDate(raw.REPDTE),
    asset: asset,
    dep: toNum(raw.DEP),
    eq: toNum(raw.EQ),
    lnlsnet: toNum(raw.LNLSNET),
    lnre: toNum(raw.LNRE),
    lnci: toNum(raw.LNCI),
    lncon: toNum(raw.LNCON),
    sec: toNum(raw.SC),
    chbal: toNum(raw.CHBAL),
    frepo: toNum(raw.FREPO),
    trade: toNum(raw.TRADE),
    ore: toNum(raw.ORE),
    bkprem: toNum(raw.BKPREM),
    intan: toNum(raw.INTAN),
    oa: toNum(raw.OA),
    frepp: toNum(raw.FREPP),
    othbor: toNum(raw.OTHBOR),
    subnd: toNum(raw.SUBND),
    tradel: toNum(raw.TRADEL),
    allothl: toNum(raw.ALLOTHL),
    netinc: toNum(raw.NETINC),
    intinc: toNum(raw.INTINC),
    eintexp: toNum(raw.EINTEXP),
    nim: toNum(raw.NIM),
    nonii: toNum(raw.NONII),
    nonix: toNum(raw.NONIX),
    elnatr: toNum(raw.ELNATR),
    netincq: toNum(raw.NETINCQ),
    nimq: toNum(raw.NIMQ),
    noniiq: toNum(raw.NONIIQ),
    nonixq: toNum(raw.NONIXQ),
    elnatq: toNum(raw.ELNATQ),
    iglsecq: toNum(raw.IGLSECQ),
    itaxq: toNum(raw.ITAXQ),
    extraq: toNum(raw.EXTRAQ),
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
  done: boolean;
  offset: number;
  quarter: string;
  source_total: number;
}

export interface SyncFinancialsOptions {
  maxPages?: number;
  runId?: string;
}

const FINANCIAL_SYNC_STATE_KEYS = [
  FINANCIAL_SYNC_STATUS_KEY,
  FINANCIAL_SYNC_RUN_ID_KEY,
  FINANCIAL_SYNC_SOURCE_TOTAL_KEY,
  FINANCIAL_SYNC_SOURCE_LATEST_KEY,
  FINANCIAL_SYNC_QUARTER_KEY,
  FINANCIAL_SYNC_PARTITION_TOTAL_KEY,
  FINANCIAL_SYNC_LAST_CERT_KEY,
  FINANCIAL_SYNC_OFFSET_KEY,
  FINANCIAL_SYNC_COUNT_KEY,
  FINANCIAL_SYNC_RECONCILED_TOTAL_KEY
] as const;

/** Read a pipeline_state value */
async function getState(db: D1Database, key: string): Promise<string | null> {
  const row = await queryOne<{ value: string }>(
    db,
    'SELECT value FROM pipeline_state WHERE key = ?',
    [key]
  );
  return row?.value ?? null;
}

/** Atomically advance all fields of a durable financial checkpoint. */
async function setStates(db: D1Database, values: Record<string, string>): Promise<void> {
  const now = new Date().toISOString();
  const statements = Object.entries(values).map(([key, value]) =>
    db.prepare(
      `INSERT INTO pipeline_state (key, value, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
    ).bind(key, value, now)
  );
  await db.batch(statements);
}

function emptyFinancialSyncCheckpoint(): Record<string, string> {
  return {
    [FINANCIAL_SYNC_OFFSET_KEY]: '0',
    [FINANCIAL_SYNC_COUNT_KEY]: '0',
    [FINANCIAL_SYNC_STATUS_KEY]: 'idle',
    [FINANCIAL_SYNC_RUN_ID_KEY]: '',
    [FINANCIAL_SYNC_SOURCE_TOTAL_KEY]: '',
    [FINANCIAL_SYNC_SOURCE_LATEST_KEY]: '',
    [FINANCIAL_SYNC_QUARTER_KEY]: CANONICAL_FINANCIAL_START,
    [FINANCIAL_SYNC_PARTITION_TOTAL_KEY]: '',
    [FINANCIAL_SYNC_LAST_CERT_KEY]: '',
    [FINANCIAL_SYNC_RECONCILED_TOTAL_KEY]: ''
  };
}

/** Explicit operator reset for a stale or source-drifted durable checkpoint. */
export async function resetFinancialSyncCheckpoint(db: D1Database): Promise<void> {
  await setStates(db, emptyFinancialSyncCheckpoint());
}

async function getFinancialSyncState(db: D1Database): Promise<Map<string, string>> {
  const placeholders = FINANCIAL_SYNC_STATE_KEYS.map(() => '?').join(', ');
  const rows = await queryAll<{ key: string; value: string }>(
    db,
    `SELECT key, value FROM pipeline_state WHERE key IN (${placeholders})`,
    [...FINANCIAL_SYNC_STATE_KEYS]
  );
  return new Map(rows.map((row) => [row.key, row.value]));
}

function parseCheckpointInteger(
  value: string | undefined,
  label: string,
  options: { positive?: boolean } = {}
): number {
  const parsed = Number(value);
  const valid = Number.isSafeInteger(parsed) && (options.positive ? parsed > 0 : parsed >= 0);
  if (!valid) throw new Error(`Financial sync checkpoint ${label} is invalid; reset the stage`);
  return parsed;
}

function nextFinancialQuarter(repdte: string): string {
  const year = Number(repdte.slice(0, 4));
  const suffix = repdte.slice(4);
  if (suffix === '0331') return `${year}0630`;
  if (suffix === '0630') return `${year}0930`;
  if (suffix === '0930') return `${year}1231`;
  if (suffix === '1231') return `${year + 1}0331`;
  throw new Error(`Financial sync checkpoint quarter is invalid: ${repdte}`);
}

function assertSourceMetadata(
  current: FinancialSourceMetadata,
  expectedTotal: number,
  expectedLatestQuarter: string
): void {
  if (current.total !== expectedTotal || current.latestQuarter !== expectedLatestQuarter) {
    throw new Error(
      `FDIC canonical financial source changed during the run `
      + `(expected ${expectedTotal} rows through ${expectedLatestQuarter}, `
      + `received ${current.total} through ${current.latestQuarter}); restart with a new run id`
    );
  }
}

/** Remove rows that cannot belong to the pinned canonical quarter sequence. */
async function purgeOutsideCanonicalSourceWindow(
  db: D1Database,
  latestQuarter: string
): Promise<void> {
  await execute(
    db,
    `DELETE FROM financials
      WHERE repdte > ?
         OR (repdte >= ? AND substr(repdte, 5, 4) NOT IN ('0331', '0630', '0930', '1231'))`,
    [latestQuarter, CANONICAL_FINANCIAL_START]
  );
}

export interface CanonicalFinancialReconciliation {
  rowCount: number;
  firstQuarter: string;
  latestQuarter: string;
}

/**
 * Reconcile the D1 natural-key table to a pinned canonical FDIC source scope.
 * `financials` has PRIMARY KEY(cert, repdte), so COUNT(*) is also the distinct
 * canonical key count and does not require a costly DISTINCT materialization.
 */
export async function reconcileCanonicalFinancialCoverage(
  db: D1Database,
  expectedTotal: number,
  expectedLatestQuarter: string
): Promise<CanonicalFinancialReconciliation> {
  const coverage = await queryOne<{
    row_count: number;
    first_quarter: string | null;
    latest_quarter: string | null;
  }>(
    db,
    `SELECT COUNT(*) AS row_count,
            MIN(repdte) AS first_quarter,
            MAX(repdte) AS latest_quarter
       FROM financials`
  );
  const rowCount = Number(coverage?.row_count);
  if (
    !Number.isSafeInteger(rowCount)
    || rowCount !== expectedTotal
    || coverage?.first_quarter !== CANONICAL_FINANCIAL_START
    || coverage.latest_quarter !== expectedLatestQuarter
  ) {
    throw new Error(
      `Canonical financial reconciliation failed: expected ${expectedTotal} rows from `
      + `${CANONICAL_FINANCIAL_START} through ${expectedLatestQuarter}, received `
      + `${Number.isSafeInteger(rowCount) ? rowCount : 'invalid'} rows from `
      + `${coverage?.first_quarter ?? 'none'} through ${coverage?.latest_quarter ?? 'none'}`
    );
  }
  return {
    rowCount,
    firstQuarter: coverage.first_quarter,
    latestQuarter: coverage.latest_quarter
  };
}

export interface CanonicalFinancialCoverageResult {
  deleted: number;
  reset: boolean;
}

/**
 * Enforce the supported BankFind product boundary before any derived stage can
 * observe the financial table. The delete is deliberately idempotent. A scope
 * marker invalidates offsets saved by the former unfiltered 1984-present loader.
 */
export async function ensureCanonicalFinancialCoverage(
  db: D1Database
): Promise<CanonicalFinancialCoverageResult> {
  const savedScope = await getState(db, FINANCIAL_SYNC_SCOPE_KEY);
  const reset = savedScope !== CANONICAL_FINANCIAL_SCOPE;
  const now = new Date().toISOString();
  const statements = [
    db.prepare('DELETE FROM financials WHERE repdte < ?').bind(CANONICAL_FINANCIAL_START)
  ];
  if (reset) {
    const resetValues = {
      ...emptyFinancialSyncCheckpoint(),
      [FINANCIAL_SYNC_SCOPE_KEY]: CANONICAL_FINANCIAL_SCOPE
    };
    for (const [key, value] of Object.entries(resetValues)) {
      statements.push(
        db.prepare(
          `INSERT INTO pipeline_state (key, value, updated_at) VALUES (?, ?, ?)
           ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
        ).bind(key, value, now)
      );
    }
  }
  const results = await db.batch(statements);
  return { deleted: results[0]?.meta.changes ?? 0, reset };
}

/**
 * Fetch historical financials from FDIC and insert into D1.
 * Resumes from last saved offset if a previous run was interrupted.
 * Processes at most `maxPages` pages per invocation to stay within
 * the Cloudflare Worker runtime and D1 query budgets. Returns `done: false` when
 * there are more pages to fetch; the caller should re-invoke.
 */
export async function syncFinancials(
  db: D1Database,
  maxPagesOrOptions: number | SyncFinancialsOptions = FINANCIAL_MAX_PAGES_PER_REQUEST
): Promise<SyncFinancialsResult> {
  const options = typeof maxPagesOrOptions === 'number'
    ? { maxPages: maxPagesOrOptions }
    : maxPagesOrOptions;
  const maxPages = options.maxPages ?? FINANCIAL_MAX_PAGES_PER_REQUEST;
  const runId = options.runId?.trim() || 'standalone';
  if (!Number.isInteger(maxPages) || maxPages < 1 || maxPages > FINANCIAL_MAX_PAGES_PER_REQUEST) {
    throw new Error(`maxPages must be between 1 and ${FINANCIAL_MAX_PAGES_PER_REQUEST}`);
  }
  if (runId.length > 128) throw new Error('Financial sync run id is too long');

  await ensureCanonicalFinancialCoverage(db);
  const source = await fetchFinancialSourceMetadata();
  await purgeOutsideCanonicalSourceWindow(db, source.latestQuarter);
  const saved = await getFinancialSyncState(db);
  const savedStatus = saved.get(FINANCIAL_SYNC_STATUS_KEY) ?? 'idle';
  const sameRun = saved.get(FINANCIAL_SYNC_RUN_ID_KEY) === runId;

  if (sameRun && savedStatus === 'complete') {
    const expectedTotal = parseCheckpointInteger(
      saved.get(FINANCIAL_SYNC_SOURCE_TOTAL_KEY),
      'source total',
      { positive: true }
    );
    const expectedLatestQuarter = saved.get(FINANCIAL_SYNC_SOURCE_LATEST_KEY) ?? '';
    assertSourceMetadata(source, expectedTotal, expectedLatestQuarter);
    await reconcileCanonicalFinancialCoverage(db, expectedTotal, expectedLatestQuarter);
    return {
      processed: expectedTotal,
      done: true,
      offset: parseCheckpointInteger(saved.get(FINANCIAL_SYNC_OFFSET_KEY), 'offset'),
      quarter: expectedLatestQuarter,
      source_total: expectedTotal
    };
  }

  let quarter: string;
  let offset: number;
  let totalProcessed: number;
  let partitionTotal: number | null;
  let lastCert: number | null;
  let expectedTotal: number;
  let expectedLatestQuarter: string;

  if (!sameRun || savedStatus === 'idle') {
    quarter = CANONICAL_FINANCIAL_START;
    offset = 0;
    totalProcessed = 0;
    partitionTotal = null;
    lastCert = null;
    expectedTotal = source.total;
    expectedLatestQuarter = source.latestQuarter;
    await setStates(db, {
      [FINANCIAL_SYNC_STATUS_KEY]: 'running',
      [FINANCIAL_SYNC_RUN_ID_KEY]: runId,
      [FINANCIAL_SYNC_SOURCE_TOTAL_KEY]: String(expectedTotal),
      [FINANCIAL_SYNC_SOURCE_LATEST_KEY]: expectedLatestQuarter,
      [FINANCIAL_SYNC_QUARTER_KEY]: quarter,
      [FINANCIAL_SYNC_PARTITION_TOTAL_KEY]: '',
      [FINANCIAL_SYNC_LAST_CERT_KEY]: '',
      [FINANCIAL_SYNC_OFFSET_KEY]: '0',
      [FINANCIAL_SYNC_COUNT_KEY]: '0',
      [FINANCIAL_SYNC_RECONCILED_TOTAL_KEY]: ''
    });
  } else if (savedStatus === 'running') {
    expectedTotal = parseCheckpointInteger(
      saved.get(FINANCIAL_SYNC_SOURCE_TOTAL_KEY),
      'source total',
      { positive: true }
    );
    expectedLatestQuarter = saved.get(FINANCIAL_SYNC_SOURCE_LATEST_KEY) ?? '';
    assertSourceMetadata(source, expectedTotal, expectedLatestQuarter);
    quarter = saved.get(FINANCIAL_SYNC_QUARTER_KEY) ?? '';
    if (!/^\d{8}$/.test(quarter) || quarter < CANONICAL_FINANCIAL_START || quarter > expectedLatestQuarter) {
      throw new Error('Financial sync checkpoint quarter is invalid; reset the stage');
    }
    offset = parseCheckpointInteger(saved.get(FINANCIAL_SYNC_OFFSET_KEY), 'offset');
    totalProcessed = parseCheckpointInteger(saved.get(FINANCIAL_SYNC_COUNT_KEY), 'processed count');
    const savedPartitionTotal = saved.get(FINANCIAL_SYNC_PARTITION_TOTAL_KEY);
    partitionTotal = savedPartitionTotal
      ? parseCheckpointInteger(savedPartitionTotal, 'quarter source total', { positive: true })
      : null;
    const savedLastCert = saved.get(FINANCIAL_SYNC_LAST_CERT_KEY);
    lastCert = savedLastCert
      ? parseCheckpointInteger(savedLastCert, 'last CERT', { positive: true })
      : null;
    if ((offset > 0 && (partitionTotal == null || lastCert == null)) || (partitionTotal != null && offset > partitionTotal)) {
      throw new Error('Financial sync checkpoint page boundary is incomplete; reset the stage');
    }
  } else {
    throw new Error(`Financial sync checkpoint status is invalid: ${savedStatus}`);
  }

  let pagesThisInvocation = 0;
  let finished = false;

  console.log(
    `Financials: ${totalProcessed > 0 ? 'resuming' : 'starting'} ${quarter} at offset ${offset}; `
    + `${totalProcessed}/${expectedTotal} canonical rows processed`
  );

  while (pagesThisInvocation < maxPages && !finished) {
    // Replacing a quarter at offset zero reconciles source withdrawals and
    // makes restarting after a failed first page safe and idempotent.
    if (offset === 0) {
      await execute(db, 'DELETE FROM financials WHERE repdte = ?', [quarter]);
      partitionTotal = null;
      lastCert = null;
    }

    const response = await fetchFinancialsPage(quarter, offset, FINANCIAL_PAGE_SIZE);
    const currentPartitionTotal = response.totals?.count;
    if (!Number.isSafeInteger(currentPartitionTotal) || currentPartitionTotal <= 0) {
      throw new Error(`FDIC financial quarter ${quarter} returned an invalid source total`);
    }
    if (partitionTotal == null) partitionTotal = currentPartitionTotal;
    if (partitionTotal !== currentPartitionTotal) {
      throw new Error(
        `FDIC financial quarter ${quarter} changed during pagination `
        + `(expected ${partitionTotal}, received ${currentPartitionTotal}); restart the run`
      );
    }
    if (response.data.length === 0 || response.data.length > FINANCIAL_PAGE_SIZE) {
      throw new Error(`FDIC financial quarter ${quarter} returned a truncated or oversized page`);
    }

    const rows = response.data.map((item) => mapFinancial(item.data));
    let pageLastCert = lastCert;
    for (const row of rows) {
      const cert = Number(row.cert);
      if (row.repdte !== quarter || !Number.isSafeInteger(cert) || cert <= 0 || (pageLastCert != null && cert <= pageLastCert)) {
        throw new Error(`FDIC financial quarter ${quarter} violated deterministic CERT ordering`);
      }
      pageLastCert = cert;
    }

    const nextOffset = offset + rows.length;
    if (nextOffset > partitionTotal || (rows.length < FINANCIAL_PAGE_SIZE && nextOffset !== partitionTotal)) {
      throw new Error(
        `FDIC financial quarter ${quarter} page did not reconcile to source total ${partitionTotal}`
      );
    }

    await bulkUpsert(db, 'financials', rows, ['cert', 'repdte']);
    totalProcessed += rows.length;
    pagesThisInvocation++;
    if (totalProcessed > expectedTotal) {
      throw new Error('Financial sync processed more rows than the pinned canonical source total');
    }

    if (nextOffset === partitionTotal) {
      if (quarter === expectedLatestQuarter) {
        offset = nextOffset;
        lastCert = pageLastCert;
        finished = true;
        await setStates(db, {
          [FINANCIAL_SYNC_STATUS_KEY]: 'running',
          [FINANCIAL_SYNC_QUARTER_KEY]: quarter,
          [FINANCIAL_SYNC_PARTITION_TOTAL_KEY]: String(partitionTotal),
          [FINANCIAL_SYNC_LAST_CERT_KEY]: String(lastCert),
          [FINANCIAL_SYNC_OFFSET_KEY]: String(offset),
          [FINANCIAL_SYNC_COUNT_KEY]: String(totalProcessed)
        });
      } else {
        const upcomingQuarter = nextFinancialQuarter(quarter);
        if (upcomingQuarter > expectedLatestQuarter) {
          throw new Error('Financial sync reached the pinned latest quarter without exact reconciliation');
        }
        quarter = upcomingQuarter;
        offset = 0;
        partitionTotal = null;
        lastCert = null;
        await setStates(db, {
          [FINANCIAL_SYNC_STATUS_KEY]: 'running',
          [FINANCIAL_SYNC_QUARTER_KEY]: quarter,
          [FINANCIAL_SYNC_PARTITION_TOTAL_KEY]: '',
          [FINANCIAL_SYNC_LAST_CERT_KEY]: '',
          [FINANCIAL_SYNC_OFFSET_KEY]: '0',
          [FINANCIAL_SYNC_COUNT_KEY]: String(totalProcessed)
        });
      }
    } else {
      offset = nextOffset;
      lastCert = pageLastCert;
      await setStates(db, {
        [FINANCIAL_SYNC_STATUS_KEY]: 'running',
        [FINANCIAL_SYNC_QUARTER_KEY]: quarter,
        [FINANCIAL_SYNC_PARTITION_TOTAL_KEY]: String(partitionTotal),
        [FINANCIAL_SYNC_LAST_CERT_KEY]: String(lastCert),
        [FINANCIAL_SYNC_OFFSET_KEY]: String(offset),
        [FINANCIAL_SYNC_COUNT_KEY]: String(totalProcessed)
      });
    }

    if (!finished && pagesThisInvocation < maxPages) {
      await delay(DELAY_BETWEEN_PAGES_MS);
    }
  }

  if (!finished) {
    console.log(`Financials: pausing after ${pagesThisInvocation} pages at ${quarter}:${offset}`);
    return {
      processed: totalProcessed,
      done: false,
      offset,
      quarter,
      source_total: expectedTotal
    };
  }

  if (totalProcessed !== expectedTotal) {
    throw new Error(
      `Financial sync checkpoint processed ${totalProcessed} rows but the pinned source has ${expectedTotal}`
    );
  }
  assertSourceMetadata(await fetchFinancialSourceMetadata(), expectedTotal, expectedLatestQuarter);
  await reconcileCanonicalFinancialCoverage(db, expectedTotal, expectedLatestQuarter);
  await setStates(db, {
    [FINANCIAL_SYNC_STATUS_KEY]: 'complete',
    [FINANCIAL_SYNC_COUNT_KEY]: String(expectedTotal),
    [FINANCIAL_SYNC_RECONCILED_TOTAL_KEY]: String(expectedTotal)
  });
  console.log(`Financials: canonical backfill complete, ${expectedTotal} reconciled rows`);

  return {
    processed: expectedTotal,
    done: true,
    offset,
    quarter: expectedLatestQuarter,
    source_total: expectedTotal
  };
}

export interface SyncLatestQuarterResult {
  repdte: string | null;
  inserted: number;
  source_total?: number;
}

/**
 * Incrementally ingest the single most recent quarter into the `financials`
 * time-series table (idempotent upsert on cert+repdte). Unlike syncFinancials,
 * this fetches just one quarter (~4.4k rows across about five pages), so it completes in a
 * single Worker invocation and is suitable for a nightly run. Use it to pick up
 * a newly-published quarter without re-backfilling the full history.
 *
 * Note: the `snapshot` stage updates the institutions summary columns; this
 * stage feeds the time series that powers charts, trends, movers, and anomalies.
 * Run both (then analytics/trends/anomalies) when a new quarter lands.
 */
export async function syncLatestQuarterFinancials(
  db: D1Database,
  repdte?: string,
  options: { publishedRelease?: string | null } = {}
): Promise<SyncLatestQuarterResult> {
  await ensureCanonicalFinancialCoverage(db);
  const source = await fetchFinancialSourceMetadata();
  const quarter = parseFdicReportingDate(repdte ?? source.latestQuarter, 'reporting quarter');
  if (quarter !== source.latestQuarter) {
    throw new Error(
      `Latest-quarter financial sync requires ${source.latestQuarter}, received ${quarter}`
    );
  }

  // The elected quarter is immutable from the public product's perspective.
  // Rewriting it in place would make a same-quarter source revision visible
  // before a complete candidate passed publication. A later quarter is safe to
  // build because public reads are pinned to release_control.release.
  if (options.publishedRelease === quarter) {
    const stored = await queryOne<{ count: number }>(
      db,
      'SELECT COUNT(*) AS count FROM financials WHERE repdte = ?',
      [quarter]
    );
    if (!stored?.count) {
      throw new Error(`Published financial quarter ${quarter} is missing from D1`);
    }
    return { repdte: quarter, inserted: 0, source_total: source.total };
  }

  await purgeOutsideCanonicalSourceWindow(db, source.latestQuarter);

  await setStates(db, {
    [FINANCIAL_SYNC_STATUS_KEY]: 'running',
    [FINANCIAL_SYNC_SOURCE_TOTAL_KEY]: String(source.total),
    [FINANCIAL_SYNC_SOURCE_LATEST_KEY]: source.latestQuarter,
    [FINANCIAL_SYNC_RECONCILED_TOTAL_KEY]: ''
  });
  await execute(db, 'DELETE FROM financials WHERE repdte = ?', [quarter]);

  let offset = 0;
  let inserted = 0;
  let expectedQuarterTotal: number | null = null;
  let lastCert: number | null = null;
  let pages = 0;
  while (pages < FINANCIAL_MAX_PAGES_PER_REQUEST) {
    const response = await fetchFinancialsPage(quarter, offset, FINANCIAL_PAGE_SIZE);
    const sourceQuarterTotal = response.totals?.count;
    if (!Number.isSafeInteger(sourceQuarterTotal) || sourceQuarterTotal <= 0) {
      throw new Error(`FDIC latest financial quarter ${quarter} returned an invalid source total`);
    }
    if (expectedQuarterTotal == null) expectedQuarterTotal = sourceQuarterTotal;
    if (sourceQuarterTotal !== expectedQuarterTotal) {
      throw new Error(`FDIC latest financial quarter ${quarter} changed during pagination`);
    }
    if (response.data.length === 0 || response.data.length > FINANCIAL_PAGE_SIZE) {
      throw new Error(`FDIC latest financial quarter ${quarter} returned a truncated or oversized page`);
    }
    const rows = response.data.map((item) => mapFinancial(item.data));
    for (const row of rows) {
      const cert = Number(row.cert);
      if (row.repdte !== quarter || !Number.isSafeInteger(cert) || cert <= 0 || (lastCert != null && cert <= lastCert)) {
        throw new Error(`FDIC latest financial quarter ${quarter} violated deterministic CERT ordering`);
      }
      lastCert = cert;
    }
    const nextOffset = offset + rows.length;
    if (
      nextOffset > expectedQuarterTotal
      || (rows.length < FINANCIAL_PAGE_SIZE && nextOffset !== expectedQuarterTotal)
    ) {
      throw new Error(
        `FDIC latest financial quarter ${quarter} did not reconcile to source total ${expectedQuarterTotal}`
      );
    }
    await bulkUpsert(db, 'financials', rows, ['cert', 'repdte']);
    inserted += rows.length;
    pages++;
    if (nextOffset === expectedQuarterTotal) break;
    offset = nextOffset;
    await delay(DELAY_BETWEEN_PAGES_MS);
  }

  if (expectedQuarterTotal == null || inserted !== expectedQuarterTotal) {
    throw new Error(
      `Latest financial quarter exceeds the bounded ${FINANCIAL_MAX_PAGES_PER_REQUEST * FINANCIAL_PAGE_SIZE}-row stage capacity`
    );
  }
  assertSourceMetadata(await fetchFinancialSourceMetadata(), source.total, source.latestQuarter);
  await reconcileCanonicalFinancialCoverage(db, source.total, source.latestQuarter);
  await setStates(db, {
    [FINANCIAL_SYNC_STATUS_KEY]: 'complete',
    [FINANCIAL_SYNC_COUNT_KEY]: String(source.total),
    [FINANCIAL_SYNC_RECONCILED_TOTAL_KEY]: String(source.total)
  });

  console.log(
    `Financials (latest quarter ${quarter}): replaced ${inserted} rows; `
    + `${source.total} canonical rows reconciled`
  );
  return { repdte: quarter, inserted, source_total: source.total };
}
