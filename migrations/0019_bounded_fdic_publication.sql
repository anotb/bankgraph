-- Migration: 0019_bounded_fdic_publication
-- Description: Keep a published SOD/location version readable while the next
-- large partition is materialized, reconciled, and cleaned in bounded chunks.

ALTER TABLE sod RENAME TO sod_unversioned;

CREATE TABLE sod (
  uninumbr INTEGER NOT NULL,
  year INTEGER NOT NULL,
  cert INTEGER NOT NULL,
  namebr TEXT,
  citybr TEXT,
  stalpbr TEXT,
  zipbr TEXT,
  cntynumb INTEGER,
  cntynamb TEXT,
  depsumbr INTEGER,
  depdom INTEGER,
  asset INTEGER,
  latitude REAL,
  longitude REAL,
  brsertyp INTEGER,
  mainoff INTEGER,
  source_run_id TEXT NOT NULL,
  source_retrieved_at TEXT,
  PRIMARY KEY (source_run_id, uninumbr, year)
) WITHOUT ROWID;

INSERT INTO sod (
  uninumbr, year, cert, namebr, citybr, stalpbr, zipbr, cntynumb,
  cntynamb, depsumbr, depdom, asset, latitude, longitude, brsertyp,
  mainoff, source_run_id, source_retrieved_at
)
SELECT
  uninumbr, year, cert, namebr, citybr, stalpbr, zipbr, cntynumb,
  cntynamb, depsumbr, depdom, asset, latitude, longitude, brsertyp,
  mainoff, COALESCE(source_run_id, 'legacy:sod:' || year),
  source_retrieved_at
FROM sod_unversioned;

DROP TABLE sod_unversioned;
CREATE INDEX idx_sod_run_year_key ON sod(source_run_id, year, uninumbr);
CREATE INDEX idx_sod_cert_year ON sod(source_run_id, cert, year);
CREATE INDEX idx_sod_state_year_dep ON sod(source_run_id, stalpbr, year, depsumbr DESC);
CREATE INDEX idx_sod_county_year_dep ON sod(source_run_id, cntynumb, year, depsumbr DESC);

ALTER TABLE locations RENAME TO locations_unversioned;

CREATE TABLE locations (
  uninum INTEGER NOT NULL,
  cert INTEGER NOT NULL,
  name TEXT,
  offname TEXT,
  address TEXT,
  city TEXT,
  stalp TEXT,
  zip TEXT,
  county TEXT,
  stcnty TEXT,
  servtype INTEGER,
  servtype_desc TEXT,
  mainoff INTEGER,
  latitude REAL,
  longitude REAL,
  estymd TEXT,
  cbsa TEXT,
  rundate TEXT,
  source_run_id TEXT NOT NULL,
  source_retrieved_at TEXT,
  source_snapshot TEXT,
  PRIMARY KEY (source_run_id, uninum)
) WITHOUT ROWID;

INSERT INTO locations (
  uninum, cert, name, offname, address, city, stalp, zip, county,
  stcnty, servtype, servtype_desc, mainoff, latitude, longitude,
  estymd, cbsa, rundate, source_run_id, source_retrieved_at,
  source_snapshot
)
SELECT
  uninum, cert, name, offname, address, city, stalp, zip, county,
  stcnty, servtype, servtype_desc, mainoff, latitude, longitude,
  estymd, cbsa, rundate,
  COALESCE(source_run_id, 'legacy:locations:' || COALESCE(source_snapshot, rundate, 'unknown')),
  source_retrieved_at, source_snapshot
FROM locations_unversioned;

DROP TABLE locations_unversioned;
CREATE INDEX idx_loc_run_key ON locations(source_run_id, uninum);
CREATE INDEX idx_loc_cert ON locations(source_run_id, cert);
CREATE INDEX idx_loc_state ON locations(source_run_id, stalp, uninum);
CREATE INDEX idx_loc_latlng ON locations(source_run_id, latitude, longitude);
CREATE INDEX idx_loc_source_snapshot ON locations(source_snapshot, source_run_id, uninum);

ALTER TABLE fdic_ingest_partitions ADD COLUMN publication_phase TEXT
  CHECK (publication_phase IS NULL OR publication_phase IN (
    'materialize', 'compare', 'switch', 'cleanup-old', 'cleanup-stage', 'complete'
  ));
ALTER TABLE fdic_ingest_partitions ADD COLUMN publication_cursor TEXT;
ALTER TABLE fdic_ingest_partitions ADD COLUMN previous_run_id TEXT;
ALTER TABLE fdic_ingest_partitions ADD COLUMN rows_materialized INTEGER NOT NULL DEFAULT 0;

ALTER TABLE fdic_ingest_runs ADD COLUMN publication_phase TEXT;
ALTER TABLE fdic_ingest_runs ADD COLUMN previous_run_id TEXT;
ALTER TABLE fdic_ingest_runs ADD COLUMN rows_materialized INTEGER NOT NULL DEFAULT 0;

INSERT INTO pipeline_state (key, value, updated_at)
VALUES ('schema_version', '0019', CURRENT_TIMESTAMP)
ON CONFLICT(key) DO UPDATE SET
  value = excluded.value,
  updated_at = excluded.updated_at;
