import { describe, it, expect } from 'vitest';
import { percentile, mean, stddev, median, PEER_STAT_METRICS } from './peer-stats';

describe('peer metric coverage', () => {
	it('computes Tier 1 and total risk-based capital as separate metrics', () => {
		expect(PEER_STAT_METRICS).toContain('rbc1rwaj');
		expect(PEER_STAT_METRICS).toContain('rbcrwaj');
	});
});

describe('mean', () => {
	it('returns 0 for empty array', () => {
		expect(mean([])).toBe(0);
	});

	it('returns the value for single-element array', () => {
		expect(mean([42])).toBe(42);
	});

	it('computes average correctly', () => {
		expect(mean([1, 2, 3, 4, 5])).toBe(3);
	});

	it('handles negative values', () => {
		expect(mean([-10, 10])).toBe(0);
	});

	it('handles decimal values', () => {
		expect(mean([1.5, 2.5])).toBe(2);
	});
});

describe('median', () => {
	it('returns 0 for empty array', () => {
		expect(median([])).toBe(0);
	});

	it('returns the value for single-element array', () => {
		expect(median([7])).toBe(7);
	});

	it('returns middle value for odd-length sorted array', () => {
		expect(median([1, 3, 5])).toBe(3);
		expect(median([2, 4, 6, 8, 10])).toBe(6);
	});

	it('returns average of two middle values for even-length sorted array', () => {
		expect(median([1, 3])).toBe(2);
		expect(median([1, 2, 3, 4])).toBe(2.5);
	});

	it('handles identical values', () => {
		expect(median([5, 5, 5, 5])).toBe(5);
	});
});

describe('stddev', () => {
	it('returns 0 for empty array', () => {
		expect(stddev([], 0)).toBe(0);
	});

	it('returns 0 for single-element array', () => {
		expect(stddev([5], 5)).toBe(0);
	});

	it('computes sample standard deviation correctly', () => {
		const values = [2, 4, 4, 4, 5, 5, 7, 9];
		const avg = mean(values); // 5.0
		const sd = stddev(values, avg);
		// Sum of squared diffs = 9+1+1+1+0+0+4+16 = 32
		// Sample variance = 32/7 = 4.571..., sample stddev = sqrt(32/7) ~= 2.1381
		expect(sd).toBeCloseTo(Math.sqrt(32 / 7), 5);
	});

	it('returns 0 for identical values', () => {
		const values = [3, 3, 3, 3];
		expect(stddev(values, 3)).toBe(0);
	});

	it('uses sample (n-1) denominator, not population (n)', () => {
		// [0, 10] with mean 5: population var = 25, sample var = 50
		const values = [0, 10];
		const sd = stddev(values, 5);
		// sample stddev = sqrt(50) ~= 7.071
		expect(sd).toBeCloseTo(Math.sqrt(50), 5);
	});
});

describe('percentile', () => {
	it('returns 0 for empty array', () => {
		expect(percentile([], 50)).toBe(0);
	});

	it('returns the only value for single-element array', () => {
		expect(percentile([42], 0)).toBe(42);
		expect(percentile([42], 50)).toBe(42);
		expect(percentile([42], 100)).toBe(42);
	});

	it('returns min at p=0', () => {
		expect(percentile([1, 2, 3, 4, 5], 0)).toBe(1);
	});

	it('returns max at p=100', () => {
		expect(percentile([1, 2, 3, 4, 5], 100)).toBe(5);
	});

	it('returns median at p=50', () => {
		expect(percentile([1, 2, 3, 4, 5], 50)).toBe(3);
	});

	it('interpolates between values', () => {
		// [10, 20, 30, 40]: p=25 should give rank=(25/100)*3 = 0.75
		// lower=0, upper=1, frac=0.75 -> 10 + 0.75*(20-10) = 17.5
		expect(percentile([10, 20, 30, 40], 25)).toBeCloseTo(17.5, 10);
	});

	it('handles p=10 and p=90 (common peer stats boundaries)', () => {
		const sorted = Array.from({ length: 100 }, (_, i) => i + 1);
		const p10 = percentile(sorted, 10);
		const p90 = percentile(sorted, 90);
		// p10 should be near 10.9, p90 near 90.1
		expect(p10).toBeGreaterThan(9);
		expect(p10).toBeLessThan(12);
		expect(p90).toBeGreaterThan(89);
		expect(p90).toBeLessThan(92);
	});

	it('handles two-element array', () => {
		expect(percentile([0, 100], 50)).toBe(50);
		expect(percentile([0, 100], 25)).toBe(25);
		expect(percentile([0, 100], 75)).toBe(75);
	});
});
