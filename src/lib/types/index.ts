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
  /** FDIC BankFind OFFDOM: domestic offices including headquarters (legacy column name). */
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

export type FailureTransactionType = 'FAILURE' | 'ASSISTANCE';

/** FDIC failure or assistance transaction record */
export interface Failure {
  /** Stable ID supplied by the FDIC Failures & Assistance API */
  source_id: string;
  /** FDIC certificate number; absent on some historical source rows */
  cert: number | null;
  name: string | null;
  city: string | null;
  state: string | null;
  fail_date: string | null;
  /** FDIC RESTYPE, normalized to uppercase */
  transaction_type: FailureTransactionType | null;
  /** FDIC RESTYPE1 transaction-method code, such as PA, P&A, A/A, or PO */
  resolution_type: string | null;
  /** FDIC SAVR insurance-fund code, such as DIF, BIF, SAIF, FSLIC, or RTC */
  insurance_fund: string | null;
  /** FDIC BIDNAME: the winning bidder or largest buyer, when reported */
  acquiring_institution: string | null;
  /** FDIC COST estimated insurance-fund loss, in thousands of US dollars */
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

export interface DatasetScope {
  kind: 'loaded_population' | 'recorded_selection' | 'reported_population_aggregate';
  label: string;
  population: string;
  count: number;
  /** All loaded institution-master records, including inactive records, when applicable. */
  record_count?: number;
  source_as_of: string | null;
}

export interface DatasetContext {
  mode: 'pipeline' | 'recorded_snapshot';
  /** Exact fixture marker from pipeline_state; null for an ordinary pipeline. */
  demo_fixture_mode: 'recorded' | null;
  source: 'FDIC BankFind';
  is_demo: boolean;
  scopes: {
    institutions: DatasetScope;
    institution_financials: DatasetScope;
    industry_aggregates: DatasetScope;
  };
  source_as_of: string | null;
  expected_source_as_of: string;
  retrieved_at: string | null;
  pipeline_stage_updated_at: string | null;
  page_loaded_at: string;
  is_stale: boolean;
  stale_message: string | null;
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

/** Active published release identity for a dynamic API response. */
export interface ReleaseLineage {
  release: string | null;
  release_generation: string | null;
}

/** Response payload whose rows were read from one active published release. */
export type ReleaseBound<T> = T & ReleaseLineage;

/** Paginated bank list response */
export interface BankListResponse extends ReleaseLineage {
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
  /** @deprecated Stage timestamps are not source freshness. */
  data_freshness: Record<string, string>;
  pipeline_stage_updated_at: Record<string, string>;
  dataset: DatasetContext;
  states: Array<{ state: string; count: number }>;
  table_counts?: Record<string, number>;
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
  /** Cash and balances due from depository institutions (thousands) */
  chbal?: number | null;
  /** Federal funds sold and reverse repos (thousands) */
  frepo?: number | null;
  /** Trading assets (thousands) */
  trade?: number | null;
  /** Other real estate owned (thousands) */
  ore?: number | null;
  /** Goodwill (thousands) */
  bkprem?: number | null;
  /** Other intangible assets (thousands) */
  intan?: number | null;
  /** Other assets (thousands) */
  oa?: number | null;
  /** Federal funds purchased and repos (thousands) */
  frepp?: number | null;
  /** Other borrowed funds (thousands) */
  othbor?: number | null;
  /** Subordinated debt (thousands) */
  subnd?: number | null;
  /** Trading liabilities (thousands) */
  tradel?: number | null;
  /** Other liabilities (thousands) */
  allothl?: number | null;
  /** Calendar-year-to-date net income (thousands) */
  netinc: number | null;
  /** Calendar-year-to-date interest income (thousands) */
  intinc: number | null;
  /** Calendar-year-to-date interest expense (thousands) */
  eintexp: number | null;
  /** Calendar-year-to-date net interest income (thousands) */
  nim: number | null;
  /** Calendar-year-to-date noninterest income (thousands) */
  nonii: number | null;
  /** Calendar-year-to-date noninterest expense (thousands) */
  nonix: number | null;
  /** Calendar-year-to-date provision for credit losses (thousands) */
  elnatr: number | null;
  /** Single-quarter net income reported by FDIC (thousands) */
  netincq?: number | null;
  /** Single-quarter net interest income reported by FDIC (thousands) */
  nimq?: number | null;
  /** Single-quarter noninterest income reported by FDIC (thousands) */
  noniiq?: number | null;
  /** Single-quarter noninterest expense reported by FDIC (thousands) */
  nonixq?: number | null;
  /** Single-quarter provision for credit losses (thousands) */
  elnatq?: number | null;
  /** Single-quarter securities gains or losses (thousands) */
  iglsecq?: number | null;
  /** Single-quarter income tax expense (thousands) */
  itaxq?: number | null;
  /** Single-quarter extraordinary items (thousands) */
  extraq?: number | null;
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
export interface FinancialsResponse extends ReleaseLineage {
  data: Financial[];
  cert: number;
  from: string | null;
  to: string | null;
}

/** Institution snapshot and latest financial row from one published release. */
export interface BankDetailResponse extends Institution, ReleaseLineage {
  latest_financials: Financial | null;
}

/** Reproducible lineage for an analytical response or saved artifact. */
export interface AnalysisProvenance {
  source: string;
  source_url: string;
  source_as_of: string | null;
  retrieved_at: string | null;
  release: string | null;
  release_generation: string | null;
  source_fields: Record<string, string[]>;
  formulas: Record<string, string>;
  cohort_hash: string | null;
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
  /** Institutions with a usable value for this metric in the period cohort. */
  peer_count: number | null;
}

/** Full peer comparison API response */
export interface PeerComparison {
  cert: number;
  repdte: string;
  peer_group: string;
  cohort: {
    basis: 'same_period_asset_bucket';
    asset_bucket: number;
    label: string;
    population: string;
    institution_count: number;
    percentile_method: 'exact_rank';
  };
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
export type CapitalAdequacyCategory =
  | 'unclassified'
  | 'well_capitalized'
  | 'adequately_capitalized'
  | 'undercapitalized'
  | 'significantly_undercapitalized'
  | 'critically_undercapitalized';

export interface RiskScore {
  cert: number;
  repdte: string;
  capital_score: number | null;
  asset_quality_score: number | null;
  earnings_score: number | null;
  liquidity_score: number | null;
  composite_score: number | null;
  /** Ratio-based capital assessment; not an official supervisory PCA determination. */
  pca_category: CapitalAdequacyCategory | null;
}

/** Anomaly API response */
export interface AnomalyResponse {
  cert: number;
  anomalies: Anomaly[];
  counts: { critical: number; warning: number; info: number };
  methodology: AnomalyMethodology;
}

export interface AnomalyMethodology {
  version: string;
  method: string;
  coverage: {
    from_repdte: string | null;
    to_repdte: string | null;
    quarter_count: number;
    requested_repdte: string | null;
  };
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
  /** Canonical deterministic ratio-threshold screen; not an official PCA determination. */
  capital_ratio_screen: CapitalAdequacyCategory | null;
  /** @deprecated Use capital_ratio_screen. Retained for v1 API compatibility. */
  /** Ratio-based capital assessment; not an official supervisory PCA determination. */
  pca_category: CapitalAdequacyCategory | null;
  methodology: RiskMethodology;
}

export interface RiskMethodology {
  version: string;
  method: string;
  peer_percentile_method: 'exact_empirical_midrank';
  peer_cohort: 'same_period_asset_bucket';
  coverage: {
    available_components: number;
    total_components: number;
    ratio: number;
    required_components: number;
    included_components: Array<'capital' | 'asset_quality' | 'earnings' | 'liquidity'>;
    missing_components: Array<'capital' | 'asset_quality' | 'earnings' | 'liquidity'>;
    composite_status: 'complete' | 'partial' | 'unavailable';
  };
}

/** Single macro data observation */
export interface MacroDataPoint {
  date: string;
  value: number;
}

/** Direct-agency macro series metadata. */
export interface MacroSeries {
  series_id: string;
  title: string | null;
  category: string | null;
  source_agency: string;
  source_series: string;
  source_url: string;
  source_page_url: string;
  rights_url: string;
  rights_note: string;
  cadence: 'daily' | 'weekly' | 'monthly' | 'quarterly';
  /** @deprecated Use cadence. */
  frequency: string;
  units: string | null;
  transform: string;
  seasonal_adjustment: string;
  retrieved_at: string | null;
  observed_through: string | null;
  coverage: { start: string | null; end: string | null };
}

/** Macro data API response */
export interface MacroResponse {
  series_id: MacroSeries['series_id'];
  title: MacroSeries['title'];
  category: MacroSeries['category'];
  source_agency: MacroSeries['source_agency'];
  source_series: MacroSeries['source_series'];
  source_url: MacroSeries['source_url'];
  source_page_url: MacroSeries['source_page_url'];
  rights_url: MacroSeries['rights_url'];
  rights_note: MacroSeries['rights_note'];
  cadence: MacroSeries['cadence'];
  frequency: MacroSeries['frequency'];
  units: MacroSeries['units'];
  transform: MacroSeries['transform'];
  seasonal_adjustment: MacroSeries['seasonal_adjustment'];
  retrieved_at: MacroSeries['retrieved_at'];
  observed_through: MacroSeries['observed_through'];
  coverage: MacroSeries['coverage'];
  query: { from: string; to: string; limit: number; default_window_years: 10 };
  data: MacroDataPoint[];
}

/** Macro series response bound to the active published release. */
export type MacroApiResponse = MacroResponse & ReleaseLineage;

/** Multi-bank comparison API response */
export interface CompareResponse {
  certs: number[];
  metrics: string[];
  data: Record<number, Financial[]>;
  provenance: AnalysisProvenance;
}

/** Correlation result between two metrics */
export interface CorrelationResult {
  metric_a: string;
  metric_b: string;
  window_start: string;
  window_end: string;
  observations: number;
  correlation: number | null;
  lag_quarters: number;
  alignment_direction: 'contemporaneous' | 'macro_leads_bank';
  method: 'pearson_yoy_change_contemporaneous';
  computed_at: string;
}

/** Single data point for percentile history over time */
export interface PercentileHistoryPoint {
  repdte: string;
  metric: string;
  percentile: number;
  asset_bucket: number;
  peer_group: string;
  peer_count: number;
  percentile_method: 'estimated_from_stored_quantiles';
}
