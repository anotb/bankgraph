import { describe, expect, it } from 'vitest';
import { selectIndustryHistoryBatch } from './industry-history';

describe('industry aggregate history planning', () => {
  it('selects the newest missing period and resumes without recomputing complete quarters', () => {
    const periods = ['20260630', '20260331', '20251231', '20250930'];
    expect(selectIndustryHistoryBatch(periods, new Set(['20260630', '20251231']))).toEqual(['20260331']);
    expect(selectIndustryHistoryBatch(periods, new Set(['20260630', '20260331']), 2)).toEqual([
      '20251231',
      '20250930'
    ]);
  });
});
