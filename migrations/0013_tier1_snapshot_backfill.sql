-- Repair the institutions summary so latest_tier1_ratio is sourced from
-- BankFind Financials field RBC1RWAJ (Tier 1 risk-based capital ratio), not
-- RBCRWAJ (total risk-based capital ratio). Future snapshot syncs use RBC1RWAJ.
UPDATE institutions
SET latest_tier1_ratio = (
  SELECT financials.rbc1rwaj
  FROM financials
  WHERE financials.cert = institutions.cert
  ORDER BY REPLACE(financials.repdte, '-', '') DESC
  LIMIT 1
),
latest_repdte = (
  SELECT financials.repdte
  FROM financials
  WHERE financials.cert = institutions.cert
  ORDER BY REPLACE(financials.repdte, '-', '') DESC
  LIMIT 1
)
WHERE EXISTS (
    SELECT 1
    FROM financials
    WHERE financials.cert = institutions.cert
  );

-- Preserve distinct provenance timestamps for existing deployments. The
-- snapshot stage will maintain these keys on each future refresh.
INSERT OR REPLACE INTO pipeline_state (key, value, updated_at)
SELECT 'financials_source_as_of', value, updated_at
FROM pipeline_state
WHERE key = 'financials_last_sync';

INSERT OR REPLACE INTO pipeline_state (key, value, updated_at)
SELECT 'financials_retrieved_at', updated_at, updated_at
FROM pipeline_state
WHERE key = 'financials_last_sync' AND updated_at IS NOT NULL;
