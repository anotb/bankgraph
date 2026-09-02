import { describe, expect, it } from 'vitest';
import {
	deriveSystemBrief,
	MAX_SYSTEM_SIGNALS,
	resolveSystemQuarterFlow,
	type MacroOverlay,
	type SystemFinancialRow
} from './system-signals';

const macro: MacroOverlay[] = [
	{ seriesId: 'FRB_FEDFUNDS', title: 'Federal Funds Effective Rate', frequency: 'Monthly', units: 'Percent', observationDate: '2026-02-01', value: 3.5 },
	{ seriesId: 'UST10Y', title: '10-Year Treasury', frequency: 'Daily', units: 'Percent', observationDate: '2026-02-27', value: 4.1 },
	{ seriesId: 'BLS_UNRATE', title: 'Unemployment Rate', frequency: 'Monthly', units: 'Percent', observationDate: '2026-02-01', value: 4.2 }
];

function row(cert: number, repdte: string, overrides: Partial<SystemFinancialRow> = {}): SystemFinancialRow {
	const periodStep = repdte === '20251231' ? 1.1 : repdte === '20250930' ? 1 : 0.9;
	return {
		cert,
		repdte,
		name: `Bank ${cert}`,
		state: cert % 2 ? 'CA' : 'TX',
		asset_bucket: cert <= 20 ? 4 : 5,
		asset: 1_000_000 * periodStep * cert,
		dep: 800_000 * periodStep * cert,
		lnlsnet: 600_000 * periodStep * cert,
		netinc: 10_000 * periodStep * cert,
		netincq: 3_000 * periodStep * cert,
		nimy: 3.2 + periodStep / 10,
		nclnlsr: 0.8 - periodStep / 20,
		rbcrwaj: 14 + periodStep / 10,
		...overrides
	};
}

function fullRows(count = 40): SystemFinancialRow[] {
	const rows: SystemFinancialRow[] = [];
	for (let cert = 1; cert <= count; cert++) {
		rows.push(row(cert, '20251231'));
		rows.push(row(cert, '20250930'));
		rows.push(row(cert, '20250630'));
	}
	return rows;
}

describe('recurring banking-system signals', () => {
	it('builds a bounded, auditable brief across volume, mix, risk, coverage, and cohorts', () => {
		const result = deriveSystemBrief({
			currentRepdte: '20251231',
			rows: fullRows(),
			macroOverlays: macro,
			now: new Date('2026-03-01T00:00:00.000Z')
		});

		expect(result.status).toBe('complete');
		expect(result.signals.length).toBeLessThanOrEqual(MAX_SYSTEM_SIGNALS);
		expect(result.signals.map((signal) => signal.metric)).toEqual(expect.arrayContaining([
			'total_assets',
			'net_loans',
			'total_deposits',
			'loans_to_assets',
			'deposits_to_assets',
			'quarterly_net_income',
			'net_interest_margin',
			'noncurrent_loans_ratio',
			'total_risk_based_capital_ratio',
			'reporting_institution_count',
			'state_asset_growth',
			'size_cohort_asset_growth',
			'core_field_coverage'
		]));
		for (const signal of result.signals) {
			expect(signal.source.version).toBe('bankgraph-system-signals-v2');
			expect(signal.source.fields.length).toBeGreaterThan(0);
			expect(signal.source.formula.length).toBeGreaterThan(10);
			expect(signal.period.current).toBe('20251231');
			expect(signal.coverage.ratio).toBeGreaterThanOrEqual(0);
			expect(signal.coverage.ratio).toBeLessThanOrEqual(1);
		}
		expect(result.macroOverlays.usage).toBe('context_only_no_causal_inference');
		const nim = result.signals.find((signal) => signal.metric === 'net_interest_margin');
		expect(nim?.current.unit).toBe('percent');
		expect(nim?.change.unit).toBe('percentage_points');
		expect(nim?.comparison.unit).toBe('percentage_points');
		const assets = result.signals.find((signal) => signal.metric === 'total_assets');
		expect(assets?.current.unit).toBe('usd_thousands');
		expect(assets?.comparison.unit).toBe('percent');
		expect(assets?.title).toBe('Assets among paired reporters');
		expect(result.signals.find((signal) => signal.metric === 'total_deposits')?.title)
			.toBe('Deposits among paired reporters');
		expect(result.changeRadar?.metrics.map((metric) => metric.id)).toEqual([
			'total_assets',
			'total_deposits',
			'net_loans'
		]);
	});

	it('derives matched-bank breadth, median movement, and additive contributors', () => {
		const assetByCert = {
			1: { prior: 1_000, current: 1_100 },
			2: { prior: 1_000, current: 1_020 },
			3: { prior: 1_000, current: 970 },
			4: { prior: 1_000, current: 1_000 }
		} as const;
		const rows = Object.entries(assetByCert).flatMap(([certText, values]) => {
			const cert = Number(certText);
			return [
				row(cert, '20251231', { asset: values.current }),
				row(cert, '20250930', { asset: values.prior }),
				row(cert, '20250630')
			];
		});
		const result = deriveSystemBrief({
			currentRepdte: '20251231', rows, macroOverlays: macro,
			now: new Date('2026-03-01T00:00:00.000Z')
		});
		const assets = result.changeRadar?.metrics.find((metric) => metric.id === 'total_assets');

		expect(result.changeRadar?.population).toMatchObject({
			currentReportingInstitutions: 4,
			priorReportingInstitutions: 4,
			matchedInstitutions: 4,
			entriesAndExits: 'excluded_from_breadth_and_contributors'
		});
		expect(assets?.population).toEqual({ eligible: 4, percentChangeEligible: 4 });
		expect(assets?.breadth).toMatchObject({
			increasing: 2,
			decreasing: 1,
			unchanged: 1,
			increasingShare: 50,
			decreasingShare: 25,
			unchangedShare: 25,
			medianPercentChange: 1
		});
		expect(assets?.matchedTotals).toMatchObject({ prior: 4_000, current: 4_090, change: 90 });
		expect(assets?.contributors.increases.map((bank) => bank.cert)).toEqual([1, 2]);
		expect(assets?.contributors.decreases.map((bank) => bank.cert)).toEqual([3]);
		expect(assets?.contributors.increases[0]).toMatchObject({
			name: 'Bank 1',
			change: 100
		});
		expect(assets?.contributors.increases[0]?.shareOfGrossMovement).toBeCloseTo(66.6667, 3);
	});

	it('keeps zero-opening and missing-value semantics when adapting the shared transition engine', () => {
		const rows = [
			row(1, '20251231', { name: '   ', asset: 10 }),
			row(1, '20250930', { asset: 0 }),
			row(1, '20250630'),
			row(2, '20251231', { asset: 200 }),
			row(2, '20250930', { asset: null }),
			row(2, '20250630'),
			row(3, '20251231', { asset: 100 }),
			row(3, '20250930', { asset: 100 }),
			row(3, '20250630')
		];
		const result = deriveSystemBrief({
			currentRepdte: '20251231', rows, macroOverlays: macro,
			now: new Date('2026-03-01T00:00:00.000Z')
		});
		const assets = result.changeRadar?.metrics.find((metric) => metric.id === 'total_assets');

		expect(result.changeRadar?.population.matchedInstitutions).toBe(3);
		expect(assets?.population).toEqual({ eligible: 2, percentChangeEligible: 1 });
		expect(assets?.breadth).toMatchObject({ increasing: 1, decreasing: 0, unchanged: 1, medianPercentChange: 0 });
		expect(assets?.matchedTotals).toMatchObject({ prior: 100, current: 110, change: 10, percentChange: 10 });
		expect(assets?.contributors).toMatchObject({ grossMovement: 10 });
		expect(assets?.contributors.increases[0]).toMatchObject({
			cert: 1, name: 'FDIC certificate 1', change: 10, shareOfGrossMovement: 100
		});
	});

	it('withholds movement signals when the exact prior calendar quarter is missing', () => {
		const rows = [
			...Array.from({ length: 20 }, (_, index) => row(index + 1, '20251231')),
			...Array.from({ length: 20 }, (_, index) => row(index + 1, '20250630'))
		];
		const result = deriveSystemBrief({
			currentRepdte: '20251231', rows, macroOverlays: macro,
			now: new Date('2026-03-01T00:00:00.000Z')
		});

		expect(result.status).toBe('partial');
		expect(result.reportingPeriod.expectedPrior).toBe('20250930');
		expect(result.reportingPeriod.prior).toBeNull();
		expect(result.signals.filter((signal) => signal.kind === 'movement')).toHaveLength(0);
		expect(result.changeRadar).toBeNull();
		expect(result.warnings.join(' ')).toContain('exact prior calendar quarter 20250930');
	});

	it('suppresses sparse geography and size cohorts instead of overstating them', () => {
		const result = deriveSystemBrief({
			currentRepdte: '20251231',
			rows: fullRows(8),
			macroOverlays: macro,
			now: new Date('2026-03-01T00:00:00.000Z')
		});

		expect(result.signals.some((signal) => signal.metric === 'state_asset_growth')).toBe(false);
		expect(result.signals.some((signal) => signal.metric === 'size_cohort_asset_growth')).toBe(false);
		expect(result.warnings.join(' ')).toContain('15-institution minimum');
	});

	it('handles zero MAD as zero dispersion rather than infinite rarity', () => {
		const result = deriveSystemBrief({
			currentRepdte: '20251231',
			rows: fullRows(),
			macroOverlays: macro,
			now: new Date('2026-03-01T00:00:00.000Z')
		});
		const assets = result.signals.find((signal) => signal.metric === 'total_assets');

		expect(assets?.rarity).toMatchObject({
			band: 'typical',
			method: 'zero_dispersion',
			robustZ: null
		});
	});

	it('marks an otherwise valid brief partial when the published quarter is stale', () => {
		const result = deriveSystemBrief({
			currentRepdte: '20251231', rows: fullRows(), macroOverlays: macro,
			now: new Date('2026-08-30T00:00:00.000Z')
		});

		expect(result.status).toBe('partial');
		expect(result.reportingPeriod.isStale).toBe(true);
		expect(result.reportingPeriod.expectedLatest).toBe('20260630');
		expect(result.warnings.join(' ')).toContain('Latest data is 20251231');
	});

	it('keeps the FDIC brief complete when optional macro context is absent', () => {
		const result = deriveSystemBrief({
			currentRepdte: '20251231', rows: fullRows(), macroOverlays: null,
			now: new Date('2026-03-01T00:00:00.000Z')
		});

		expect(result.status).toBe('complete');
		expect(result.macroOverlays.status).toBe('unavailable');
		expect(result.warnings.join(' ')).toContain('Direct-agency macro overlays are unavailable');
	});

	it('marks incomplete core FDIC fields partial from row coverage', () => {
		const rows = fullRows();
		for (const candidate of rows) {
			if (candidate.repdte === '20251231' && candidate.cert <= 4) candidate.dep = null;
		}
		const result = deriveSystemBrief({
			currentRepdte: '20251231', rows, macroOverlays: macro,
			now: new Date('2026-03-01T00:00:00.000Z')
		});

		expect(result.status).toBe('partial');
		expect(result.signals.find((signal) => signal.metric === 'core_field_coverage')?.coverage.status).toBe('partial');
	});

	it('marks a signal partial when prior-period coverage is incomplete', () => {
		const rows = fullRows();
		for (const candidate of rows) {
			if (candidate.repdte === '20250930' && candidate.cert <= 4) candidate.dep = null;
		}
		const result = deriveSystemBrief({
			currentRepdte: '20251231', rows, macroOverlays: macro,
			now: new Date('2026-03-01T00:00:00.000Z')
		});

		const coverage = result.signals.find((signal) => signal.metric === 'core_field_coverage')?.coverage;
		expect(coverage).toMatchObject({
			availableCurrent: 40,
			availablePrior: 36,
			status: 'partial'
		});
		expect(result.status).toBe('partial');
	});

	it('marks matched-movement coverage partial when the period populations do not overlap', () => {
		const rows = [
			...Array.from({ length: 40 }, (_, index) => row(index + 1, '20251231')),
			...Array.from({ length: 40 }, (_, index) => row(index + 101, '20250930')),
			...Array.from({ length: 40 }, (_, index) => row(index + 101, '20250630'))
		];
		const result = deriveSystemBrief({
			currentRepdte: '20251231', rows, macroOverlays: macro,
			now: new Date('2026-03-01T00:00:00.000Z')
		});

		const assets = result.signals.find((signal) => signal.metric === 'total_assets');
		expect(assets?.coverage).toMatchObject({
			availableCurrent: 40,
			availablePrior: 40,
			paired: 0,
			status: 'partial'
		});
		expect(result.status).toBe('partial');
	});

	it('calculates aggregate movements from the exact paired reporters only', () => {
		const rows = [
			row(1, '20251231', { lnlsnet: 110 }),
			row(2, '20251231', { lnlsnet: 9_999 }),
			row(1, '20250930', { lnlsnet: 100 }),
			row(3, '20250930', { lnlsnet: 8_888 }),
			row(1, '20250630')
		];
		const result = deriveSystemBrief({
			currentRepdte: '20251231', rows, macroOverlays: macro,
			now: new Date('2026-03-01T00:00:00.000Z')
		});

		const loans = result.signals.find((signal) => signal.metric === 'net_loans');
		expect(loans).toMatchObject({
			title: 'Net loans and leases among paired reporters',
			current: { value: 110 },
			prior: { value: 100 },
			change: { absolute: 10, percent: 10 },
			coverage: {
				populationCurrent: 2,
				populationPrior: 2,
				availableCurrent: 2,
				availablePrior: 2,
				paired: 1
			}
		});
		expect(loans?.source.formula).toContain('non-null value in both exact quarters');
	});
});

describe('quarterly earnings validity', () => {
	it('prefers a reported single-quarter value', () => {
		expect(resolveSystemQuarterFlow(row(1, '20251231', { netincq: 42 }), null)).toEqual({
			value: 42,
			method: 'reported_single_quarter'
		});
	});

	it('derives a YTD flow only from an exact consecutive quarter in the same year', () => {
		const current = row(1, '20250930', { netincq: null, netinc: 90 });
		const prior = row(1, '20250630', { netincq: null, netinc: 55 });
		expect(resolveSystemQuarterFlow(current, prior)).toEqual({
			value: 35,
			method: 'derived_consecutive_ytd'
		});
	});

	it('does not derive a flow across a missing quarter or calendar-year boundary', () => {
		const current = row(1, '20250930', { netincq: null, netinc: 90 });
		const nonconsecutive = row(1, '20250331', { netincq: null, netinc: 20 });
		expect(resolveSystemQuarterFlow(current, nonconsecutive)).toEqual({
			value: null,
			method: 'unavailable'
		});
	});
});
