import { describe, expect, it } from 'vitest';
import { parseCompareQuery } from './compare-query';

const metrics = new Set(['roa', 'roe', 'nimy', 'asset']);

describe('parseCompareQuery', () => {
	it('deduplicates bounded certs and metrics without changing order', () => {
		expect(parseCompareQuery(new URLSearchParams('certs=3510,628,3510&metrics=asset,roa,asset'), metrics)).toMatchObject({
			certs: [3510, 628],
			metrics: ['asset', 'roa']
		});
	});

	it('rejects malformed, excessive, and ambiguous input', () => {
		expect(() => parseCompareQuery(new URLSearchParams('certs=1x'), metrics)).toThrow(/positive integers/);
		expect(() => parseCompareQuery(new URLSearchParams(`certs=1&metrics=${'roa,'.repeat(600)}`), metrics)).toThrow(/metrics parameter is too long|query must be at most/);
		expect(() => parseCompareQuery(new URLSearchParams('certs=1&from=20240231'), metrics)).toThrow(/real calendar date/);
		expect(() => parseCompareQuery(new URLSearchParams('certs=1&certs=2'), metrics)).toThrow(/Duplicate/);
	});
});
