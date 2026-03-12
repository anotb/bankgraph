import { describe, it, expect, vi } from 'vitest';
import { delay } from './fdic-api';
import type { FDICResponse, FinancialSnapshot } from './fdic-api';

describe('delay', () => {
	it('returns a promise that resolves after the given ms', async () => {
		vi.useFakeTimers();
		const p = delay(100);

		// Should not be resolved yet
		let resolved = false;
		p.then(() => { resolved = true; });

		await vi.advanceTimersByTimeAsync(50);
		expect(resolved).toBe(false);

		await vi.advanceTimersByTimeAsync(51);
		expect(resolved).toBe(true);

		vi.useRealTimers();
	});

	it('resolves with undefined', async () => {
		vi.useFakeTimers();
		const p = delay(10);
		vi.advanceTimersByTime(10);
		const result = await p;
		expect(result).toBeUndefined();
		vi.useRealTimers();
	});
});

describe('FDICResponse type shape', () => {
	it('accepts a valid FDICResponse object', () => {
		const response: FDICResponse = {
			data: [
				{ data: { CERT: 12345, NAME: 'Test Bank' } }
			],
			totals: { count: 1 }
		};

		expect(response.data).toHaveLength(1);
		expect(response.totals.count).toBe(1);
		expect(response.data[0].data.CERT).toBe(12345);
	});

	it('accepts empty data array', () => {
		const response: FDICResponse = {
			data: [],
			totals: { count: 0 }
		};

		expect(response.data).toHaveLength(0);
	});
});

describe('FinancialSnapshot type shape', () => {
	it('accepts a complete snapshot', () => {
		const snapshot: FinancialSnapshot = {
			repdte: '20240331',
			asset: 1000000,
			dep: 800000,
			eq: 120000,
			lnlsnet: 500000,
			lnre: 200000,
			lnci: 150000,
			lncon: 50000,
			sec: 100000,
			netinc: 5000,
			intinc: 20000,
			eintexp: 8000,
			nim: 3.5,
			nonii: 2000,
			nonix: 15000,
			elnatr: 500,
			roa: 1.2,
			roe: 12.5,
			nimy: 3.8,
			eeffr: 62.5,
			rbcrwaj: 14.2,
			rbc1rwaj: 12.1,
			rbc1aaj: 9.5,
			eqv: 12.0,
			nclnlsr: 0.8,
			lnatresr: 1.2,
			nco_ratio: 0.3,
			lnlsdepr: 65.0,
			othbfhlb: 10000,
			numemp: 250
		};

		expect(snapshot.repdte).toBe('20240331');
		expect(snapshot.roa).toBe(1.2);
		expect(snapshot.asset).toBe(1000000);
	});

	it('accepts null values for optional numeric fields', () => {
		const snapshot: FinancialSnapshot = {
			repdte: '20240331',
			asset: null,
			dep: null,
			eq: null,
			lnlsnet: null,
			lnre: null,
			lnci: null,
			lncon: null,
			sec: null,
			netinc: null,
			intinc: null,
			eintexp: null,
			nim: null,
			nonii: null,
			nonix: null,
			elnatr: null,
			roa: null,
			roe: null,
			nimy: null,
			eeffr: null,
			rbcrwaj: null,
			rbc1rwaj: null,
			rbc1aaj: null,
			eqv: null,
			nclnlsr: null,
			lnatresr: null,
			nco_ratio: null,
			lnlsdepr: null,
			othbfhlb: null,
			numemp: null
		};

		expect(snapshot.repdte).toBe('20240331');
		expect(snapshot.asset).toBeNull();
	});

	it('has all expected field keys', () => {
		const expectedFields = [
			'repdte', 'asset', 'dep', 'eq', 'lnlsnet', 'lnre', 'lnci', 'lncon', 'sec',
			'netinc', 'intinc', 'eintexp', 'nim', 'nonii', 'nonix', 'elnatr',
			'roa', 'roe', 'nimy', 'eeffr',
			'rbcrwaj', 'rbc1rwaj', 'rbc1aaj', 'eqv',
			'nclnlsr', 'lnatresr', 'nco_ratio',
			'lnlsdepr', 'othbfhlb',
			'numemp'
		];

		// Create a minimal valid snapshot and check all keys present
		const snapshot: FinancialSnapshot = {
			repdte: '', asset: null, dep: null, eq: null, lnlsnet: null,
			lnre: null, lnci: null, lncon: null, sec: null,
			netinc: null, intinc: null, eintexp: null, nim: null,
			nonii: null, nonix: null, elnatr: null,
			roa: null, roe: null, nimy: null, eeffr: null,
			rbcrwaj: null, rbc1rwaj: null, rbc1aaj: null, eqv: null,
			nclnlsr: null, lnatresr: null, nco_ratio: null,
			lnlsdepr: null, othbfhlb: null, numemp: null
		};

		for (const field of expectedFields) {
			expect(field in snapshot, `missing field: ${field}`).toBe(true);
		}
	});
});
