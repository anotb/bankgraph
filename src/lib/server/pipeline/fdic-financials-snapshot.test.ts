import { describe, expect, it } from 'vitest';
import recordedFixture from '../../../../demo/fixtures/fdic-demo.json';
import { mapInstitutionFinancialSnapshot } from './fdic-financials-snapshot';

describe('mapInstitutionFinancialSnapshot', () => {
  it('uses RBC1RWAJ for Tier 1 and never substitutes total RBC', () => {
    const snapshot = mapInstitutionFinancialSnapshot({
      CERT: 628,
      REPDTE: '20260630',
      RBCRWAJ: '16.23',
      RBC1RWAJ: '15.03'
    }, '20260630');

    expect(snapshot.tier1_ratio).toBe(15.03);
  });

  it('keeps Tier 1 null when only the total risk-based ratio is reported', () => {
    const snapshot = mapInstitutionFinancialSnapshot({
      CERT: 628,
      REPDTE: '20260630',
      RBCRWAJ: '16.23',
      RBC1RWAJ: null
    }, '20260630');

    expect(snapshot.tier1_ratio).toBeNull();
  });

  it('matches the recorded fixture mapping for the same official source fields', () => {
    const recordedBank = recordedFixture.institutions.find((bank) => bank.cert === 628);
    expect(recordedBank).toBeDefined();

    const snapshot = mapInstitutionFinancialSnapshot({
      CERT: recordedBank!.cert,
      REPDTE: recordedBank!.latest_repdte,
      ROA: recordedBank!.latest_roa,
      ROE: recordedBank!.latest_roe,
      NIMY: recordedBank!.latest_nim,
      NCLNLSR: recordedBank!.latest_npl_ratio,
      RBC1RWAJ: recordedBank!.latest_tier1_ratio,
      RBCRWAJ: 99
    }, recordedBank!.latest_repdte!);

    expect(snapshot).toMatchObject({
      cert: recordedBank!.cert,
      repdte: recordedBank!.latest_repdte,
      tier1_ratio: recordedBank!.latest_tier1_ratio
    });
  });
});
