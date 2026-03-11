-- Migration: 0001_initial_schema
-- Description: Create Phase 1 tables (institutions, failures, pipeline_state)

-- Institution master record (~27,800 rows)
-- Sourced from FDIC BankFind API
CREATE TABLE institutions (
  cert INTEGER PRIMARY KEY,
  rssd_id INTEGER,
  name TEXT NOT NULL,
  city TEXT,
  state TEXT,
  zip TEXT,
  county TEXT,
  charter_class TEXT,          -- NM, N, SB, SM
  regulator TEXT,              -- OCC, FDIC, FRB
  active INTEGER DEFAULT 1,
  established_date TEXT,       -- YYYYMMDD or ISO
  insured_date TEXT,           -- YYYYMMDD or ISO
  holding_company TEXT,
  hc_rssd_id INTEGER,
  asset_tier INTEGER,          -- 1=<100M, 2=100M-300M, 3=300M-1B, 4=1B-10B, 5=10B-50B, 6=50B-250B, 7=>250B
  total_assets INTEGER,        -- latest, for fast sorting
  total_deposits INTEGER,
  num_branches INTEGER,
  num_employees INTEGER,
  latest_repdte TEXT,          -- YYYYMMDD reporting date
  latest_roa REAL,
  latest_roe REAL,
  latest_nim REAL,
  latest_npl_ratio REAL,
  latest_tier1_ratio REAL
);

CREATE INDEX idx_inst_state ON institutions(state);
CREATE INDEX idx_inst_name ON institutions(name);
CREATE INDEX idx_inst_assets ON institutions(total_assets DESC);
CREATE INDEX idx_inst_tier ON institutions(asset_tier);
CREATE INDEX idx_inst_active ON institutions(active);

-- Bank failures (~4,100 rows)
-- Sourced from FDIC BankFind failures API
CREATE TABLE failures (
  cert INTEGER PRIMARY KEY,
  name TEXT,
  city TEXT,
  state TEXT,
  fail_date TEXT,              -- YYYYMMDD or ISO
  acquiring_institution TEXT,
  cost INTEGER,
  total_deposits INTEGER,
  total_assets INTEGER
);

-- Pipeline state tracking
-- Stores ETL pipeline metadata (last run times, row counts, etc.)
CREATE TABLE pipeline_state (
  key TEXT PRIMARY KEY,
  value TEXT,
  updated_at TEXT              -- ISO timestamp
);
