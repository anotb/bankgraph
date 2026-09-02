import { describe, expect, it } from 'vitest';
import {
  expectedFDICCoveragePartitions,
  validateFDICCoverage,
  type FDICCoverageActual,
  type FDICCoverageBounds,
  type FDICCoveragePublicationRow
} from './fdic-coverage-audit';

const currentYear = new Date().getUTCFullYear();
const bounds: FDICCoverageBounds = {
  annualCbLatest: 1934,
  annualSiLatest: 1984,
  historyLatest: currentYear,
  locationsSnapshot: '2026-06-30',
  sodLatest: 1994
};

function publication(
  dataset: FDICCoveragePublicationRow['dataset'],
  partition_key: string,
  row_count: number
): FDICCoveragePublicationRow {
  return {
    dataset,
    partition_key,
    run_id: `${dataset}-${partition_key}`,
    source_total: row_count,
    row_count,
    run_status: 'complete'
  };
}

function completeActual(): FDICCoverageActual {
  const expected = expectedFDICCoveragePartitions(bounds);
  const publications = [
    ...expected.annual.map((key) => publication('annual-summary', key, 1)),
    ...expected.history.map((key) => publication('history', key, 0)),
    publication('locations', bounds.locationsSnapshot, 1),
    publication('sod', String(bounds.sodLatest), 2)
  ];
  return {
    publications,
    lake: [{
      partition_key: String(bounds.sodLatest),
      object_key: 'sod/year=1994/data.parquet',
      manifest_key: 'sod/year=1994/manifest.json',
      object_sha256: 'a'.repeat(64),
      source_total: 2,
      row_count: 2,
      compressed_bytes: 100,
      field_count: 10,
      is_current_snapshot: 1,
      state_branches: 2,
      county_branches: 2,
      bank_branches: 2
    }],
    locations: {
      row_count: 1,
      run_count: 1,
      run_min: `locations-${bounds.locationsSnapshot}`,
      run_max: `locations-${bounds.locationsSnapshot}`,
      partition_count: 1,
      partition_min: bounds.locationsSnapshot,
      partition_max: bounds.locationsSnapshot
    },
    sod: {
      row_count: 2,
      run_count: 1,
      run_min: `sod-${bounds.sodLatest}`,
      run_max: `sod-${bounds.sodLatest}`,
      partition_count: 1,
      partition_min: String(bounds.sodLatest),
      partition_max: String(bounds.sodLatest)
    },
    staleAggregateRows: 0,
    activeIngests: []
  };
}

describe('extended FDIC expected-coverage gate', () => {
  it('enumerates the class-specific, process-year, snapshot, and lake bounds exactly', () => {
    const partitions = expectedFDICCoveragePartitions({
      ...bounds,
      annualCbLatest: 1935,
      annualSiLatest: 1985,
      historyLatest: 1901,
      sodLatest: 1995
    });
    expect(partitions.annual).toEqual(['1934:CB', '1935:CB', '1984:SI', '1985:SI']);
    expect(partitions.history).toEqual(['1900', '1901']);
    expect(partitions.locations).toEqual(['2026-06-30']);
    expect(partitions.sod).toEqual(['1994', '1995']);
  });

  it('accepts zero-row history years but requires one current hot and R2 SOD publication', () => {
    expect(validateFDICCoverage(bounds, completeActual())).toEqual([]);
  });

  it('fails closed for a missing partition, count drift, or a stale current pointer', () => {
    const actual = completeActual();
    actual.publications = actual.publications.filter(
      (row) => !(row.dataset === 'annual-summary' && row.partition_key === '1934:CB')
    );
    actual.lake[0].row_count = 1;
    actual.lake[0].is_current_snapshot = 0;
    expect(validateFDICCoverage(bounds, actual)).toEqual(expect.arrayContaining([
      expect.stringContaining('annual-summary missing 1934:CB'),
      expect.stringContaining('SOD R2 1994 source/stored mismatch'),
      expect.stringContaining('exactly one current snapshot')
    ]));
  });
});
