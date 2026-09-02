import { describe, expect, it } from 'vitest';
import {
  COMPOSITION_DEFINITIONS,
  compositionDefinition,
  deriveCompositionChange,
  deriveCompositionSnapshot,
  validateCompositionDefinitions,
  type CompositionDefinition,
  type CompositionRow
} from './composition';

const assetRow = (overrides: Partial<CompositionRow> = {}): CompositionRow => ({
  cert: 1,
  repdte: '20260630',
  asset: 1_000,
  chbal: 100,
  frepo: 20,
  sec: 200,
  lnlsnet: 500,
  trade: 10,
  ore: 5,
  bkprem: 15,
  intan: 50,
  oa: 100,
  dep: 700,
  frepp: 20,
  othbor: 80,
  subnd: 10,
  tradel: 5,
  allothl: 85,
  eq: 100,
  lnre: 250,
  lnci: 150,
  lncon: 50,
  ...overrides
});

describe('composition registry', () => {
  it('uses the FDIC fields behind the existing exact balance-sheet identities', () => {
    expect(compositionDefinition('asset_mix')).toMatchObject({
      denominator: { field: 'asset', sourceField: 'ASSET' },
      identity: 'reported_balance_sheet_identity'
    });
    expect(compositionDefinition('asset_mix').components.map((item) => item.sourceField))
      .toContain('SC');
    expect(compositionDefinition('funding_mix').components.map((item) => item.sourceField))
      .toContain('OTHBOR');
    expect(compositionDefinition('loan_mix').residual).toMatchObject({
      label: 'Unclassified / basis residual',
      expected: true,
      canBeNegative: true
    });
    expect(validateCompositionDefinitions(COMPOSITION_DEFINITIONS)).toEqual([]);
  });

  it('rejects overlapping component fields, denominator overlap, and duplicate ids', () => {
    const base = compositionDefinition('asset_mix');
    const malformed: CompositionDefinition = {
      ...base,
      components: [
        base.components[0],
        { ...base.components[0], id: 'duplicate_field' },
        { ...base.components[1], id: base.residual.id, field: 'asset' }
      ]
    };
    const issues = validateCompositionDefinitions([malformed, malformed]);
    expect(issues.map((issue) => issue.path)).toEqual(expect.arrayContaining([
      'id',
      'components.duplicate_field.field',
      `components.${base.residual.id}.field`,
      'residual.id'
    ]));
  });
});

describe('point-in-time composition', () => {
  it('reconciles asset and funding identities exactly for one institution', () => {
    const assets = deriveCompositionSnapshot('asset_mix', [assetRow()]);
    const funding = deriveCompositionSnapshot('funding_mix', [assetRow()]);

    expect(assets).toMatchObject({
      scope: 'institution',
      status: 'ok',
      denominator: { value: 1_000, reporterCount: 1 },
      residual: { value: 0, sharePercent: 0 },
      reconciliation: {
        status: 'reconciled',
        componentTotal: 1_000,
        reconstructedTotal: 1_000,
        difference: 0
      },
      coverage: { completeReporters: 1, excludedReporters: 0 }
    });
    expect(assets.components.find((item) => item.id === 'net_loans')).toMatchObject({
      value: 500,
      sharePercent: 50
    });

    expect(funding).toMatchObject({
      status: 'ok',
      denominator: { value: 1_000 },
      residual: { value: 0 },
      reconciliation: { status: 'reconciled' }
    });
    expect(funding.components.find((item) => item.id === 'deposits')?.sharePercent).toBe(70);
  });

  it('uses a ratio of sums for cohorts instead of averaging bank shares', () => {
    const result = deriveCompositionSnapshot('loan_mix', [
      assetRow({ cert: 1, lnlsnet: 100, lnre: 100, lnci: 0, lncon: 0 }),
      assetRow({ cert: 2, lnlsnet: 900, lnre: 0, lnci: 900, lncon: 0 })
    ]);

    expect(result.scope).toBe('cohort');
    expect(result.denominator.value).toBe(1_000);
    expect(result.components.find((item) => item.id === 'real_estate')?.sharePercent).toBe(10);
    expect(result.components.find((item) => item.id === 'commercial_industrial')?.sharePercent).toBe(90);
    expect(result.source.shareFormula).toContain('SUM(component) / SUM(denominator)');
  });

  it('keeps the loan basis residual visible, including when it is negative', () => {
    const positive = deriveCompositionSnapshot('loan_mix', [
      assetRow({ lnlsnet: 500, lnre: 250, lnci: 150, lncon: 50 })
    ]);
    const negative = deriveCompositionSnapshot('loan_mix', [
      assetRow({ lnlsnet: 100, lnre: 70, lnci: 30, lncon: 20 })
    ]);

    expect(positive).toMatchObject({
      residual: { value: 50, sharePercent: 10, expected: true, canBeNegative: true },
      reconciliation: { status: 'basis_residual' }
    });
    expect(negative).toMatchObject({
      residual: { value: -20, sharePercent: -20 },
      reconciliation: { status: 'basis_residual', reconstructedTotal: 100 }
    });
  });

  it('reports null, zero-denominator, and incomplete common-basis coverage honestly', () => {
    const missing = deriveCompositionSnapshot('loan_mix', [
      assetRow({ lnci: null })
    ]);
    expect(missing).toMatchObject({
      status: 'unavailable',
      denominator: { value: null },
      residual: { value: null },
      coverage: {
        denominatorReporters: 1,
        completeReporters: 0,
        excludedReporters: 1,
        missingFieldCounts: { lnci: 1 }
      }
    });

    const zero = deriveCompositionSnapshot('loan_mix', [
      assetRow({ lnlsnet: 0, lnre: 0, lnci: 0, lncon: 0 })
    ]);
    expect(zero).toMatchObject({
      status: 'zero_denominator',
      denominator: { value: 0 },
      residual: { value: 0, sharePercent: null },
      reconciliation: { status: 'zero_denominator' }
    });
    expect(zero.components.every((item) => item.sharePercent === null)).toBe(true);

    const partial = deriveCompositionSnapshot('loan_mix', [
      assetRow({ cert: 1, lnlsnet: 100, lnre: 50, lnci: 25, lncon: 10 }),
      assetRow({ cert: 2, lnlsnet: 10_000, lnre: null, lnci: 2_000, lncon: 1_000 })
    ]);
    expect(partial).toMatchObject({
      status: 'partial_coverage',
      denominator: { value: 100, reporterCount: 1 },
      coverage: {
        distinctReporters: 2,
        denominatorReporters: 2,
        completeReporters: 1,
        excludedReporters: 1,
        completeReporterShare: 0.5
      }
    });
  });
});

describe('composition change', () => {
  it('uses matched complete reporters and preserves the from-to identity', () => {
    const result = deriveCompositionChange(
      'asset_mix',
      [
        assetRow({ cert: 1, repdte: '20260331' }),
        assetRow({ cert: 2, repdte: '20260331', asset: 2_000, chbal: null }),
        assetRow({ cert: 3, repdte: '20260331' })
      ],
      [
        assetRow({
          cert: 1,
          repdte: '20260630',
          asset: 1_200,
          chbal: 150,
          frepo: 20,
          sec: 230,
          lnlsnet: 600,
          trade: 10,
          ore: 5,
          bkprem: 15,
          intan: 50,
          oa: 120
        }),
        assetRow({ cert: 2, repdte: '20260630' }),
        assetRow({ cert: 4, repdte: '20260630' })
      ]
    );

    expect(result).toMatchObject({
      status: 'partial_coverage',
      denominator: { fromValue: 1_000, toValue: 1_200, valueChange: 200 },
      matchedReporters: {
        fromReporters: 3,
        toReporters: 3,
        identityMatchedReporters: 2,
        comparableReporters: 1,
        nonComparableReporters: 1,
        fromOnlyReporters: 1,
        toOnlyReporters: 1
      },
      changeReconciliation: {
        status: 'reconciled',
        denominatorChange: 200,
        componentChangeTotal: 200,
        residualChange: 0,
        reconstructedChange: 200,
        difference: 0
      }
    });
    expect(result.components.find((item) => item.id === 'net_loans')).toMatchObject({
      fromValue: 500,
      toValue: 600,
      valueChange: 100,
      fromSharePercent: 50,
      toSharePercent: 50,
      shareChangePercentagePoints: 0
    });
  });

  it('includes the loan basis residual in the change identity', () => {
    const result = deriveCompositionChange(
      'loan_mix',
      [assetRow({ repdte: '20260331', lnlsnet: 100, lnre: 40, lnci: 30, lncon: 20 })],
      [assetRow({ repdte: '20260630', lnlsnet: 150, lnre: 80, lnci: 40, lncon: 10 })]
    );

    expect(result.residual).toMatchObject({
      fromValue: 10,
      toValue: 20,
      valueChange: 10
    });
    expect(result.changeReconciliation).toMatchObject({
      denominatorChange: 50,
      componentChangeTotal: 40,
      residualChange: 10,
      reconstructedChange: 50,
      difference: 0,
      status: 'reconciled'
    });
  });

  it('returns unavailable changes when there are no comparable reporters', () => {
    const result = deriveCompositionChange(
      'loan_mix',
      [assetRow({ cert: 1, repdte: '20260331' })],
      [assetRow({ cert: 2, repdte: '20260630' })]
    );
    expect(result.status).toBe('unavailable');
    expect(result.matchedReporters).toMatchObject({
      identityMatchedReporters: 0,
      comparableReporters: 0,
      fromOnlyReporters: 1,
      toOnlyReporters: 1
    });
    expect(result.changeReconciliation.status).toBe('unavailable');
  });
});
