-- Migration: 0020_sod_lakehouse
-- Description: Register immutable R2 SOD partitions and retain only the
-- compact historical rollups plus the current branch snapshot in D1.

CREATE TABLE fdic_lake_partitions (
  dataset TEXT NOT NULL,
  partition_key TEXT NOT NULL,
  layout_version INTEGER NOT NULL CHECK (layout_version >= 1),
  object_key TEXT NOT NULL UNIQUE,
  manifest_key TEXT NOT NULL UNIQUE,
  object_sha256 TEXT NOT NULL CHECK (
    length(object_sha256) = 64
    AND object_sha256 NOT GLOB '*[^0-9a-f]*'
  ),
  source_endpoint TEXT NOT NULL,
  source_query_json TEXT NOT NULL CHECK (json_valid(source_query_json)),
  source_total INTEGER NOT NULL CHECK (source_total >= 0),
  row_count INTEGER NOT NULL CHECK (row_count >= 0),
  compressed_bytes INTEGER NOT NULL CHECK (compressed_bytes > 0),
  field_count INTEGER NOT NULL CHECK (field_count > 0),
  key_first TEXT,
  key_last TEXT,
  retrieved_at TEXT NOT NULL,
  published_at TEXT NOT NULL,
  is_current_snapshot INTEGER NOT NULL DEFAULT 0 CHECK (is_current_snapshot IN (0, 1)),
  PRIMARY KEY (dataset, partition_key)
) WITHOUT ROWID;

CREATE UNIQUE INDEX idx_fdic_lake_current_snapshot
  ON fdic_lake_partitions(dataset)
  WHERE is_current_snapshot = 1;
CREATE INDEX idx_fdic_lake_retrieved
  ON fdic_lake_partitions(dataset, retrieved_at DESC);

-- Aggregate rows are revision-keyed. The current fdic_lake_partitions pointer
-- is written only after every aggregate has landed, so a failed publication
-- cannot expose a half-written refresh. Old revisions may then be pruned.
CREATE TABLE sod_state_year (
  year INTEGER NOT NULL,
  state TEXT NOT NULL,
  branch_count INTEGER NOT NULL,
  bank_count INTEGER NOT NULL,
  total_deposits INTEGER NOT NULL,
  source_sha256 TEXT NOT NULL,
  PRIMARY KEY (year, state, source_sha256)
) WITHOUT ROWID;

CREATE TABLE sod_county_year (
  year INTEGER NOT NULL,
  state TEXT NOT NULL,
  county_fips TEXT NOT NULL,
  county_name TEXT,
  branch_count INTEGER NOT NULL,
  bank_count INTEGER NOT NULL,
  total_deposits INTEGER NOT NULL,
  source_sha256 TEXT NOT NULL,
  PRIMARY KEY (year, state, county_fips, source_sha256)
) WITHOUT ROWID;

CREATE TABLE sod_bank_year (
  year INTEGER NOT NULL,
  cert INTEGER NOT NULL,
  branch_count INTEGER NOT NULL,
  main_office_count INTEGER NOT NULL,
  state_count INTEGER NOT NULL,
  county_count INTEGER NOT NULL,
  total_deposits INTEGER NOT NULL,
  source_sha256 TEXT NOT NULL,
  PRIMARY KEY (year, cert, source_sha256)
) WITHOUT ROWID;

CREATE INDEX idx_sod_state_year_current
  ON sod_state_year(year, source_sha256, total_deposits DESC, state);
CREATE INDEX idx_sod_county_year_current
  ON sod_county_year(year, source_sha256, state, total_deposits DESC, county_fips);
CREATE INDEX idx_sod_bank_year_current
  ON sod_bank_year(year, source_sha256, total_deposits DESC, cert);
CREATE INDEX idx_sod_bank_cert_history
  ON sod_bank_year(cert, year DESC, source_sha256);

-- Migration 0019 owns the bounded, versioned SOD publication. This view
-- resolves that hot table to the one R2 partition marked as the current
-- snapshot; raw historical branch-year records never need to enter D1.
CREATE VIEW sod_latest_branches AS
SELECT
  s.uninumbr, s.year, s.cert, s.namebr, s.citybr, s.stalpbr, s.zipbr,
  s.cntynumb, s.cntynamb, s.depsumbr, s.depdom, s.asset,
  s.latitude, s.longitude, s.brsertyp, s.mainoff,
  s.source_run_id, s.source_retrieved_at
FROM sod AS s
JOIN fdic_lake_partitions AS lake
  ON lake.dataset = 'sod'
 AND lake.is_current_snapshot = 1
 AND lake.partition_key = CAST(s.year AS TEXT)
JOIN fdic_dataset_publications AS publication
  ON publication.dataset = 'sod'
 AND publication.partition_key = lake.partition_key
 AND publication.run_id = s.source_run_id;

CREATE INDEX idx_sod_run_coordinates
  ON sod(source_run_id, latitude, longitude, uninumbr);
CREATE INDEX idx_sod_run_name
  ON sod(source_run_id, namebr COLLATE NOCASE, stalpbr, citybr, uninumbr);
CREATE INDEX idx_sod_year_cleanup
  ON sod(year, source_run_id, uninumbr);

INSERT INTO pipeline_state (key, value, updated_at)
VALUES ('schema_version', '0020', CURRENT_TIMESTAMP)
ON CONFLICT(key) DO UPDATE SET
  value = excluded.value,
  updated_at = excluded.updated_at;
