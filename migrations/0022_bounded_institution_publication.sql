-- Migration: 0022_bounded_institution_publication
-- Description: Support resumable institution snapshot publication without a
-- quadratic JSON stale-key comparison or one unbounded typed-table write.

CREATE INDEX IF NOT EXISTS idx_inst_source_run_cert
  ON institutions(source_run_id, cert);

INSERT INTO pipeline_state (key, value, updated_at)
VALUES ('schema_version', '0022', CURRENT_TIMESTAMP)
ON CONFLICT(key) DO UPDATE SET
  value = excluded.value,
  updated_at = excluded.updated_at;
