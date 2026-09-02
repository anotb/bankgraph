import { describe, expect, it } from 'vitest';
import { buildFDICReadPlan } from './fdic-read';

describe('buildFDICReadPlan', () => {
  it('reads only rows belonging to the fully published run', () => {
    const search = new URLSearchParams({ partition: '2024:SI', state: 'va', limit: '25' });
    const plan = buildFDICReadPlan('annual-summary', '2024:SI', search);
    expect(plan.sql).toContain('year = ? AND charter_type = ?');
    expect(plan.sql).toContain('source_run_id = (SELECT run_id FROM fdic_dataset_publications');
    expect(plan.sql).toContain('stalp = ?');
    expect(plan.params).toEqual([2024, 'SI', 'annual-summary', '2024:SI', 'VA']);
    expect(plan.limit).toBe(25);
  });

  it('bounds public result pages', () => {
    expect(() => buildFDICReadPlan(
      'sod',
      '2024',
      new URLSearchParams({ limit: '201' })
    )).toThrow('limit must be between 1 and 200');
  });

  it('requires an actual snapshot date for public reads', () => {
    expect(() => buildFDICReadPlan(
      'locations',
      'latest',
      new URLSearchParams()
    )).toThrow('resolved snapshot date');
  });

  it('reads an entire history process-year publication, including older effective years', () => {
    const plan = buildFDICReadPlan('history', '2026', new URLSearchParams());
    expect(plan.sql).toContain('proc_year = ?');
    expect(plan.sql).not.toContain('eff_year = ?');
    expect(plan.params).toEqual([2026, 'history', '2026']);
  });

  it('keeps quarterly and institution reads behind the elected release views', () => {
    const financials = buildFDICReadPlan('financials', '20240331', new URLSearchParams());
    const institutions = buildFDICReadPlan('institutions', '2024-05-01', new URLSearchParams());
    expect(financials.sql).toContain('FROM published_financials');
    expect(financials.sql).not.toContain('fdic_dataset_publications');
    expect(financials.params).toEqual(['20240331']);
    expect(institutions.sql).toContain('FROM published_institutions');
    expect(institutions.sql).toContain('fdic_dataset_publications');
  });
});
