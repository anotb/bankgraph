CREATE TABLE financials (
  cert INTEGER NOT NULL,
  repdte TEXT NOT NULL,
  asset INTEGER, dep INTEGER, eq INTEGER, lnlsnet INTEGER,
  lnre INTEGER, lnci INTEGER, lncon INTEGER, sec INTEGER,
  netinc INTEGER, intinc INTEGER, eintexp INTEGER, nim INTEGER,
  nonii INTEGER, nonix INTEGER, elnatr INTEGER,
  roa REAL, roe REAL, nimy REAL, eeffr REAL,
  rbcrwaj REAL, rbc1rwaj REAL, rbc1aaj REAL, eqv REAL,
  nclnlsr REAL, lnatresr REAL, nco_ratio REAL,
  lnlsdepr REAL, othbfhlb INTEGER,
  numemp INTEGER, asset_bucket INTEGER,
  PRIMARY KEY (cert, repdte)
) WITHOUT ROWID;
CREATE INDEX idx_fin_repdte ON financials(repdte);
CREATE INDEX idx_fin_bucket ON financials(asset_bucket, repdte);
