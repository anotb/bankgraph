import { describe, it, expect } from 'vitest';
import {
	CORRELATION_METHOD,
	CORRELATION_PLAN,
	MIN_CORRELATION_OBSERVATIONS,
	addQuarters,
	alignQuarterlySeries,
	analyzeContemporaneousYearOverYearChanges,
	pearsonCorrelation,
	repdteToQuarterStart,
	yearOverYearChanges
} from './correlations';

describe('pearsonCorrelation', () => {
	it('returns NaN without two paired values', () => {
		expect(pearsonCorrelation([], [])).toBeNaN();
		expect(pearsonCorrelation([1], [2])).toBeNaN();
		expect(pearsonCorrelation([1, 2], [3, 4])).toBeCloseTo(1, 10);
	});

	it('returns 1.0 for perfectly correlated arrays', () => {
		const x = [1, 2, 3, 4, 5];
		const y = [2, 4, 6, 8, 10];
		expect(pearsonCorrelation(x, y)).toBeCloseTo(1.0, 10);
	});

	it('returns -1.0 for perfectly inversely correlated arrays', () => {
		const x = [1, 2, 3, 4, 5];
		const y = [10, 8, 6, 4, 2];
		expect(pearsonCorrelation(x, y)).toBeCloseTo(-1.0, 10);
	});

	it('returns ~0 for uncorrelated arrays', () => {
		// sin and cos are orthogonal over a full period
		const n = 100;
		const x: number[] = [];
		const y: number[] = [];
		for (let i = 0; i < n; i++) {
			const t = (i / n) * 2 * Math.PI;
			x.push(Math.sin(t));
			y.push(Math.cos(t));
		}
		expect(Math.abs(pearsonCorrelation(x, y))).toBeLessThan(0.1);
	});

	it('returns NaN when one array has zero variance', () => {
		const x = [5, 5, 5, 5];
		const y = [1, 2, 3, 4];
		expect(pearsonCorrelation(x, y)).toBeNaN();
	});

	it('rejects arrays with different lengths rather than silently truncating a series', () => {
		const x = [1, 2, 3, 4, 5, 6, 7];
		const y = [2, 4, 6];
		expect(pearsonCorrelation(x, y)).toBeNaN();
	});

	it('handles very large values without overflow', () => {
		const x = [1e10, 2e10, 3e10, 4e10];
		const y = [1e10, 2e10, 3e10, 4e10];
		expect(pearsonCorrelation(x, y)).toBeCloseTo(1.0, 5);
	});

	it('handles very small differences', () => {
		const x = [1.000001, 1.000002, 1.000003];
		const y = [2.000001, 2.000002, 2.000003];
		expect(pearsonCorrelation(x, y)).toBeCloseTo(1.0, 5);
	});
});

describe('quarterly lag alignment', () => {
	it('uses calendar quarter arithmetic instead of array offsets across gaps', () => {
		const macro = new Map([['2024-01-01', 1], ['2024-07-01', 3]]);
		const bank = new Map([['2024-04-01', 10], ['2024-10-01', 30]]);
		expect(addQuarters('2024-10-01', 1)).toBe('2025-01-01');
		expect(alignQuarterlySeries(macro, bank, 1)).toEqual({
			x: [1, 3],
			y: [10, 30],
			macroQuarters: ['2024-01-01', '2024-07-01'],
			bankQuarters: ['2024-04-01', '2024-10-01']
		});
	});
});

describe('macro-bank co-movement methodology', () => {
	it('uses one predeclared contemporaneous test per economic pair', () => {
		expect(CORRELATION_METHOD).toBe('pearson_yoy_change_contemporaneous');
		expect(MIN_CORRELATION_OBSERVATIONS).toBe(2);
		expect(CORRELATION_PLAN).toEqual([
			{ macroSeries: 'FRB_FEDFUNDS', bankMetric: 'median_nim' },
			{ macroSeries: 'BLS_UNRATE', bankMetric: 'median_npl' },
			{ macroSeries: 'UST10Y2Y', bankMetric: 'median_roa' },
			{ macroSeries: 'UST10Y', bankMetric: 'median_nim' }
		]);
	});

	it('computes changes against the same quarter one year earlier and leaves gaps unpaired', () => {
		const levels = new Map([
			['2023-01-01', 1],
			['2023-04-01', 2],
			['2024-01-01', 4],
			['2024-04-01', 7],
			['2025-04-01', 11]
		]);

		expect([...yearOverYearChanges(levels)]).toEqual([
			['2024-01-01', 3],
			['2024-04-01', 5],
			['2025-04-01', 4]
		]);
	});

	it('calculates from two nonconstant paired changes and reports the exact window', () => {
		const macro = new Map<string, number>();
		const bank = new Map<string, number>();
		let quarter = '2010-01-01';
		for (let index = 0; index < 5; index++) {
			macro.set(quarter, index * index + Math.sin(index));
			bank.set(quarter, index * index * 0.5 + Math.cos(index));
			quarter = addQuarters(quarter, 1);
		}

		expect(analyzeContemporaneousYearOverYearChanges(macro, bank)).toBeNull();

		macro.set(quarter, 25 + Math.sin(5));
		bank.set(quarter, 12.5 + Math.cos(5));
		const result = analyzeContemporaneousYearOverYearChanges(macro, bank);
		expect(result).not.toBeNull();
		expect(result?.observations).toBe(2);
		expect(result?.windowStart).toBe('2011-01-01');
		expect(result?.windowEnd).toBe('2011-04-01');
	});

	it('does not publish a correlation when changes have no variance', () => {
		const macro = new Map<string, number>();
		const bank = new Map<string, number>();
		let quarter = '2010-01-01';
		for (let index = 0; index < 32; index++) {
			macro.set(quarter, index);
			bank.set(quarter, index * 2);
			quarter = addQuarters(quarter, 1);
		}

		// Both level series trend perfectly, but their year-over-year changes are
		// constant and therefore do not support a correlation estimate.
		expect(pearsonCorrelation([...macro.values()], [...bank.values()])).toBeCloseTo(1);
		expect(analyzeContemporaneousYearOverYearChanges(macro, bank)).toBeNull();
	});
});

describe('repdteToQuarterStart', () => {
	it('maps Q1 end dates to Q1 start', () => {
		expect(repdteToQuarterStart('20240331')).toBe('2024-01-01');
		expect(repdteToQuarterStart('20240131')).toBe('2024-01-01');
		expect(repdteToQuarterStart('20240228')).toBe('2024-01-01');
	});

	it('maps Q2 end dates to Q2 start', () => {
		expect(repdteToQuarterStart('20240630')).toBe('2024-04-01');
		expect(repdteToQuarterStart('20240430')).toBe('2024-04-01');
		expect(repdteToQuarterStart('20240531')).toBe('2024-04-01');
	});

	it('maps Q3 end dates to Q3 start', () => {
		expect(repdteToQuarterStart('20240930')).toBe('2024-07-01');
		expect(repdteToQuarterStart('20240731')).toBe('2024-07-01');
	});

	it('maps Q4 end dates to Q4 start', () => {
		expect(repdteToQuarterStart('20241231')).toBe('2024-10-01');
		expect(repdteToQuarterStart('20241031')).toBe('2024-10-01');
		expect(repdteToQuarterStart('20241130')).toBe('2024-10-01');
	});

	it('handles different years', () => {
		expect(repdteToQuarterStart('20200331')).toBe('2020-01-01');
		expect(repdteToQuarterStart('19990630')).toBe('1999-04-01');
	});
});
