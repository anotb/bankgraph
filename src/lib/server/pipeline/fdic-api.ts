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
  roa: number | null;
  roe: number | null;
  nim: number | null;
  npl_ratio: number | null;
  tier1_ratio: number | null;
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
  'CERT', 'REPDTE', 'ROA', 'ROE', 'NIMY', 'NCLNLSR', 'RBCRWAJ'
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
        results.set(cert, {
          repdte: String(d.REPDTE ?? ''),
          roa: d.ROA != null ? Number(d.ROA) : null,
          roe: d.ROE != null ? Number(d.ROE) : null,
          nim: d.NIMY != null ? Number(d.NIMY) : null,
          npl_ratio: d.NCLNLSR != null ? Number(d.NCLNLSR) : null,
          tier1_ratio: d.RBCRWAJ != null ? Number(d.RBCRWAJ) : null
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
