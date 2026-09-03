import { describe, expect, it, vi } from 'vitest';
import { GET } from '../../routes/api/v2/banks/screen/+server';

function mockDb() {
	const calls: Array<{ sql: string; params: unknown[]; method: 'first' | 'all' }> = [];
	const prepare = vi.fn((sql: string) => ({
		bind: (...params: unknown[]) => ({
			first: async () => {
				calls.push({ sql, params, method: 'first' });
				return { total: 3, as_of: '20260630' };
			},
			all: async () => {
				calls.push({ sql, params, method: 'all' });
				return {
					results: [{
						cert: 100, name: 'Example Bank', city: 'Raleigh', state: 'NC', active: 1,
						total_assets: 500000, total_deposits: 400000, num_branches: 8,
						num_employees: 120, latest_repdte: '20260630', latest_roa: 1.4,
						latest_roe: 12, latest_nim: 3.7, latest_npl_ratio: 0.8,
						latest_tier1_ratio: 14, latest_loan_to_deposit_ratio: 92.4
					}]
				};
			}
		})
	}));
	return { db: { prepare } as unknown as D1Database, prepare, calls };
}

async function call(
	url: string,
	db: D1Database,
	locals: App.Locals = { liveDataRelease: '20260630', liveDataGeneration: 'generation-42' },
	cache?: KVNamespace
): Promise<Response> {
	const handler = GET as unknown as (event: {
		url: URL;
		platform: App.Platform;
		locals: App.Locals;
		request: Request;
	}) => Promise<Response>;
	return handler({
		url: new URL(url),
		platform: { env: { DB: db, CACHE: cache } } as App.Platform,
		locals,
		request: new Request(url)
	});
}

describe('GET /api/v2/banks/screen', () => {
	it('returns and orders by the reported loan-to-deposit ratio', async () => {
		const { db, calls } = mockDb();
		const response = await call(
			'https://bankgraph.test/api/v2/banks/screen?active=active&asset_min=10000000&sort=loanToDeposit&order=desc&limit=10',
			db
		);
		const body = await response.json() as { data: Array<Record<string, unknown>> };

		expect(response.status).toBe(200);
		expect(body.data[0]).toMatchObject({ latest_loan_to_deposit_ratio: 92.4 });
		expect(calls.find((entry) => entry.method === 'all')?.sql).toContain(
			'latest_loan_to_deposit_ratio IS NULL ASC, latest_loan_to_deposit_ratio DESC'
		);
	});

	it('release-caches the finite family of common first-page workspace screens', async () => {
		const { db, prepare } = mockDb();
		const values = new Map<string, string>();
		const get = vi.fn(async (key: string) => values.get(key) ?? null);
		const put = vi.fn(async (key: string, value: string) => { values.set(key, value); });
		const cache = {
			get,
			put
		} as unknown as KVNamespace;
		const url = 'https://bankgraph.test/api/v2/banks/screen?active=active&sort=assets&order=desc&limit=1000';

		const first = await call(url, db, undefined, cache);
		expect(first.status).toBe(200);
		expect(prepare).toHaveBeenCalledTimes(2);
		expect(put).toHaveBeenCalledOnce();

		prepare.mockClear();
		const second = await call(url, db, undefined, cache);
		expect(second.status).toBe(200);
		expect(await second.json()).toMatchObject({ total: 3, limit: 1000 });
		expect(prepare).not.toHaveBeenCalled();

		const cacheReads = get.mock.calls.length;
		await call(`${url}&q=bank`, db, undefined, cache);
		expect(prepare).toHaveBeenCalledTimes(2);
		expect(get).toHaveBeenCalledTimes(cacheReads);
		expect(put).toHaveBeenCalledOnce();
	});

	it('returns bounded rows with total, as-of date, provenance, and explicit null behavior', async () => {
		const { db, calls } = mockDb();
		const conditions = encodeURIComponent(JSON.stringify([
			{ metric: 'roa', operator: 'gte', value: 1 },
			{ metric: 'noncurrentLoanRatio', operator: 'lte', value: 2 }
		]));
		const response = await call(
			`https://bankgraph.test/api/v2/banks/screen?state=NC,VA&active=active&conditions=${conditions}&sort=roa&limit=10`,
			db
		);
		const body = await response.json() as Record<string, unknown>;

		expect(response.status).toBe(200);
		expect(body).toMatchObject({ total: 3, limit: 10, truncated: true, asOf: '20260630' });
		expect(body.provenance).toMatchObject({
			source: 'FDIC BankFind',
			release: '20260630',
			release_generation: 'generation-42',
			conditionLogic: 'and',
			nullBehavior: 'exclude when a condition references a null metric'
		});
		expect(body.data).toEqual([expect.objectContaining({
			cert: 100, total_assets: 500000, latest_roa: 1.4, latest_npl_ratio: 0.8
		})]);
		expect(calls).toHaveLength(2);
		expect(calls.every((call) => call.sql.includes('latest_roa IS NOT NULL'))).toBe(true);
		expect(calls.every((call) => call.sql.includes('latest_npl_ratio IS NOT NULL'))).toBe(true);
		expect(calls.find((entry) => entry.method === 'all')?.params).toEqual(['NC', 'VA', 1, 1, 2, 10, 0]);
	});

	it('returns 400 before touching the database for a SQL-shaped condition metric', async () => {
		const { db, prepare } = mockDb();
		const conditions = encodeURIComponent(JSON.stringify([
			{ metric: 'roa) OR 1=1 --', operator: 'gt', value: 0 }
		]));
		const response = await call(
			`https://bankgraph.test/api/v2/banks/screen?conditions=${conditions}`,
			db
		);

		expect(response.status).toBe(400);
		expect(await response.json()).toMatchObject({ error: expect.stringContaining('metric must be one of') });
		expect(prepare).not.toHaveBeenCalled();
	});

	it('rejects a stale page generation before touching the database', async () => {
		const { db, prepare } = mockDb();
		const response = await call(
			'https://bankgraph.test/api/v2/banks/screen?expected_release_generation=generation-41',
			db
		);

		expect(response.status).toBe(409);
		expect(await response.json()).toMatchObject({
			error: 'stale_page_release',
			release_generation: 'generation-42'
		});
		expect(prepare).not.toHaveBeenCalled();
	});
});
