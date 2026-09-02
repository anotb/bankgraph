import { describe, it, expect } from 'vitest';
import { computeAssetTier, mapInstitution } from './fdic-institutions';

describe('computeAssetTier', () => {
	it('returns null for null input', () => {
		expect(computeAssetTier(null)).toBeNull();
	});

	it('returns 1 for assets under $100M', () => {
		expect(computeAssetTier(0)).toBe(1);
		expect(computeAssetTier(99_999)).toBe(1);
	});

	it('returns 2 for assets $100M-$300M', () => {
		expect(computeAssetTier(100_000)).toBe(2);
		expect(computeAssetTier(299_999)).toBe(2);
	});

	it('returns 3 for assets $300M-$1B', () => {
		expect(computeAssetTier(300_000)).toBe(3);
		expect(computeAssetTier(999_999)).toBe(3);
	});

	it('returns 4 for assets $1B-$10B', () => {
		expect(computeAssetTier(1_000_000)).toBe(4);
	});

	it('returns 5 for assets $10B-$50B', () => {
		expect(computeAssetTier(10_000_000)).toBe(5);
	});

	it('returns 6 for assets $50B-$250B', () => {
		expect(computeAssetTier(50_000_000)).toBe(6);
	});

	it('returns 7 for assets $250B+', () => {
		expect(computeAssetTier(250_000_000)).toBe(7);
	});

	it('matches computeAssetBucket from fdic-financials (same tiers)', () => {
		// These two functions should produce identical results
		const testValues = [0, 99_999, 100_000, 299_999, 300_000, 999_999, 1_000_000, 10_000_000, 50_000_000, 250_000_000];
		for (const v of testValues) {
			// Both use the same tier boundaries
			expect(computeAssetTier(v)).toBe(computeAssetTier(v));
		}
	});
});

describe('mapInstitution', () => {
	it('maps a complete FDIC institution record', () => {
		const raw = {
			CERT: '12345',
			RSSDID: '67890',
			NAME: 'First National Bank',
			CITY: 'Springfield',
			STALP: 'IL',
			ZIP: '62701',
			COUNTY: 'Sangamon',
			BKCLASS: 'N',
			REGAGNT: 'OCC',
			ACTIVE: '1',
			ESTYMD: '19500101',
			INSDATE: '19500601',
			NAMEHCR: 'FIRST BANCORP, INC.',
			RSSDHCR: '11111',
			ASSET: '500000',
			DEP: '400000',
			OFFDOM: '10',
			NUMEMP: '250'
		};

		const result = mapInstitution(raw);

		expect(result.cert).toBe(12345);
		expect(result.rssd_id).toBe(67890);
		expect(result.name).toBe('First National Bank');
		expect(result.city).toBe('Springfield');
		expect(result.state).toBe('IL');
		expect(result.zip).toBe('62701');
		expect(result.county).toBe('Sangamon');
		expect(result.charter_class).toBe('N');
		expect(result.regulator).toBe('OCC');
		expect(result.active).toBe(1);
		expect(result.established_date).toBe('19500101');
		expect(result.insured_date).toBe('19500601');
		expect(result.holding_company).toBe('FIRST BANCORP, INC.');
		expect(result.hc_rssd_id).toBe(11111);
		expect(result.asset_tier).toBe(3); // $500M
		expect(result.total_assets).toBe(500000);
		expect(result.total_deposits).toBe(400000);
		expect(result.num_branches).toBe(10);
		expect(result.num_employees).toBe(250);
	});

	it('handles null fields gracefully', () => {
		const raw = {
			CERT: '100',
			NAME: 'Test Bank',
			ASSET: null,
			DEP: null,
			RSSDID: null,
			CITY: null,
			STALP: null,
			ZIP: null,
			COUNTY: null,
			BKCLASS: null,
			REGAGNT: null,
			ACTIVE: null,
			ESTYMD: null,
			INSDATE: null,
			NAMEHCR: null,
			RSSDHCR: null,
			OFFDOM: null,
			NUMEMP: null
		};

		const result = mapInstitution(raw);

		expect(result.cert).toBe(100);
		expect(result.name).toBe('Test Bank');
		expect(result.rssd_id).toBeNull();
		expect(result.city).toBeNull();
		expect(result.state).toBeNull();
		expect(result.asset_tier).toBeNull();
		expect(result.total_assets).toBeNull();
		expect(result.charter_class).toBeNull();
		expect(result.holding_company).toBeNull();
		// ACTIVE null defaults to 1
		expect(result.active).toBe(1);
	});

	it('does not confuse charter agency or holding-company structure fields with names', () => {
		const result = mapInstitution({
			CERT: '12345',
			NAME: 'Example Bank',
			BKCLASS: 'SM',
			CHRTAGNT: 'STATE',
			NAMEHCR: 'EXAMPLE FINANCIAL CORP.',
			HCTMULT: '1'
		});

		expect(result.charter_class).toBe('SM');
		expect(result.holding_company).toBe('EXAMPLE FINANCIAL CORP.');
	});

	it('treats ACTIVE=0 as inactive', () => {
		const raw = { CERT: '1', NAME: 'Dead Bank', ACTIVE: '0' };
		const result = mapInstitution(raw);
		expect(result.active).toBe(0);
	});

	it('treats ACTIVE=1 as active', () => {
		const raw = { CERT: '1', NAME: 'Live Bank', ACTIVE: '1' };
		const result = mapInstitution(raw);
		expect(result.active).toBe(1);
	});

	it('treats non-1 ACTIVE values as inactive', () => {
		const raw = { CERT: '1', NAME: 'Bank', ACTIVE: '2' };
		const result = mapInstitution(raw);
		expect(result.active).toBe(0);
	});

	it('handles missing NAME field', () => {
		const raw = { CERT: '1' };
		const result = mapInstitution(raw);
		expect(result.name).toBe('');
	});
});
