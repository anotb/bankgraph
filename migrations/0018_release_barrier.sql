-- Strong publication barrier and per-run completion ledger.
--
-- Workers KV remains a best-effort response cache. D1 is the authoritative
-- release gate because its writes are serialized at the primary database.

CREATE TABLE release_control (
  singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
  state TEXT NOT NULL CHECK (state IN ('unpublished', 'refreshing', 'ready')),
  release TEXT,
  generation TEXT,
  pending_release TEXT,
  pending_generation TEXT,
  pending_run_id TEXT,
  updated_at TEXT NOT NULL
);

INSERT INTO release_control (
  singleton, state, release, generation,
  pending_release, pending_generation, pending_run_id, updated_at
) VALUES (1, 'unpublished', NULL, NULL, NULL, NULL, NULL, CURRENT_TIMESTAMP);

CREATE TABLE pipeline_run_stages (
  run_id TEXT NOT NULL,
  stage TEXT NOT NULL,
  scope TEXT NOT NULL DEFAULT '',
  completed_at TEXT NOT NULL,
  PRIMARY KEY (run_id, stage, scope)
) WITHOUT ROWID;

CREATE INDEX idx_pipeline_run_stages_completed
  ON pipeline_run_stages(completed_at);

INSERT INTO pipeline_state (key, value, updated_at)
VALUES ('schema_version', '0018', CURRENT_TIMESTAMP)
ON CONFLICT(key) DO UPDATE SET
  value = excluded.value,
  updated_at = excluded.updated_at;
