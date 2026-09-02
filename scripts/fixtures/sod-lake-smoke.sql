-- Synthetic local-only rows for exercising migration 0020.
INSERT OR IGNORE INTO fdic_ingest_runs (
  run_id, dataset, partition_key, source_endpoint, status,
  started_at, retrieved_at, completed_at,
  source_total, rows_seen, rows_published
) VALUES (
  'smoke-sod-current', 'sod', '2024', 'https://api.fdic.gov/banks/sod', 'complete',
  '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z', '2026-01-01T00:00:01Z',
  1, 1, 1
);

INSERT OR REPLACE INTO fdic_dataset_publications (
  dataset, partition_key, run_id, source_endpoint,
  source_total, row_count, key_first, key_last, period_min, period_max,
  retrieved_at, published_at
) VALUES (
  'sod', '2024', 'smoke-sod-current', 'https://api.fdic.gov/banks/sod',
  1, 1, '2024|000000000001', '2024|000000000001', '2024', '2024',
  '2026-01-01T00:00:00Z', '2026-01-01T00:00:01Z'
);

INSERT OR REPLACE INTO fdic_lake_partitions (
  dataset, partition_key, layout_version, object_key, manifest_key,
  object_sha256, source_endpoint, source_query_json,
  source_total, row_count, compressed_bytes, field_count,
  key_first, key_last, retrieved_at, published_at, is_current_snapshot
) VALUES (
  'sod', '2024', 1,
  'lake/fdic/sod/v1/data/year=2024/sod-2024-aaaaaaaaaaaaaaaa.parquet',
  'lake/fdic/sod/v1/metadata/manifests/year=2024/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.json',
  'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  'https://api.fdic.gov/banks/sod', '{"filters":"YEAR:2024"}',
  1, 1, 100, 2,
  '2024|000000000001', '2024|000000000001',
  '2026-01-01T00:00:00Z', '2026-01-01T00:00:01Z', 1
);

INSERT OR REPLACE INTO sod (
  uninumbr, year, cert, namebr, citybr, stalpbr, zipbr,
  cntynumb, cntynamb, depsumbr, latitude, longitude, mainoff,
  source_run_id, source_retrieved_at
) VALUES (
  1, 2024, 10, 'Main', 'Richmond', 'VA', '23219',
  51001, 'Alpha', 100, 37.54, -77.43, 1,
  'smoke-sod-current', '2026-01-01T00:00:00Z'
);

INSERT OR IGNORE INTO sod_state_year (
  year, state, branch_count, bank_count, total_deposits, source_sha256
) VALUES (
  2024, 'VA', 1, 1, 100,
  'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
);
