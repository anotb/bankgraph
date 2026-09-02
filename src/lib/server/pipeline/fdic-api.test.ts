import { afterEach, describe, it, expect, vi } from 'vitest';
import { delay, fetchFinancialsForQuarter, fetchInstitutions } from './fdic-api';
import type { FDICResponse, FinancialSnapshot } from './fdic-api';

afterEach(() => {
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
	vi.useRealTimers();
});

describe('fetchInstitutions', () => {
	it('requests official bank-class and holding-company-name fields', async () => {
		const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
			data: [],
			totals: { count: 0 }
		}), { status: 200 }));
		vi.stubGlobal('fetch', fetchMock);

		await fetchInstitutions(25, 50);

		const requestUrl = new URL(String(fetchMock.mock.calls[0][0]));
		const fields = requestUrl.searchParams.get('fields')?.split(',') ?? [];
		expect(fields).toContain('BKCLASS');
		expect(fields).toContain('NAMEHCR');
		expect(fields).not.toContain('CHRTAGNT');
		expect(fields).not.toContain('HCTMULT');
	});
});

describe('fetchFinancialsForQuarter', () => {
	it('requests the balance identities and reported single-quarter fields used by attribution', async () => {
		const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
			data: [],
			totals: { count: 0 }
		}), { status: 200 }));
		vi.stubGlobal('fetch', fetchMock);

		await fetchFinancialsForQuarter('20260630', 0, 100);

		const requestUrl = new URL(String(fetchMock.mock.calls[0][0]));
		const fields = requestUrl.searchParams.get('fields')?.split(',') ?? [];
		for (const field of [
			'CHBAL', 'FREPO', 'TRADE', 'ORE', 'BKPREM', 'INTAN', 'OA',
			'FREPP', 'OTHBOR', 'SUBND', 'TRADEL', 'ALLOTHL',
			'NETINCQ', 'NIMQ', 'NONIIQ', 'NONIXQ', 'ELNATQ', 'IGLSECQ', 'ITAXQ', 'EXTRAQ'
		]) {
			expect(fields).toContain(field);
		}
	});
});

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
			chbal: 100000,
			frepo: 0,
			trade: 0,
			ore: 0,
			bkprem: 0,
			intan: 0,
			oa: 150000,
			frepp: 0,
			othbor: 0,
			subnd: 0,
			tradel: 0,
			allothl: 80000,
			netinc: 5000,
			intinc: 20000,
			eintexp: 8000,
			nim: 3.5,
			nonii: 2000,
			nonix: 15000,
			elnatr: 500,
			netincq: 5000,
			nimq: 12000,
			noniiq: 2000,
			nonixq: 8000,
			elnatq: 500,
			iglsecq: 0,
			itaxq: 500,
			extraq: 0,
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
			chbal: null, frepo: null, trade: null, ore: null, bkprem: null, intan: null, oa: null,
			frepp: null, othbor: null, subnd: null, tradel: null, allothl: null,
			netinc: null,
			intinc: null,
			eintexp: null,
			nim: null,
			nonii: null,
			nonix: null,
			elnatr: null,
			netincq: null, nimq: null, noniiq: null, nonixq: null,
			elnatq: null, iglsecq: null, itaxq: null, extraq: null,
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
			'chbal', 'frepo', 'trade', 'ore', 'bkprem', 'intan', 'oa',
			'frepp', 'othbor', 'subnd', 'tradel', 'allothl',
			'netinc', 'intinc', 'eintexp', 'nim', 'nonii', 'nonix', 'elnatr',
			'netincq', 'nimq', 'noniiq', 'nonixq', 'elnatq', 'iglsecq', 'itaxq', 'extraq',
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
			chbal: null, frepo: null, trade: null, ore: null, bkprem: null, intan: null, oa: null,
			frepp: null, othbor: null, subnd: null, tradel: null, allothl: null,
			netinc: null, intinc: null, eintexp: null, nim: null,
			nonii: null, nonix: null, elnatr: null,
			netincq: null, nimq: null, noniiq: null, nonixq: null,
			elnatq: null, iglsecq: null, itaxq: null, extraq: null,
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
