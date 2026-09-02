import { describe, expect, it } from 'vitest';
import { encodeCsvCell, encodeCsvRow } from './csv';

describe('encodeCsvCell', () => {
	it.each(['=2+2', '+cmd|\' /C calc\'!A0', '-1+1', '@SUM(A1:A2)', '  =HYPERLINK("https://evil.test")', '\t=1+1'])(
		'neutralizes spreadsheet formula payload %j',
		(payload) => {
			const encoded = encodeCsvCell(payload);
			const decoded = encoded.startsWith('"')
				? encoded.slice(1, -1).replace(/""/g, '"')
				: encoded;
			expect(decoded).toBe(`'${payload}`);
		}
	);

	it('preserves numeric negatives as numeric CSV values', () => {
		expect(encodeCsvCell(-123.45)).toBe('-123.45');
		expect(encodeCsvRow(['ratio', -0.75])).toBe('ratio,-0.75');
	});

	it('quotes commas, quotes, and newlines after formula neutralization', () => {
		expect(encodeCsvCell('Bank, "National"\nNA')).toBe('"Bank, ""National""\nNA"');
		expect(encodeCsvCell('=1,2')).toBe('"\'=1,2"');
	});

	it('renders nullish and non-finite values as empty cells', () => {
		expect(encodeCsvRow([null, undefined, Number.NaN, Number.POSITIVE_INFINITY])).toBe(',,,');
	});
});
