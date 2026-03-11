-- FRED macro data and correlations tables

CREATE TABLE IF NOT EXISTS macro_data (
  series_id TEXT NOT NULL,
  date TEXT NOT NULL,
  value REAL,
  PRIMARY KEY (series_id, date)
) WITHOUT ROWID;

CREATE TABLE IF NOT EXISTS fred_series (
  series_id TEXT PRIMARY KEY,
  title TEXT,
  frequency TEXT,
  units TEXT,
  category TEXT
);

CREATE TABLE IF NOT EXISTS correlations (
  metric_a TEXT NOT NULL,
  metric_b TEXT NOT NULL,
  period_start TEXT NOT NULL,
  correlation REAL,
  lag_quarters INTEGER DEFAULT 0,
  PRIMARY KEY (metric_a, metric_b, period_start, lag_quarters)
) WITHOUT ROWID;
