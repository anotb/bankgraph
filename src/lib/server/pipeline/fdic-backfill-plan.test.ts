import { describe, expect, it, vi } from 'vitest';
import {
  buildAnnualSummaryRange,
  discoverAnnualSummaryBounds,
  latestAnnualSummaryPartitions,
  validatePipelineRunId
} from '../../../../scripts/fdic-backfill-plan';

describe('annual summary planning', () => {
  it('starts SI at its own source minimum and stops both classes at source maxima', () => {
    expect(buildAnnualSummaryRange(1934, 2026, {
      CB: { min: 1934, max: 2025 },
      SI: { min: 1984, max: 2025 }
    })).toEqual([
      ...Array.from({ length: 50 }, (_, index) => `${1934 + index}:CB`),
      ...Array.from({ length: 42 }, (_, index) => [
        `${1984 + index}:CB`,
        `${1984 + index}:SI`
      ]).flat()
    ]);
  });

  it('discovers each class boundary from FDIC rather than the calendar year', async () => {
    const fetcher = vi.fn(async (input: string | URL | Request) => {
      const url = new URL(String(input));
      const charter = url.searchParams.get('filters')?.split(':')[1] as 'CB' | 'SI';
      const ascending = url.searchParams.get('sort_order') === 'ASC';
      const year = ascending ? (charter === 'CB' ? 1934 : 1984) : 2025;
      return Response.json({ data: [{ data: { YEAR: year, CB_SI: charter } }] });
    });

    await expect(discoverAnnualSummaryBounds(fetcher as typeof fetch)).resolves.toEqual({
      CB: { min: 1934, max: 2025 },
      SI: { min: 1984, max: 2025 }
    });
    expect(fetcher).toHaveBeenCalledTimes(4);
  });

  it('uses class-specific latest aliases for recurring refreshes', () => {
    expect(latestAnnualSummaryPartitions()).toEqual(['latest:CB', 'latest:SI']);
  });

  it('accepts one reusable pipeline run id and rejects unsafe header values', () => {
    expect(validatePipelineRunId('fdic-initial-2026.08.30')).toBe('fdic-initial-2026.08.30');
    expect(() => validatePipelineRunId('contains spaces')).toThrow('URL-safe');
    expect(() => validatePipelineRunId('x'.repeat(129))).toThrow('URL-safe');
  });
});
