-- Re-key Failures & Assistance rows by the FDIC API's stable ID. Certificate
-- numbers identify institutions, not transactions: some source rows have no
-- certificate and one certificate can appear in more than one source row.

CREATE TABLE failures_v2 (
  source_id TEXT PRIMARY KEY NOT NULL, -- FDIC failures API ID
  cert INTEGER,
  name TEXT,
  city TEXT,
  state TEXT,
  fail_date TEXT,                     -- YYYYMMDD
  transaction_type TEXT CHECK (transaction_type IN ('FAILURE', 'ASSISTANCE') OR transaction_type IS NULL), -- RESTYPE
  resolution_type TEXT,               -- RESTYPE1
  insurance_fund TEXT,                -- SAVR
  acquiring_institution TEXT,         -- BIDNAME
  cost INTEGER,                       -- FDIC estimated loss, USD thousands
  total_deposits INTEGER,             -- USD thousands
  total_assets INTEGER                -- USD thousands
);

-- Preserve the old snapshot until a successful failures sync replaces these
-- legacy rows with source-ID-keyed records. The earlier importer stored SAVR
-- in acquiring_institution, so retain it as insurance_fund and do not present
-- it as an acquirer. RESTYPE and RESTYPE1 were not stored in the old schema and
-- cannot be reconstructed honestly.
INSERT INTO failures_v2 (
  source_id,
  cert,
  name,
  city,
  state,
  fail_date,
  transaction_type,
  resolution_type,
  insurance_fund,
  acquiring_institution,
  cost,
  total_deposits,
  total_assets
)
SELECT
  'legacy-cert:' || cert,
  cert,
  name,
  city,
  state,
  fail_date,
  NULL,
  NULL,
  acquiring_institution,
  NULL,
  cost,
  total_deposits,
  total_assets
FROM failures;

DROP TABLE failures;
ALTER TABLE failures_v2 RENAME TO failures;

CREATE INDEX idx_failures_cert ON failures(cert);
CREATE INDEX idx_failures_fail_date ON failures(fail_date DESC);
CREATE INDEX idx_failures_transaction_date
  ON failures(transaction_type, fail_date DESC);
