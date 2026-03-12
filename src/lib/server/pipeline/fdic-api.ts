/**
 * Shared FDIC BankFind API client.
 * Base URL: https://banks.data.fdic.gov/api
 * No auth required; may rate limit.
 */

const BASE_URL = 'https://banks.data.fdic.gov/api';
const MAX_RETRIES = 3;
const INITIAL_BACKOFF_MS = 500;

/** Shape returned by every FDIC BankFind endpoint */
export interface FDICResponse {
  data: Array<{ data: Record<string, unknown> }>;
  totals: { count: number };
}

/** Financial snapshot fields we care about */
export interface FinancialSnapshot {
  repdte: string;
  // Balance sheet
  asset: number | null;
  dep: number | null;
  eq: number | null;
  lnlsnet: number | null;
  lnre: number | null;
  lnci: number | null;
  lncon: number | null;
  sec: number | null;
  // Income
  netinc: number | null;
  intinc: number | null;
  eintexp: number | null;
  nim: number | null;
  nonii: number | null;
  nonix: number | null;
  elnatr: number | null;
  // Ratios
  roa: number | null;
  roe: number | null;
  nimy: number | null;
  eeffr: number | null;
  // Capital
  rbcrwaj: number | null;
  rbc1rwaj: number | null;
  rbc1aaj: number | null;
  eqv: number | null;
  // Asset quality
  nclnlsr: number | null;
  lnatresr: number | null;
  nco_ratio: number | null;
  // Liquidity
  lnlsdepr: number | null;
  othbfhlb: number | null;
  // General
  numemp: number | null;
}

/** Fetch wrapper with retry + exponential backoff */
async function fetchWithRetry(url: string): Promise<Response> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const response = await fetch(url);
      if (response.ok) return response;

      // 429 or 5xx: retry. 4xx (other than 429): throw immediately.
      if (response.status !== 429 && response.status < 500) {
        throw new Error(`FDIC API returned ${response.status}: ${await response.text()}`);
      }

      lastError = new Error(`FDIC API returned ${response.status}`);
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
    }

    if (attempt < MAX_RETRIES - 1) {
      const delay = INITIAL_BACKOFF_MS * Math.pow(2, attempt);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError ?? new Error('FDIC API request failed after retries');
}

const INSTITUTION_FIELDS = [
  'CERT', 'NAME', 'CITY', 'STALP', 'ZIP', 'COUNTY',
  'CHRTAGNT', 'REGAGNT', 'ACTIVE', 'ESTYMD', 'INSDATE',
  'HCTMULT', 'RSSDHCR', 'RSSDID', 'ASSET', 'DEP', 'OFFDOM', 'NUMEMP'
].join(',');

const FINANCIAL_FIELDS = [
  // Core
  'CERT', 'REPDTE',
  // Balance sheet
  'ASSET', 'DEP', 'EQ', 'LNLSNET', 'LNRE', 'LNCI', 'LNCON', 'SC',
  // Income
  'NETINC', 'INTINC', 'EINTEXP', 'NIM', 'NONII', 'NONIX', 'ELNATR',
  // Ratios
  'ROA', 'ROE', 'NIMY', 'EEFFR',
  // Capital
  'RBCRWAJ', 'RBC1RWAJ', 'RBC1AAJ', 'EQV',
  // Asset quality
  'NCLNLSR', 'LNATRESR', 'NTLNLSR',
  // Liquidity
  'LNLSDEPR', 'OTHBFHLB',
  // General
  'NUMEMP'
].join(',');

/** Fetch a page of institutions sorted by CERT ASC */
export async function fetchInstitutions(
  offset: number,
  limit: number
): Promise<FDICResponse> {
  const url = `${BASE_URL}/institutions?limit=${limit}&offset=${offset}&fields=${INSTITUTION_FIELDS}&sort_by=CERT&sort_order=ASC`;
  const response = await fetchWithRetry(url);
  return response.json() as Promise<FDICResponse>;
}

/**
 * Fetch latest quarter financials for a batch of certs.
 * Uses the financials endpoint with a REPDTE filter for a specific quarter.
 */
export async function fetchFinancialsForQuarter(
  repdte: string,
  offset: number,
  limit: number
): Promise<FDICResponse> {
  const url = `${BASE_URL}/financials?filters=REPDTE:${repdte}&sort_by=CERT&sort_order=ASC&limit=${limit}&offset=${offset}&fields=${FINANCIAL_FIELDS}`;
  const response = await fetchWithRetry(url);
  return response.json() as Promise<FDICResponse>;
}

/**
 * Discover the most recent reporting date in the financials dataset.
 * Fetches one record sorted by REPDTE DESC.
 */
export async function fetchLatestQuarter(): Promise<string | null> {
  const url = `${BASE_URL}/financials?sort_by=REPDTE&sort_order=DESC&limit=1&fields=REPDTE`;
  const response = await fetchWithRetry(url);
  const json = (await response.json()) as FDICResponse;

  if (json.data.length === 0) return null;
  return String(json.data[0].data.REPDTE);
}

/**
 * Fetch latest financials for a small batch of certs (one-by-one fallback).
 * Returns a Map keyed by cert number.
 */
export async function fetchLatestFinancials(
  certs: number[]
): Promise<Map<number, FinancialSnapshot>> {
  const results = new Map<number, FinancialSnapshot>();

  for (const cert of certs) {
    try {
      const url = `${BASE_URL}/financials?filters=CERT:${cert}&sort_by=REPDTE&sort_order=DESC&limit=1&fields=${FINANCIAL_FIELDS}`;
      const response = await fetchWithRetry(url);
      const json = (await response.json()) as FDICResponse;

      if (json.data.length > 0) {
        const d = json.data[0].data;
        const toNum = (v: unknown): number | null => (v != null ? Number(v) : null);
        results.set(cert, {
          repdte: String(d.REPDTE ?? ''),
          asset: toNum(d.ASSET),
          dep: toNum(d.DEP),
          eq: toNum(d.EQ),
          lnlsnet: toNum(d.LNLSNET),
          lnre: toNum(d.LNRE),
          lnci: toNum(d.LNCI),
          lncon: toNum(d.LNCON),
          sec: toNum(d.SC),
          netinc: toNum(d.NETINC),
          intinc: toNum(d.INTINC),
          eintexp: toNum(d.EINTEXP),
          nim: toNum(d.NIM),
          nonii: toNum(d.NONII),
          nonix: toNum(d.NONIX),
          elnatr: toNum(d.ELNATR),
          roa: toNum(d.ROA),
          roe: toNum(d.ROE),
          nimy: toNum(d.NIMY),
          eeffr: toNum(d.EEFFR),
          rbcrwaj: toNum(d.RBCRWAJ),
          rbc1rwaj: toNum(d.RBC1RWAJ),
          rbc1aaj: toNum(d.RBC1AAJ),
          eqv: toNum(d.EQV),
          nclnlsr: toNum(d.NCLNLSR),
          lnatresr: toNum(d.LNATRESR),
          nco_ratio: toNum(d.NTLNLSR),
          lnlsdepr: toNum(d.LNLSDEPR),
          othbfhlb: toNum(d.OTHBFHLB),
          numemp: toNum(d.NUMEMP)
        });
      }
    } catch (err) {
      console.log(`Failed to fetch financials for cert ${cert}: ${err}`);
    }
  }

  return results;
}

/** Small delay to avoid hammering the API */
export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
