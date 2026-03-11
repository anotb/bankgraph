/**
 * FRED (Federal Reserve Economic Data) API client.
 * Base: https://api.stlouisfed.org/fred
 */

const BASE_URL = 'https://api.stlouisfed.org/fred';
const MAX_RETRIES = 3;
const INITIAL_BACKOFF_MS = 500;

export interface FredObservation {
  date: string;
  value: number | null;
}

export interface FredSeriesInfo {
  title: string;
  frequency: string;
  units: string;
}

/** Fetch with retry + exponential backoff */
async function fetchWithRetry(url: string): Promise<Response> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const response = await fetch(url);
      if (response.ok) return response;

      if (response.status !== 429 && response.status < 500) {
        throw new Error(`FRED API returned ${response.status}: ${await response.text()}`);
      }

      lastError = new Error(`FRED API returned ${response.status}`);
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
    }

    if (attempt < MAX_RETRIES - 1) {
      const delay = INITIAL_BACKOFF_MS * Math.pow(2, attempt);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError ?? new Error('FRED API request failed after retries');
}

/**
 * Fetch observation data for a FRED series.
 * Filters out "." values (FRED's representation of missing data).
 */
export async function fetchSeriesObservations(
  apiKey: string,
  seriesId: string,
  startDate?: string
): Promise<FredObservation[]> {
  let url = `${BASE_URL}/series/observations?series_id=${seriesId}&api_key=${apiKey}&file_type=json`;
  if (startDate) {
    url += `&observation_start=${startDate}`;
  }

  const response = await fetchWithRetry(url);
  const json = (await response.json()) as {
    observations: Array<{ date: string; value: string }>;
  };

  return (json.observations ?? [])
    .filter((obs) => obs.value !== '.')
    .map((obs) => ({
      date: obs.date,
      value: parseFloat(obs.value)
    }))
    .filter((obs) => !isNaN(obs.value!));
}

/**
 * Fetch metadata for a FRED series.
 */
export async function fetchSeriesInfo(
  apiKey: string,
  seriesId: string
): Promise<FredSeriesInfo> {
  const url = `${BASE_URL}/series?series_id=${seriesId}&api_key=${apiKey}&file_type=json`;

  const response = await fetchWithRetry(url);
  const json = (await response.json()) as {
    seriess: Array<{
      title: string;
      frequency: string;
      units: string;
    }>;
  };

  const series = json.seriess?.[0];
  if (!series) {
    throw new Error(`FRED series ${seriesId} not found`);
  }

  return {
    title: series.title,
    frequency: series.frequency,
    units: series.units
  };
}

/** Small delay helper */
export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
