-- Migration: 0003_analytics
-- Description: Peer comparison and industry aggregate tables

CREATE TABLE peer_stats (
  peer_group TEXT NOT NULL,
  repdte TEXT NOT NULL,
  metric TEXT NOT NULL,
  count INTEGER, mean REAL, median REAL, stddev REAL,
  p10 REAL, p25 REAL, p75 REAL, p90 REAL,
  min_val REAL, max_val REAL,
  PRIMARY KEY (peer_group, repdte, metric)
) WITHOUT ROWID;

CREATE TABLE agg_industry (
  repdte TEXT NOT NULL,
  segment TEXT NOT NULL,
  metric TEXT NOT NULL,
  value REAL, count INTEGER,
  PRIMARY KEY (repdte, segment, metric)
) WITHOUT ROWID;
