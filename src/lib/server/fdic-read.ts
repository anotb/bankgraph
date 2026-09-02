import {
  FDICPartitionError,
  normalizeFDICPartition,
  type FDICDataset
} from './pipeline/fdic-partitioned-ingest';

export const FDIC_READ_MAX_LIMIT = 200;

interface ReadSpec {
  table: string;
  columns: readonly string[];
  orderBy: string;
  /**
   * Extended FDIC partitions are versioned by their ingest run. Canonical
   * financial history is instead versioned by the elected release view and
   * its immutable release attestation.
   */
  publication: 'partition-run' | 'elected-release';
  partitionWhere(partition: string): { sql: string; params: unknown[] };
  filters(search: URLSearchParams): Array<{ sql: string; param: unknown }>;
}

function positiveInteger(raw: string | null, name: string): number | null {
  if (raw == null) return null;
  if (!/^\d+$/.test(raw) || Number(raw) < 1) throw new FDICPartitionError(`${name} must be a positive integer`);
  return Number(raw);
}

function stateCode(raw: string | null): string | null {
  if (raw == null) return null;
  const state = raw.toUpperCase();
  if (!/^(?:[A-Z]{2}|USA)$/.test(state)) throw new FDICPartitionError('state must be a two-letter code or USA');
  return state;
}

function commonFilters(search: URLSearchParams, stateColumn?: string): Array<{ sql: string; param: unknown }> {
  const filters: Array<{ sql: string; param: unknown }> = [];
  const cert = positiveInteger(search.get('cert'), 'cert');
  if (cert != null) filters.push({ sql: 'cert = ?', param: cert });
  const state = stateCode(search.get('state'));
  if (state != null) {
    if (!stateColumn) throw new FDICPartitionError('state is not supported for this dataset');
    filters.push({ sql: `${stateColumn} = ?`, param: state });
  }
  return filters;
}

const SPECS: Record<FDICDataset, ReadSpec> = {
  financials: {
    table: 'published_financials',
    publication: 'elected-release',
    columns: [
      'cert', 'repdte', 'asset', 'dep', 'eq', 'lnlsnet', 'lnre', 'lnci', 'lncon',
      'sec', 'netinc', 'intinc', 'eintexp', 'nim', 'nonii', 'nonix', 'elnatr',
      'roa', 'roe', 'nimy', 'eeffr', 'rbcrwaj', 'rbc1rwaj', 'rbc1aaj', 'eqv',
      'nclnlsr', 'lnatresr', 'nco_ratio', 'lnlsdepr', 'othbfhlb', 'numemp',
      'asset_bucket', 'source_retrieved_at'
    ],
    orderBy: 'cert ASC',
    partitionWhere: (partition) => ({ sql: 'repdte = ?', params: [partition] }),
    filters: (search) => commonFilters(search)
  },
  'annual-summary': {
    table: 'annual_summary',
    publication: 'partition-run',
    columns: [
      'stalp', 'year', 'charter_type', 'asset', 'dep', 'eq', 'netinc', 'nim',
      'nonii', 'nonix', 'elnatr', 'intinc', 'eintexp', 'banks', 'branches',
      'numemp', 'lnlsnet', 'lnre', 'lnci', 'lncon', 'sec', 'nclnls', 'lnatres',
      'source_retrieved_at'
    ],
    orderBy: 'stalp ASC',
    partitionWhere: (partition) => {
      const [year, charter] = partition.split(':');
      return { sql: 'year = ? AND charter_type = ?', params: [Number(year), charter] };
    },
    filters: (search) => {
      const state = stateCode(search.get('state'));
      return state == null ? [] : [{ sql: 'stalp = ?', param: state }];
    }
  },
  sod: {
    table: 'sod',
    publication: 'partition-run',
    columns: [
      'uninumbr', 'year', 'cert', 'namebr', 'citybr', 'stalpbr', 'zipbr',
      'cntynumb', 'cntynamb', 'depsumbr', 'depdom', 'asset', 'latitude',
      'longitude', 'brsertyp', 'mainoff', 'source_retrieved_at'
    ],
    orderBy: 'uninumbr ASC',
    partitionWhere: (partition) => ({ sql: 'year = ?', params: [Number(partition)] }),
    filters: (search) => commonFilters(search, 'stalpbr')
  },
  history: {
    table: 'history_events',
    publication: 'partition-run',
    columns: [
      'id', 'cert', 'uninum', 'fi_uninum', 'event_date', 'process_date',
      'change_code', 'change_desc', 'org_role', 'inst_name', 'acq_uninum',
      'out_uninum', 'transnum', 'eff_year', 'proc_year', 'source_retrieved_at'
    ],
    orderBy: 'id ASC',
    partitionWhere: (partition) => ({ sql: 'proc_year = ?', params: [Number(partition)] }),
    filters: (search) => commonFilters(search)
  },
  locations: {
    table: 'locations',
    publication: 'partition-run',
    columns: [
      'uninum', 'cert', 'name', 'offname', 'address', 'city', 'stalp', 'zip',
      'county', 'stcnty', 'servtype', 'servtype_desc', 'mainoff', 'latitude',
      'longitude', 'estymd', 'cbsa', 'rundate', 'source_snapshot',
      'source_retrieved_at'
    ],
    orderBy: 'uninum ASC',
    partitionWhere: (partition) => ({ sql: 'source_snapshot = ?', params: [partition] }),
    filters: (search) => commonFilters(search, 'stalp')
  },
  institutions: {
    table: 'published_institutions',
    publication: 'partition-run',
    columns: [
      'cert', 'rssd_id', 'name', 'city', 'state', 'zip', 'county', 'charter_class',
      'regulator', 'active', 'established_date', 'insured_date', 'holding_company',
      'hc_rssd_id', 'asset_tier', 'total_assets', 'total_deposits', 'num_branches',
      'num_employees', 'source_snapshot', 'source_retrieved_at'
    ],
    orderBy: 'cert ASC',
    partitionWhere: (partition) => ({ sql: 'source_snapshot = ?', params: [partition] }),
    filters: (search) => commonFilters(search, 'state')
  }
};

export interface FDICReadPlan {
  dataset: FDICDataset;
  partition: string;
  sql: string;
  countSql: string;
  params: unknown[];
  limit: number;
  offset: number;
}

export function buildFDICReadPlan(
  dataset: FDICDataset,
  rawPartition: string,
  search: URLSearchParams
): FDICReadPlan {
  const partition = normalizeFDICPartition(dataset, rawPartition);
  if (partition === 'latest') throw new FDICPartitionError('Public reads require the resolved snapshot date, not latest');
  const limitRaw = search.get('limit');
  const offsetRaw = search.get('offset');
  const limit = limitRaw == null ? 50 : Number(limitRaw);
  const offset = offsetRaw == null ? 0 : Number(offsetRaw);
  if (!Number.isInteger(limit) || limit < 1 || limit > FDIC_READ_MAX_LIMIT) {
    throw new FDICPartitionError(`limit must be between 1 and ${FDIC_READ_MAX_LIMIT}`);
  }
  if (!Number.isInteger(offset) || offset < 0 || offset > 1_000_000) {
    throw new FDICPartitionError('offset must be between 0 and 1000000');
  }

  const spec = SPECS[dataset];
  const partitionWhere = spec.partitionWhere(partition);
  const extra = spec.filters(search);
  const partitionPublication = spec.publication === 'partition-run'
    ? [{
        sql: `source_run_id = (SELECT run_id FROM fdic_dataset_publications WHERE dataset = ? AND partition_key = ?)`,
        params: [dataset, partition]
      }]
    : [];
  const where = [
    partitionWhere.sql,
    ...partitionPublication.map((constraint) => constraint.sql),
    ...extra.map((filter) => filter.sql)
  ].join(' AND ');
  const params = [
    ...partitionWhere.params,
    ...partitionPublication.flatMap((constraint) => constraint.params),
    ...extra.map((filter) => filter.param)
  ];
  return {
    dataset,
    partition,
    sql: `SELECT ${spec.columns.join(', ')} FROM ${spec.table} WHERE ${where} ORDER BY ${spec.orderBy} LIMIT ? OFFSET ?`,
    countSql: `SELECT COUNT(*) AS count FROM ${spec.table} WHERE ${where}`,
    params,
    limit,
    offset
  };
}
