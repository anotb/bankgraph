-- Migration: 0025_screenable_loan_to_deposit
-- Description: Add the release-elected FDIC LNLSDEPR value to the public
-- institution snapshot so screens can filter and sort on loan-to-deposit ratio.

DROP VIEW published_institutions;

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
  financial.lnlsdepr AS latest_loan_to_deposit_ratio,
  institution.source_run_id,
  institution.source_retrieved_at,
  institution.source_snapshot
FROM institutions AS institution
JOIN release_control ON release_control.singleton = 1
LEFT JOIN financials AS financial
  ON financial.cert = institution.cert
 AND financial.repdte = release_control.release
WHERE release_control.release IS NOT NULL;

-- This additive projection does not change the staged publication or
-- attestation contract, so the publication schema marker remains 0024.
