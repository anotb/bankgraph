import { describe, expect, it } from 'vitest';
import {
  chooseSyncRange,
  chooseSyncYear,
  deriveCpiYoY,
  latestExpectedSourceYear,
  parseUploadedMacroSource,
  parseUploadedBlsSource,
  resolveMacroSourceUrl
} from './macro-sync';
import { BLS_CPI_BULK_URL } from './bls-bulk';
import { MACRO_SERIES_BY_ID } from './macro-sources';

describe('macro series backfill cursor', () => {
  it('starts at the exact source floor and advances from stored coverage', () => {
    expect(chooseSyncYear('1948-01-01', 2026, null, null)).toBe(1948);
    expect(chooseSyncYear('1948-01-01', 2026, { status: 'partial', cursor_year: 1948 }, {
      coverage_start: '1948-01-01', coverage_end: '1948-12-01'
    })).toBe(1949);
  });

  it('backfills an existing bounded window before returning to incremental refreshes', () => {
    const boundedCoverage = { coverage_start: '2016-01-01', coverage_end: '2026-08-01' };
    expect(chooseSyncYear('1913-01-01', 2026, { status: 'success', cursor_year: 2026 }, boundedCoverage)).toBe(2015);
    expect(chooseSyncYear('1913-01-01', 2026, { status: 'partial', cursor_year: 2015 }, {
      coverage_start: '1913-01-01', coverage_end: '2026-08-01'
    })).toBe(2026);
    expect(chooseSyncYear('1990-01-02', 2026, { status: 'partial', cursor_year: 1990 }, {
      coverage_start: '1990-02-01', coverage_end: '2026-08-28'
    })).toBe(1990);
  });

  it('refreshes the current year and advances cleanly when the calendar changes', () => {
    const complete = { coverage_start: '1990-01-02', coverage_end: '2026-08-28' };
    expect(chooseSyncYear('1990-01-02', 2026, { status: 'success', cursor_year: 2026 }, complete)).toBe(2026);
    expect(chooseSyncYear('1990-01-02', 2027, { status: 'success', cursor_year: 2026 }, complete)).toBe(2027);
  });

  it('retries the same failed slice', () => {
    expect(chooseSyncYear('1948-01-01', 2026, { status: 'failed', cursor_year: 2019 }, {
      coverage_start: '1948-01-01', coverage_end: '2018-12-01'
    })).toBe(2019);
  });
});

describe('BLS request windows', () => {
  const unemployment = {
    provider: 'bls' as const,
    seriesId: 'BLS_UNRATE',
    sourceStartDate: '1948-01-01'
  };
  const inflation = {
    provider: 'bls' as const,
    seriesId: 'BLS_CPI_YOY',
    sourceStartDate: '1914-01-01'
  };

  it('fills unregistered BLS history in ten-year requests', () => {
    expect(chooseSyncRange(unemployment, 2026, null, null)).toEqual({
      startYear: 1948, endYear: 1957, cursorYear: 1957
    });
    expect(chooseSyncRange(unemployment, 2026, { status: 'partial', cursor_year: 1957 }, {
      coverage_start: '1948-01-01', coverage_end: '1957-12-01'
    })).toEqual({ startYear: 1958, endYear: 1967, cursorYear: 1967 });
  });

  it('reserves the prior year required for CPI year-over-year changes', () => {
    expect(chooseSyncRange(inflation, 2026, null, null)).toEqual({
      startYear: 1914, endYear: 1923, cursorYear: 1923
    });
  });

  it('batches backward upgrades and keeps a completed series to one refresh year', () => {
    expect(chooseSyncRange(unemployment, 2026, { status: 'partial', cursor_year: 2015 }, {
      coverage_start: '2016-01-01', coverage_end: '2026-07-01'
    })).toEqual({ startYear: 2006, endYear: 2015, cursorYear: 2006 });
    expect(chooseSyncRange(unemployment, 2026, { status: 'success', cursor_year: 2026 }, {
      coverage_start: '1948-01-01', coverage_end: '2026-07-01'
    })).toEqual({ startYear: 2026, endYear: 2026, cursorYear: 2026 });
  });
});

describe('Federal Reserve request windows', () => {
  const fedFunds = {
    provider: 'frb' as const,
    seriesId: 'FRB_FEDFUNDS',
    sourceStartDate: '1954-07-01'
  };

  it('fills Board history in ten-year packages', () => {
    expect(chooseSyncRange(fedFunds, 2026, null, null)).toEqual({
      startYear: 1954, endYear: 1963, cursorYear: 1963
    });
    expect(chooseSyncRange(fedFunds, 2026, { status: 'partial', cursor_year: 1963 }, {
      coverage_start: '1954-07-01', coverage_end: '1963-12-01'
    })).toEqual({ startYear: 1964, endYear: 1973, cursorYear: 1973 });
  });
});

describe('stored CPI inflation derivation', () => {
  it('derives each 12-month change without another BLS request', () => {
    expect(deriveCpiYoY([
      { date: '2024-01-01', value: 300 },
      { date: '2025-01-01', value: 309 },
      { date: '2026-01-01', value: 315.18 }
    ], 2025, 2026)).toEqual([
      { date: '2025-01-01', value: 3.0000000000000027 },
      { date: '2026-01-01', value: 2.0000000000000018 }
    ]);
  });
});

describe('authenticated BLS source transport', () => {
  const unemployment = {
    provider: 'bls' as const,
    seriesId: 'BLS_UNRATE',
    blsSeriesId: 'LNS14000000'
  };
  const payload = {
    status: 'REQUEST_SUCCEEDED',
    message: [],
    Results: {
      series: [{
        seriesID: 'LNS14000000',
        data: [{ year: '1948', period: 'M01', value: '3.4' }]
      }]
    }
  };

  it('accepts only the exact Worker-planned BLS slice', () => {
    expect(parseUploadedBlsSource(
      unemployment,
      { startYear: 1948, endYear: 1957 },
      payload,
      { startYear: 1948, endYear: 1957 }
    )).toEqual([{ date: '1948-01-01', value: 3.4 }]);
    expect(() => parseUploadedBlsSource(
      unemployment,
      { startYear: 1948, endYear: 1957 },
      payload,
      { startYear: 1949, endYear: 1957 }
    )).toThrow(/did not match the expected 1948-1957 slice/);
  });

  it('rejects uploaded payloads for derived series', () => {
    expect(() => parseUploadedBlsSource(
      { ...unemployment, seriesId: 'BLS_CPI_YOY' },
      { startYear: 1948, endYear: 1957 },
      payload,
      { startYear: 1948, endYear: 1957 }
    )).toThrow(/only accepted for fetched BLS series/);
  });

  it('records the actual allowlisted BLS transport URL', () => {
    const cpi = {
      provider: 'bls' as const,
      seriesId: 'BLS_CPI_U',
      sourceUrl: 'https://api.bls.gov/publicAPI/v2/timeseries/data/'
    };
    expect(resolveMacroSourceUrl(cpi, 'bls_api')).toBe(cpi.sourceUrl);
    expect(resolveMacroSourceUrl(cpi, 'bls_bulk')).toBe(BLS_CPI_BULK_URL);
    expect(() => resolveMacroSourceUrl({ ...cpi, seriesId: 'BLS_UNRATE' }, 'bls_bulk'))
      .toThrow(/only accepted for CPI-U/);
  });
});

describe('authenticated Federal Reserve source transport', () => {
  it('re-parses the exact Board CSV slice on the Worker', () => {
    const definition = MACRO_SERIES_BY_ID.get('FRB_FEDFUNDS')!;
    const csv = [
      '"Series Description","Federal funds effective rate"',
      '"Time Period","RIFSPFF_N.M"',
      '1967-01,4.94',
      '1967-02,5.00',
      '1968-01,4.61'
    ].join('\n');
    expect(parseUploadedMacroSource(
      definition,
      { startYear: 1967, endYear: 1968 },
      csv,
      { startYear: 1967, endYear: 1968 },
      'frb_csv'
    )).toEqual([
      { date: '1967-01-01', value: 4.94 },
      { date: '1967-02-01', value: 5 },
      { date: '1968-01-01', value: 4.61 }
    ]);
  });

  it('rejects a Board CSV transport for a non-Board series', () => {
    const definition = MACRO_SERIES_BY_ID.get('BLS_UNRATE')!;
    expect(() => parseUploadedMacroSource(
      definition,
      { startYear: 1967, endYear: 1967 },
      '"Time Period","RIFSPFF_N.M"\n1967-01,4.94',
      { startYear: 1967, endYear: 1967 },
      'frb_csv'
    )).toThrow(/require an allowlisted Board series/);
  });
});

describe('cadence-aware source year', () => {
  it('uses the current year for daily data and a conservative publication lag for monthly data', () => {
    const january = new Date('2027-01-15T00:00:00.000Z');
    expect(latestExpectedSourceYear('daily', january)).toBe(2027);
    expect(latestExpectedSourceYear('weekly', january)).toBe(2027);
    expect(latestExpectedSourceYear('monthly', january)).toBe(2026);
  });
});
