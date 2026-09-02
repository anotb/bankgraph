-- Deliberately synthetic records for release smoke tests. These rows never ship.

INSERT INTO institutions (
  cert, rssd_id, name, city, state, zip, charter_class, regulator, active,
  established_date, insured_date, holding_company, asset_tier, total_assets,
  total_deposits, num_branches, num_employees, latest_repdte, latest_roa,
  latest_roe, latest_nim, latest_npl_ratio, latest_tier1_ratio
) VALUES
  (900001, 900001, 'CI North Bank', 'Raleigh', 'NC', '27601', 'SM', 'FDIC', 1,
   '20000101', '20000101', NULL, 5, 12500000, 10100000, 18, 420, '20260630',
   1.21, 11.40, 3.52, 0.42, 13.80),
  (900002, 900002, 'CI South Bank', 'Atlanta', 'GA', '30303', 'N', 'OCC', 1,
   '19950101', '19950101', NULL, 5, 18400000, 15100000, 24, 610, '20260630',
   0.96, 9.80, 3.18, 0.61, 12.90);

INSERT INTO financials (
  cert, repdte, asset, dep, eq, lnlsnet, lnre, lnci, lncon, sec, netinc,
  intinc, eintexp, nim, nonii, nonix, elnatr, roa, roe, nimy, eeffr,
  rbcrwaj, rbc1rwaj, rbc1aaj, eqv, nclnlsr, lnatresr, nco_ratio,
  lnlsdepr, othbfhlb, numemp, asset_bucket
) VALUES
  (900001, '20260331', 11900000, 9700000, 1280000, 8240000, 3120000, 1760000,
   920000, 1800000, 101000, 392000, 143000, 98000, 72000, 205000, 23000,
   1.15, 10.90, 3.44, 55.20, 14.60, 13.80, 10.20, 10.76, 0.46, 1.18,
   0.19, 84.95, 170000, 408, 5),
  (900001, '20260630', 12500000, 10100000, 1340000, 8610000, 3260000, 1840000,
   960000, 1920000, 142000, 535000, 193000, 136000, 98000, 276000, 30000,
   1.21, 11.40, 3.52, 54.80, 14.80, 14.00, 10.40, 10.72, 0.42, 1.21,
   0.17, 85.25, 165000, 420, 5),
  (900002, '20260331', 17900000, 14800000, 1640000, 12100000, 4100000, 2960000,
   1380000, 2700000, 118000, 558000, 214000, 126000, 89000, 315000, 41000,
   0.91, 9.30, 3.09, 59.10, 13.80, 13.10, 9.80, 9.16, 0.65, 1.42,
   0.25, 81.76, 260000, 596, 5),
  (900002, '20260630', 18400000, 15100000, 1690000, 12500000, 4240000, 3060000,
   1420000, 2810000, 163000, 758000, 289000, 171000, 121000, 423000, 53000,
   0.96, 9.80, 3.18, 58.70, 14.00, 13.30, 10.00, 9.18, 0.61, 1.45,
   0.23, 82.78, 255000, 610, 5);

INSERT INTO agg_industry (repdte, segment, metric, value, count) VALUES
  ('20260630', 'all', 'bank_count', 2, 2),
  ('20260630', 'all', 'median_roa', 1.085, 2),
  ('20260630', 'all', 'median_roe', 10.60, 2),
  ('20260630', 'all', 'median_nim', 3.35, 2),
  ('20260630', 'all', 'total_assets', 30900000, 2),
  ('20260630', 'all', 'total_deposits', 25200000, 2),
  ('20260331', 'all', 'bank_count', 2, 2),
  ('20260331', 'all', 'median_roa', 1.03, 2),
  ('20260331', 'all', 'median_roe', 10.10, 2),
  ('20260331', 'all', 'median_nim', 3.265, 2),
  ('20260331', 'all', 'total_assets', 29800000, 2),
  ('20260331', 'all', 'total_deposits', 24500000, 2);

INSERT INTO pipeline_state (key, value, updated_at) VALUES
  ('institutions_last_sync', '2', '2026-08-30T12:00:00.000Z'),
  ('financials_last_sync', '4', '2026-08-30T12:00:00.000Z'),
  ('analytics_last_sync', '12', '2026-08-30T12:00:00.000Z'),
  ('published_release', '20260630', '2026-08-30T12:00:00.000Z');

UPDATE release_control
SET state = 'ready', release = '20260630', generation = 'ci-smoke-generation',
    pending_release = NULL, pending_generation = NULL, pending_run_id = NULL,
    updated_at = '2026-08-30T12:00:00.000Z'
WHERE singleton = 1;
