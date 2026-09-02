/**
 * @deprecated Network access to FRED is intentionally disabled.
 *
 * The file remains as a compatibility boundary for code built against older
 * Bankgraph versions. It performs no request and never accepts or stores a
 * credential. Active macro ingestion lives in `macro-sources.ts` and connects
 * only to originating-agency endpoints reviewed for this project.
 */
export class FredUsageDisabledError extends Error {
  constructor() {
    super('FRED access is disabled; use the direct-agency macro catalog');
    this.name = 'FredUsageDisabledError';
  }
}

export async function fetchSeriesObservations(): Promise<never> {
  throw new FredUsageDisabledError();
}

export async function fetchSeriesInfo(): Promise<never> {
  throw new FredUsageDisabledError();
}

export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
