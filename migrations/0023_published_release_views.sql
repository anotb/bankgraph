-- Keep the last elected quarterly release queryable while a routine refresh
-- builds a newer candidate in the same database.  Every public quarterly read
-- goes through these views; pipeline writers continue to use the base tables.

CREATE VIEW published_financials AS
SELECT financials.*
FROM financials
JOIN release_control ON release_control.singleton = 1
WHERE release_control.release IS NOT NULL
  AND financials.repdte <= release_control.release;

CREATE VIEW published_peer_stats AS
SELECT peer_stats.*
FROM peer_stats
JOIN release_control ON release_control.singleton = 1
WHERE release_control.release IS NOT NULL
  AND peer_stats.repdte <= release_control.release;

CREATE VIEW published_agg_industry AS
SELECT agg_industry.*
FROM agg_industry
JOIN release_control ON release_control.singleton = 1
WHERE release_control.release IS NOT NULL
  AND agg_industry.repdte <= release_control.release;

CREATE VIEW published_bank_trends AS
SELECT bank_trends.*
FROM bank_trends
JOIN release_control ON release_control.singleton = 1
WHERE release_control.release IS NOT NULL
  AND bank_trends.repdte <= release_control.release;

CREATE VIEW published_anomalies AS
SELECT anomalies.*
FROM anomalies
JOIN release_control ON release_control.singleton = 1
WHERE release_control.release IS NOT NULL
  AND anomalies.repdte <= release_control.release;

CREATE VIEW published_risk_scores AS
SELECT risk_scores.*
FROM risk_scores
JOIN release_control ON release_control.singleton = 1
WHERE release_control.release IS NOT NULL
  AND risk_scores.repdte <= release_control.release;

-- Institution identity and branch metadata remain current.  The financial
-- snapshot is projected from the elected release instead of the in-place
-- snapshot columns being rebuilt by the pipeline.
CREATE VIEW published_institutions AS
SELECT
  institution.cert,
  institution.rssd_id,
  institution.name,
  institution.city,
  institution.state,
  institution.zip,
  institution.county,
  institution.charter_class,
  institution.regulator,
  institution.active,
  institution.established_date,
  institution.insured_date,
  institution.holding_company,
  institution.hc_rssd_id,
  CASE
    WHEN financial.asset IS NULL THEN NULL
    WHEN financial.asset < 100000 THEN 1
    WHEN financial.asset < 300000 THEN 2
    WHEN financial.asset < 1000000 THEN 3
    WHEN financial.asset < 10000000 THEN 4
    WHEN financial.asset < 50000000 THEN 5
    WHEN financial.asset < 250000000 THEN 6
    ELSE 7
  END AS asset_tier,
  financial.asset AS total_assets,
  financial.dep AS total_deposits,
  institution.num_branches,
  financial.numemp AS num_employees,
  financial.repdte AS latest_repdte,
  financial.roa AS latest_roa,
  financial.roe AS latest_roe,
  financial.nimy AS latest_nim,
  financial.nclnlsr AS latest_npl_ratio,
  financial.rbc1rwaj AS latest_tier1_ratio,
  institution.source_run_id,
  institution.source_retrieved_at,
  institution.source_snapshot
FROM institutions AS institution
JOIN release_control ON release_control.singleton = 1
LEFT JOIN financials AS financial
  ON financial.cert = institution.cert
 AND financial.repdte = release_control.release
WHERE release_control.release IS NOT NULL;

INSERT INTO pipeline_state (key, value, updated_at)
VALUES ('schema_version', '0023', CURRENT_TIMESTAMP)
ON CONFLICT(key) DO UPDATE SET
  value = excluded.value,
  updated_at = excluded.updated_at;
