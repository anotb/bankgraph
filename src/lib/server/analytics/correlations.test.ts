import { describe, it, expect } from 'vitest';
import { pearsonCorrelation, repdteToQuarterStart } from './correlations';

describe('pearsonCorrelation', () => {
	it('returns NaN for arrays shorter than 3', () => {
		expect(pearsonCorrelation([], [])).toBeNaN();
		expect(pearsonCorrelation([1], [2])).toBeNaN();
		expect(pearsonCorrelation([1, 2], [3, 4])).toBeNaN();
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

	it('uses the shorter array length when arrays differ in size', () => {
		const x = [1, 2, 3, 4, 5, 6, 7];
		const y = [2, 4, 6]; // only 3 elements
		// Should compute on first 3 elements: x=[1,2,3], y=[2,4,6] -> perfect correlation
		expect(pearsonCorrelation(x, y)).toBeCloseTo(1.0, 10);
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
