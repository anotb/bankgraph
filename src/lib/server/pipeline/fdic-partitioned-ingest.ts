import { bulkUpsert, queryOne } from '$lib/server/db';
import { mapFinancial } from './fdic-financials';
import { mapInstitution } from './fdic-institutions';
import { parseFdicReportingDate } from './fdic-reporting-date';

export const FDIC_API_BASE = 'https://api.fdic.gov/banks';
export const FDIC_PAGE_SIZE = 1_000;
export const FDIC_MAX_PAGES_PER_REQUEST = 5;
export const FDIC_PUBLICATION_CHUNK_SIZE = 1_000;
export const FDIC_FINANCIAL_FIRST_QUARTER = '19920331';

const LEASE_SECONDS = 5 * 60;
const MAX_RETRIES = 3;
const INITIAL_BACKOFF_MS = 500;

export const FDIC_DATASETS = [
  'financials',
  'annual-summary',
  'sod',
  'history',
  'locations',
  'institutions'
] as const;

export type FDICDataset = (typeof FDIC_DATASETS)[number];

export interface FDICPage {
  rows: Record<string, unknown>[];
  total: number;
}

export interface FDICPartitionState {
  dataset: FDICDataset;
  partitionKey: string;
  runId: string;
  status: 'running' | 'reconciling' | 'complete' | 'error';
  checkpoint: number;
  sourceTotal: number | null;
  rowsSeen: number;
  keyFirst: string | null;
  keyLast: string | null;
  retrievedAt: string;
  publicationPhase: FDICPublicationPhase | null;
  rowsMaterialized: number;
}

export type FDICPublicationPhase =
  | 'materialize'
  | 'compare'
  | 'switch'
  | 'cleanup-old'
  | 'cleanup-stage'
  | 'complete';

export interface FDICPartitionResult {
  dataset: FDICDataset;
  partition: string;
  run_id: string;
  status: FDICPartitionState['status'];
  done: boolean;
  checkpoint: number;
  source_total: number | null;
  rows_seen: number;
  rows_published: number | null;
  rows_deleted: number;
  key_first: string | null;
  key_last: string | null;
  retrieved_at: string;
  published_at: string | null;
  source_endpoint: string;
  publication_phase: FDICPublicationPhase | null;
  rows_materialized: number;
}

export class FDICPartitionError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
  }
}

export class FDICLeaseError extends FDICPartitionError {
  constructor() {
    super('This FDIC partition is already being processed', 409);
  }
}

interface PartitionSpec {
  dataset: FDICDataset;
  endpoint: string;
  table: string;
  fields: readonly string[];
  columns: readonly string[];
  primaryKeys: readonly string[];
  sortBy: string;
  filter(partition: string): string;
  normalizePartition(partition: string): string;
  map(raw: Record<string, unknown>, partition: string): Record<string, unknown>;
  rowKey(row: Record<string, unknown>): string;
  staleWhere(partition: string): { sql: string; params: unknown[] };
  period(partition: string): { min: string; max: string };
  requireNonEmpty: boolean;
  versionedPublication?: boolean;
  boundedInPlacePublication?: boolean;
  sqlRowKey?(alias: string): string;
}

const FINANCIAL_COLUMNS = [
  'cert', 'repdte', 'asset', 'dep', 'eq', 'lnlsnet', 'lnre', 'lnci', 'lncon', 'sec',
  'chbal', 'frepo', 'trade', 'ore', 'bkprem', 'intan', 'oa', 'frepp', 'othbor',
  'subnd', 'tradel', 'allothl', 'netinc', 'intinc', 'eintexp', 'nim', 'nonii',
  'nonix', 'elnatr', 'netincq', 'nimq', 'noniiq', 'nonixq', 'elnatq', 'iglsecq',
  'itaxq', 'extraq', 'roa', 'roe', 'nimy', 'eeffr', 'rbcrwaj', 'rbc1rwaj',
  'rbc1aaj', 'eqv', 'nclnlsr', 'lnatresr', 'nco_ratio', 'lnlsdepr', 'othbfhlb',
  'numemp', 'asset_bucket', 'source_run_id', 'source_retrieved_at'
] as const;

const FINANCIAL_FIELDS = [
  'CERT', 'REPDTE', 'ASSET', 'DEP', 'EQ', 'LNLSNET', 'LNRE', 'LNCI', 'LNCON', 'SC',
  'CHBAL', 'FREPO', 'TRADE', 'ORE', 'BKPREM', 'INTAN', 'OA', 'FREPP', 'OTHBOR',
  'SUBND', 'TRADEL', 'ALLOTHL', 'NETINC', 'INTINC', 'EINTEXP', 'NIM', 'NONII',
  'NONIX', 'ELNATR', 'NETINCQ', 'NIMQ', 'NONIIQ', 'NONIXQ', 'ELNATQ', 'IGLSECQ',
  'ITAXQ', 'EXTRAQ', 'ROA', 'ROE', 'NIMY', 'EEFFR', 'RBCRWAJ', 'RBC1RWAJ',
  'RBC1AAJ', 'EQV', 'NCLNLSR', 'LNATRESR', 'NTLNLSR', 'LNLSDEPR', 'OTHBFHLB',
  'NUMEMP'
] as const;

const ANNUAL_COLUMNS = [
  'stalp', 'year', 'asset', 'dep', 'eq', 'netinc', 'nim', 'nonii', 'nonix', 'elnatr',
  'intinc', 'eintexp', 'banks', 'branches', 'numemp', 'lnlsnet', 'lnre', 'lnci',
  'lncon', 'sec', 'nclnls', 'lnatres', 'charter_type', 'source_run_id',
  'source_retrieved_at'
] as const;

const SOD_COLUMNS = [
  'uninumbr', 'year', 'cert', 'namebr', 'citybr', 'stalpbr', 'zipbr', 'cntynumb',
  'cntynamb', 'depsumbr', 'depdom', 'asset', 'latitude', 'longitude', 'brsertyp',
  'mainoff', 'source_run_id', 'source_retrieved_at'
] as const;

const HISTORY_COLUMNS = [
  'id', 'cert', 'uninum', 'fi_uninum', 'event_date', 'process_date', 'change_code',
  'change_desc', 'org_role', 'inst_name', 'acq_uninum', 'out_uninum', 'transnum',
  'eff_year', 'proc_year', 'source_run_id', 'source_retrieved_at'
] as const;

const LOCATION_COLUMNS = [
  'uninum', 'cert', 'name', 'offname', 'address', 'city', 'stalp', 'zip', 'county',
  'stcnty', 'servtype', 'servtype_desc', 'mainoff', 'latitude', 'longitude', 'estymd',
  'cbsa', 'rundate', 'source_run_id', 'source_retrieved_at', 'source_snapshot'
] as const;

const INSTITUTION_COLUMNS = [
  'cert', 'rssd_id', 'name', 'city', 'state', 'zip', 'county', 'charter_class',
  'regulator', 'active', 'established_date', 'insured_date', 'holding_company',
  'hc_rssd_id', 'asset_tier', 'total_assets', 'total_deposits', 'num_branches',
  'num_employees', 'source_run_id', 'source_retrieved_at', 'source_snapshot'
] as const;

function textValue(value: unknown): string | null {
  if (value == null || value === '') return null;
  return String(value);
}

function numberValue(value: unknown): number | null {
  if (value == null || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function requiredNumber(value: unknown, field: string): number {
  const parsed = numberValue(value);
  if (parsed == null) throw new FDICPartitionError(`FDIC row is missing ${field}`, 502);
  return parsed;
}

function rawDateKey(value: unknown): string | null {
  const raw = textValue(value);
  if (!raw) return null;
  const match = raw.match(/^(\d{4})-?(\d{2})-?(\d{2})/);
  return match ? `${match[1]}${match[2]}${match[3]}` : raw;
}

function normalizeYear(value: string, minimum: number): string {
  if (!/^\d{4}$/.test(value)) throw new FDICPartitionError(`Invalid year partition: ${value}`);
  const year = Number(value);
  if (year < minimum || year > new Date().getUTCFullYear() + 1) {
    throw new FDICPartitionError(`Year must be between ${minimum} and ${new Date().getUTCFullYear() + 1}`);
  }
  return value;
}

function normalizeQuarter(value: string): string {
  const quarterAlias = value.toUpperCase().match(/^(\d{4})-?Q([1-4])$/);
  const normalized = quarterAlias
    ? `${quarterAlias[1]}${['0331', '0630', '0930', '1231'][Number(quarterAlias[2]) - 1]}`
    : parseFdicReportingDate(value, 'FDIC financial quarter');
  if (!/^\d{8}$/.test(normalized) || !['0331', '0630', '0930', '1231'].includes(normalized.slice(4))) {
    throw new FDICPartitionError(`Financial partition must be a quarter end: ${value}`);
  }
  if (normalized < FDIC_FINANCIAL_FIRST_QUARTER) {
    throw new FDICPartitionError('Financial partitions begin at 1992Q1 (19920331)');
  }
  return normalized;
}

function normalizeAnnual(value: string): string {
  const latest = value.toUpperCase().match(/^LATEST[:/](CB|SI)$/);
  if (latest) return `latest:${latest[1]}`;
  const match = value.toUpperCase().match(/^(\d{4})[:/](CB|SI)$/);
  if (!match) throw new FDICPartitionError('Annual summary partition must be YEAR:CB or YEAR:SI');
  return `${normalizeYear(match[1], 1934)}:${match[2]}`;
}

export function normalizeSnapshotDate(value: string): string {
  const iso = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const us = value.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  const normalized = iso ? value : us ? `${us[3]}-${us[1]}-${us[2]}` : null;
  if (!normalized) throw new FDICPartitionError(`Snapshot must be latest or YYYY-MM-DD: ${value}`);
  const parsed = new Date(`${normalized}T00:00:00Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== normalized) {
    throw new FDICPartitionError(`Invalid snapshot date: ${value}`);
  }
  return normalized;
}

function paddedNumber(value: unknown): string {
  return String(requiredNumber(value, 'natural key')).padStart(12, '0');
}

function annualParts(partition: string): [number, 'CB' | 'SI'] {
  const [year, charter] = partition.split(':');
  return [Number(year), charter as 'CB' | 'SI'];
}

const SPECS: Record<FDICDataset, PartitionSpec> = {
  financials: {
    dataset: 'financials',
    endpoint: 'financials',
    table: 'financials',
    fields: FINANCIAL_FIELDS,
    columns: FINANCIAL_COLUMNS,
    primaryKeys: ['cert', 'repdte'],
    sortBy: 'CERT',
    filter: (partition) => `REPDTE:${partition}`,
    normalizePartition: normalizeQuarter,
    map: (raw, partition) => {
      const row = mapFinancial(raw);
      if (row.repdte !== partition) throw new FDICPartitionError('FDIC financial row escaped its quarter partition', 502);
      return row;
    },
    rowKey: (row) => `${String(row.repdte)}|${paddedNumber(row.cert)}`,
    staleWhere: (partition) => ({ sql: 'repdte = ?', params: [partition] }),
    period: (partition) => ({ min: partition, max: partition }),
    requireNonEmpty: true
  },
  'annual-summary': {
    dataset: 'annual-summary',
    endpoint: 'summary',
    table: 'annual_summary',
    fields: [
      'ID', 'STALP', 'YEAR', 'CB_SI', 'ASSET', 'DEP', 'EQ', 'NETINC', 'NIM',
      'NONII', 'NONIX', 'ELNATR', 'INTINC', 'EINTEXP', 'BANKS', 'BRANCHES',
      'NUMEMP', 'LNLSNET', 'LNRE', 'LNCI', 'LNCON', 'SC', 'NCLNLS', 'LNATRES'
    ],
    columns: ANNUAL_COLUMNS,
    primaryKeys: ['stalp', 'year', 'charter_type'],
    sortBy: 'STALP',
    filter: (partition) => {
      const [year, charter] = annualParts(partition);
      return `YEAR:${year} AND CB_SI:${charter}`;
    },
    normalizePartition: normalizeAnnual,
    map: (raw, partition) => {
      const [partitionYear, partitionClass] = annualParts(partition);
      const sourceClass = textValue(raw.CB_SI);
      if (sourceClass !== partitionClass) throw new FDICPartitionError('FDIC summary class escaped its partition', 502);
      if (numberValue(raw.YEAR) !== partitionYear) throw new FDICPartitionError('FDIC summary year escaped its partition', 502);
      return {
        stalp: textValue(raw.STALP) ?? 'USA',
        year: requiredNumber(raw.YEAR, 'YEAR'),
        asset: numberValue(raw.ASSET), dep: numberValue(raw.DEP), eq: numberValue(raw.EQ),
        netinc: numberValue(raw.NETINC), nim: numberValue(raw.NIM), nonii: numberValue(raw.NONII),
        nonix: numberValue(raw.NONIX), elnatr: numberValue(raw.ELNATR), intinc: numberValue(raw.INTINC),
        eintexp: numberValue(raw.EINTEXP), banks: numberValue(raw.BANKS), branches: numberValue(raw.BRANCHES),
        numemp: numberValue(raw.NUMEMP), lnlsnet: numberValue(raw.LNLSNET), lnre: numberValue(raw.LNRE),
        lnci: numberValue(raw.LNCI), lncon: numberValue(raw.LNCON), sec: numberValue(raw.SC),
        nclnls: numberValue(raw.NCLNLS), lnatres: numberValue(raw.LNATRES), charter_type: sourceClass
      };
    },
    rowKey: (row) => `${String(row.year)}|${String(row.charter_type)}|${String(row.stalp)}`,
    staleWhere: (partition) => {
      const [year, charter] = annualParts(partition);
      return { sql: 'year = ? AND charter_type = ?', params: [year, charter] };
    },
    period: (partition) => ({ min: partition.slice(0, 4), max: partition.slice(0, 4) }),
    requireNonEmpty: true
  },
  sod: {
    dataset: 'sod',
    endpoint: 'sod',
    table: 'sod',
    fields: [
      'ID', 'UNINUMBR', 'YEAR', 'CERT', 'NAMEBR', 'CITYBR', 'STALPBR', 'ZIPBR',
      'CNTYNUMB', 'CNTYNAMB', 'DEPSUMBR', 'DEPDOM', 'ASSET', 'SIMS_LATITUDE',
      'SIMS_LONGITUDE', 'BRSERTYP', 'BRNUM'
    ],
    columns: SOD_COLUMNS,
    primaryKeys: ['uninumbr', 'year'],
    sortBy: 'UNINUMBR',
    filter: (partition) => `YEAR:${partition}`,
    normalizePartition: (partition) => normalizeYear(partition, 1994),
    map: (raw, partition) => {
      const year = requiredNumber(raw.YEAR, 'YEAR');
      if (year !== Number(partition)) throw new FDICPartitionError('FDIC SOD row escaped its year partition', 502);
      return {
        uninumbr: requiredNumber(raw.UNINUMBR, 'UNINUMBR'), year,
        cert: requiredNumber(raw.CERT, 'CERT'),
        namebr: textValue(raw.NAMEBR), citybr: textValue(raw.CITYBR), stalpbr: textValue(raw.STALPBR),
        zipbr: textValue(raw.ZIPBR), cntynumb: numberValue(raw.CNTYNUMB), cntynamb: textValue(raw.CNTYNAMB),
        depsumbr: numberValue(raw.DEPSUMBR), depdom: numberValue(raw.DEPDOM), asset: numberValue(raw.ASSET),
        latitude: numberValue(raw.SIMS_LATITUDE), longitude: numberValue(raw.SIMS_LONGITUDE),
        brsertyp: numberValue(raw.BRSERTYP), mainoff: numberValue(raw.BRNUM) === 0 ? 1 : 0
      };
    },
    rowKey: (row) => `${String(row.year)}|${paddedNumber(row.uninumbr)}`,
    staleWhere: (partition) => ({ sql: 'year = ?', params: [Number(partition)] }),
    period: (partition) => ({ min: partition, max: partition }),
    requireNonEmpty: true,
    versionedPublication: true,
    sqlRowKey: (alias) => `printf('%04d|%012d', ${alias}.year, ${alias}.uninumbr)`
  },
  history: {
    dataset: 'history',
    endpoint: 'history',
    table: 'history_events',
    fields: [
      'ID', 'CERT', 'UNINUM', 'FI_UNINUM', 'EFFDATE', 'PROCDATE', 'CHANGECODE',
      'CHANGECODE_DESC', 'ORG_ROLE_CDE', 'INSTNAME', 'ACQ_UNINUM', 'OUT_UNINUM',
      'TRANSNUM', 'EFFYEAR', 'PROCYEAR'
    ],
    columns: HISTORY_COLUMNS,
    primaryKeys: ['id'],
    // ID is returned but is not mapped as a sortable field by BankFind.
    // PROCDATE is the supported stable partition order; the staged distinct-key
    // count still prevents publication if equal dates ever page inconsistently.
    sortBy: 'PROCDATE',
    // Process year is the ingestion boundary because it is exhaustive and
    // bounded while still retaining retroactive events with old effective
    // years. Partitioning both fields creates a mostly-empty O(year^2) plan.
    filter: (partition) => `PROCYEAR:${partition}`,
    normalizePartition: (partition) => normalizeYear(partition, 1900),
    map: (raw, partition) => {
      const effectiveYear = requiredNumber(raw.EFFYEAR, 'EFFYEAR');
      const processYear = requiredNumber(raw.PROCYEAR, 'PROCYEAR');
      if (processYear !== Number(partition)) {
        throw new FDICPartitionError('FDIC history row escaped its process-year partition', 502);
      }
      return {
        id: textValue(raw.ID), cert: numberValue(raw.CERT), uninum: numberValue(raw.UNINUM),
        fi_uninum: numberValue(raw.FI_UNINUM), event_date: rawDateKey(raw.EFFDATE),
        process_date: rawDateKey(raw.PROCDATE), change_code: numberValue(raw.CHANGECODE),
        change_desc: textValue(raw.CHANGECODE_DESC), org_role: textValue(raw.ORG_ROLE_CDE),
        inst_name: textValue(raw.INSTNAME), acq_uninum: numberValue(raw.ACQ_UNINUM),
        out_uninum: numberValue(raw.OUT_UNINUM), transnum: numberValue(raw.TRANSNUM),
        eff_year: effectiveYear, proc_year: processYear
      };
    },
    rowKey: (row) => {
      const id = textValue(row.id);
      if (!id) throw new FDICPartitionError('FDIC history row is missing raw ID', 502);
      return id;
    },
    staleWhere: (partition) => ({ sql: 'proc_year = ?', params: [Number(partition)] }),
    period: (partition) => ({ min: partition, max: partition }),
    requireNonEmpty: false
  },
  locations: {
    dataset: 'locations',
    endpoint: 'locations',
    table: 'locations',
    fields: [
      'ID', 'UNINUM', 'CERT', 'NAME', 'OFFNAME', 'ADDRESS', 'ADDRESS2', 'CITY',
      'STALP', 'ZIP', 'COUNTY', 'STCNTY', 'SERVTYPE', 'SERVTYPE_DESC', 'MAINOFF',
      'LATITUDE', 'LONGITUDE', 'ESTYMD', 'CBSA', 'RUNDATE'
    ],
    columns: LOCATION_COLUMNS,
    primaryKeys: ['uninum'],
    sortBy: 'UNINUM',
    filter: (partition) => `RUNDATE:${partition}`,
    normalizePartition: normalizeSnapshotDate,
    map: (raw, partition) => {
      if (normalizeSnapshotDate(String(raw.RUNDATE ?? '')) !== partition) {
        throw new FDICPartitionError('FDIC location row escaped its snapshot partition', 502);
      }
      return {
        uninum: requiredNumber(raw.UNINUM, 'UNINUM'), cert: requiredNumber(raw.CERT, 'CERT'),
        name: textValue(raw.NAME), offname: textValue(raw.OFFNAME),
        address: [textValue(raw.ADDRESS), textValue(raw.ADDRESS2)].filter(Boolean).join(', ') || null,
        city: textValue(raw.CITY), stalp: textValue(raw.STALP), zip: textValue(raw.ZIP),
        county: textValue(raw.COUNTY), stcnty: textValue(raw.STCNTY), servtype: numberValue(raw.SERVTYPE),
        servtype_desc: textValue(raw.SERVTYPE_DESC), mainoff: numberValue(raw.MAINOFF),
        latitude: numberValue(raw.LATITUDE), longitude: numberValue(raw.LONGITUDE), estymd: textValue(raw.ESTYMD),
        cbsa: textValue(raw.CBSA), rundate: textValue(raw.RUNDATE), source_snapshot: partition
      };
    },
    rowKey: (row) => paddedNumber(row.uninum),
    staleWhere: () => ({ sql: '1 = 1', params: [] }),
    period: (partition) => ({ min: partition, max: partition }),
    requireNonEmpty: true,
    versionedPublication: true,
    sqlRowKey: (alias) => `printf('%012d', ${alias}.uninum)`
  },
  institutions: {
    dataset: 'institutions',
    endpoint: 'institutions',
    table: 'institutions',
    fields: [
      'ID', 'CERT', 'RSSDID', 'NAME', 'CITY', 'STALP', 'ZIP', 'COUNTY', 'BKCLASS',
      'REGAGNT', 'ACTIVE', 'ESTYMD', 'INSDATE', 'NAMEHCR', 'RSSDHCR', 'ASSET',
      'DEP', 'OFFDOM', 'NUMEMP', 'RUNDATE'
    ],
    columns: INSTITUTION_COLUMNS,
    primaryKeys: ['cert'],
    sortBy: 'CERT',
    filter: (partition) => `RUNDATE:${partition}`,
    normalizePartition: normalizeSnapshotDate,
    map: (raw, partition) => {
      if (normalizeSnapshotDate(String(raw.RUNDATE ?? '')) !== partition) {
        throw new FDICPartitionError('FDIC institution row escaped its snapshot partition', 502);
      }
      return { ...mapInstitution(raw), source_snapshot: partition };
    },
    rowKey: (row) => paddedNumber(row.cert),
    staleWhere: () => ({ sql: '1 = 1', params: [] }),
    period: (partition) => ({ min: partition, max: partition }),
    requireNonEmpty: true,
    boundedInPlacePublication: true,
    sqlRowKey: (alias) => `printf('%012d', ${alias}.cert)`
  }
};

function specFor(dataset: FDICDataset): PartitionSpec {
  return SPECS[dataset];
}

export function parseFDICDataset(raw: string | null): FDICDataset {
  if (!raw || !FDIC_DATASETS.includes(raw as FDICDataset)) {
    throw new FDICPartitionError(`dataset must be one of: ${FDIC_DATASETS.join(', ')}`);
  }
  return raw as FDICDataset;
}

export function normalizeFDICPartition(dataset: FDICDataset, raw: string): string {
  if (!raw) throw new FDICPartitionError('partition is required');
  if (raw.toLowerCase() === 'latest') {
    if (dataset !== 'locations' && dataset !== 'institutions' && dataset !== 'sod') {
      throw new FDICPartitionError('latest without a class is only valid for SOD or snapshot datasets');
    }
    return 'latest';
  }
  return specFor(dataset).normalizePartition(raw);
}

export async function discoverLatestSODYear(fetcher: typeof fetch = fetch): Promise<number> {
  const params = new URLSearchParams({
    fields: 'YEAR',
    sort_by: 'YEAR',
    sort_order: 'DESC',
    limit: '1',
    offset: '0'
  });
  const response = await fetchWithRetry(`${FDIC_API_BASE}/sod?${params.toString()}`, fetcher);
  const page = parseFDICPage(await response.json() as RawFDICResponse);
  const year = numberValue(page.rows[0]?.YEAR);
  if (year == null || !Number.isInteger(year)) {
    throw new FDICPartitionError('FDIC SOD endpoint did not return a latest year', 502);
  }
  return year;
}

async function fetchWithRetry(url: string, fetcher: typeof fetch): Promise<Response> {
  let lastError: Error | null = null;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const response = await fetcher(url, { headers: { Accept: 'application/json' } });
      if (response.ok) return response;
      if (response.status !== 429 && response.status < 500) {
        const message = (await response.text()).slice(0, 500);
        throw new FDICPartitionError(`FDIC API returned ${response.status}: ${message}`, 502);
      }
      lastError = new Error(`FDIC API returned ${response.status}`);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
    }
    if (attempt < MAX_RETRIES - 1) {
      await new Promise((resolve) => setTimeout(resolve, INITIAL_BACKOFF_MS * 2 ** attempt));
    }
  }
  throw new FDICPartitionError(lastError?.message ?? 'FDIC API request failed', 502);
}

interface RawFDICResponse {
  data?: Array<{ data?: Record<string, unknown> }>;
  totals?: { count?: number };
  meta?: { total?: number };
}

export function parseFDICPage(payload: RawFDICResponse): FDICPage {
  if (!Array.isArray(payload.data)) throw new FDICPartitionError('FDIC response is missing data', 502);
  const totalsCount = payload.totals?.count;
  const metaTotal = payload.meta?.total;
  if (totalsCount != null && metaTotal != null && totalsCount !== metaTotal) {
    throw new FDICPartitionError('FDIC response total fields disagree', 502);
  }
  const total = totalsCount ?? metaTotal;
  if (typeof total !== 'number' || !Number.isSafeInteger(total) || total < 0) {
    throw new FDICPartitionError('FDIC response is missing a valid source total', 502);
  }
  const rows = payload.data.map((item) => {
    if (!item || typeof item.data !== 'object' || item.data == null) {
      throw new FDICPartitionError('FDIC response contains an invalid row', 502);
    }
    return item.data;
  });
  return { rows, total };
}

export function buildFDICPageUrl(
  dataset: FDICDataset,
  partition: string,
  offset: number,
  limit = FDIC_PAGE_SIZE
): string {
  const spec = specFor(dataset);
  const params = new URLSearchParams({
    filters: spec.filter(partition),
    fields: spec.fields.join(','),
    sort_by: spec.sortBy,
    sort_order: 'ASC',
    limit: String(limit),
    offset: String(offset)
  });
  return `${FDIC_API_BASE}/${spec.endpoint}?${params.toString()}`;
}

export async function fetchFDICPage(
  dataset: FDICDataset,
  partition: string,
  offset: number,
  fetcher: typeof fetch = fetch
): Promise<FDICPage> {
  const response = await fetchWithRetry(buildFDICPageUrl(dataset, partition, offset), fetcher);
  return parseFDICPage(await response.json() as RawFDICResponse);
}

async function discoverLatestSnapshot(dataset: 'locations' | 'institutions', fetcher: typeof fetch): Promise<string> {
  const params = new URLSearchParams({
    fields: 'RUNDATE', sort_by: 'RUNDATE', sort_order: 'DESC', limit: '1', offset: '0'
  });
  const response = await fetchWithRetry(`${FDIC_API_BASE}/${dataset}?${params.toString()}`, fetcher);
  const page = parseFDICPage(await response.json() as RawFDICResponse);
  const raw = page.rows[0]?.RUNDATE;
  if (!raw) throw new FDICPartitionError(`FDIC ${dataset} endpoint did not return a snapshot date`, 502);
  return normalizeSnapshotDate(String(raw));
}

export async function discoverLatestAnnualYear(
  charter: 'CB' | 'SI',
  fetcher: typeof fetch = fetch
): Promise<number> {
  const params = new URLSearchParams({
    filters: `CB_SI:${charter}`,
    fields: 'YEAR,CB_SI',
    sort_by: 'YEAR',
    sort_order: 'DESC',
    limit: '1',
    offset: '0'
  });
  const response = await fetchWithRetry(`${FDIC_API_BASE}/summary?${params.toString()}`, fetcher);
  const page = parseFDICPage(await response.json() as RawFDICResponse);
  const row = page.rows[0];
  const year = numberValue(row?.YEAR);
  if (row?.CB_SI !== charter || year == null || !Number.isInteger(year)) {
    throw new FDICPartitionError(`FDIC summary endpoint did not return a latest ${charter} year`, 502);
  }
  return year;
}

export async function discoverLatestHistoryProcessYear(
  fetcher: typeof fetch = fetch
): Promise<number> {
  const params = new URLSearchParams({
    fields: 'PROCYEAR',
    sort_by: 'PROCYEAR',
    sort_order: 'DESC',
    limit: '1',
    offset: '0'
  });
  const response = await fetchWithRetry(`${FDIC_API_BASE}/history?${params.toString()}`, fetcher);
  const page = parseFDICPage(await response.json() as RawFDICResponse);
  const year = numberValue(page.rows[0]?.PROCYEAR);
  if (year == null || !Number.isInteger(year)) {
    throw new FDICPartitionError('FDIC history endpoint did not return a latest process year', 502);
  }
  return year;
}

export async function resolveFDICPartition(
  dataset: FDICDataset,
  raw: string,
  fetcher: typeof fetch = fetch
): Promise<string> {
  const normalized = normalizeFDICPartition(dataset, raw);
  if (normalized === 'latest') {
    if (dataset === 'sod') return String(await discoverLatestSODYear(fetcher));
    return discoverLatestSnapshot(dataset as 'locations' | 'institutions', fetcher);
  }
  const annualLatest = normalized.match(/^latest:(CB|SI)$/);
  if (annualLatest) {
    const charter = annualLatest[1] as 'CB' | 'SI';
    return `${await discoverLatestAnnualYear(charter, fetcher)}:${charter}`;
  }
  return normalized;
}

export interface FDICIngestStore {
  begin(dataset: FDICDataset, partition: string, endpoint: string, refresh: boolean): Promise<{ state: FDICPartitionState; alreadyComplete: boolean }>;
  stage(runId: string, rows: Array<{ row_key: string; row_json: string }>): Promise<number>;
  advance(state: FDICPartitionState, next: { checkpoint: number; sourceTotal: number; rowsSeen: number; keyFirst: string | null; keyLast: string | null }): Promise<void>;
  publish(state: FDICPartitionState, spec: PartitionSpec): Promise<FDICPublishResult>;
  fail(state: FDICPartitionState, error: string): Promise<void>;
  release(state: FDICPartitionState): Promise<void>;
}

interface FDICPublishResult {
  done: boolean;
  rowsPublished: number | null;
  rowsDeleted: number;
  publishedAt: string | null;
  publicationPhase: FDICPublicationPhase | null;
  rowsMaterialized: number;
}

interface PartitionRow {
  dataset: FDICDataset;
  partition_key: string;
  run_id: string;
  status: FDICPartitionState['status'];
  checkpoint: number;
  source_total: number | null;
  rows_seen: number;
  key_first: string | null;
  key_last: string | null;
  retrieved_at: string;
  published_at: string | null;
  lease_token: string | null;
  lease_expires_at: string | null;
  publication_phase: FDICPublicationPhase | null;
  rows_materialized: number;
}

interface PublicationProgressRow {
  publication_phase: FDICPublicationPhase | null;
  publication_cursor: string | null;
  previous_run_id: string | null;
  rows_materialized: number;
  rows_deleted: number;
  published_at: string | null;
}

function toState(row: PartitionRow): FDICPartitionState {
  return {
    dataset: row.dataset,
    partitionKey: row.partition_key,
    runId: row.run_id,
    status: row.status,
    checkpoint: row.checkpoint,
    sourceTotal: row.source_total,
    rowsSeen: row.rows_seen,
    keyFirst: row.key_first,
    keyLast: row.key_last,
    retrievedAt: row.retrieved_at,
    publicationPhase: row.publication_phase,
    rowsMaterialized: row.rows_materialized
  };
}

function sqlIdentifier(identifier: string): string {
  if (!/^[a-z_][a-z0-9_]*$/i.test(identifier)) throw new Error(`Unsafe SQL identifier: ${identifier}`);
  return identifier;
}

export class D1FDICIngestStore implements FDICIngestStore {
  readonly leaseToken = crypto.randomUUID();

  constructor(private readonly db: D1Database, private readonly now: () => Date = () => new Date()) {}

  async begin(dataset: FDICDataset, partition: string, endpoint: string, refresh: boolean): Promise<{ state: FDICPartitionState; alreadyComplete: boolean }> {
    const current = await queryOne<PartitionRow>(
      this.db,
      'SELECT * FROM fdic_ingest_partitions WHERE dataset = ? AND partition_key = ?',
      [dataset, partition]
    );
    if (current?.status === 'complete' && !refresh) {
      return { state: toState(current), alreadyComplete: true };
    }

    const now = this.now();
    const nowIso = now.toISOString();
    const leaseExpiry = new Date(now.getTime() + LEASE_SECONDS * 1_000).toISOString();
    if (current && (current.status === 'running' || current.status === 'reconciling')) {
      const claim = await this.db.prepare(
        `UPDATE fdic_ingest_partitions
         SET lease_token = ?, lease_expires_at = ?, error = NULL
         WHERE dataset = ? AND partition_key = ? AND run_id = ?
           AND (lease_token IS NULL OR lease_expires_at < ?)`
      ).bind(this.leaseToken, leaseExpiry, dataset, partition, current.run_id, nowIso).run();
      if ((claim.meta.changes ?? 0) !== 1) throw new FDICLeaseError();
      return { state: toState({ ...current, lease_token: this.leaseToken, lease_expires_at: leaseExpiry }), alreadyComplete: false };
    }

    const runId = crypto.randomUUID();
    const previousRunId = current?.run_id ?? null;
    const statements: D1PreparedStatement[] = [
      this.db.prepare(
        `INSERT INTO fdic_ingest_runs
         (run_id, dataset, partition_key, source_endpoint, status, started_at, retrieved_at)
         VALUES (?, ?, ?, ?, 'running', ?, ?)`
      ).bind(runId, dataset, partition, endpoint, nowIso, nowIso),
      this.db.prepare(
        `INSERT INTO fdic_ingest_partitions
         (dataset, partition_key, run_id, status, checkpoint, source_total, rows_seen,
          rows_deleted, key_first, key_last, retrieved_at, published_at, error,
          lease_token, lease_expires_at)
         VALUES (?, ?, ?, 'running', 0, NULL, 0, 0, NULL, NULL, ?, NULL, NULL, ?, ?)
         ON CONFLICT(dataset, partition_key) DO UPDATE SET
            run_id = excluded.run_id, status = 'running', checkpoint = 0,
            source_total = NULL, rows_seen = 0, rows_deleted = 0,
            key_first = NULL, key_last = NULL, retrieved_at = excluded.retrieved_at,
            published_at = NULL, error = NULL, lease_token = excluded.lease_token,
            lease_expires_at = excluded.lease_expires_at, publication_phase = NULL,
            publication_cursor = NULL, previous_run_id = NULL, rows_materialized = 0
         WHERE fdic_ingest_partitions.status IN ('complete', 'error')
           AND (fdic_ingest_partitions.lease_token IS NULL OR fdic_ingest_partitions.lease_expires_at < ?)`
      ).bind(dataset, partition, runId, nowIso, this.leaseToken, leaseExpiry, nowIso)
    ];
    if (previousRunId) {
      statements.push(this.db.prepare(
        `DELETE FROM fdic_ingest_stage
         WHERE run_id = ? AND row_key IN (
           SELECT row_key FROM fdic_ingest_stage WHERE run_id = ?
           ORDER BY row_key LIMIT ?
         )`
      ).bind(previousRunId, previousRunId, FDIC_PUBLICATION_CHUNK_SIZE));
    }
    const results = await this.db.batch(statements);
    if ((results[1]?.meta.changes ?? 0) !== 1) throw new FDICLeaseError();
    return {
      state: {
        dataset, partitionKey: partition, runId, status: 'running', checkpoint: 0,
        sourceTotal: null, rowsSeen: 0, keyFirst: null, keyLast: null, retrievedAt: nowIso,
        publicationPhase: null, rowsMaterialized: 0
      },
      alreadyComplete: false
    };
  }

  async stage(runId: string, rows: Array<{ row_key: string; row_json: string }>): Promise<number> {
    const result = await bulkUpsert(
      this.db,
      'fdic_ingest_stage',
      rows.map((row) => ({ run_id: runId, ...row })),
      ['run_id', 'row_key']
    );
    return result.statements;
  }

  async advance(state: FDICPartitionState, next: { checkpoint: number; sourceTotal: number; rowsSeen: number; keyFirst: string | null; keyLast: string | null }): Promise<void> {
    const results = await this.db.batch([
      this.db.prepare(
        `UPDATE fdic_ingest_partitions
         SET checkpoint = ?, source_total = ?, rows_seen = ?, key_first = ?, key_last = ?, error = NULL
         WHERE dataset = ? AND partition_key = ? AND run_id = ? AND lease_token = ?`
      ).bind(next.checkpoint, next.sourceTotal, next.rowsSeen, next.keyFirst, next.keyLast,
        state.dataset, state.partitionKey, state.runId, this.leaseToken),
      this.db.prepare(
        `UPDATE fdic_ingest_runs
         SET source_total = ?, rows_seen = ?, key_first = ?, key_last = ?
         WHERE run_id = ?`
      ).bind(next.sourceTotal, next.rowsSeen, next.keyFirst, next.keyLast, state.runId)
    ]);
    if ((results[0]?.meta.changes ?? 0) !== 1) throw new FDICLeaseError();
  }

  async publish(state: FDICPartitionState, spec: PartitionSpec): Promise<FDICPublishResult> {
    if (spec.boundedInPlacePublication) return this.publishBoundedInPlace(state, spec);
    if (spec.versionedPublication) return this.publishVersioned(state, spec);
    return this.publishAtomic(state, spec);
  }

  private async validateStage(state: FDICPartitionState): Promise<void> {
    const staged = await queryOne<{ count: number }>(
      this.db,
      'SELECT COUNT(*) AS count FROM fdic_ingest_stage WHERE run_id = ?',
      [state.runId]
    );
    if ((staged?.count ?? 0) !== state.sourceTotal) {
      throw new FDICPartitionError(
        `Refusing publication: staged natural keys (${staged?.count ?? 0}) do not match source total (${state.sourceTotal ?? 'unknown'})`,
        502
      );
    }
  }

  private async publishAtomic(state: FDICPartitionState, spec: PartitionSpec): Promise<FDICPublishResult> {
    await this.validateStage(state);
    const where = spec.staleWhere(state.partitionKey);
    const table = sqlIdentifier(spec.table);
    const keys = spec.primaryKeys.map(sqlIdentifier);
    const stagedKeyMatch = keys
      .map((column) => `json_extract(staged.row_json, '$.${column}') = target.${column}`)
      .join(' AND ');
    const stale = await queryOne<{ count: number }>(
      this.db,
      `SELECT COUNT(*) AS count
       FROM ${table} AS target
       WHERE ${where.sql}
         AND NOT EXISTS (
           SELECT 1 FROM fdic_ingest_stage AS staged
           WHERE staged.run_id = ? AND ${stagedKeyMatch}
         )`,
      [...where.params, state.runId]
    );
    const staleCount = stale?.count ?? 0;
    const columns = spec.columns.map(sqlIdentifier);
    const updateColumns = columns.filter((column) => !keys.includes(column));
    const selectColumns = columns.map((column) => `json_extract(row_json, '$.${column}')`).join(', ');
    const publishSql = `INSERT INTO ${table} (${columns.join(', ')}) SELECT ${selectColumns} FROM fdic_ingest_stage WHERE run_id = ? ON CONFLICT(${keys.join(', ')}) DO UPDATE SET ${updateColumns.map((column) => `${column}=excluded.${column}`).join(', ')}`;
    const publishedAt = this.now().toISOString();
    const period = spec.period(state.partitionKey);

    await this.db.batch([
      this.db.prepare(publishSql).bind(state.runId),
      this.db.prepare(
        `DELETE FROM ${table} WHERE ${where.sql} AND (source_run_id IS NULL OR source_run_id <> ?)`
      ).bind(...where.params, state.runId),
      this.publicationStatement(state, spec, publishedAt),
      this.db.prepare(
        `UPDATE fdic_ingest_runs
         SET status = 'complete', completed_at = ?, rows_published = ?, rows_deleted = ?,
             publication_phase = 'complete', rows_materialized = ?, error = NULL
         WHERE run_id = ?`
      ).bind(publishedAt, state.sourceTotal, staleCount, state.sourceTotal, state.runId),
      this.db.prepare(
        `UPDATE fdic_ingest_partitions
         SET status = 'complete', checkpoint = ?, rows_deleted = ?, published_at = ?,
             publication_phase = 'complete', rows_materialized = ?, error = NULL,
             lease_token = NULL, lease_expires_at = NULL
         WHERE dataset = ? AND partition_key = ? AND run_id = ? AND lease_token = ?`
      ).bind(state.sourceTotal, staleCount, publishedAt, state.sourceTotal,
        state.dataset, state.partitionKey, state.runId, this.leaseToken),
      this.db.prepare('DELETE FROM fdic_ingest_stage WHERE run_id = ?').bind(state.runId)
    ]);
    return {
      done: true,
      rowsPublished: state.sourceTotal ?? 0,
      rowsDeleted: staleCount,
      publishedAt,
      publicationPhase: 'complete',
      rowsMaterialized: state.sourceTotal ?? 0
    };
  }

  private publicationStatement(
    state: FDICPartitionState,
    spec: PartitionSpec,
    publishedAt: string,
    requireLease = false
  ): D1PreparedStatement {
    const period = spec.period(state.partitionKey);
    if (requireLease) {
      return this.db.prepare(
        `INSERT INTO fdic_dataset_publications
         (dataset, partition_key, run_id, source_endpoint, source_total, row_count,
          key_first, key_last, period_min, period_max, retrieved_at, published_at)
         SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
         WHERE EXISTS (
           SELECT 1 FROM fdic_ingest_partitions
           WHERE dataset = ? AND partition_key = ? AND run_id = ? AND lease_token = ?
         )
         ON CONFLICT(dataset, partition_key) DO UPDATE SET
           run_id = excluded.run_id, source_endpoint = excluded.source_endpoint,
           source_total = excluded.source_total, row_count = excluded.row_count,
           key_first = excluded.key_first, key_last = excluded.key_last,
           period_min = excluded.period_min, period_max = excluded.period_max,
           retrieved_at = excluded.retrieved_at, published_at = excluded.published_at`
      ).bind(state.dataset, state.partitionKey, state.runId, `${FDIC_API_BASE}/${spec.endpoint}`,
        state.sourceTotal, state.sourceTotal, state.keyFirst, state.keyLast,
        period.min, period.max, state.retrievedAt, publishedAt,
        state.dataset, state.partitionKey, state.runId, this.leaseToken);
    }
    return this.db.prepare(
      `INSERT INTO fdic_dataset_publications
       (dataset, partition_key, run_id, source_endpoint, source_total, row_count,
        key_first, key_last, period_min, period_max, retrieved_at, published_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(dataset, partition_key) DO UPDATE SET
         run_id = excluded.run_id, source_endpoint = excluded.source_endpoint,
         source_total = excluded.source_total, row_count = excluded.row_count,
         key_first = excluded.key_first, key_last = excluded.key_last,
         period_min = excluded.period_min, period_max = excluded.period_max,
         retrieved_at = excluded.retrieved_at, published_at = excluded.published_at`
    ).bind(state.dataset, state.partitionKey, state.runId, `${FDIC_API_BASE}/${spec.endpoint}`,
      state.sourceTotal, state.sourceTotal, state.keyFirst, state.keyLast,
      period.min, period.max, state.retrievedAt, publishedAt);
  }

  private async publicationProgress(state: FDICPartitionState): Promise<PublicationProgressRow> {
    const progress = await queryOne<PublicationProgressRow>(
      this.db,
      `SELECT publication_phase, publication_cursor, previous_run_id,
              rows_materialized, rows_deleted, published_at
       FROM fdic_ingest_partitions
       WHERE dataset = ? AND partition_key = ? AND run_id = ?`,
      [state.dataset, state.partitionKey, state.runId]
    );
    if (!progress) throw new FDICLeaseError();
    return progress;
  }

  private async startVersionedPublication(state: FDICPartitionState): Promise<PublicationProgressRow> {
    await this.validateStage(state);
    const previousRunSql = `(SELECT run_id FROM fdic_dataset_publications
      WHERE dataset = ? AND partition_key = ?)`;
    const results = await this.db.batch([
      this.db.prepare(
        `UPDATE fdic_ingest_partitions
         SET status = 'reconciling', publication_phase = 'materialize',
             publication_cursor = NULL, rows_materialized = 0,
             previous_run_id = ${previousRunSql}
         WHERE dataset = ? AND partition_key = ? AND run_id = ? AND lease_token = ?
           AND publication_phase IS NULL`
      ).bind(state.dataset, state.partitionKey, state.dataset, state.partitionKey,
        state.runId, this.leaseToken),
      this.db.prepare(
        `UPDATE fdic_ingest_runs
         SET status = 'reconciling', publication_phase = 'materialize',
             rows_materialized = 0, previous_run_id = ${previousRunSql}
         WHERE run_id = ? AND publication_phase IS NULL`
      ).bind(state.dataset, state.partitionKey, state.runId)
    ]);
    if ((results[0]?.meta.changes ?? 0) !== 1) throw new FDICLeaseError();
    return this.publicationProgress(state);
  }

  private async startBoundedInPlacePublication(
    state: FDICPartitionState
  ): Promise<PublicationProgressRow> {
    await this.validateStage(state);
    const previousRunSql = `(SELECT run_id FROM fdic_dataset_publications
      WHERE dataset = ? ORDER BY published_at DESC, partition_key DESC LIMIT 1)`;
    const results = await this.db.batch([
      this.db.prepare(
        `UPDATE fdic_ingest_partitions
         SET status = 'reconciling', publication_phase = 'materialize',
             publication_cursor = NULL, rows_materialized = 0, rows_deleted = 0,
             previous_run_id = ${previousRunSql}
         WHERE dataset = ? AND partition_key = ? AND run_id = ? AND lease_token = ?
           AND publication_phase IS NULL`
      ).bind(state.dataset, state.dataset, state.partitionKey, state.runId, this.leaseToken),
      this.db.prepare(
        `UPDATE fdic_ingest_runs
         SET status = 'reconciling', publication_phase = 'materialize',
             rows_materialized = 0, rows_deleted = 0,
             previous_run_id = ${previousRunSql}
         WHERE run_id = ? AND publication_phase IS NULL
           AND EXISTS (
             SELECT 1 FROM fdic_ingest_partitions
             WHERE dataset = ? AND partition_key = ? AND run_id = ? AND lease_token = ?
           )`
      ).bind(state.dataset, state.runId, state.dataset, state.partitionKey,
        state.runId, this.leaseToken)
    ]);
    if ((results[0]?.meta.changes ?? 0) !== 1
      || (results[1]?.meta.changes ?? 0) !== 1) {
      throw new FDICLeaseError();
    }
    return this.publicationProgress(state);
  }

  private async publishBoundedInPlace(
    state: FDICPartitionState,
    spec: PartitionSpec
  ): Promise<FDICPublishResult> {
    let progress = await this.publicationProgress(state);
    if (progress.publication_phase == null) {
      progress = await this.startBoundedInPlacePublication(state);
    }

    switch (progress.publication_phase) {
      case 'materialize':
        return this.materializeInPlaceChunk(state, spec, progress);
      case 'compare':
        return this.deleteStaleInPlaceChunk(state, spec, progress);
      case 'cleanup-stage':
        return this.cleanupInPlaceStage(state, progress);
      case 'switch':
        return this.switchInPlaceVersion(state, spec, progress);
      case 'complete':
        return {
          done: true, rowsPublished: state.sourceTotal, rowsDeleted: progress.rows_deleted,
          publishedAt: progress.published_at, publicationPhase: 'complete',
          rowsMaterialized: progress.rows_materialized
        };
      default:
        throw new FDICPartitionError('Invalid bounded in-place publication phase', 500);
    }
  }

  private async materializeInPlaceChunk(
    state: FDICPartitionState,
    spec: PartitionSpec,
    progress: PublicationProgressRow
  ): Promise<FDICPublishResult> {
    const cursor = progress.publication_cursor ?? '';
    const chunk = await queryOne<{ count: number; last_key: string | null }>(
      this.db,
      `SELECT COUNT(*) AS count, MAX(row_key) AS last_key FROM (
         SELECT row_key FROM fdic_ingest_stage
         WHERE run_id = ? AND row_key > ? ORDER BY row_key LIMIT ?
       )`,
      [state.runId, cursor, FDIC_PUBLICATION_CHUNK_SIZE]
    );
    const count = chunk?.count ?? 0;
    const nextRows = progress.rows_materialized + count;
    if (nextRows > state.sourceTotal!) {
      throw new FDICPartitionError('Bounded publication exceeded the reconciled source total', 502);
    }
    const nextPhase: FDICPublicationPhase = nextRows === state.sourceTotal
      ? 'compare'
      : 'materialize';
    if (count === 0) {
      if (nextRows !== state.sourceTotal) {
        throw new FDICPartitionError(
          'Publication stage ended before all reconciled rows were materialized',
          502
        );
      }
      await this.setPublicationPhase(state, 'compare', null);
      return this.pendingPublishResult({ ...progress, publication_phase: 'compare' });
    }

    const table = sqlIdentifier(spec.table);
    const columns = spec.columns.map(sqlIdentifier);
    const keys = spec.primaryKeys.map(sqlIdentifier);
    const updateColumns = columns.filter((column) => !keys.includes(column));
    const selectColumns = columns
      .map((column) => `json_extract(row_json, '$.${column}')`)
      .join(', ');
    const sql = `INSERT INTO ${table} (${columns.join(', ')}) SELECT ${selectColumns}
      FROM fdic_ingest_stage WHERE run_id = ? AND row_key > ?
        AND EXISTS (
          SELECT 1 FROM fdic_ingest_partitions
          WHERE dataset = ? AND partition_key = ? AND run_id = ? AND lease_token = ?
        )
      ORDER BY row_key LIMIT ? ON CONFLICT(${keys.join(', ')}) DO UPDATE SET
      ${updateColumns.map((column) => `${column}=excluded.${column}`).join(', ')}`;
    const results = await this.db.batch([
      this.db.prepare(sql).bind(state.runId, cursor, state.dataset, state.partitionKey,
        state.runId, this.leaseToken, FDIC_PUBLICATION_CHUNK_SIZE),
      this.db.prepare(
        `UPDATE fdic_ingest_partitions
         SET publication_phase = ?, publication_cursor = ?, rows_materialized = ?
         WHERE dataset = ? AND partition_key = ? AND run_id = ? AND lease_token = ?`
      ).bind(nextPhase, nextPhase === 'compare' ? null : chunk?.last_key,
        nextRows, state.dataset, state.partitionKey, state.runId, this.leaseToken),
      this.db.prepare(
        `UPDATE fdic_ingest_runs SET publication_phase = ?, rows_materialized = ?
         WHERE run_id = ? AND EXISTS (
           SELECT 1 FROM fdic_ingest_partitions
           WHERE dataset = ? AND partition_key = ? AND run_id = ? AND lease_token = ?
         )`
      ).bind(nextPhase, nextRows, state.runId, state.dataset, state.partitionKey,
        state.runId, this.leaseToken)
    ]);
    if ((results[0]?.meta.changes ?? 0) !== count
      || (results[1]?.meta.changes ?? 0) !== 1
      || (results[2]?.meta.changes ?? 0) !== 1) {
      throw new FDICLeaseError();
    }
    return this.pendingPublishResult({
      ...progress,
      publication_phase: nextPhase,
      publication_cursor: nextPhase === 'compare' ? null : chunk?.last_key ?? null,
      rows_materialized: nextRows
    });
  }

  private async deleteStaleInPlaceChunk(
    state: FDICPartitionState,
    spec: PartitionSpec,
    progress: PublicationProgressRow
  ): Promise<FDICPublishResult> {
    const table = sqlIdentifier(spec.table);
    const keys = spec.primaryKeys.map(sqlIdentifier);
    const tuple = keys.length === 1 ? keys[0] : `(${keys.join(', ')})`;
    const candidate = await queryOne<{ count: number }>(
      this.db,
      `SELECT COUNT(*) AS count FROM (
         SELECT ${keys.join(', ')} FROM ${table}
         WHERE source_run_id IS NULL OR source_run_id <> ?
         ORDER BY ${keys.join(', ')} LIMIT ?
       )`,
      [state.runId, FDIC_PUBLICATION_CHUNK_SIZE]
    );
    const removed = candidate?.count ?? 0;
    const nextDeleted = progress.rows_deleted + removed;
    const nextPhase: FDICPublicationPhase = removed < FDIC_PUBLICATION_CHUNK_SIZE
      ? 'switch'
      : 'compare';
    const results = await this.db.batch([
      this.db.prepare(
        `DELETE FROM ${table} WHERE ${tuple} IN (
           SELECT ${keys.join(', ')} FROM ${table}
           WHERE source_run_id IS NULL OR source_run_id <> ?
           ORDER BY ${keys.join(', ')} LIMIT ?
         ) AND EXISTS (
           SELECT 1 FROM fdic_ingest_partitions
           WHERE dataset = ? AND partition_key = ? AND run_id = ? AND lease_token = ?
         )`
      ).bind(state.runId, FDIC_PUBLICATION_CHUNK_SIZE, state.dataset,
        state.partitionKey, state.runId, this.leaseToken),
      this.db.prepare(
        `UPDATE fdic_ingest_partitions
         SET publication_phase = ?, rows_deleted = ?
         WHERE dataset = ? AND partition_key = ? AND run_id = ? AND lease_token = ?`
      ).bind(nextPhase, nextDeleted, state.dataset, state.partitionKey, state.runId, this.leaseToken),
      this.db.prepare(
        `UPDATE fdic_ingest_runs SET publication_phase = ?, rows_deleted = ?
         WHERE run_id = ? AND EXISTS (
           SELECT 1 FROM fdic_ingest_partitions
           WHERE dataset = ? AND partition_key = ? AND run_id = ? AND lease_token = ?
         )`
      ).bind(nextPhase, nextDeleted, state.runId, state.dataset, state.partitionKey,
        state.runId, this.leaseToken)
    ]);
    if ((results[0]?.meta.changes ?? 0) !== removed
      || (results[1]?.meta.changes ?? 0) !== 1
      || (results[2]?.meta.changes ?? 0) !== 1) {
      throw new FDICLeaseError();
    }
    return this.pendingPublishResult({
      ...progress, publication_phase: nextPhase, rows_deleted: nextDeleted
    });
  }

  private async cleanupInPlaceStage(
    state: FDICPartitionState,
    progress: PublicationProgressRow
  ): Promise<FDICPublishResult> {
    const remaining = await queryOne<{ count: number }>(
      this.db,
      `SELECT COUNT(*) AS count FROM (
         SELECT row_key FROM fdic_ingest_stage WHERE run_id = ? LIMIT ?
       )`,
      [state.runId, FDIC_PUBLICATION_CHUNK_SIZE + 1]
    );
    const count = remaining?.count ?? 0;
    const deleteStatement = this.db.prepare(
      `DELETE FROM fdic_ingest_stage WHERE run_id = ? AND row_key IN (
         SELECT row_key FROM fdic_ingest_stage WHERE run_id = ?
         ORDER BY row_key LIMIT ?
       ) AND EXISTS (
         SELECT 1 FROM fdic_ingest_partitions
         WHERE dataset = ? AND partition_key = ? AND run_id = ? AND lease_token = ?
       )`
    ).bind(state.runId, state.runId, FDIC_PUBLICATION_CHUNK_SIZE,
      state.dataset, state.partitionKey, state.runId, this.leaseToken);
    if (count > FDIC_PUBLICATION_CHUNK_SIZE) {
      const deleted = await deleteStatement.run();
      if ((deleted.meta.changes ?? 0) !== FDIC_PUBLICATION_CHUNK_SIZE) {
        throw new FDICLeaseError();
      }
      return this.pendingPublishResult(progress);
    }

    const completedAt = this.now().toISOString();
    const results = await this.db.batch([
      deleteStatement,
      this.db.prepare(
        `UPDATE fdic_ingest_runs
         SET status = 'complete', completed_at = ?, rows_published = ?,
             publication_phase = 'complete', error = NULL
         WHERE run_id = ? AND EXISTS (
           SELECT 1 FROM fdic_ingest_partitions
           WHERE dataset = ? AND partition_key = ? AND run_id = ? AND lease_token = ?
         )`
      ).bind(completedAt, state.sourceTotal, state.runId, state.dataset,
        state.partitionKey, state.runId, this.leaseToken),
      this.db.prepare(
        `UPDATE fdic_ingest_partitions
         SET status = 'complete', publication_phase = 'complete',
             lease_token = NULL, lease_expires_at = NULL, error = NULL
         WHERE dataset = ? AND partition_key = ? AND run_id = ? AND lease_token = ?`
      ).bind(state.dataset, state.partitionKey, state.runId, this.leaseToken)
    ]);
    if ((results[0]?.meta.changes ?? 0) !== count
      || (results[1]?.meta.changes ?? 0) !== 1
      || (results[2]?.meta.changes ?? 0) !== 1) {
      throw new FDICLeaseError();
    }
    return {
      done: true,
      rowsPublished: state.sourceTotal,
      rowsDeleted: progress.rows_deleted,
      publishedAt: progress.published_at,
      publicationPhase: 'complete',
      rowsMaterialized: progress.rows_materialized
    };
  }

  private async switchInPlaceVersion(
    state: FDICPartitionState,
    spec: PartitionSpec,
    progress: PublicationProgressRow
  ): Promise<FDICPublishResult> {
    if (!spec.sqlRowKey) throw new Error(`Missing SQL row key for ${spec.dataset}`);
    if (progress.rows_materialized !== state.sourceTotal) {
      throw new FDICPartitionError('Refusing pointer switch before all rows are materialized', 502);
    }
    const table = sqlIdentifier(spec.table);
    const verified = await queryOne<{
      count: number;
      unique_count: number;
      key_first: string | null;
      key_last: string | null;
      invalid_count: number;
      staged_count: number;
      staged_first: string | null;
      staged_last: string | null;
    }>(
      this.db,
      `SELECT COUNT(*) AS count, COUNT(DISTINCT cert) AS unique_count,
              MIN(${spec.sqlRowKey('typed')}) AS key_first,
              MAX(${spec.sqlRowKey('typed')}) AS key_last,
              COALESCE(SUM(CASE
                WHEN source_run_id = ? AND source_snapshot = ? THEN 0 ELSE 1 END), 0)
                AS invalid_count,
              (SELECT COUNT(*) FROM fdic_ingest_stage WHERE run_id = ?) AS staged_count,
              (SELECT MIN(row_key) FROM fdic_ingest_stage WHERE run_id = ?) AS staged_first,
              (SELECT MAX(row_key) FROM fdic_ingest_stage WHERE run_id = ?) AS staged_last
       FROM ${table} AS typed`,
      [state.runId, state.partitionKey, state.runId, state.runId, state.runId]
    );
    if (!verified
      || verified.count !== state.sourceTotal
      || verified.unique_count !== state.sourceTotal
      || verified.key_first !== state.keyFirst
      || verified.key_last !== state.keyLast
      || verified.invalid_count !== 0
      || verified.staged_count !== state.sourceTotal
      || verified.staged_first !== state.keyFirst
      || verified.staged_last !== state.keyLast) {
      throw new FDICPartitionError(
        'Refusing institution pointer switch: typed snapshot failed exact count, key, run, or date verification',
        502
      );
    }

    const publishedAt = this.now().toISOString();
    const results = await this.db.batch([
      this.publicationStatement(state, spec, publishedAt, true),
      this.db.prepare(
        `UPDATE fdic_ingest_partitions
         SET publication_phase = 'cleanup-stage', published_at = ?
         WHERE dataset = ? AND partition_key = ? AND run_id = ? AND lease_token = ?`
      ).bind(publishedAt, state.dataset, state.partitionKey, state.runId, this.leaseToken),
      this.db.prepare(
        `UPDATE fdic_ingest_runs SET publication_phase = 'cleanup-stage'
         WHERE run_id = ? AND EXISTS (
           SELECT 1 FROM fdic_ingest_partitions
           WHERE dataset = ? AND partition_key = ? AND run_id = ? AND lease_token = ?
         )`
      ).bind(state.runId, state.dataset, state.partitionKey, state.runId, this.leaseToken)
    ]);
    if (results.some((result) => (result?.meta.changes ?? 0) !== 1)) throw new FDICLeaseError();
    return this.pendingPublishResult({
      ...progress, publication_phase: 'cleanup-stage', published_at: publishedAt
    });
  }

  private async publishVersioned(state: FDICPartitionState, spec: PartitionSpec): Promise<FDICPublishResult> {
    let progress = await this.publicationProgress(state);
    if (progress.publication_phase == null) progress = await this.startVersionedPublication(state);

    switch (progress.publication_phase) {
      case 'materialize':
        return this.materializeVersionChunk(state, spec, progress);
      case 'compare':
        return this.compareVersionChunk(state, spec, progress);
      case 'switch':
        return this.switchVersion(state, spec, progress);
      case 'cleanup-old':
        return this.cleanupOldVersion(state, spec, progress);
      case 'cleanup-stage':
        return this.cleanupStage(state, progress);
      case 'complete':
        return {
          done: true, rowsPublished: state.sourceTotal, rowsDeleted: progress.rows_deleted,
          publishedAt: progress.published_at, publicationPhase: 'complete',
          rowsMaterialized: progress.rows_materialized
        };
      default:
        throw new FDICPartitionError('Invalid bounded publication phase', 500);
    }
  }

  private pendingPublishResult(progress: PublicationProgressRow): FDICPublishResult {
    return {
      done: false,
      rowsPublished: null,
      rowsDeleted: progress.rows_deleted,
      publishedAt: progress.published_at,
      publicationPhase: progress.publication_phase,
      rowsMaterialized: progress.rows_materialized
    };
  }

  private async materializeVersionChunk(
    state: FDICPartitionState,
    spec: PartitionSpec,
    progress: PublicationProgressRow
  ): Promise<FDICPublishResult> {
    const cursor = progress.publication_cursor ?? '';
    const chunk = await queryOne<{ count: number; last_key: string | null }>(
      this.db,
      `SELECT COUNT(*) AS count, MAX(row_key) AS last_key FROM (
         SELECT row_key FROM fdic_ingest_stage
         WHERE run_id = ? AND row_key > ? ORDER BY row_key LIMIT ?
       )`,
      [state.runId, cursor, FDIC_PUBLICATION_CHUNK_SIZE]
    );
    const count = chunk?.count ?? 0;
    const nextRows = progress.rows_materialized + count;
    if (nextRows > state.sourceTotal!) {
      throw new FDICPartitionError('Bounded publication exceeded the reconciled source total', 502);
    }
    const nextPhase: FDICPublicationPhase = nextRows === state.sourceTotal ? 'compare' : 'materialize';
    if (count > 0) {
      const table = sqlIdentifier(spec.table);
      const columns = spec.columns.map(sqlIdentifier);
      const keys = ['source_run_id', ...spec.primaryKeys.map(sqlIdentifier)];
      const updateColumns = columns.filter((column) => !keys.includes(column));
      const selectColumns = columns.map((column) => `json_extract(row_json, '$.${column}')`).join(', ');
      const sql = `INSERT INTO ${table} (${columns.join(', ')}) SELECT ${selectColumns}
        FROM fdic_ingest_stage WHERE run_id = ? AND row_key > ?
        ORDER BY row_key LIMIT ? ON CONFLICT(${keys.join(', ')}) DO UPDATE SET
        ${updateColumns.map((column) => `${column}=excluded.${column}`).join(', ')}`;
      await this.db.batch([
        this.db.prepare(sql).bind(state.runId, cursor, FDIC_PUBLICATION_CHUNK_SIZE),
        this.db.prepare(
          `UPDATE fdic_ingest_partitions
           SET publication_phase = ?, publication_cursor = ?, rows_materialized = ?
           WHERE dataset = ? AND partition_key = ? AND run_id = ? AND lease_token = ?`
        ).bind(nextPhase, nextPhase === 'compare' ? null : chunk?.last_key,
          nextRows, state.dataset, state.partitionKey, state.runId, this.leaseToken),
        this.db.prepare(
          `UPDATE fdic_ingest_runs SET publication_phase = ?, rows_materialized = ? WHERE run_id = ?`
        ).bind(nextPhase, nextRows, state.runId)
      ]);
    } else if (nextRows === state.sourceTotal) {
      await this.setPublicationPhase(state, 'compare', null);
    } else {
      throw new FDICPartitionError('Publication stage ended before all reconciled rows were materialized', 502);
    }
    return this.pendingPublishResult({
      ...progress,
      publication_phase: nextPhase,
      publication_cursor: nextPhase === 'compare' ? null : chunk?.last_key ?? null,
      rows_materialized: nextRows
    });
  }

  private async setPublicationPhase(
    state: FDICPartitionState,
    phase: FDICPublicationPhase,
    cursor: string | null
  ): Promise<void> {
    const results = await this.db.batch([
      this.db.prepare(
        `UPDATE fdic_ingest_partitions SET publication_phase = ?, publication_cursor = ?
         WHERE dataset = ? AND partition_key = ? AND run_id = ? AND lease_token = ?`
      ).bind(phase, cursor, state.dataset, state.partitionKey, state.runId, this.leaseToken),
      this.db.prepare(
        `UPDATE fdic_ingest_runs SET publication_phase = ?
         WHERE run_id = ? AND EXISTS (
           SELECT 1 FROM fdic_ingest_partitions
           WHERE dataset = ? AND partition_key = ? AND run_id = ? AND lease_token = ?
         )`
      ).bind(phase, state.runId, state.dataset, state.partitionKey, state.runId, this.leaseToken)
    ]);
    if ((results[0]?.meta.changes ?? 0) !== 1
      || (results[1]?.meta.changes ?? 0) !== 1) {
      throw new FDICLeaseError();
    }
  }

  private async compareVersionChunk(
    state: FDICPartitionState,
    spec: PartitionSpec,
    progress: PublicationProgressRow
  ): Promise<FDICPublishResult> {
    if (!progress.previous_run_id) {
      await this.setPublicationPhase(state, 'switch', null);
      return this.pendingPublishResult({ ...progress, publication_phase: 'switch' });
    }
    if (!spec.sqlRowKey) throw new Error(`Missing SQL row key for ${spec.dataset}`);
    const table = sqlIdentifier(spec.table);
    const keys = spec.primaryKeys.map(sqlIdentifier);
    const keySelect = keys.map((key) => `old.${key} AS ${key}`).join(', ');
    const keyMatch = keys.map((key) => `next.${key} = candidate.${key}`).join(' AND ');
    const where = spec.staleWhere(state.partitionKey);
    const cursor = progress.publication_cursor ?? '';
    const comparison = await queryOne<{ count: number; last_key: string | null; stale_count: number }>(
      this.db,
      `WITH candidate AS (
         SELECT ${keySelect}, ${spec.sqlRowKey('old')} AS row_key
         FROM ${table} AS old
         WHERE old.source_run_id = ? AND ${where.sql} AND ${spec.sqlRowKey('old')} > ?
         ORDER BY row_key LIMIT ?
       )
       SELECT COUNT(*) AS count, MAX(row_key) AS last_key,
              COALESCE(SUM(CASE WHEN EXISTS (
                SELECT 1 FROM ${table} AS next
                WHERE next.source_run_id = ? AND ${keyMatch}
              ) THEN 0 ELSE 1 END), 0) AS stale_count
       FROM candidate`,
      [progress.previous_run_id, ...where.params, cursor, FDIC_PUBLICATION_CHUNK_SIZE, state.runId]
    );
    const count = comparison?.count ?? 0;
    const stale = comparison?.stale_count ?? 0;
    const nextPhase: FDICPublicationPhase = count < FDIC_PUBLICATION_CHUNK_SIZE ? 'switch' : 'compare';
    const nextDeleted = progress.rows_deleted + stale;
    await this.db.batch([
      this.db.prepare(
        `UPDATE fdic_ingest_partitions
         SET publication_phase = ?, publication_cursor = ?, rows_deleted = ?
         WHERE dataset = ? AND partition_key = ? AND run_id = ? AND lease_token = ?`
      ).bind(nextPhase, nextPhase === 'switch' ? null : comparison?.last_key,
        nextDeleted, state.dataset, state.partitionKey, state.runId, this.leaseToken),
      this.db.prepare(
        `UPDATE fdic_ingest_runs SET publication_phase = ?, rows_deleted = ? WHERE run_id = ?`
      ).bind(nextPhase, nextDeleted, state.runId)
    ]);
    return this.pendingPublishResult({
      ...progress,
      publication_phase: nextPhase,
      publication_cursor: nextPhase === 'switch' ? null : comparison?.last_key ?? null,
      rows_deleted: nextDeleted
    });
  }

  private async switchVersion(
    state: FDICPartitionState,
    spec: PartitionSpec,
    progress: PublicationProgressRow
  ): Promise<FDICPublishResult> {
    if (progress.rows_materialized !== state.sourceTotal) {
      throw new FDICPartitionError('Refusing pointer switch before all rows are materialized', 502);
    }
    const publishedAt = this.now().toISOString();
    const nextPhase: FDICPublicationPhase = progress.previous_run_id ? 'cleanup-old' : 'cleanup-stage';
    const results = await this.db.batch([
      this.publicationStatement(state, spec, publishedAt),
      this.db.prepare(
        `UPDATE fdic_ingest_partitions
         SET publication_phase = ?, publication_cursor = NULL, published_at = ?
         WHERE dataset = ? AND partition_key = ? AND run_id = ? AND lease_token = ?`
      ).bind(nextPhase, publishedAt, state.dataset, state.partitionKey, state.runId, this.leaseToken),
      this.db.prepare('UPDATE fdic_ingest_runs SET publication_phase = ? WHERE run_id = ?')
        .bind(nextPhase, state.runId)
    ]);
    if ((results[1]?.meta.changes ?? 0) !== 1) throw new FDICLeaseError();
    return this.pendingPublishResult({
      ...progress, publication_phase: nextPhase, published_at: publishedAt
    });
  }

  private async cleanupOldVersion(
    state: FDICPartitionState,
    spec: PartitionSpec,
    progress: PublicationProgressRow
  ): Promise<FDICPublishResult> {
    if (!progress.previous_run_id) {
      await this.setPublicationPhase(state, 'cleanup-stage', null);
      return this.pendingPublishResult({ ...progress, publication_phase: 'cleanup-stage' });
    }
    const table = sqlIdentifier(spec.table);
    const keys = spec.primaryKeys.map(sqlIdentifier);
    const where = spec.staleWhere(state.partitionKey);
    const tuple = keys.length === 1 ? keys[0] : `(${keys.join(', ')})`;
    const result = await this.db.prepare(
      `DELETE FROM ${table} WHERE source_run_id = ? AND ${tuple} IN (
         SELECT ${keys.join(', ')} FROM ${table}
         WHERE source_run_id = ? AND ${where.sql}
         ORDER BY ${keys.join(', ')} LIMIT ?
       )`
    ).bind(progress.previous_run_id, progress.previous_run_id,
      ...where.params, FDIC_PUBLICATION_CHUNK_SIZE).run();
    const removed = result.meta.changes ?? 0;
    const nextPhase: FDICPublicationPhase = removed < FDIC_PUBLICATION_CHUNK_SIZE
      ? 'cleanup-stage'
      : 'cleanup-old';
    if (nextPhase !== progress.publication_phase) await this.setPublicationPhase(state, nextPhase, null);
    return this.pendingPublishResult({ ...progress, publication_phase: nextPhase });
  }

  private async cleanupStage(
    state: FDICPartitionState,
    progress: PublicationProgressRow
  ): Promise<FDICPublishResult> {
    const result = await this.db.prepare(
      `DELETE FROM fdic_ingest_stage WHERE run_id = ? AND row_key IN (
         SELECT row_key FROM fdic_ingest_stage WHERE run_id = ?
         ORDER BY row_key LIMIT ?
       )`
    ).bind(state.runId, state.runId, FDIC_PUBLICATION_CHUNK_SIZE).run();
    if ((result.meta.changes ?? 0) >= FDIC_PUBLICATION_CHUNK_SIZE) {
      return this.pendingPublishResult(progress);
    }
    const completedAt = this.now().toISOString();
    const results = await this.db.batch([
      this.db.prepare(
        `UPDATE fdic_ingest_runs
         SET status = 'complete', completed_at = ?, rows_published = ?,
             publication_phase = 'complete', error = NULL
         WHERE run_id = ?`
      ).bind(completedAt, state.sourceTotal, state.runId),
      this.db.prepare(
        `UPDATE fdic_ingest_partitions
         SET status = 'complete', publication_phase = 'complete',
             lease_token = NULL, lease_expires_at = NULL, error = NULL
         WHERE dataset = ? AND partition_key = ? AND run_id = ? AND lease_token = ?`
      ).bind(state.dataset, state.partitionKey, state.runId, this.leaseToken)
    ]);
    if ((results[1]?.meta.changes ?? 0) !== 1) throw new FDICLeaseError();
    return {
      done: true,
      rowsPublished: state.sourceTotal,
      rowsDeleted: progress.rows_deleted,
      publishedAt: progress.published_at,
      publicationPhase: 'complete',
      rowsMaterialized: progress.rows_materialized
    };
  }

  async fail(state: FDICPartitionState, error: string): Promise<void> {
    const now = this.now().toISOString();
    await this.db.batch([
      this.db.prepare(
        `UPDATE fdic_ingest_runs SET status = 'error', completed_at = ?, error = ? WHERE run_id = ?`
      ).bind(now, error.slice(0, 2_000), state.runId),
      this.db.prepare(
        `UPDATE fdic_ingest_partitions
         SET status = 'error', error = ?, lease_token = NULL, lease_expires_at = NULL
         WHERE dataset = ? AND partition_key = ? AND run_id = ? AND lease_token = ?`
      ).bind(error.slice(0, 2_000), state.dataset, state.partitionKey, state.runId, this.leaseToken)
    ]);
  }

  async release(state: FDICPartitionState): Promise<void> {
    await this.db.prepare(
      `UPDATE fdic_ingest_partitions SET lease_token = NULL, lease_expires_at = NULL
       WHERE dataset = ? AND partition_key = ? AND run_id = ? AND lease_token = ?`
    ).bind(state.dataset, state.partitionKey, state.runId, this.leaseToken).run();
  }
}

export interface RunFDICPartitionOptions {
  dataset: FDICDataset;
  partition: string;
  refresh?: boolean;
  maxPages?: number;
  store: FDICIngestStore;
  fetchPage?: (dataset: FDICDataset, partition: string, offset: number) => Promise<FDICPage>;
}

export async function runFDICPartition(options: RunFDICPartitionOptions): Promise<FDICPartitionResult> {
  const spec = specFor(options.dataset);
  const partition = spec.normalizePartition(options.partition);
  const maxPages = options.maxPages ?? 1;
  if (!Number.isInteger(maxPages) || maxPages < 1 || maxPages > FDIC_MAX_PAGES_PER_REQUEST) {
    throw new FDICPartitionError(`max_pages must be between 1 and ${FDIC_MAX_PAGES_PER_REQUEST}`);
  }
  const fetchPage = options.fetchPage ?? fetchFDICPage;
  const endpoint = `${FDIC_API_BASE}/${spec.endpoint}`;
  const begun = await options.store.begin(options.dataset, partition, endpoint, options.refresh === true);
  let state = begun.state;
  if (begun.alreadyComplete) {
    return {
      dataset: state.dataset, partition: state.partitionKey, run_id: state.runId,
      status: 'complete', done: true, checkpoint: state.checkpoint, source_total: state.sourceTotal,
      rows_seen: state.rowsSeen, rows_published: state.sourceTotal, rows_deleted: 0,
      key_first: state.keyFirst, key_last: state.keyLast, retrieved_at: state.retrievedAt,
      published_at: null, source_endpoint: endpoint,
      publication_phase: state.publicationPhase, rows_materialized: state.rowsMaterialized
    };
  }

  try {
    if (state.status === 'running'
      && state.sourceTotal != null
      && state.rowsSeen === state.sourceTotal) {
      state = { ...state, status: 'reconciling' };
    }
    if (state.status === 'reconciling') {
      const published = await options.store.publish(state, spec);
      if (!published.done) await options.store.release(state);
      return {
        dataset: state.dataset, partition: state.partitionKey, run_id: state.runId,
        status: published.done ? 'complete' : 'reconciling', done: published.done,
        checkpoint: state.checkpoint, source_total: state.sourceTotal,
        rows_seen: state.rowsSeen, rows_published: published.rowsPublished,
        rows_deleted: published.rowsDeleted, key_first: state.keyFirst,
        key_last: state.keyLast, retrieved_at: state.retrievedAt,
        published_at: published.publishedAt, source_endpoint: endpoint,
        publication_phase: published.publicationPhase,
        rows_materialized: published.rowsMaterialized
      };
    }

    for (let pageNumber = 0; pageNumber < maxPages; pageNumber++) {
      const page = await fetchPage(options.dataset, partition, state.checkpoint);
      if (state.sourceTotal != null && state.sourceTotal !== page.total) {
        throw new FDICPartitionError(
          `FDIC source total changed during run (${state.sourceTotal} to ${page.total}); restart the partition`,
          502
        );
      }
      if (spec.requireNonEmpty && page.total === 0) {
        throw new FDICPartitionError('Refusing to reconcile a normally non-empty partition with source total 0', 502);
      }
      if (page.rows.length === 0 && state.rowsSeen < page.total) {
        throw new FDICPartitionError('FDIC returned an empty page before the reported source total', 502);
      }
      const nextRowsSeen = state.rowsSeen + page.rows.length;
      if (nextRowsSeen > page.total) {
        throw new FDICPartitionError('FDIC returned more rows than its reported source total', 502);
      }

      const mapped = page.rows.map((raw) => {
        const mappedRow = spec.map(raw, partition);
        const row: Record<string, unknown> = {
          ...mappedRow,
          source_run_id: state.runId,
          source_retrieved_at: state.retrievedAt
        };
        const selected = Object.fromEntries(spec.columns.map((column) => [column, row[column] ?? null]));
        return { key: spec.rowKey(selected), row: selected };
      });
      await options.store.stage(
        state.runId,
        mapped.map(({ key, row }) => ({ row_key: key, row_json: JSON.stringify(row) }))
      );
      const pageKeys = mapped.map(({ key }) => key).sort();
      const nextKeyFirst = [state.keyFirst, pageKeys[0]].filter((value): value is string => Boolean(value)).sort()[0] ?? null;
      const nextKeyLast = [state.keyLast, pageKeys.at(-1)].filter((value): value is string => Boolean(value)).sort().at(-1) ?? null;
      const nextCheckpoint = state.checkpoint + page.rows.length;
      await options.store.advance(state, {
        checkpoint: nextCheckpoint,
        sourceTotal: page.total,
        rowsSeen: nextRowsSeen,
        keyFirst: nextKeyFirst,
        keyLast: nextKeyLast
      });
      state = {
        ...state,
        checkpoint: nextCheckpoint,
        sourceTotal: page.total,
        rowsSeen: nextRowsSeen,
        keyFirst: nextKeyFirst,
        keyLast: nextKeyLast
      };

      if (nextRowsSeen === page.total) {
        state = { ...state, status: 'reconciling' };
        const published = await options.store.publish(state, spec);
        if (!published.done) await options.store.release(state);
        return {
          dataset: state.dataset, partition: state.partitionKey, run_id: state.runId,
          status: published.done ? 'complete' : 'reconciling', done: published.done,
          checkpoint: nextCheckpoint, source_total: page.total,
          rows_seen: nextRowsSeen, rows_published: published.rowsPublished,
          rows_deleted: published.rowsDeleted, key_first: nextKeyFirst, key_last: nextKeyLast,
          retrieved_at: state.retrievedAt, published_at: published.publishedAt,
          source_endpoint: endpoint, publication_phase: published.publicationPhase,
          rows_materialized: published.rowsMaterialized
        };
      }
    }

    await options.store.release(state);
    return {
      dataset: state.dataset, partition: state.partitionKey, run_id: state.runId,
      status: 'running', done: false, checkpoint: state.checkpoint, source_total: state.sourceTotal,
      rows_seen: state.rowsSeen, rows_published: null, rows_deleted: 0,
      key_first: state.keyFirst, key_last: state.keyLast, retrieved_at: state.retrievedAt,
      published_at: null, source_endpoint: endpoint,
      publication_phase: state.publicationPhase, rows_materialized: state.rowsMaterialized
    };
  } catch (error) {
    if (!(error instanceof FDICLeaseError)) {
      if (state.status === 'reconciling' && !(error instanceof FDICPartitionError)) {
        await options.store.release(state);
      } else {
        await options.store.fail(state, error instanceof Error ? error.message : String(error));
      }
    }
    throw error;
  }
}
