-- Migration: 0016_extended_fdic_ingestion
-- Description: Correct the natural keys and raw identifiers for the extended
-- FDIC datasets, add row lineage, and add partition-level ingestion metadata.

-- /summary contains a commercial-bank (CB) and savings-institution (SI) row
-- for the same state and year. The original key silently collapsed the pair.
ALTER TABLE annual_summary RENAME TO annual_summary_legacy;

CREATE TABLE annual_summary (
  stalp TEXT NOT NULL,
  year INTEGER NOT NULL,
  asset INTEGER,
  dep INTEGER,
  eq INTEGER,
  netinc INTEGER,
  nim INTEGER,
  nonii INTEGER,
  nonix INTEGER,
  elnatr INTEGER,
  intinc INTEGER,
  eintexp INTEGER,
  banks INTEGER,
  branches INTEGER,
  numemp INTEGER,
  lnlsnet INTEGER,
  lnre INTEGER,
  lnci INTEGER,
  lncon INTEGER,
  sec INTEGER,
  nclnls INTEGER,
  lnatres INTEGER,
  charter_type TEXT NOT NULL CHECK (charter_type IN ('CB', 'SI')),
  source_run_id TEXT,
  source_retrieved_at TEXT,
  PRIMARY KEY (stalp, year, charter_type)
) WITHOUT ROWID;

INSERT INTO annual_summary (
  stalp, year, asset, dep, eq, netinc, nim, nonii, nonix, elnatr,
  intinc, eintexp, banks, branches, numemp, lnlsnet, lnre, lnci,
  lncon, sec, nclnls, lnatres, charter_type
)
SELECT
  stalp, year, asset, dep, eq, netinc, nim, nonii, nonix, elnatr,
  intinc, eintexp, banks, branches, numemp, lnlsnet, lnre, lnci,
  lncon, sec, nclnls, lnatres,
  CASE WHEN charter_type IN ('SI', 'SA') THEN 'SI' ELSE 'CB' END
FROM annual_summary_legacy;

DROP TABLE annual_summary_legacy;
CREATE INDEX idx_annual_year ON annual_summary(year);
CREATE INDEX idx_annual_class_year ON annual_summary(charter_type, year);

-- The FDIC /history endpoint identifies related entities by UNINUM, not by
-- certificate or name. Preserve the raw identifiers and process date exactly;
-- entity resolution is an optional downstream operation.
ALTER TABLE history_events RENAME TO history_events_legacy;

CREATE TABLE history_events (
  id TEXT PRIMARY KEY,
  cert INTEGER,
  uninum INTEGER,
  fi_uninum INTEGER,
  event_date TEXT,
  process_date TEXT,
  change_code INTEGER,
  change_desc TEXT,
  org_role TEXT,
  inst_name TEXT,
  acq_uninum INTEGER,
  out_uninum INTEGER,
  transnum INTEGER,
  eff_year INTEGER,
  proc_year INTEGER,
  source_run_id TEXT,
  source_retrieved_at TEXT
);

INSERT INTO history_events (
  id, cert, uninum, event_date, change_code, change_desc, org_role,
  inst_name, transnum, eff_year, proc_year
)
SELECT
  id, cert, uninum, event_date, change_code, change_desc, org_role,
  inst_name, transnum,
  CASE
    WHEN event_date GLOB '[0-9][0-9][0-9][0-9]*' THEN CAST(substr(event_date, 1, 4) AS INTEGER)
    WHEN event_date GLOB '[0-9][0-9]/[0-9][0-9]/[0-9][0-9][0-9][0-9]*' THEN CAST(substr(event_date, 7, 4) AS INTEGER)
    ELSE NULL
  END,
  proc_year
FROM history_events_legacy;

DROP TABLE history_events_legacy;
CREATE INDEX idx_hist_cert ON history_events(cert);
CREATE INDEX idx_hist_uninum ON history_events(uninum);
CREATE INDEX idx_hist_date ON history_events(event_date);
CREATE INDEX idx_hist_partition ON history_events(eff_year, proc_year);
CREATE INDEX idx_hist_process ON history_events(proc_year, process_date);
CREATE INDEX idx_hist_code ON history_events(change_code);

ALTER TABLE financials ADD COLUMN source_run_id TEXT;
ALTER TABLE financials ADD COLUMN source_retrieved_at TEXT;
ALTER TABLE institutions ADD COLUMN source_run_id TEXT;
ALTER TABLE institutions ADD COLUMN source_retrieved_at TEXT;
ALTER TABLE institutions ADD COLUMN source_snapshot TEXT;
ALTER TABLE sod ADD COLUMN source_run_id TEXT;
ALTER TABLE sod ADD COLUMN source_retrieved_at TEXT;
ALTER TABLE locations ADD COLUMN source_run_id TEXT;
ALTER TABLE locations ADD COLUMN source_retrieved_at TEXT;
ALTER TABLE locations ADD COLUMN source_snapshot TEXT;
CREATE INDEX idx_inst_source_snapshot ON institutions(source_snapshot, cert);
CREATE INDEX idx_loc_source_snapshot ON locations(source_snapshot, uninum);

-- One row records the audit trail for each attempt. A successful refresh is
-- immutable here even though the current checkpoint advances later.
CREATE TABLE fdic_ingest_runs (
  run_id TEXT PRIMARY KEY,
  dataset TEXT NOT NULL,
  partition_key TEXT NOT NULL,
  source_endpoint TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('running', 'reconciling', 'complete', 'error')),
  started_at TEXT NOT NULL,
  retrieved_at TEXT NOT NULL,
  completed_at TEXT,
  source_total INTEGER,
  rows_seen INTEGER NOT NULL DEFAULT 0,
  rows_published INTEGER,
  rows_deleted INTEGER NOT NULL DEFAULT 0,
  key_first TEXT,
  key_last TEXT,
  error TEXT
);
CREATE INDEX idx_fdic_runs_partition ON fdic_ingest_runs(dataset, partition_key, started_at DESC);

-- Mutable checkpoint used to resume a bounded Worker request. The checkpoint
-- is the next FDIC offset; reconciliation begins only after rows_seen equals
-- the source total reported on every page.
CREATE TABLE fdic_ingest_partitions (
  dataset TEXT NOT NULL,
  partition_key TEXT NOT NULL,
  run_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('running', 'reconciling', 'complete', 'error')),
  checkpoint INTEGER NOT NULL DEFAULT 0,
  source_total INTEGER,
  rows_seen INTEGER NOT NULL DEFAULT 0,
  rows_deleted INTEGER NOT NULL DEFAULT 0,
  key_first TEXT,
  key_last TEXT,
  retrieved_at TEXT NOT NULL,
  published_at TEXT,
  error TEXT,
  lease_token TEXT,
  lease_expires_at TEXT,
  PRIMARY KEY (dataset, partition_key),
  FOREIGN KEY (run_id) REFERENCES fdic_ingest_runs(run_id)
) WITHOUT ROWID;
CREATE INDEX idx_fdic_partitions_status ON fdic_ingest_partitions(status, dataset);

-- Pages land here before publication. Keeping the stage payload run-scoped
-- prevents a partially fetched refresh from replacing public rows.
CREATE TABLE fdic_ingest_stage (
  run_id TEXT NOT NULL,
  row_key TEXT NOT NULL,
  row_json TEXT NOT NULL,
  PRIMARY KEY (run_id, row_key),
  FOREIGN KEY (run_id) REFERENCES fdic_ingest_runs(run_id)
) WITHOUT ROWID;
CREATE INDEX idx_fdic_stage_run ON fdic_ingest_stage(run_id);

-- Public, compact coverage metadata. It changes only after a partition is
-- completely fetched and stale rows have been removed.
CREATE TABLE fdic_dataset_publications (
  dataset TEXT NOT NULL,
  partition_key TEXT NOT NULL,
  run_id TEXT NOT NULL,
  source_endpoint TEXT NOT NULL,
  source_total INTEGER NOT NULL,
  row_count INTEGER NOT NULL,
  key_first TEXT,
  key_last TEXT,
  period_min TEXT,
  period_max TEXT,
  retrieved_at TEXT NOT NULL,
  published_at TEXT NOT NULL,
  PRIMARY KEY (dataset, partition_key),
  FOREIGN KEY (run_id) REFERENCES fdic_ingest_runs(run_id)
) WITHOUT ROWID;
CREATE INDEX idx_fdic_publications_dataset ON fdic_dataset_publications(dataset, published_at DESC);

INSERT INTO pipeline_state (key, value, updated_at)
VALUES ('schema_version', '0016', CURRENT_TIMESTAMP)
ON CONFLICT(key) DO UPDATE SET
  value = excluded.value,
  updated_at = excluded.updated_at;
