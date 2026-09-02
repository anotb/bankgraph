-- Production readiness and publication state.
-- A pipeline run writes published_release only after every public dataset for
-- the quarter has finished. The schema marker lets /api/v1/ready detect a
-- partially migrated database without exposing migration internals.

INSERT INTO pipeline_state (key, value, updated_at)
VALUES ('schema_version', '0014', CURRENT_TIMESTAMP)
ON CONFLICT(key) DO UPDATE SET
  value = excluded.value,
  updated_at = excluded.updated_at;
