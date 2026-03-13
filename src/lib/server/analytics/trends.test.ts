import { describe, it, expect } from 'vitest';
import { linearRegression } from './trends';

describe('linearRegression', () => {
	it('returns zeros for fewer than 2 points', () => {
		expect(linearRegression([])).toEqual({ slope: 0, intercept: 0, r_squared: 0 });
		expect(linearRegression([{ x: 1, y: 5 }])).toEqual({ slope: 0, intercept: 0, r_squared: 0 });
	});

	it('fits a perfect line y = 2x + 1', () => {
		const points = [
			{ x: 0, y: 1 },
			{ x: 1, y: 3 },
			{ x: 2, y: 5 },
			{ x: 3, y: 7 }
		];
		const result = linearRegression(points);

		expect(result.slope).toBeCloseTo(2.0, 10);
		expect(result.intercept).toBeCloseTo(1.0, 10);
		expect(result.r_squared).toBeCloseTo(1.0, 10);
	});

	it('fits a horizontal line (slope 0)', () => {
		const points = [
			{ x: 0, y: 5 },
			{ x: 1, y: 5 },
			{ x: 2, y: 5 }
		];
		const result = linearRegression(points);

		expect(result.slope).toBeCloseTo(0, 10);
		expect(result.intercept).toBeCloseTo(5, 10);
		// R-squared is 0 when all y are the same (no variance to explain)
		expect(result.r_squared).toBe(0);
	});

	it('computes R-squared between 0 and 1 for noisy data', () => {
		const points = [
			{ x: 0, y: 1.1 },
			{ x: 1, y: 2.9 },
			{ x: 2, y: 5.2 },
			{ x: 3, y: 6.8 }
		];
		const result = linearRegression(points);

		expect(result.slope).toBeGreaterThan(1.5);
		expect(result.slope).toBeLessThan(2.5);
		expect(result.r_squared).toBeGreaterThan(0.95);
		expect(result.r_squared).toBeLessThanOrEqual(1.0);
	});

	it('handles negative slope', () => {
		const points = [
			{ x: 0, y: 10 },
			{ x: 1, y: 8 },
			{ x: 2, y: 6 },
			{ x: 3, y: 4 }
		];
		const result = linearRegression(points);

		expect(result.slope).toBeCloseTo(-2.0, 10);
		expect(result.intercept).toBeCloseTo(10.0, 10);
		expect(result.r_squared).toBeCloseTo(1.0, 10);
	});

	it('handles all-same x values (degenerate case)', () => {
		const points = [
			{ x: 3, y: 1 },
			{ x: 3, y: 2 },
			{ x: 3, y: 3 }
		];
		const result = linearRegression(points);

		// denom is 0, so slope = 0, intercept = mean(y)
		expect(result.slope).toBe(0);
		expect(result.intercept).toBeCloseTo(2.0, 10);
		expect(result.r_squared).toBe(0);
	});
});
