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
