import { queryAll, queryOne } from '$lib/server/db';
import {
  discoverLatestAnnualYear,
  discoverLatestHistoryProcessYear,
  discoverLatestSODYear,
  resolveFDICPartition
} from './fdic-partitioned-ingest';

export const FDIC_COVERAGE_MANIFEST_VERSION = 1;
export const ANNUAL_CB_FIRST_YEAR = 1934;
export const ANNUAL_SI_FIRST_YEAR = 1984;
export const HISTORY_FIRST_PROCESS_YEAR = 1900;
export const SOD_FIRST_YEAR = 1994;

export interface FDICCoverageBounds {
  annualCbLatest: number;
  annualSiLatest: number;
  historyLatest: number;
  locationsSnapshot: string;
  sodLatest: number;
}

export interface FDICCoverageManifestItem {
  dataset: 'annual-summary' | 'history' | 'locations' | 'sod';
  partition_key: string;
  storage_layer: 'd1' | 'r2' | 'hot';
  publication_run_id: string | null;
  source_total: number;
  row_count: number;
  object_key: string | null;
  manifest_key: string | null;
  object_sha256: string | null;
  compressed_bytes: number | null;
  is_current_snapshot: number;
}

export interface FDICCoverageAuditResult {
  run_id: string;
  manifest_sha256: string;
  item_count: number;
  source_observed_at: string;
  audited_at: string;
  bounds: FDICCoverageBounds;
  r2_objects_checked: number;
}

export interface FDICCoveragePublicationRow {
  dataset: FDICCoverageManifestItem['dataset'];
  partition_key: string;
  run_id: string;
  source_total: number;
  row_count: number;
  run_status: string | null;
}

export interface FDICCoverageLakeRow {
  partition_key: string;
  object_key: string;
  manifest_key: string;
  object_sha256: string;
  source_total: number;
  row_count: number;
  compressed_bytes: number;
  field_count: number;
  is_current_snapshot: number;
  state_branches: number;
  county_branches: number;
  bank_branches: number;
}

export interface FDICCoverageHotSnapshotRow {
  row_count: number;
  run_count: number;
  run_min: string | null;
  run_max: string | null;
  partition_count: number;
  partition_min: string | null;
  partition_max: string | null;
}

export interface FDICCoverageActual {
  publications: FDICCoveragePublicationRow[];
  lake: FDICCoverageLakeRow[];
  locations: FDICCoverageHotSnapshotRow;
  sod: FDICCoverageHotSnapshotRow;
  staleAggregateRows: number;
  activeIngests: string[];
}

interface StoredManifestRow {
  run_id: string;
  manifest_sha256: string;
  annual_cb_latest: number;
  annual_si_latest: number;
  history_latest: number;
  locations_snapshot: string;
  sod_latest: number;
  item_count: number;
  source_observed_at: string;
  audited_at: string;
}

export class FDICCoverageError extends Error {
  constructor(readonly issues: string[]) {
    super(`Extended FDIC coverage is incomplete: ${issues.join('; ')}`);
  }
}

function range(first: number, last: number): string[] {
  return Array.from({ length: last - first + 1 }, (_, index) => String(first + index));
}

export function expectedFDICCoveragePartitions(bounds: FDICCoverageBounds): {
  annual: string[];
  history: string[];
  locations: string[];
  sod: string[];
} {
  const upper = new Date().getUTCFullYear() + 1;
  const years = [bounds.annualCbLatest, bounds.annualSiLatest, bounds.historyLatest, bounds.sodLatest];
  if (years.some((year) => !Number.isInteger(year) || year > upper)) {
    throw new FDICCoverageError(['source returned an invalid future or non-integer year']);
  }
  if (bounds.annualCbLatest < ANNUAL_CB_FIRST_YEAR) {
    throw new FDICCoverageError([`annual CB ends before ${ANNUAL_CB_FIRST_YEAR}`]);
  }
  if (bounds.annualSiLatest < ANNUAL_SI_FIRST_YEAR) {
    throw new FDICCoverageError([`annual SI ends before ${ANNUAL_SI_FIRST_YEAR}`]);
  }
  if (bounds.historyLatest < HISTORY_FIRST_PROCESS_YEAR) {
    throw new FDICCoverageError([`history ends before ${HISTORY_FIRST_PROCESS_YEAR}`]);
  }
  if (bounds.sodLatest < SOD_FIRST_YEAR) {
    throw new FDICCoverageError([`SOD ends before ${SOD_FIRST_YEAR}`]);
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(bounds.locationsSnapshot)) {
    throw new FDICCoverageError(['locations latest snapshot is not YYYY-MM-DD']);
  }
  return {
    annual: [
      ...range(ANNUAL_CB_FIRST_YEAR, bounds.annualCbLatest).map((year) => `${year}:CB`),
      ...range(ANNUAL_SI_FIRST_YEAR, bounds.annualSiLatest).map((year) => `${year}:SI`)
    ],
    history: range(HISTORY_FIRST_PROCESS_YEAR, bounds.historyLatest),
    locations: [bounds.locationsSnapshot],
    sod: range(SOD_FIRST_YEAR, bounds.sodLatest)
  };
}

function setDifference(expected: Iterable<string>, actual: Iterable<string>): {
  missing: string[];
  unexpected: string[];
} {
  const expectedSet = new Set(expected);
  const actualSet = new Set(actual);
  return {
    missing: [...expectedSet].filter((value) => !actualSet.has(value)),
    unexpected: [...actualSet].filter((value) => !expectedSet.has(value))
  };
}

function compactKeys(keys: string[]): string {
  const shown = keys.slice(0, 5).join(',');
  return keys.length <= 5 ? shown : `${shown},+${keys.length - 5} more`;
}

function publicationIssues(
  label: string,
  expected: string[],
  rows: FDICCoveragePublicationRow[],
  exact = true
): string[] {
  const issues: string[] = [];
  const difference = setDifference(expected, rows.map((row) => row.partition_key));
  if (difference.missing.length > 0) issues.push(`${label} missing ${compactKeys(difference.missing)}`);
  if (exact && difference.unexpected.length > 0) {
    issues.push(`${label} unexpected ${compactKeys(difference.unexpected)}`);
  }
  for (const row of rows.filter((candidate) => expected.includes(candidate.partition_key))) {
    if (row.source_total !== row.row_count) issues.push(`${label} ${row.partition_key} source/stored mismatch`);
    if (row.run_status !== 'complete') issues.push(`${label} ${row.partition_key} ingest run is not complete`);
    if (label !== 'history' && row.source_total <= 0) issues.push(`${label} ${row.partition_key} is empty`);
  }
  return issues;
}

export function validateFDICCoverage(
  bounds: FDICCoverageBounds,
  actual: FDICCoverageActual
): string[] {
  const expected = expectedFDICCoveragePartitions(bounds);
  const issues: string[] = [];
  const annual = actual.publications.filter((row) => row.dataset === 'annual-summary');
  const history = actual.publications.filter((row) => row.dataset === 'history');
  const locations = actual.publications.filter((row) => row.dataset === 'locations');
  const sodPublications = actual.publications.filter((row) => row.dataset === 'sod');

  issues.push(...publicationIssues('annual-summary', expected.annual, annual));
  issues.push(...publicationIssues('history', expected.history, history));
  issues.push(...publicationIssues('locations', expected.locations, locations, false));
  issues.push(...publicationIssues('SOD hot publication', [String(bounds.sodLatest)], sodPublications));

  const locationPublication = locations.find((row) => row.partition_key === bounds.locationsSnapshot);
  if (actual.locations.row_count <= 0) issues.push('locations hot snapshot is empty');
  if (actual.locations.run_count !== 1 || actual.locations.partition_count !== 1) {
    issues.push('locations hot table does not contain exactly one run and snapshot');
  }
  if (actual.locations.partition_min !== bounds.locationsSnapshot
    || actual.locations.partition_max !== bounds.locationsSnapshot) {
    issues.push('locations hot snapshot does not match the latest source snapshot');
  }
  if (!locationPublication
    || actual.locations.run_min !== locationPublication.run_id
    || actual.locations.run_max !== locationPublication.run_id
    || actual.locations.row_count !== locationPublication.row_count) {
    issues.push('locations hot rows do not match their publication');
  }

  const lakeDifference = setDifference(expected.sod, actual.lake.map((row) => row.partition_key));
  if (lakeDifference.missing.length > 0) issues.push(`SOD R2 missing ${compactKeys(lakeDifference.missing)}`);
  if (lakeDifference.unexpected.length > 0) {
    issues.push(`SOD R2 unexpected ${compactKeys(lakeDifference.unexpected)}`);
  }
  for (const row of actual.lake) {
    if (row.source_total !== row.row_count) issues.push(`SOD R2 ${row.partition_key} source/stored mismatch`);
    if (row.source_total <= 0) issues.push(`SOD R2 ${row.partition_key} is empty`);
    if (row.compressed_bytes <= 0 || row.field_count <= 0) {
      issues.push(`SOD R2 ${row.partition_key} has invalid object metadata`);
    }
    if (row.state_branches !== row.row_count) issues.push(`SOD state aggregate ${row.partition_key} is incomplete`);
    if (row.county_branches !== row.row_count) issues.push(`SOD county aggregate ${row.partition_key} is incomplete`);
    if (row.bank_branches !== row.row_count) issues.push(`SOD bank aggregate ${row.partition_key} is incomplete`);
  }
  const currentLake = actual.lake.filter((row) => row.is_current_snapshot === 1);
  if (currentLake.length !== 1 || currentLake[0]?.partition_key !== String(bounds.sodLatest)) {
    issues.push('SOD R2 must have exactly one current snapshot at the latest source year');
  }
  if (actual.staleAggregateRows !== 0) issues.push('SOD aggregates contain stale or unregistered revisions');

  const hotPublication = sodPublications[0];
  if (actual.sod.row_count <= 0) issues.push('SOD hot snapshot is empty');
  if (actual.sod.run_count !== 1 || actual.sod.partition_count !== 1) {
    issues.push('SOD hot table does not contain exactly one run and year');
  }
  if (actual.sod.partition_min !== String(bounds.sodLatest)
    || actual.sod.partition_max !== String(bounds.sodLatest)) {
    issues.push('SOD hot snapshot is not the latest lake year');
  }
  if (!hotPublication
    || actual.sod.run_min !== hotPublication.run_id
    || actual.sod.run_max !== hotPublication.run_id
    || actual.sod.row_count !== hotPublication.row_count
    || hotPublication.row_count !== currentLake[0]?.row_count) {
    issues.push('SOD hot rows, publication, and current lake snapshot disagree');
  }
  if (actual.activeIngests.length > 0) {
    issues.push(`extended FDIC ingests still active: ${compactKeys(actual.activeIngests)}`);
  }
  return issues;
}

async function readActualCoverage(db: D1Database): Promise<FDICCoverageActual> {
  const [publications, lake, locations, sod, staleAggregates, active] = await Promise.all([
    queryAll<FDICCoveragePublicationRow>(db, `
      SELECT publication.dataset, publication.partition_key, publication.run_id,
             publication.source_total, publication.row_count, run.status AS run_status
      FROM fdic_dataset_publications AS publication
      LEFT JOIN fdic_ingest_runs AS run ON run.run_id = publication.run_id
      WHERE publication.dataset IN ('annual-summary', 'history', 'locations', 'sod')
      ORDER BY publication.dataset, publication.partition_key
    `),
    queryAll<FDICCoverageLakeRow>(db, `
      SELECT lake.partition_key, lake.object_key, lake.manifest_key, lake.object_sha256,
             lake.source_total, lake.row_count, lake.compressed_bytes, lake.field_count,
             lake.is_current_snapshot,
             COALESCE((SELECT SUM(branch_count) FROM sod_state_year
                       WHERE year = CAST(lake.partition_key AS INTEGER)
                         AND source_sha256 = lake.object_sha256), 0) AS state_branches,
             COALESCE((SELECT SUM(branch_count) FROM sod_county_year
                       WHERE year = CAST(lake.partition_key AS INTEGER)
                         AND source_sha256 = lake.object_sha256), 0) AS county_branches,
             COALESCE((SELECT SUM(branch_count) FROM sod_bank_year
                       WHERE year = CAST(lake.partition_key AS INTEGER)
                         AND source_sha256 = lake.object_sha256), 0) AS bank_branches
      FROM fdic_lake_partitions AS lake
      WHERE lake.dataset = 'sod'
      ORDER BY lake.partition_key
    `),
    queryOne<FDICCoverageHotSnapshotRow>(db, `
      SELECT COUNT(*) AS row_count, COUNT(DISTINCT source_run_id) AS run_count,
             MIN(source_run_id) AS run_min, MAX(source_run_id) AS run_max,
             COUNT(DISTINCT source_snapshot) AS partition_count,
             MIN(source_snapshot) AS partition_min, MAX(source_snapshot) AS partition_max
      FROM locations
    `),
    queryOne<FDICCoverageHotSnapshotRow>(db, `
      SELECT COUNT(*) AS row_count, COUNT(DISTINCT source_run_id) AS run_count,
             MIN(source_run_id) AS run_min, MAX(source_run_id) AS run_max,
             COUNT(DISTINCT CAST(year AS TEXT)) AS partition_count,
             MIN(CAST(year AS TEXT)) AS partition_min, MAX(CAST(year AS TEXT)) AS partition_max
      FROM sod
    `),
    queryOne<{ row_count: number }>(db, `
      SELECT
        (SELECT COUNT(*) FROM sod_state_year AS aggregate_row
         LEFT JOIN fdic_lake_partitions AS lake
           ON lake.dataset = 'sod'
          AND lake.partition_key = CAST(aggregate_row.year AS TEXT)
          AND lake.object_sha256 = aggregate_row.source_sha256
         WHERE lake.partition_key IS NULL)
        +
        (SELECT COUNT(*) FROM sod_county_year AS aggregate_row
         LEFT JOIN fdic_lake_partitions AS lake
           ON lake.dataset = 'sod'
          AND lake.partition_key = CAST(aggregate_row.year AS TEXT)
          AND lake.object_sha256 = aggregate_row.source_sha256
         WHERE lake.partition_key IS NULL)
        +
        (SELECT COUNT(*) FROM sod_bank_year AS aggregate_row
         LEFT JOIN fdic_lake_partitions AS lake
           ON lake.dataset = 'sod'
          AND lake.partition_key = CAST(aggregate_row.year AS TEXT)
          AND lake.object_sha256 = aggregate_row.source_sha256
         WHERE lake.partition_key IS NULL) AS row_count
    `),
    queryAll<{ dataset: string; partition_key: string; status: string }>(db, `
      SELECT dataset, partition_key, status FROM fdic_ingest_runs
      WHERE dataset IN ('annual-summary', 'history', 'locations', 'sod')
        AND status IN ('running', 'reconciling')
      UNION ALL
      SELECT dataset, partition_key, status FROM fdic_ingest_partitions
      WHERE dataset IN ('annual-summary', 'history', 'locations', 'sod')
        AND status IN ('running', 'reconciling')
    `)
  ]);
  return {
    publications,
    lake,
    locations: locations ?? emptyHotSnapshot(),
    sod: sod ?? emptyHotSnapshot(),
    staleAggregateRows: staleAggregates?.row_count ?? 0,
    activeIngests: active.map((row) => `${row.dataset}:${row.partition_key}:${row.status}`)
  };
}

function emptyHotSnapshot(): FDICCoverageHotSnapshotRow {
  return {
    row_count: 0, run_count: 0, run_min: null, run_max: null,
    partition_count: 0, partition_min: null, partition_max: null
  };
}

function manifestItems(bounds: FDICCoverageBounds, actual: FDICCoverageActual): FDICCoverageManifestItem[] {
  const publicationItems = actual.publications
    .filter((row) => row.dataset === 'annual-summary'
      || row.dataset === 'history'
      || (row.dataset === 'locations' && row.partition_key === bounds.locationsSnapshot)
      || (row.dataset === 'sod' && row.partition_key === String(bounds.sodLatest)))
    .map((row): FDICCoverageManifestItem => ({
      dataset: row.dataset,
      partition_key: row.partition_key,
      storage_layer: row.dataset === 'sod' ? 'hot' : 'd1',
      publication_run_id: row.run_id,
      source_total: row.source_total,
      row_count: row.row_count,
      object_key: null,
      manifest_key: null,
      object_sha256: null,
      compressed_bytes: null,
      is_current_snapshot: row.dataset === 'locations' || row.dataset === 'sod' ? 1 : 0
    }));
  const lakeItems = actual.lake.map((row): FDICCoverageManifestItem => ({
    dataset: 'sod',
    partition_key: row.partition_key,
    storage_layer: 'r2',
    publication_run_id: null,
    source_total: row.source_total,
    row_count: row.row_count,
    object_key: row.object_key,
    manifest_key: row.manifest_key,
    object_sha256: row.object_sha256,
    compressed_bytes: row.compressed_bytes,
    is_current_snapshot: row.is_current_snapshot
  }));
  return [...publicationItems, ...lakeItems].sort((left, right) =>
    `${left.dataset}:${left.partition_key}:${left.storage_layer}`
      .localeCompare(`${right.dataset}:${right.partition_key}:${right.storage_layer}`)
  );
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function manifestHash(bounds: FDICCoverageBounds, items: FDICCoverageManifestItem[]): Promise<string> {
  return sha256(JSON.stringify({ version: FDIC_COVERAGE_MANIFEST_VERSION, bounds, items }));
}

async function verifyR2Objects(bucket: R2Bucket, items: FDICCoverageManifestItem[]): Promise<number> {
  let checked = 0;
  for (const item of items.filter((candidate) => candidate.storage_layer === 'r2')) {
    const object = item.object_key ? await bucket.head(item.object_key) : null;
    checked++;
    if (!object) throw new FDICCoverageError([`R2 object is missing for SOD ${item.partition_key}`]);
    if (item.compressed_bytes !== object.size) {
      throw new FDICCoverageError([`R2 object size mismatch for SOD ${item.partition_key}`]);
    }
    const sidecar = item.manifest_key ? await bucket.head(item.manifest_key) : null;
    checked++;
    if (!sidecar) throw new FDICCoverageError([`R2 manifest is missing for SOD ${item.partition_key}`]);
  }
  return checked;
}

async function persistManifest(
  db: D1Database,
  runId: string,
  hash: string,
  bounds: FDICCoverageBounds,
  items: FDICCoverageManifestItem[],
  sourceObservedAt: string,
  auditedAt: string
): Promise<void> {
  const payload = JSON.stringify(items);
  await db.batch([
    db.prepare(`
      INSERT INTO fdic_coverage_manifests (
        run_id, manifest_version, manifest_sha256,
        annual_cb_first, annual_cb_latest, annual_si_first, annual_si_latest,
        history_first, history_latest, locations_snapshot, sod_first, sod_latest,
        item_count, source_observed_at, audited_at
      ) VALUES (?, 1, ?, 1934, ?, 1984, ?, 1900, ?, ?, 1994, ?, ?, ?, ?)
      ON CONFLICT(run_id) DO UPDATE SET
        manifest_sha256 = excluded.manifest_sha256,
        annual_cb_latest = excluded.annual_cb_latest,
        annual_si_latest = excluded.annual_si_latest,
        history_latest = excluded.history_latest,
        locations_snapshot = excluded.locations_snapshot,
        sod_latest = excluded.sod_latest,
        item_count = excluded.item_count,
        source_observed_at = excluded.source_observed_at,
        audited_at = excluded.audited_at
    `).bind(
      runId, hash, bounds.annualCbLatest, bounds.annualSiLatest,
      bounds.historyLatest, bounds.locationsSnapshot, bounds.sodLatest,
      items.length, sourceObservedAt, auditedAt
    ),
    db.prepare('DELETE FROM fdic_coverage_manifest_items WHERE run_id = ?').bind(runId),
    db.prepare(`
      INSERT INTO fdic_coverage_manifest_items (
        run_id, dataset, partition_key, storage_layer, publication_run_id,
        source_total, row_count, object_key, manifest_key, object_sha256,
        compressed_bytes, is_current_snapshot
      )
      SELECT ?,
             json_extract(value, '$.dataset'), json_extract(value, '$.partition_key'),
             json_extract(value, '$.storage_layer'), json_extract(value, '$.publication_run_id'),
             json_extract(value, '$.source_total'), json_extract(value, '$.row_count'),
             json_extract(value, '$.object_key'), json_extract(value, '$.manifest_key'),
             json_extract(value, '$.object_sha256'), json_extract(value, '$.compressed_bytes'),
             json_extract(value, '$.is_current_snapshot')
      FROM json_each(?) WHERE json_type(value) = 'object'
    `).bind(runId, payload)
  ]);
}

export async function discoverFDICCoverageBounds(
  fetcher: typeof fetch = fetch,
  now = new Date()
): Promise<FDICCoverageBounds> {
  const [annualCbLatest, annualSiLatest, sourceHistoryLatest, locationsSnapshot, sodLatest] =
    await Promise.all([
      discoverLatestAnnualYear('CB', fetcher),
      discoverLatestAnnualYear('SI', fetcher),
      discoverLatestHistoryProcessYear(fetcher),
      resolveFDICPartition('locations', 'latest', fetcher),
      discoverLatestSODYear(fetcher)
    ]);
  return {
    annualCbLatest,
    annualSiLatest,
    historyLatest: Math.max(now.getUTCFullYear(), sourceHistoryLatest),
    locationsSnapshot,
    sodLatest
  };
}

export async function auditFDICCoverage(
  db: D1Database,
  bucket: R2Bucket,
  runId: string,
  options: { fetcher?: typeof fetch; now?: Date } = {}
): Promise<FDICCoverageAuditResult> {
  const now = options.now ?? new Date();
  const bounds = await discoverFDICCoverageBounds(options.fetcher ?? fetch, now);
  const sourceObservedAt = now.toISOString();
  const actual = await readActualCoverage(db);
  const issues = validateFDICCoverage(bounds, actual);
  if (issues.length > 0) throw new FDICCoverageError(issues);
  const items = manifestItems(bounds, actual);
  const r2ObjectsChecked = await verifyR2Objects(bucket, items);
  const hash = await manifestHash(bounds, items);
  const auditedAt = new Date().toISOString();
  await persistManifest(db, runId, hash, bounds, items, sourceObservedAt, auditedAt);
  return {
    run_id: runId,
    manifest_sha256: hash,
    item_count: items.length,
    source_observed_at: sourceObservedAt,
    audited_at: auditedAt,
    bounds,
    r2_objects_checked: r2ObjectsChecked
  };
}

export async function verifyStoredFDICCoverageManifest(
  db: D1Database,
  runId: string,
  bucket?: R2Bucket
): Promise<FDICCoverageAuditResult> {
  const stored = await queryOne<StoredManifestRow>(db, `
    SELECT run_id, manifest_sha256, annual_cb_latest, annual_si_latest,
           history_latest, locations_snapshot, sod_latest, item_count,
           source_observed_at, audited_at
    FROM fdic_coverage_manifests WHERE run_id = ?
  `, [runId]);
  if (!stored) throw new FDICCoverageError([`run ${runId} has no coverage manifest`]);
  const bounds: FDICCoverageBounds = {
    annualCbLatest: stored.annual_cb_latest,
    annualSiLatest: stored.annual_si_latest,
    historyLatest: stored.history_latest,
    locationsSnapshot: stored.locations_snapshot,
    sodLatest: stored.sod_latest
  };
  const [storedItems, actual] = await Promise.all([
    queryAll<FDICCoverageManifestItem>(db, `
      SELECT dataset, partition_key, storage_layer, publication_run_id,
             source_total, row_count, object_key, manifest_key, object_sha256,
             compressed_bytes, is_current_snapshot
      FROM fdic_coverage_manifest_items WHERE run_id = ?
      ORDER BY dataset, partition_key, storage_layer
    `, [runId]),
    readActualCoverage(db)
  ]);
  const issues = validateFDICCoverage(bounds, actual);
  const currentItems = manifestItems(bounds, actual);
  const [storedHash, currentHash] = await Promise.all([
    manifestHash(bounds, storedItems),
    manifestHash(bounds, currentItems)
  ]);
  if (stored.item_count !== storedItems.length || stored.item_count !== currentItems.length) {
    issues.push('coverage manifest item count changed');
  }
  if (storedHash !== currentHash) {
    issues.push('coverage manifest no longer matches the live publication registries');
  }
  if (storedHash !== stored.manifest_sha256) issues.push('stored coverage manifest items failed hash verification');
  if (currentHash !== stored.manifest_sha256) issues.push('coverage manifest hash changed');
  if (issues.length > 0) throw new FDICCoverageError(issues);
  const r2ObjectsChecked = bucket ? await verifyR2Objects(bucket, currentItems) : 0;
  return {
    run_id: runId,
    manifest_sha256: stored.manifest_sha256,
    item_count: stored.item_count,
    source_observed_at: stored.source_observed_at,
    audited_at: stored.audited_at,
    bounds,
    r2_objects_checked: r2ObjectsChecked
  };
}
