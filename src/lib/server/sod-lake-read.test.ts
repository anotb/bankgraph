import { describe, expect, it } from 'vitest';
import {
  buildLatestSodBranchPlan,
  buildSodAggregatePlan,
  parseSodLakeYear
} from './sod-lake-read';

describe('buildSodAggregatePlan', () => {
  it('pins aggregate rows to the registered R2 checksum revision', () => {
    const plan = buildSodAggregatePlan(new URLSearchParams({
      level: 'county',
      year: '2024',
      state: 'va',
      limit: '25'
    }));
    expect(plan.sql).toContain('sod_county_year AS aggregate');
    expect(plan.sql).toContain('aggregate.source_sha256 = lake.object_sha256');
    expect(plan.params).toEqual([2024, '2024', 'VA', 25, 0]);
  });

  it('requires bounded county and bank filters to match their level', () => {
    expect(() => buildSodAggregatePlan(new URLSearchParams({
      level: 'county', year: '2024'
    }))).toThrow(/require state or county_fips/);
    expect(() => buildSodAggregatePlan(new URLSearchParams({
      level: 'state', year: '2024', cert: '10'
    }))).toThrow(/only valid for bank/);
  });

  it('rejects duplicate and unknown parameters', () => {
    expect(() => buildSodAggregatePlan(new URLSearchParams('year=2024&year=2025')))
      .toThrow(/Duplicate/);
    expect(() => buildSodAggregatePlan(new URLSearchParams('year=2024&sql=drop')))
      .toThrow(/Unknown/);
  });
});

describe('buildLatestSodBranchPlan', () => {
  it('requires a selective map or search shape and fetches one lookahead row', () => {
    expect(() => buildLatestSodBranchPlan(new URLSearchParams())).toThrow(/require state/);
    const plan = buildLatestSodBranchPlan(new URLSearchParams({
      west: '-78', south: '37', east: '-77', north: '38', limit: '50'
    }));
    expect(plan.sql).toContain('longitude >= ?');
    expect(plan.fetchLimit).toBe(51);
    expect(plan.params).toEqual([-78, -77, 37, 38, 51, 0]);
  });

  it('rejects incomplete and inverted map bounds', () => {
    expect(() => buildLatestSodBranchPlan(new URLSearchParams({ west: '-78' })))
      .toThrow(/supplied together/);
    expect(() => buildLatestSodBranchPlan(new URLSearchParams({
      west: '-77', south: '37', east: '-78', north: '38'
    }))).toThrow(/west must be less/);
  });
});

describe('parseSodLakeYear', () => {
  it('accepts exactly one SOD year', () => {
    expect(parseSodLakeYear(new URLSearchParams({ year: '2024' }))).toBe(2024);
    expect(() => parseSodLakeYear(new URLSearchParams({ year: '2024', all: '1' })))
      .toThrow(/Unknown/);
  });
});
