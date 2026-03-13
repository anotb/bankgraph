import { describe, it, expect } from 'vitest';
import { computeAssetBucket, toNum, mapFinancial } from './fdic-financials';

describe('computeAssetBucket', () => {
	it('returns null for null input', () => {
		expect(computeAssetBucket(null)).toBeNull();
	});

	it('returns 1 for assets under $100M (< 100,000 thousands)', () => {
		expect(computeAssetBucket(0)).toBe(1);
		expect(computeAssetBucket(50_000)).toBe(1);
		expect(computeAssetBucket(99_999)).toBe(1);
	});

	it('returns 2 for assets $100M-$300M', () => {
		expect(computeAssetBucket(100_000)).toBe(2);
		expect(computeAssetBucket(299_999)).toBe(2);
	});

	it('returns 3 for assets $300M-$1B', () => {
		expect(computeAssetBucket(300_000)).toBe(3);
		expect(computeAssetBucket(999_999)).toBe(3);
	});

	it('returns 4 for assets $1B-$10B', () => {
		expect(computeAssetBucket(1_000_000)).toBe(4);
		expect(computeAssetBucket(9_999_999)).toBe(4);
	});

	it('returns 5 for assets $10B-$50B', () => {
		expect(computeAssetBucket(10_000_000)).toBe(5);
		expect(computeAssetBucket(49_999_999)).toBe(5);
	});

	it('returns 6 for assets $50B-$250B', () => {
		expect(computeAssetBucket(50_000_000)).toBe(6);
		expect(computeAssetBucket(249_999_999)).toBe(6);
	});

	it('returns 7 for assets $250B+ (megabanks)', () => {
		expect(computeAssetBucket(250_000_000)).toBe(7);
		expect(computeAssetBucket(3_000_000_000)).toBe(7);
	});

	it('handles negative asset values (degenerate data)', () => {
		// Negative assets are weird but technically < 100_000
		expect(computeAssetBucket(-1000)).toBe(1);
	});
});

describe('toNum', () => {
	it('returns null for null', () => {
		expect(toNum(null)).toBeNull();
	});

	it('returns null for undefined', () => {
		expect(toNum(undefined)).toBeNull();
	});

	it('converts string numbers', () => {
		expect(toNum('123')).toBe(123);
		expect(toNum('3.14')).toBeCloseTo(3.14);
	});

	it('converts numeric values', () => {
		expect(toNum(42)).toBe(42);
		expect(toNum(0)).toBe(0);
	});

	it('returns NaN for non-numeric strings', () => {
		expect(toNum('abc')).toBeNaN();
	});

	it('converts "0" to 0 (not null)', () => {
		expect(toNum('0')).toBe(0);
	});

	it('handles empty string (converts to 0 via Number(""))', () => {
		expect(toNum('')).toBe(0);
	});

	it('handles boolean values', () => {
		expect(toNum(true)).toBe(1);
		expect(toNum(false)).toBe(0);
	});
});

describe('mapFinancial', () => {
	it('maps a complete FDIC record to internal schema', () => {
		const raw = {
			CERT: '12345',
			REPDTE: '20240331',
			ASSET: '500000',
			DEP: '400000',
			EQ: '50000',
			LNLSNET: '300000',
			LNRE: '200000',
			LNCI: '50000',
			LNCON: '30000',
			SC: '80000',
			NETINC: '5000',
			INTINC: '20000',
			EINTEXP: '10000',
			NIM: '3000',
			NONII: '2000',
			NONIX: '15000',
			ELNATR: '1000',
			ROA: '1.5',
			ROE: '12.0',
			NIMY: '3.5',
			EEFFR: '60',
			RBCRWAJ: '14.5',
			RBC1RWAJ: '12.0',
			RBC1AAJ: '8.0',
			EQV: '10.0',
			NCLNLSR: '1.2',
			LNATRESR: '1.5',
			NTLNLSR: '0.5',
			LNLSDEPR: '75.0',
			OTHBFHLB: '1000',
			NUMEMP: '250'
		};

		const result = mapFinancial(raw);

		expect(result.cert).toBe(12345);
		expect(result.repdte).toBe('20240331');
		expect(result.asset).toBe(500000);
		expect(result.dep).toBe(400000);
		expect(result.roa).toBe(1.5);
		expect(result.roe).toBe(12.0);
		expect(result.nimy).toBe(3.5);
		expect(result.rbcrwaj).toBe(14.5);
		expect(result.nco_ratio).toBe(0.5);
		expect(result.asset_bucket).toBe(3); // 500K thousands = $500M
	});

	it('handles null/undefined fields gracefully', () => {
		const raw = {
			CERT: '100',
			REPDTE: '20240331',
			ASSET: null,
			DEP: undefined,
			ROA: null
		};

		const result = mapFinancial(raw as Record<string, unknown>);

		expect(result.cert).toBe(100);
		expect(result.repdte).toBe('20240331');
		expect(result.asset).toBeNull();
		expect(result.dep).toBeNull();
		expect(result.roa).toBeNull();
		expect(result.asset_bucket).toBeNull();
	});

	it('computes correct asset_bucket from ASSET', () => {
		const raw = { CERT: '1', REPDTE: '20240331', ASSET: '1000000' };
		const result = mapFinancial(raw);
		expect(result.asset_bucket).toBe(4); // $1B
	});

	it('handles missing REPDTE', () => {
		const raw = { CERT: '1' };
		const result = mapFinancial(raw);
		expect(result.repdte).toBe('');
	});

	it('handles zero asset value', () => {
		const raw = { CERT: '1', REPDTE: '20240331', ASSET: '0' };
		const result = mapFinancial(raw);
		expect(result.asset).toBe(0);
		expect(result.asset_bucket).toBe(1);
	});
});
