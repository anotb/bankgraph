import { describe, expect, it } from 'vitest';
import { fetchSeriesInfo, fetchSeriesObservations, FredUsageDisabledError } from './fred-api';

describe('retired FRED compatibility boundary', () => {
  it('never performs a request or accepts a credential', async () => {
    await expect(fetchSeriesInfo()).rejects.toBeInstanceOf(FredUsageDisabledError);
    await expect(fetchSeriesObservations()).rejects.toThrow(/disabled/);
  });
});
