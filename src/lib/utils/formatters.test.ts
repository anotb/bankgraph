import { describe, it, expect } from 'vitest';
import { formatCurrency, formatPercent, formatDate, formatNumber } from './formatters';

describe('formatCurrency', () => {
	it('returns dash for null', () => {
		expect(formatCurrency(null)).toBe('—');
	});

	it('returns dash for undefined', () => {
		expect(formatCurrency(undefined as unknown as null)).toBe('—');
	});

	it('formats zero', () => {
		expect(formatCurrency(0)).toBe('$0');
	});

	it('formats small values (under $1K actual)', () => {
		// Input 0.5 means 500 actual dollars
		expect(formatCurrency(0.5)).toBe('$500');
	});

	it('formats thousands (input maps to $K actual)', () => {
		// Input 1 means $1,000 actual -> $1.0K
		expect(formatCurrency(1)).toBe('$1.0K');
	});

	it('formats millions (input in thousands)', () => {
		// Input 1000 means $1,000,000 actual -> $1.0M
		expect(formatCurrency(1000)).toBe('$1.0M');
		expect(formatCurrency(12345)).toBe('$12.3M');
	});

	it('formats billions (input in thousands)', () => {
		// Input 1_000_000 means $1,000,000,000 actual -> $1.0B
		expect(formatCurrency(1_000_000)).toBe('$1.0B');
		expect(formatCurrency(450_000_000)).toBe('$450.0B');
	});

	it('formats trillions (input in thousands)', () => {
		// Input 1_000_000_000 means $1,000,000,000,000 actual -> $1.0T
		expect(formatCurrency(1_000_000_000)).toBe('$1.0T');
	});

	it('formats negative values', () => {
		expect(formatCurrency(-1000)).toBe('-$1.0M');
		expect(formatCurrency(-1_000_000)).toBe('-$1.0B');
	});
});

describe('formatPercent', () => {
	it('returns dash for null', () => {
		expect(formatPercent(null)).toBe('—');
	});

	it('returns dash for undefined', () => {
		expect(formatPercent(undefined as unknown as null)).toBe('—');
	});

	it('formats with default 2 decimal places', () => {
		expect(formatPercent(12.345)).toBe('12.35%');
	});

	it('formats zero', () => {
		expect(formatPercent(0)).toBe('0.00%');
	});

	it('formats negative values', () => {
		expect(formatPercent(-3.5)).toBe('-3.50%');
	});

	it('respects custom decimal places', () => {
		expect(formatPercent(12.3456, 1)).toBe('12.3%');
		expect(formatPercent(12.3456, 0)).toBe('12%');
		expect(formatPercent(12.3456, 4)).toBe('12.3456%');
	});
});

describe('formatDate', () => {
	it('returns dash for null', () => {
		expect(formatDate(null)).toBe('—');
	});

	it('returns dash for empty string', () => {
		expect(formatDate('')).toBe('—');
	});

	it('formats YYYYMMDD to "Mon YYYY"', () => {
		expect(formatDate('20240331')).toBe('Mar 2024');
		expect(formatDate('20230101')).toBe('Jan 2023');
		expect(formatDate('20221231')).toBe('Dec 2022');
	});

	it('handles all 12 months', () => {
		expect(formatDate('20240115')).toBe('Jan 2024');
		expect(formatDate('20240215')).toBe('Feb 2024');
		expect(formatDate('20240315')).toBe('Mar 2024');
		expect(formatDate('20240415')).toBe('Apr 2024');
		expect(formatDate('20240515')).toBe('May 2024');
		expect(formatDate('20240615')).toBe('Jun 2024');
		expect(formatDate('20240715')).toBe('Jul 2024');
		expect(formatDate('20240815')).toBe('Aug 2024');
		expect(formatDate('20240915')).toBe('Sep 2024');
		expect(formatDate('20241015')).toBe('Oct 2024');
		expect(formatDate('20241115')).toBe('Nov 2024');
		expect(formatDate('20241215')).toBe('Dec 2024');
	});

	it('returns raw string for invalid month', () => {
		expect(formatDate('20241315')).toBe('20241315');
		expect(formatDate('20240015')).toBe('20240015');
	});

	it('formats MM/DD/YYYY (FDIC API format)', () => {
		expect(formatDate('10/17/1904')).toBe('Oct 1904');
		expect(formatDate('01/01/2000')).toBe('Jan 2000');
		expect(formatDate('12/31/2024')).toBe('Dec 2024');
		expect(formatDate('03/15/1998')).toBe('Mar 1998');
	});

	it('formats YYYY-MM-DD (ISO format)', () => {
		expect(formatDate('2024-03-31')).toBe('Mar 2024');
		expect(formatDate('2023-01-01')).toBe('Jan 2023');
		expect(formatDate('2022-12-31')).toBe('Dec 2022');
	});
});

describe('formatNumber', () => {
	it('returns dash for null', () => {
		expect(formatNumber(null)).toBe('—');
	});

	it('returns dash for undefined', () => {
		expect(formatNumber(undefined as unknown as null)).toBe('—');
	});

	it('formats integers with commas', () => {
		expect(formatNumber(1234)).toBe('1,234');
		expect(formatNumber(1000000)).toBe('1,000,000');
	});

	it('formats zero', () => {
		expect(formatNumber(0)).toBe('0');
	});

	it('formats negative numbers', () => {
		expect(formatNumber(-5000)).toBe('-5,000');
	});

	it('formats decimals', () => {
		expect(formatNumber(1234.56)).toBe('1,234.56');
	});
});
