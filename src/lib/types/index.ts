/** Institution master record, one row per FDIC-insured institution */
export interface Institution {
  cert: number;
  rssd_id: number | null;
  name: string;
  city: string | null;
  state: string | null;
  zip: string | null;
  county: string | null;
  /** Charter class: NM, N, SB, SM */
  charter_class: string | null;
  /** Primary regulator: OCC, FDIC, FRB */
  regulator: string | null;
  /** 1 = active, 0 = inactive */
  active: number;
  established_date: string | null;
  insured_date: string | null;
  holding_company: string | null;
  hc_rssd_id: number | null;
  /** Asset tier bucket: 1=<100M, 2=100M-300M, 3=300M-1B, 4=1B-10B, 5=10B-50B, 6=50B-250B, 7=>250B */
  asset_tier: number | null;
  /** Latest total assets in thousands */
  total_assets: number | null;
  /** Latest total deposits in thousands */
  total_deposits: number | null;
  num_branches: number | null;
  num_employees: number | null;
  /** Latest reporting date (YYYYMMDD) */
  latest_repdte: string | null;
  latest_roa: number | null;
  latest_roe: number | null;
  latest_nim: number | null;
  latest_npl_ratio: number | null;
  latest_tier1_ratio: number | null;
}

/** Bank failure record */
export interface Failure {
  cert: number;
  name: string | null;
  city: string | null;
  state: string | null;
  fail_date: string | null;
  acquiring_institution: string | null;
  cost: number | null;
  total_deposits: number | null;
  total_assets: number | null;
}

/** Pipeline state key-value entry */
export interface PipelineState {
  key: string;
  value: string | null;
  updated_at: string | null;
}

/** Search/filter params for the bank list API */
export interface BankSearchParams {
  /** Full-text search query (name, city, etc.) */
  q?: string;
  /** Filter by state (two-letter code) */
  state?: string;
  /** Minimum total assets */
  asset_min?: number;
  /** Maximum total assets */
  asset_max?: number;
  /** Filter by active status (1 or 0) */
  active?: number;
  /** Sort column name */
  sort?: string;
  /** Sort direction: 'asc' or 'desc' */
  order?: string;
  /** Page number (1-based) */
  page?: number;
  /** Results per page */
  limit?: number;
}

/** Paginated bank list response */
export interface BankListResponse {
  data: Institution[];
  total: number;
  page: number;
  limit: number;
}

/** API metadata response */
export interface MetaResponse {
  bank_count: number;
  active_count: number;
  latest_quarter: string | null;
  data_freshness: Record<string, string>;
  states: Array<{ state: string; count: number }>;
}

/** Quarterly financial data for an institution */
export interface Financial {
  /** FDIC certificate number */
  cert: number;
  /** Reporting date (YYYYMMDD) */
  repdte: string;
  /** Total assets (thousands) */
  asset: number | null;
  /** Total deposits (thousands) */
  dep: number | null;
  /** Total equity capital (thousands) */
  eq: number | null;
  /** Net loans and leases (thousands) */
  lnlsnet: number | null;
  /** Real estate loans (thousands) */
  lnre: number | null;
  /** Commercial & industrial loans (thousands) */
  lnci: number | null;
  /** Consumer loans (thousands) */
  lncon: number | null;
  /** Securities (thousands) */
  sec: number | null;
  /** Net income (thousands) */
  netinc: number | null;
  /** Interest income (thousands) */
  intinc: number | null;
  /** Interest expense (thousands) */
  eintexp: number | null;
  /** Net interest margin (thousands) */
  nim: number | null;
  /** Non-interest income (thousands) */
  nonii: number | null;
  /** Non-interest expense (thousands) */
  nonix: number | null;
  /** Provision for loan losses (thousands) */
  elnatr: number | null;
  /** Return on assets (%) */
  roa: number | null;
  /** Return on equity (%) */
  roe: number | null;
  /** Net interest margin yield (%) */
  nimy: number | null;
  /** Efficiency ratio (%) */
  eeffr: number | null;
  /** Total risk-based capital ratio (%) */
  rbcrwaj: number | null;
  /** Tier 1 risk-based capital ratio (%) */
  rbc1rwaj: number | null;
  /** Tier 1 leverage ratio (%) */
  rbc1aaj: number | null;
  /** Equity-to-assets ratio (%) */
  eqv: number | null;
  /** Non-current loans to loans ratio (%) */
  nclnlsr: number | null;
  /** Loan loss allowance to non-current ratio (%) */
  lnatresr: number | null;
  /** Net charge-off ratio (%) */
  nco_ratio: number | null;
  /** Loans-to-deposits ratio (%) */
  lnlsdepr: number | null;
  /** Other borrowed funds incl. FHLB (thousands) */
  othbfhlb: number | null;
  /** Number of employees */
  numemp: number | null;
  /** Asset size bucket */
  asset_bucket: number | null;
}

/** Financials API response for a single institution */
export interface FinancialsResponse {
  data: Financial[];
  cert: number;
  from: string | null;
  to: string | null;
}

/** Peer group statistics for a single metric */
export interface PeerStats {
  peer_group: string;
  repdte: string;
  metric: string;
  count: number | null;
  mean: number | null;
  median: number | null;
  stddev: number | null;
  p10: number | null;
  p25: number | null;
  p75: number | null;
  p90: number | null;
  min_val: number | null;
  max_val: number | null;
}

/** Single metric comparison between a bank and its peer group */
export interface PeerMetricComparison {
  metric: string;
  bank_value: number | null;
  peer_median: number | null;
  peer_mean: number | null;
  percentile: number | null;
  p10: number | null;
  p25: number | null;
  p75: number | null;
  p90: number | null;
}

/** Full peer comparison API response */
export interface PeerComparison {
  cert: number;
  repdte: string;
  peer_group: string;
  metrics: PeerMetricComparison[];
}

/** Industry aggregate row from agg_industry table */
export interface IndustryAggregate {
  repdte: string;
  segment: string;
  metric: string;
  value: number | null;
  count: number | null;
}

/** Trend data for a single bank-metric-quarter */
export interface BankTrend {
  cert: number;
  metric: string;
  repdte: string;
  ma_4q: number | null;
  ma_8q: number | null;
  qoq_change: number | null;
  yoy_change: number | null;
  trend_slope: number | null;
  trend_r_squared: number | null;
  peer_group: string | null;
  peer_percentile: number | null;
}

/** Anomaly detection result */
export interface Anomaly {
  id?: number;
  cert: number;
  repdte: string;
  metric: string;
  anomaly_type: string;
  severity: 'critical' | 'warning' | 'info';
  value: number | null;
  reference_value: number | null;
  delta: number | null;
  description: string | null;
}

/** Risk score for a single bank-quarter */
export interface RiskScore {
  cert: number;
  repdte: string;
  capital_score: number | null;
  asset_quality_score: number | null;
  earnings_score: number | null;
  liquidity_score: number | null;
  composite_score: number | null;
  pca_category: string | null;
}

/** Anomaly API response */
export interface AnomalyResponse {
  cert: number;
  anomalies: Anomaly[];
  counts: { critical: number; warning: number; info: number };
}

/** Risk score API response */
export interface RiskResponse {
  cert: number;
  repdte: string;
  scores: {
    capital: number | null;
    asset_quality: number | null;
    earnings: number | null;
    liquidity: number | null;
    composite: number | null;
  };
  pca_category: string | null;
}
