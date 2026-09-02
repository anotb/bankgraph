-- Migration: 0008_showcase_datasets
-- Description: Tables for the showcase data foundation:
--   annual_summary (FDIC /summary, 1934+), sod (Summary of Deposits, 1994+),
--   locations (branch offices with lat/lng), history_events (structure change/M&A),
--   sync_state (resumable backfill checkpoints).

-- Annual industry aggregates by year x state, back to 1934.
-- Natural key: (stalp, year). scope='USA' is the national aggregate row.
CREATE TABLE annual_summary (
  stalp TEXT NOT NULL,             -- state code or 'USA' (national)
  year INTEGER NOT NULL,
  asset INTEGER,                   -- total deposits/assets in thousands
  dep INTEGER,
  eq INTEGER,
  netinc INTEGER,
  nim INTEGER,
  nonii INTEGER,
  nonix INTEGER,
  elnatr INTEGER,
  intinc INTEGER,
  eintexp INTEGER,
  banks INTEGER,                   -- number of institutions
  branches INTEGER,                -- number of branches
  numemp INTEGER,
  lnlsnet INTEGER,
  lnre INTEGER,
  lnci INTEGER,
  lncon INTEGER,
  sec INTEGER,
  nclnls INTEGER,                  -- non-current loans
  lnatres INTEGER,                 -- loan loss allowance
  charter_type TEXT,               -- CB (commercial) or SA (savings); 'CB' preferred when both exist
  PRIMARY KEY (stalp, year)
) WITHOUT ROWID;
CREATE INDEX idx_annual_year ON annual_summary(year);

-- Summary of Deposits branch-level deposits (annual, 1994+).
-- Natural key: (uninumbr, year).
CREATE TABLE sod (
  uninumbr INTEGER NOT NULL,       -- branch unique id
  year INTEGER NOT NULL,
  cert INTEGER NOT NULL,
  namebr TEXT,                     -- branch name
  citybr TEXT,
  stalpbr TEXT,
  zipbr TEXT,
  cntynumb INTEGER,                -- county FIPS
  cntynamb TEXT,
  depsumbr INTEGER,                -- branch deposits (thousands)
  depdom INTEGER,                  -- bank domestic deposits
  asset INTEGER,                   -- institution assets
  latitude REAL,
  longitude REAL,
  brsertyp INTEGER,                -- branch service type code
  mainoff INTEGER,                 -- 1 if main office
  PRIMARY KEY (uninumbr, year)
) WITHOUT ROWID;
CREATE INDEX idx_sod_cert_year ON sod(cert, year);
CREATE INDEX idx_sod_state_year_dep ON sod(stalpbr, year, depsumbr DESC);
CREATE INDEX idx_sod_county_year_dep ON sod(cntynumb, year, depsumbr DESC);

-- Branch offices with lat/lng (FDIC /locations, current snapshot).
-- Natural key: uninum.
CREATE TABLE locations (
  uninum INTEGER PRIMARY KEY,
  cert INTEGER NOT NULL,
  name TEXT,                       -- institution name
  offname TEXT,                    -- branch name
  address TEXT,
  city TEXT,
  stalp TEXT,
  zip TEXT,
  county TEXT,
  stcnty TEXT,                     -- state+county FIPS
  servtype INTEGER,                -- service type code
  servtype_desc TEXT,
  mainoff INTEGER,                 -- 1 if main office
  latitude REAL,
  longitude REAL,
  estymd TEXT,                     -- established date (MM/DD/YYYY)
  cbsa TEXT,
  rundate TEXT                     -- FDIC snapshot run date
);
CREATE INDEX idx_loc_cert ON locations(cert);
CREATE INDEX idx_loc_state ON locations(stalp);
CREATE INDEX idx_loc_latlng ON locations(latitude, longitude);

-- Structure-change / M&A events (FDIC /history).
-- Natural key: fdic id (stable hash string from the API).
CREATE TABLE history_events (
  id TEXT PRIMARY KEY,             -- FDIC event id (e.g. '2023001518_223_1595_74673_1595')
  cert INTEGER NOT NULL,
  uninum INTEGER,
  event_date TEXT,                 -- effective date YYYYMMDD
  change_code INTEGER,             -- FDIC CHANGECODE
  change_desc TEXT,                -- FDIC CHANGECODE_DESC
  org_role TEXT,                   -- 'FI' institution-level, 'BR' branch-level
  inst_name TEXT,
  acq_cert INTEGER,                -- acquirer cert (merger events)
  acq_name TEXT,                   -- acquirer name (SUR_INSTNAME)
  transnum INTEGER,                -- FDIC transaction number
  proc_year INTEGER,
  out_cert INTEGER,                -- cert of the disappearing entity
  out_name TEXT                    -- name of the disappearing entity
);
CREATE INDEX idx_hist_cert ON history_events(cert);
CREATE INDEX idx_hist_date ON history_events(event_date);
CREATE INDEX idx_hist_code ON history_events(change_code);

-- Resumable sync checkpoints: one row per dataset (and per chunk where useful).
CREATE TABLE sync_state (
  dataset TEXT NOT NULL,
  checkpoint TEXT,                 -- dataset-specific cursor (offset, year, quarter, etc.)
  status TEXT DEFAULT 'idle',      -- idle | running | complete | error
  rows_processed INTEGER DEFAULT 0,
  updated_at TEXT,
  PRIMARY KEY (dataset)
) WITHOUT ROWID;
