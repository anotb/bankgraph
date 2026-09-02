-- Provider-neutral macro storage sourced from originating U.S. agencies.
--
-- The legacy tables were populated from FRED. They remain in the schema only
-- for migration compatibility; their content is removed and the application no
-- longer reads or writes them.
DELETE FROM macro_data;
DELETE FROM fred_series;
DELETE FROM correlations;

CREATE TABLE IF NOT EXISTS macro_series (
  series_id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  category TEXT NOT NULL,
  source_agency TEXT NOT NULL,
  source_series TEXT NOT NULL,
  source_url TEXT NOT NULL,
  source_page_url TEXT NOT NULL,
  rights_url TEXT NOT NULL,
  rights_note TEXT NOT NULL,
  cadence TEXT NOT NULL CHECK (cadence IN ('daily', 'weekly', 'monthly', 'quarterly')),
  units TEXT NOT NULL,
  transform TEXT NOT NULL,
  seasonal_adjustment TEXT NOT NULL,
  retrieved_at TEXT,
  observed_through TEXT,
  coverage_start TEXT,
  coverage_end TEXT
);

CREATE TABLE IF NOT EXISTS macro_observations (
  series_id TEXT NOT NULL REFERENCES macro_series(series_id),
  date TEXT NOT NULL,
  value REAL NOT NULL,
  retrieved_at TEXT NOT NULL,
  PRIMARY KEY (series_id, date)
) WITHOUT ROWID;

CREATE INDEX IF NOT EXISTS idx_macro_observations_date
  ON macro_observations(date, series_id);

CREATE TABLE IF NOT EXISTS macro_sync_state (
  series_id TEXT PRIMARY KEY,
  status TEXT NOT NULL CHECK (status IN ('partial', 'success', 'failed')),
  cursor_year INTEGER,
  attempts INTEGER NOT NULL DEFAULT 0,
  last_attempt_at TEXT NOT NULL,
  last_success_at TEXT,
  last_error TEXT
);

CREATE TABLE IF NOT EXISTS macro_correlations (
  metric_a TEXT NOT NULL,
  metric_b TEXT NOT NULL,
  window_start TEXT NOT NULL,
  window_end TEXT NOT NULL,
  observations INTEGER NOT NULL,
  correlation REAL NOT NULL,
  lag_quarters INTEGER NOT NULL,
  alignment_direction TEXT NOT NULL,
  method TEXT NOT NULL,
  computed_at TEXT NOT NULL,
  PRIMARY KEY (metric_a, metric_b, window_start, window_end, lag_quarters)
) WITHOUT ROWID;

INSERT INTO pipeline_state (key, value, updated_at)
VALUES ('schema_version', '0015', CURRENT_TIMESTAMP)
ON CONFLICT(key) DO UPDATE SET
  value = excluded.value,
  updated_at = excluded.updated_at;
