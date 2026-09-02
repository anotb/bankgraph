import { describe, expect, it } from 'vitest';
import {
	parsePeerMetrics,
	PeerMetricsQueryError,
	shouldCachePeerRequest
} from './peer-query';

function parse(query: string): string[] {
	return parsePeerMetrics(new URLSearchParams(query));
}

describe('parsePeerMetrics', () => {
	it('deduplicates metrics while preserving their first-seen order', () => {
		expect(parse('metrics=roe,roa,roe,nimy,roa')).toEqual(['roe', 'roa', 'nimy']);
	});

	it('uses the bounded default set only when the parameter is absent', () => {
		expect(parse('')).toEqual(['roa', 'roe', 'nimy', 'eeffr', 'nclnlsr', 'rbcrwaj']);
		expect(() => parse('metrics=')).toThrow(/must not be empty/);
	});

	it('caps query-string length before splitting or database work', () => {
		expect(() => parse(`metrics=${'a'.repeat(257)}`)).toThrow(/at most 256 UTF-8 bytes/);
	});

	it('caps the number of unique metrics before database work', () => {
		expect(() => parse('metrics=roa,roe,nimy,eeffr,nclnlsr,rbcrwaj,lnlsdepr,eqv,ninth'))
			.toThrow(/at most 8 unique values/);
	});

	it('rejects duplicate metric parameters and invalid values', () => {
		expect(() => parse('metrics=roa&metrics=roe')).toThrowError(
			new PeerMetricsQueryError('Duplicate query parameter: metrics')
		);
		expect(() => parse('metrics=roa,not_a_column')).toThrow(/Invalid metrics/);
	});
});

describe('shouldCachePeerRequest', () => {
	it('admits only the shared default latest-period JSON view', () => {
		expect(shouldCachePeerRequest(new URLSearchParams())).toBe(true);
		expect(shouldCachePeerRequest(new URLSearchParams('metrics=roa'))).toBe(false);
		expect(shouldCachePeerRequest(new URLSearchParams('repdte=20241231'))).toBe(false);
		expect(shouldCachePeerRequest(new URLSearchParams('download'))).toBe(false);
	});
});
