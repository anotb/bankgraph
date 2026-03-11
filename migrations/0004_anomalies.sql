-- Migration: 0004_anomalies
-- Description: Trend analysis, anomaly detection, and CAMELS-proxy risk scoring tables

CREATE TABLE bank_trends (
  cert INTEGER NOT NULL,
  metric TEXT NOT NULL,
  repdte TEXT NOT NULL,
  ma_4q REAL, ma_8q REAL,
  qoq_change REAL, yoy_change REAL,
  trend_slope REAL, trend_r_squared REAL,
  peer_group TEXT, peer_percentile REAL,
  PRIMARY KEY (cert, metric, repdte)
) WITHOUT ROWID;
CREATE INDEX idx_trends_cert ON bank_trends(cert);

CREATE TABLE anomalies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cert INTEGER NOT NULL,
  repdte TEXT NOT NULL,
  metric TEXT NOT NULL,
  anomaly_type TEXT NOT NULL,
  severity TEXT NOT NULL,
  value REAL, reference_value REAL, delta REAL,
  description TEXT,
  UNIQUE(cert, repdte, metric, anomaly_type)
);
CREATE INDEX idx_anomalies_cert ON anomalies(cert);
CREATE INDEX idx_anomalies_severity ON anomalies(severity);

CREATE TABLE risk_scores (
  cert INTEGER NOT NULL,
  repdte TEXT NOT NULL,
  capital_score REAL, asset_quality_score REAL,
  earnings_score REAL, liquidity_score REAL,
  composite_score REAL,
  pca_category TEXT,
  PRIMARY KEY (cert, repdte)
) WITHOUT ROWID;
CREATE INDEX idx_risk_cert ON risk_scores(cert);
