import { describe, expect, it } from 'vitest';
import {
  buildAssetBridge,
  buildFrozenPeerMovement,
  buildFundingBridge,
  buildQuarterlyNetIncomeBridge,
  decomposeLoanToDeposit,
  previousQuarterDate,
  resolveQuarterFlow,
  type AttributionRow
} from './change-attribution';

const sofiQ3: AttributionRow = {
  repdte: '20250930',
  asset: 41_250_282,
  chbal: 3_520_371,
  frepo: 0,
  sec: 2_388_529,
  lnlsnet: 33_722_667,
  trade: 84_464,
  ore: 0,
  bkprem: 3_489,
  intan: 330_071,
  oa: 1_200_691,
  dep: 33_767_514,
  frepp: 0,
  othbor: 893_735,
  subnd: 0,
  tradel: 0,
  allothl: 773_516,
  eq: 5_815_517,
  netincq: 190_166,
  nimq: 576_092,
  noniiq: 260_068,
  nonixq: 575_318,
  elnatq: 9_199,
  iglsecq: 194,
  itaxq: 61_671,
  extraq: 0
};

const sofiQ4: AttributionRow = {
  repdte: '20251231',
  asset: 46_568_135,
  chbal: 5_405_856,
  frepo: 0,
  sec: 2_600_697,
  lnlsnet: 36_743_813,
  trade: 89_520,
  ore: 0,
  bkprem: 3_395,
  intan: 333_275,
  oa: 1_391_579,
  dep: 39_706_752,
  frepp: 0,
  othbor: 0,
  subnd: 0,
  tradel: 0,
  allothl: 830_964,
  eq: 6_030_419,
  netincq: 204_215,
  nimq: 612_328,
  noniiq: 273_681,
  nonixq: 616_634,
  elnatq: 5_407,
  iglsecq: 3_803,
  itaxq: 63_556,
  extraq: 0
};

describe('additive balance bridges', () => {
  it('reconciles the SoFi-like asset and funding identities exactly', () => {
    const assets = buildAssetBridge(sofiQ3, sofiQ4);
    const funding = buildFundingBridge(sofiQ3, sofiQ4);

    expect(assets.totalChange).toBe(5_317_853);
    expect(assets.residual).toBe(0);
    expect(assets.reconciliation).toBe('reconciled');
    expect(assets.dataCoverage).toBe(1);
    expect(assets.contributions.find((item) => item.key === 'lnlsnet')?.change).toBe(3_021_146);

    expect(funding.totalChange).toBe(5_317_853);
    expect(funding.residual).toBe(0);
    expect(funding.reconciliation).toBe('reconciled');
    expect(funding.contributions.find((item) => item.key === 'dep')?.change).toBe(5_939_238);
    expect(funding.contributions.find((item) => item.key === 'othbor')?.change).toBe(-893_735);
  });

  it('keeps a visible residual and field coverage when a component is missing', () => {
    const partialTo = { ...sofiQ4, oa: null };
    const bridge = buildAssetBridge(sofiQ3, partialTo);

    expect(bridge.method).toBe('exact_difference_identity');
    expect(bridge.reconciliation).toBe('partial_inputs');
    expect(bridge.dataCoverage).toBeLessThan(1);
    expect(bridge.residual).toBe(190_888);
    expect(bridge.contributions.find((item) => item.key === 'oa')?.change).toBeNull();
  });

  it('does not claim an identity when an endpoint total is missing', () => {
    const bridge = buildFundingBridge(sofiQ3, { ...sofiQ4, asset: null });
    expect(bridge.method).toBe('unavailable');
    expect(bridge.reconciliation).toBe('missing_total');
    expect(bridge.totalChange).toBeNull();
  });

  it('reconciles the current published SoFi 2026Q1 to 2026Q2 example', () => {
    // Official FDIC BankFind values observed 2026-08-30; historical filings can
    // later be restated, so this fixture records the source snapshot explicitly.
    const q1: AttributionRow = {
      repdte: '20260331', asset: 49_667_835, chbal: 3_746_570, frepo: 0,
      sec: 3_042_836, lnlsnet: 40_853_216, trade: 153_303, ore: 0,
      bkprem: 3_349, intan: 372_539, oa: 1_496_022, dep: 42_321_604,
      frepp: 0, othbor: 0, subnd: 0, tradel: 0, allothl: 1_020_208,
      eq: 6_326_023, netincq: 244_608, nimq: 687_512, noniiq: 306_497,
      nonixq: 666_899, elnatq: 8_895, iglsecq: 7_875, itaxq: 81_482, extraq: 0
    };
    const q2: AttributionRow = {
      repdte: '20260630', asset: 56_821_411, chbal: 3_787_737, frepo: 0,
      sec: 4_034_230, lnlsnet: 46_666_253, trade: 205_503, ore: 0,
      bkprem: 3_257, intan: 368_225, oa: 1_756_206, dep: 46_781_713,
      frepp: 0, othbor: 1_488_308, subnd: 0, tradel: 0, allothl: 1_273_434,
      eq: 7_277_956, netincq: 259_508, nimq: 783_426, noniiq: 345_314,
      nonixq: 761_714, elnatq: 13_755, iglsecq: -140, itaxq: 93_623, extraq: 0
    };

    expect(buildAssetBridge(q1, q2)).toMatchObject({
      totalChange: 7_153_576,
      residual: 0,
      reconciliation: 'reconciled'
    });
    expect(buildFundingBridge(q1, q2)).toMatchObject({
      totalChange: 7_153_576,
      residual: 0,
      reconciliation: 'reconciled'
    });
    expect(buildQuarterlyNetIncomeBridge({ row: q1 }, { row: q2 })).toMatchObject({
      totalChange: 14_900,
      residual: 0,
      reconciliation: 'reconciled'
    });
  });
});

describe('quarter flows', () => {
  it('prefers a reported single-quarter value', () => {
    const result = resolveQuarterFlow(
      { row: { repdte: '20250630', netincq: 45, netinc: 100 } },
      'netincq',
      'netinc'
    );
    expect(result).toEqual({ value: 45, method: 'reported_single_quarter', reason: null });
  });

  it('derives a YTD flow only from consecutive quarters in the same year', () => {
    const result = resolveQuarterFlow(
      {
        row: { repdte: '20250630', netinc: 100 },
        previousRow: { repdte: '20250331', netinc: 40 }
      },
      'netincq',
      'netinc'
    );
    expect(result).toEqual({ value: 60, method: 'derived_from_consecutive_ytd', reason: null });
  });

  it('uses first-quarter YTD directly but rejects gaps and cross-year subtraction', () => {
    expect(resolveQuarterFlow(
      { row: { repdte: '20250331', netinc: 40 } },
      'netincq',
      'netinc'
    )).toEqual({ value: 40, method: 'reported_ytd_first_quarter', reason: null });

    expect(resolveQuarterFlow(
      {
        row: { repdte: '20250930', netinc: 120 },
        previousRow: { repdte: '20250331', netinc: 40 }
      },
      'netincq',
      'netinc'
    ).reason).toBe('missing_consecutive_prior_quarter');

    expect(resolveQuarterFlow(
      {
        row: { repdte: '20250331', netinc: null },
        previousRow: { repdte: '20241231', netinc: 200 }
      },
      'netincq',
      'netinc'
    ).value).toBeNull();
  });

  it('reconciles reported quarterly net-income drivers for the SoFi-like example', () => {
    const bridge = buildQuarterlyNetIncomeBridge({ row: sofiQ3 }, { row: sofiQ4 });
    expect(bridge.totalChange).toBe(14_049);
    expect(bridge.residual).toBe(0);
    expect(bridge.reconciliation).toBe('reconciled');
    expect(bridge.contributions.find((item) => item.key === 'net_interest_income')?.change).toBe(36_236);
    expect(bridge.contributions.find((item) => item.key === 'noninterest_expense')?.change).toBe(-41_316);
  });
});

describe('loan-to-deposit Shapley attribution', () => {
  it('reconciles numerator and denominator contributions exactly', () => {
    const result = decomposeLoanToDeposit(
      sofiQ3.lnlsnet as number,
      sofiQ4.lnlsnet as number,
      sofiQ3.dep as number,
      sofiQ4.dep as number
    );
    expect(result.status).toBe('ok');
    expect(result.method).toBe('exact_two_factor_shapley');
    expect((result.contributions.numerator ?? 0) + (result.contributions.denominator ?? 0))
      .toBeCloseTo(result.totalChange ?? 0, 12);
    expect(result.totalChange).toBeCloseTo(-7.329, 3);
  });

  it('returns an honest unavailable state for zero or missing denominators', () => {
    expect(decomposeLoanToDeposit(100, 120, 0, 100).status).toBe('zero_denominator');
    expect(decomposeLoanToDeposit(100, null, 80, 100).status).toBe('missing_input');
  });
});

describe('frozen opening-quarter peer cohorts', () => {
  const rows = [
    { cert: 99, assetBucket: 5, fromValue: 100, toValue: 150 },
    { cert: 1, assetBucket: 5, fromValue: 100, toValue: 110 },
    { cert: 2, assetBucket: 5, fromValue: 100, toValue: 120 },
    { cert: 3, assetBucket: 4, fromValue: 100, toValue: 105 },
    { cert: 4, assetBucket: 4, fromValue: 100, toValue: 115 },
    { cert: 5, assetBucket: 6, fromValue: 100, toValue: 200 },
    { cert: 6, assetBucket: 5, fromValue: null, toValue: 130 }
  ];

  it('excludes the subject, requires both quarters, and broadens from the frozen t0 bucket', () => {
    const result = buildFrozenPeerMovement({
      metric: 'total_assets',
      mode: 'percent_change',
      fromRepdte: '20250930',
      toRepdte: '20251231',
      subjectCert: 99,
      subjectAssetBucket: 5,
      subjectFrom: 100,
      subjectTo: 130,
      rows,
      minimumPeerCount: 4
    });

    expect(result.status).toBe('ok');
    expect(result.cohort.fallback).toBe('broad_asset_band');
    expect(result.cohort.selectedAssetBuckets).toEqual([4, 5]);
    expect(result.peerCount).toBe(4);
    expect(result.peerMedian).toBeCloseTo(12.5);
    expect(result.cohort.hash).toMatch(/^fnv1a32:/);
  });

  it('returns a stable hash and marks a still-small broad cohort insufficient', () => {
    const input = {
      metric: 'total_assets',
      mode: 'percent_change' as const,
      fromRepdte: '20250930',
      toRepdte: '20251231',
      subjectCert: 99,
      subjectAssetBucket: 5,
      subjectFrom: 100,
      subjectTo: 130,
      rows,
      minimumPeerCount: 10
    };
    const first = buildFrozenPeerMovement(input);
    const second = buildFrozenPeerMovement({ ...input, rows: [...rows].reverse() });
    expect(first.status).toBe('insufficient_peers');
    expect(first.cohort.hash).toBe(second.cohort.hash);
  });
});

describe('quarter date arithmetic', () => {
  it('handles year boundaries without hardcoded reporting periods', () => {
    expect(previousQuarterDate('20260630')).toBe('20260331');
    expect(previousQuarterDate('20260331')).toBe('20251231');
    expect(previousQuarterDate('20260430')).toBeNull();
  });
});
