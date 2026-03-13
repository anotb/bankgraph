import { describe, it, expect } from 'vitest';
import { medianOf } from './industry-agg';

describe('medianOf', () => {
	it('returns 0 for empty array', () => {
		expect(medianOf([])).toBe(0);
	});

	it('returns the value for single-element array', () => {
		expect(medianOf([3.14])).toBe(3.14);
	});

	it('returns middle value for odd-length sorted array', () => {
		expect(medianOf([1, 2, 3])).toBe(2);
		expect(medianOf([10, 20, 30, 40, 50])).toBe(30);
	});

	it('returns average of two middle values for even-length sorted array', () => {
		expect(medianOf([1, 2, 3, 4])).toBe(2.5);
		expect(medianOf([10, 20])).toBe(15);
	});

	it('handles identical values', () => {
		expect(medianOf([5, 5, 5])).toBe(5);
	});

	it('handles negative values', () => {
		expect(medianOf([-3, -1, 0, 2, 4])).toBe(0);
	});

	it('handles two-element array', () => {
		expect(medianOf([0, 100])).toBe(50);
	});
});
