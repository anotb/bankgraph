-- Migration: 0017_history_process_year
-- Description: Align history indexes with process-year ingestion partitions.
-- Migration 0016 is already deployed and must remain immutable.

DROP INDEX IF EXISTS idx_hist_partition;
CREATE INDEX idx_hist_partition ON history_events(proc_year, id);
CREATE INDEX idx_hist_effective ON history_events(eff_year, event_date);

INSERT INTO pipeline_state (key, value, updated_at)
VALUES ('schema_version', '0017', CURRENT_TIMESTAMP)
ON CONFLICT(key) DO UPDATE SET
  value = excluded.value,
  updated_at = excluded.updated_at;
