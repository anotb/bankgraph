import { FredUsageDisabledError } from './fred-api';

/** @deprecated Use `syncMacroSeries` from `macro-sync.ts`. */
export async function syncFredData(): Promise<never> {
  throw new FredUsageDisabledError();
}
