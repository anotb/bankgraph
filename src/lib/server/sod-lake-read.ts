export const SOD_AGGREGATE_MAX_LIMIT = 500;
export const SOD_BRANCH_MAX_LIMIT = 500;

export type SodAggregateLevel = 'state' | 'county' | 'bank';

export class SodLakeQueryError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
  }
}

interface QueryPlan {
  sql: string;
  params: unknown[];
  limit: number;
  offset: number;
}

export interface SodAggregatePlan extends QueryPlan {
  level: SodAggregateLevel;
  year: number;
  format: 'json' | 'csv';
  countSql: string;
  countParams: unknown[];
}

export interface SodBranchPlan extends QueryPlan {
  fetchLimit: number;
}

const STATE_RE = /^[A-Z]{2}$/;
const YEAR_RE = /^\d{4}$/;

function one(search: URLSearchParams, name: string): string | null {
  const values = search.getAll(name);
  if (values.length > 1) throw new SodLakeQueryError(`Duplicate query parameter: ${name}`);
  return values[0] ?? null;
}

function rejectUnknown(search: URLSearchParams, allowed: ReadonlySet<string>): void {
  for (const key of search.keys()) {
    if (!allowed.has(key)) throw new SodLakeQueryError(`Unknown query parameter: ${key}`);
  }
}

function integer(
  raw: string | null,
  name: string,
  fallback: number | null,
  minimum: number,
  maximum: number
): number {
  if (raw == null) {
    if (fallback == null) throw new SodLakeQueryError(`${name} is required`);
    return fallback;
  }
  if (!/^\d+$/.test(raw)) throw new SodLakeQueryError(`${name} must be an integer`);
  const parsed = Number(raw);
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new SodLakeQueryError(`${name} must be between ${minimum} and ${maximum}`);
  }
  return parsed;
}

function year(raw: string | null): number {
  if (raw == null) throw new SodLakeQueryError('year is required');
  if (!YEAR_RE.test(raw)) throw new SodLakeQueryError('year must be YYYY');
  const parsed = Number(raw);
  if (parsed < 1994 || parsed > new Date().getUTCFullYear() + 1) {
    throw new SodLakeQueryError(`year must be between 1994 and ${new Date().getUTCFullYear() + 1}`);
  }
  return parsed;
}

function state(raw: string | null): string | null {
  if (raw == null) return null;
  const normalized = raw.toUpperCase();
  if (!STATE_RE.test(normalized)) throw new SodLakeQueryError('state must be a two-letter code');
  return normalized;
}

function cert(raw: string | null): number | null {
  if (raw == null) return null;
  return integer(raw, 'cert', null, 1, 9_999_999);
}

const AGGREGATE_PARAMETERS = new Set([
  'level', 'year', 'state', 'county_fips', 'cert', 'limit', 'offset', 'format'
]);

export function buildSodAggregatePlan(search: URLSearchParams): SodAggregatePlan {
  rejectUnknown(search, AGGREGATE_PARAMETERS);
  const levelRaw = one(search, 'level') ?? 'state';
  if (!['state', 'county', 'bank'].includes(levelRaw)) {
    throw new SodLakeQueryError('level must be state, county, or bank');
  }
  const level = levelRaw as SodAggregateLevel;
  const partitionYear = year(one(search, 'year'));
  const formatRaw = one(search, 'format') ?? 'json';
  if (formatRaw !== 'json' && formatRaw !== 'csv') {
    throw new SodLakeQueryError('format must be json or csv');
  }
  const limit = integer(one(search, 'limit'), 'limit', 100, 1, SOD_AGGREGATE_MAX_LIMIT);
  const offset = integer(one(search, 'offset'), 'offset', 0, 0, 100_000);
  const requestedState = state(one(search, 'state'));
  const requestedCert = cert(one(search, 'cert'));
  const countyFips = one(search, 'county_fips');
  if (countyFips != null && !/^\d{5}$/.test(countyFips)) {
    throw new SodLakeQueryError('county_fips must be a five-digit FIPS code');
  }

  if (level !== 'county' && countyFips != null) {
    throw new SodLakeQueryError('county_fips is only valid for county results');
  }
  if (level !== 'bank' && requestedCert != null) {
    throw new SodLakeQueryError('cert is only valid for bank results');
  }
  if (level === 'county' && requestedState == null && countyFips == null) {
    throw new SodLakeQueryError('county results require state or county_fips');
  }
  if (level === 'bank' && requestedState != null) {
    throw new SodLakeQueryError('state is not available on bank/year aggregates');
  }

  const table = `sod_${level}_year`;
  const columns = level === 'state'
    ? 'aggregate.year, aggregate.state, aggregate.branch_count, aggregate.bank_count, aggregate.total_deposits'
    : level === 'county'
      ? 'aggregate.year, aggregate.state, aggregate.county_fips, aggregate.county_name, aggregate.branch_count, aggregate.bank_count, aggregate.total_deposits'
      : 'aggregate.year, aggregate.cert, aggregate.branch_count, aggregate.main_office_count, aggregate.state_count, aggregate.county_count, aggregate.total_deposits';
  const orderBy = level === 'state'
    ? 'aggregate.total_deposits DESC, aggregate.state ASC'
    : level === 'county'
      ? 'aggregate.total_deposits DESC, aggregate.county_fips ASC'
      : 'aggregate.total_deposits DESC, aggregate.cert ASC';
  const where = [
    'aggregate.year = ?',
    "lake.dataset = 'sod'",
    'lake.partition_key = ?',
    'aggregate.source_sha256 = lake.object_sha256'
  ];
  const params: unknown[] = [partitionYear, String(partitionYear)];
  if (requestedState != null) {
    where.push('aggregate.state = ?');
    params.push(requestedState);
  }
  if (countyFips != null) {
    where.push('aggregate.county_fips = ?');
    params.push(countyFips);
  }
  if (requestedCert != null) {
    where.push('aggregate.cert = ?');
    params.push(requestedCert);
  }
  const from = `${table} AS aggregate JOIN fdic_lake_partitions AS lake ON lake.object_sha256 = aggregate.source_sha256`;
  const whereSql = where.join(' AND ');
  return {
    level,
    year: partitionYear,
    format: formatRaw,
    sql: `SELECT ${columns} FROM ${from} WHERE ${whereSql} ORDER BY ${orderBy} LIMIT ? OFFSET ?`,
    countSql: `SELECT COUNT(*) AS count FROM ${from} WHERE ${whereSql}`,
    params: [...params, limit, offset],
    countParams: params,
    limit,
    offset
  };
}

const BRANCH_PARAMETERS = new Set([
  'state', 'q', 'cert', 'west', 'south', 'east', 'north', 'limit', 'offset'
]);

function coordinate(raw: string | null, name: string, minimum: number, maximum: number): number | null {
  if (raw == null) return null;
  if (raw.trim() === '') throw new SodLakeQueryError(`${name} must be a number`);
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < minimum || parsed > maximum) {
    throw new SodLakeQueryError(`${name} must be between ${minimum} and ${maximum}`);
  }
  return parsed;
}

export function buildLatestSodBranchPlan(search: URLSearchParams): SodBranchPlan {
  rejectUnknown(search, BRANCH_PARAMETERS);
  const requestedState = state(one(search, 'state'));
  const requestedCert = cert(one(search, 'cert'));
  const q = one(search, 'q')?.trim() || null;
  if (q != null && (q.length < 2 || q.length > 80 || new TextEncoder().encode(q).length > 160)) {
    throw new SodLakeQueryError('q must be 2-80 characters and at most 160 UTF-8 bytes');
  }
  const west = coordinate(one(search, 'west'), 'west', -180, 180);
  const south = coordinate(one(search, 'south'), 'south', -90, 90);
  const east = coordinate(one(search, 'east'), 'east', -180, 180);
  const north = coordinate(one(search, 'north'), 'north', -90, 90);
  const suppliedBounds = [west, south, east, north].filter((value) => value != null).length;
  if (suppliedBounds !== 0 && suppliedBounds !== 4) {
    throw new SodLakeQueryError('west, south, east, and north must be supplied together');
  }
  if (west != null && east != null && west >= east) {
    throw new SodLakeQueryError('west must be less than east');
  }
  if (south != null && north != null && south >= north) {
    throw new SodLakeQueryError('south must be less than north');
  }
  if (requestedState == null && requestedCert == null && q == null && suppliedBounds === 0) {
    throw new SodLakeQueryError('latest branch reads require state, cert, q, or a bounding box');
  }
  const limit = integer(one(search, 'limit'), 'limit', 200, 1, SOD_BRANCH_MAX_LIMIT);
  const offset = integer(one(search, 'offset'), 'offset', 0, 0, 50_000);
  const where: string[] = [];
  const params: unknown[] = [];
  if (requestedState != null) {
    where.push('stalpbr = ?');
    params.push(requestedState);
  }
  if (requestedCert != null) {
    where.push('cert = ?');
    params.push(requestedCert);
  }
  if (q != null) {
    where.push('(INSTR(LOWER(namebr), LOWER(?)) > 0 OR INSTR(LOWER(citybr), LOWER(?)) > 0 OR zipbr = ?)');
    params.push(q, q, q);
  }
  if (west != null && south != null && east != null && north != null) {
    where.push('longitude >= ? AND longitude <= ? AND latitude >= ? AND latitude <= ?');
    params.push(west, east, south, north);
  }
  const fetchLimit = limit + 1;
  return {
    sql: `SELECT uninumbr, year, cert, namebr, citybr, stalpbr, zipbr, cntynumb, cntynamb, depsumbr, latitude, longitude, mainoff, source_retrieved_at FROM sod_latest_branches WHERE ${where.join(' AND ')} ORDER BY depsumbr DESC, uninumbr ASC LIMIT ? OFFSET ?`,
    params: [...params, fetchLimit, offset],
    limit,
    fetchLimit,
    offset
  };
}

export function parseSodLakeYear(search: URLSearchParams): number {
  rejectUnknown(search, new Set(['year']));
  return year(one(search, 'year'));
}
