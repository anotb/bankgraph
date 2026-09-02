import { afterEach, describe, it, expect, vi } from 'vitest';
import {
	computeAssetBucket,
	CANONICAL_FINANCIAL_SCOPE,
	CANONICAL_FINANCIAL_START,
	ensureCanonicalFinancialCoverage,
	FINANCIAL_PAGE_SIZE,
	mapFinancial,
	syncFinancials,
	toNum
} from './fdic-financials';

afterEach(() => {
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
});

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
			CHBAL: '45000',
			FREPO: '5000',
			TRADE: '1000',
			ORE: '2000',
			BKPREM: '3000',
			INTAN: '4000',
			OA: '10000',
			FREPP: '6000',
			OTHBOR: '7000',
			SUBND: '8000',
			TRADEL: '9000',
			ALLOTHL: '10000',
			NETINC: '5000',
			INTINC: '20000',
			EINTEXP: '10000',
			NIM: '3000',
			NONII: '2000',
			NONIX: '15000',
			ELNATR: '1000',
			NETINCQ: '1500',
			NIMQ: '2500',
			NONIIQ: '500',
			NONIXQ: '1000',
			ELNATQ: '100',
			IGLSECQ: '50',
			ITAXQ: '300',
			EXTRAQ: '0',
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
		expect(result.chbal).toBe(45000);
		expect(result.othbor).toBe(7000);
		expect(result.netincq).toBe(1500);
		expect(result.itaxq).toBe(300);
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

	it('rejects missing REPDTE before it reaches storage or export', () => {
		const raw = { CERT: '1' };
		expect(() => mapFinancial(raw)).toThrow(/FDIC quarter end/);
	});

	it('handles zero asset value', () => {
		const raw = { CERT: '1', REPDTE: '20240331', ASSET: '0' };
		const result = mapFinancial(raw);
		expect(result.asset).toBe(0);
		expect(result.asset_bucket).toBe(1);
	});
});

describe('bounded legacy financial sync', () => {
	it('purges pre-1992 rows and invalidates an unfiltered legacy checkpoint atomically', async () => {
		const prepared: Array<{ sql: string; params: unknown[] }> = [];
		const prepare = vi.fn((sql: string) => {
			const call = { sql, params: [] as unknown[] };
			prepared.push(call);
			const statement = {
				bind: (...params: unknown[]) => {
					call.params = params;
					return statement;
				},
				first: async () => ({ value: 'unfiltered:v0' })
			};
			return statement;
		});
		const batch = vi.fn(async (statements: D1PreparedStatement[]) =>
			statements.map((_, index) => ({ meta: { changes: index === 0 ? 42_750 : 1 } })) as D1Result[]
		);
		const db = Object.assign(Object.create(null) as D1Database, { prepare, batch });

		const result = await ensureCanonicalFinancialCoverage(db);

		expect(result).toEqual({ deleted: 42_750, reset: true });
		const purge = prepared.find(({ sql }) => sql.startsWith('DELETE FROM financials'));
		expect(purge?.params).toEqual([CANONICAL_FINANCIAL_START]);
		const resetValues = prepared
			.filter(({ sql }) => sql.includes('INSERT INTO pipeline_state'))
			.map(({ params }) => params.slice(0, 2));
		expect(resetValues).toContainEqual(['financials_sync_offset', '0']);
		expect(resetValues).toContainEqual(['financials_sync_count', '0']);
		expect(batch).toHaveBeenCalledTimes(1);
		expect(batch.mock.calls[0]?.[0]).toHaveLength(12);
	});

	it('keeps the cutoff purge idempotent after the canonical scope is established', async () => {
		const prepare = vi.fn((_sql: string) => {
			const statement = {
				bind: (..._params: unknown[]) => statement,
				first: async () => ({ value: CANONICAL_FINANCIAL_SCOPE })
			};
			return statement;
		});
		const batch = vi.fn(async (_statements: D1PreparedStatement[]) => [
			{ meta: { changes: 0 } }
		] as D1Result[]);
		const db = Object.assign(Object.create(null) as D1Database, { prepare, batch });

		expect(await ensureCanonicalFinancialCoverage(db)).toEqual({ deleted: 0, reset: false });
		expect(batch.mock.calls[0]?.[0]).toHaveLength(1);
	});

	it('compacts a 1,000-row source page into five D1 upsert statements', async () => {
		const sourceRows = Array.from({ length: FINANCIAL_PAGE_SIZE }, (_, index) => ({
			data: {
				CERT: index + 1,
				REPDTE: CANONICAL_FINANCIAL_START,
				ASSET: 100_000 + index
			}
		}));
		const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
			const url = new URL(String(input));
			const payload = url.searchParams.get('fields') === 'REPDTE'
				? { data: [{ data: { REPDTE: '20261231' } }], totals: { count: FINANCIAL_PAGE_SIZE * 2 } }
				: { data: sourceRows, totals: { count: FINANCIAL_PAGE_SIZE * 2 } };
			return new Response(JSON.stringify(payload), {
				status: 200,
				headers: { 'Content-Type': 'application/json' }
			});
		});
		vi.stubGlobal('fetch', fetchMock);
		vi.spyOn(console, 'log').mockImplementation(() => undefined);

		const preparedSql: string[] = [];
		const prepare = vi.fn((sql: string) => {
			preparedSql.push(sql);
			const statement = {
				bind: (..._params: unknown[]) => statement,
				first: async () => null,
				all: async () => ({ results: [] }),
				run: async () => ({ success: true, meta: { changes: 1 } })
			};
			return statement;
		});
		const batch = vi.fn(async (_statements: D1PreparedStatement[]) => [] as D1Result[]);
		const db = Object.assign(Object.create(null) as D1Database, { prepare, batch });

		const result = await syncFinancials(db, 1);

		expect(result).toEqual({
			processed: FINANCIAL_PAGE_SIZE,
			done: false,
			offset: FINANCIAL_PAGE_SIZE,
			quarter: CANONICAL_FINANCIAL_START,
			source_total: FINANCIAL_PAGE_SIZE * 2
		});
		expect(fetchMock).toHaveBeenCalledTimes(2);
		const metadataUrl = new URL(String(fetchMock.mock.calls[0][0]));
		expect(metadataUrl.searchParams.get('filters')).toBe(
			`REPDTE:[${CANONICAL_FINANCIAL_START} TO *]`
		);
		const sourceUrl = new URL(String(fetchMock.mock.calls[1][0]));
		expect(sourceUrl.searchParams.get('limit')).toBe(String(FINANCIAL_PAGE_SIZE));
		expect(sourceUrl.searchParams.get('filters')).toBe(`REPDTE:${CANONICAL_FINANCIAL_START}`);
		expect(sourceUrl.searchParams.get('sort_by')).toBe('CERT');
		expect(preparedSql.filter((sql) => sql.includes('FROM json_each(?)'))).toHaveLength(5);
		expect(batch).toHaveBeenCalledTimes(4);
		expect(batch.mock.calls.find((call) => call[0].length === 5)?.[0]).toHaveLength(5);
	});

	it('fails closed when the pinned canonical source total changes between requests', async () => {
		const state = [
			['financials_sync_status', 'running'],
			['financials_sync_run_id', 'stable-run'],
			['financials_sync_source_total', '2000'],
			['financials_sync_source_latest', '20261231'],
			['financials_sync_quarter', CANONICAL_FINANCIAL_START],
			['financials_sync_partition_total', '2000'],
			['financials_sync_last_cert', '1000'],
			['financials_sync_offset', '1000'],
			['financials_sync_count', '1000'],
			['financials_sync_reconciled_total', '']
		].map(([key, value]) => ({ key, value }));
		vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
			data: [{ data: { REPDTE: '20261231' } }],
			totals: { count: 2001 }
		}), { status: 200, headers: { 'Content-Type': 'application/json' } })));

		const prepare = vi.fn((sql: string) => {
			const statement = {
				bind: (..._params: unknown[]) => statement,
				first: async () => sql.includes('SELECT value FROM pipeline_state')
					? { value: CANONICAL_FINANCIAL_SCOPE }
					: null,
				all: async () => ({ results: state }),
				run: async () => ({ success: true, meta: { changes: 1 } })
			};
			return statement;
		});
		const batch = vi.fn(async (_statements: D1PreparedStatement[]) => [
			{ meta: { changes: 0 } }
		] as D1Result[]);
		const db = Object.assign(Object.create(null) as D1Database, { prepare, batch });

		await expect(syncFinancials(db, { maxPages: 1, runId: 'stable-run' }))
			.rejects.toThrow(/source changed during the run/);
		expect(batch).toHaveBeenCalledTimes(1);
	});

	it('does not mark completion when the final canonical key count is short', async () => {
		const sourceRows = [1, 2].map((cert) => ({
			data: { CERT: cert, REPDTE: CANONICAL_FINANCIAL_START, ASSET: 100_000 }
		}));
		const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
			const url = new URL(String(input));
			const payload = url.searchParams.get('fields') === 'REPDTE'
				? { data: [{ data: { REPDTE: CANONICAL_FINANCIAL_START } }], totals: { count: 2 } }
				: { data: sourceRows, totals: { count: 2 } };
			return new Response(JSON.stringify(payload), {
				status: 200,
				headers: { 'Content-Type': 'application/json' }
			});
		});
		vi.stubGlobal('fetch', fetchMock);
		vi.spyOn(console, 'log').mockImplementation(() => undefined);

		const prepared: Array<{ sql: string; params: unknown[] }> = [];
		const prepare = vi.fn((sql: string) => {
			const call = { sql, params: [] as unknown[] };
			prepared.push(call);
			const statement = {
				bind: (...params: unknown[]) => {
					call.params = params;
					return statement;
				},
				first: async () => {
					if (sql.includes('SELECT value FROM pipeline_state')) {
						return { value: CANONICAL_FINANCIAL_SCOPE };
					}
					if (sql.includes('COUNT(*) AS row_count')) {
						return {
							row_count: 1,
							first_quarter: CANONICAL_FINANCIAL_START,
							latest_quarter: CANONICAL_FINANCIAL_START
						};
					}
					return null;
				},
				all: async () => ({ results: [] }),
				run: async () => ({ success: true, meta: { changes: 1 } })
			};
			return statement;
		});
		const batch = vi.fn(async (_statements: D1PreparedStatement[]) => [] as D1Result[]);
		const db = Object.assign(Object.create(null) as D1Database, { prepare, batch });

		await expect(syncFinancials(db, { maxPages: 1, runId: 'reconcile-run' }))
			.rejects.toThrow(/expected 2 rows/);
		const completedStatusWrites = prepared.filter(
			({ params }) => params[0] === 'financials_sync_status' && params[1] === 'complete'
		);
		expect(completedStatusWrites).toHaveLength(0);
	});
});
