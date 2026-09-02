import { describe, expect, it } from 'vitest';
import {
	BankListQueryError,
	buildBankListCacheKey,
	parseBankListQuery,
	shouldCacheBankList
} from './bank-list-query';

function parse(query: string) {
	return parseBankListQuery(new URLSearchParams(query));
}

describe('parseBankListQuery', () => {
	it('rejects unknown and duplicate query parameters', () => {
		expect(() => parse('admin=true')).toThrowError(
			new BankListQueryError('Unknown query parameter: admin')
		);
		expect(() => parse('q=one&q=two')).toThrowError(
			new BankListQueryError('Duplicate query parameter: q')
		);
	});

	it('bounds search text and validates state lists', () => {
		expect(() => parse(`q=${'a'.repeat(101)}`)).toThrow(/at most 100/);
		expect(() => parse(`q=${'é'.repeat(51)}`)).toThrow(/UTF-8 bytes/);
		expect(() => parse('state=NY,NY')).toThrow(/duplicate state/);
		expect(() => parse('state=ZZ')).toThrow(/Unknown state code/);
		expect(() => parse(`state=${Array.from({ length: 57 }, () => 'AL').join(',')}`)).toThrow(/at most 56/);
	});

	it('requires strict bounded integers and coherent asset ranges', () => {
		expect(() => parse('page=1oops')).toThrow(/page must be an integer/);
		expect(() => parse('page=10001')).toThrow(/page must be between/);
		expect(() => parse('limit=101')).toThrow(/limit must be between/);
		expect(() => parse('asset_min=-1')).toThrow(/asset_min must be an integer/);
		expect(() => parse('asset_min=20&asset_max=10')).toThrow(/less than or equal/);
	});

	it('can explicitly include active and historical institutions', () => {
		expect(parse('active=all').active).toBe('all');
		expect(() => parse('active=any')).toThrow(/active must be 0, 1, or all/);
	});
});

describe('buildBankListCacheKey', () => {
	it('does not collide when a q value contains serialized parameter delimiters', () => {
		const separateFields = parse('q=a&state=NY');
		const embeddedDelimiters = parse('q=a%26state%3DNY');

		expect(buildBankListCacheKey(separateFields)).not.toBe(
			buildBankListCacheKey(embeddedDelimiters)
		);
	});

	it('canonicalizes effective defaults and state order', () => {
		expect(buildBankListCacheKey(parse('state=NY,CA'))).toBe(
			buildBankListCacheKey(parse('order=DESC&sort=ASSETS&state=CA,NY&page=1&limit=25'))
		);
	});
});

describe('shouldCacheBankList', () => {
	it('keeps user-shaped and deep-page queries out of KV', () => {
		expect(shouldCacheBankList(parse(''))).toBe(true);
		expect(shouldCacheBankList(parse('q=community'))).toBe(false);
		expect(shouldCacheBankList(parse('asset_min=1'))).toBe(false);
		expect(shouldCacheBankList(parse('state=NY'))).toBe(false);
		expect(shouldCacheBankList(parse('page=21'))).toBe(false);
	});
});
