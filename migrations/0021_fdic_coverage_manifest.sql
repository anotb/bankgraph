-- Migration: 0021_fdic_coverage_manifest
-- Description: Bind strict publication to an explicit, run-scoped manifest of
-- every required extended FDIC partition and its authoritative storage layer.

CREATE TABLE fdic_coverage_manifests (
  run_id TEXT PRIMARY KEY,
  manifest_version INTEGER NOT NULL CHECK (manifest_version = 1),
  manifest_sha256 TEXT NOT NULL CHECK (
    length(manifest_sha256) = 64
    AND manifest_sha256 NOT GLOB '*[^0-9a-f]*'
  ),
  annual_cb_first INTEGER NOT NULL CHECK (annual_cb_first = 1934),
  annual_cb_latest INTEGER NOT NULL CHECK (annual_cb_latest >= annual_cb_first),
  annual_si_first INTEGER NOT NULL CHECK (annual_si_first = 1984),
  annual_si_latest INTEGER NOT NULL CHECK (annual_si_latest >= annual_si_first),
  history_first INTEGER NOT NULL CHECK (history_first = 1900),
  history_latest INTEGER NOT NULL CHECK (history_latest >= history_first),
  locations_snapshot TEXT NOT NULL,
  sod_first INTEGER NOT NULL CHECK (sod_first = 1994),
  sod_latest INTEGER NOT NULL CHECK (sod_latest >= sod_first),
  item_count INTEGER NOT NULL CHECK (item_count > 0),
  source_observed_at TEXT NOT NULL,
  audited_at TEXT NOT NULL
) WITHOUT ROWID;

CREATE INDEX idx_fdic_coverage_manifest_sha
  ON fdic_coverage_manifests(manifest_sha256);
CREATE INDEX idx_fdic_coverage_manifest_audited
  ON fdic_coverage_manifests(audited_at DESC);

CREATE TABLE fdic_coverage_manifest_items (
  run_id TEXT NOT NULL,
  dataset TEXT NOT NULL CHECK (dataset IN ('annual-summary', 'history', 'locations', 'sod')),
  partition_key TEXT NOT NULL,
  storage_layer TEXT NOT NULL CHECK (storage_layer IN ('d1', 'r2', 'hot')),
  publication_run_id TEXT,
  source_total INTEGER NOT NULL CHECK (source_total >= 0),
  row_count INTEGER NOT NULL CHECK (row_count >= 0),
  object_key TEXT,
  manifest_key TEXT,
  object_sha256 TEXT,
  compressed_bytes INTEGER,
  is_current_snapshot INTEGER NOT NULL DEFAULT 0 CHECK (is_current_snapshot IN (0, 1)),
  PRIMARY KEY (run_id, dataset, partition_key, storage_layer),
  FOREIGN KEY (run_id) REFERENCES fdic_coverage_manifests(run_id) ON DELETE CASCADE
) WITHOUT ROWID;

INSERT INTO pipeline_state (key, value, updated_at)
VALUES ('schema_version', '0021', CURRENT_TIMESTAMP)
ON CONFLICT(key) DO UPDATE SET
  value = excluded.value,
  updated_at = excluded.updated_at;
