-- Migration: 0024_release_attestations
-- Description: Persist the expensive publish-time verification result so the
-- public readiness check uses only primary-key and singleton reads.

CREATE TABLE release_attestations (
  generation TEXT PRIMARY KEY,
  release TEXT NOT NULL CHECK (
    length(release) = 8
    AND release NOT GLOB '*[^0-9]*'
  ),
  run_id TEXT NOT NULL,
  schema_version TEXT NOT NULL,
  coverage_manifest_sha256 TEXT NOT NULL CHECK (
    length(coverage_manifest_sha256) = 64
    AND coverage_manifest_sha256 NOT GLOB '*[^0-9a-f]*'
  ),
  coverage_item_count INTEGER NOT NULL CHECK (coverage_item_count > 0),
  financial_history_start TEXT NOT NULL CHECK (
    length(financial_history_start) = 8
    AND financial_history_start NOT GLOB '*[^0-9]*'
  ),
  financial_row_count INTEGER NOT NULL CHECK (financial_row_count > 0),
  attested_at TEXT NOT NULL,
  UNIQUE (release, generation),
  FOREIGN KEY (run_id) REFERENCES fdic_coverage_manifests(run_id)
) WITHOUT ROWID;

CREATE INDEX idx_release_attestations_run
  ON release_attestations(run_id);

-- Attestations are append-only. A release retry reuses a committed row only
-- after the bounded readiness join verifies it; it never edits verification.
CREATE TRIGGER release_attestations_no_update
BEFORE UPDATE ON release_attestations
BEGIN
  SELECT RAISE(ABORT, 'release attestations are immutable');
END;

CREATE TRIGGER release_attestations_no_delete
BEFORE DELETE ON release_attestations
BEGIN
  SELECT RAISE(ABORT, 'release attestations are immutable');
END;

INSERT INTO pipeline_state (key, value, updated_at)
VALUES ('schema_version', '0024', CURRENT_TIMESTAMP)
ON CONFLICT(key) DO UPDATE SET
  value = excluded.value,
  updated_at = excluded.updated_at;
