import { describe, expect, it, vi } from 'vitest';
import { GET } from '../../routes/api/v1/fdic/[dataset]/+server';

const locals: App.Locals = {
	liveDataRelease: '20240630',
	liveDataGeneration: 'generation-42'
};

const financialRow = {
	cert: 100,
	repdte: '20240331',
	asset: 125_000,
	dep: 110_000,
	source_retrieved_at: '2026-08-30T20:00:00.000Z'
};

const financialPublication = {
	source_endpoint: 'https://api.fdic.gov/banks/financials',
	source_total: 1,
	row_count: 1,
	key_first: '20240331|000000000100',
	key_last: '20240331|000000000100',
	retrieved_at: '2026-08-30T20:00:00.000Z',
	published_at: '2026-08-31T04:42:20.220Z'
};

interface DbCall {
	sql: string;
	params: unknown[];
	method: 'first' | 'all';
}

function mockDb(publication: typeof financialPublication | null = financialPublication) {
	const calls: DbCall[] = [];
	const prepare = vi.fn((sql: string) => ({
		bind: (...params: unknown[]) => ({
			first: async () => {
				calls.push({ sql, params, method: 'first' });
				if (sql.includes('FROM published_financials AS financial')) return publication;
				if (sql.includes('COUNT(*) AS count')) return { count: 1 };
				return null;
			},
			all: async () => {
				calls.push({ sql, params, method: 'all' });
				return { results: [financialRow] };
			}
		})
	}));
	return { db: { prepare } as unknown as D1Database, prepare, calls };
}

function event(url: string, db: D1Database) {
	return {
		url: new URL(url),
		request: new Request(url),
		params: { dataset: 'financials' },
		locals,
		platform: { env: { DB: db } } as App.Platform
	};
}

describe('GET /api/v1/fdic/financials', () => {
	it('reads a historical quarter through the elected financial release and returns lineage', async () => {
		const { db, calls } = mockDb();
		const handler = GET as unknown as (input: ReturnType<typeof event>) => Promise<Response>;
		const response = await handler(event(
			'https://bankgraph.test/api/v1/fdic/financials?partition=20240331&limit=25&expected_release_generation=generation-42',
			db
		));

		expect(response.status).toBe(200);
		expect(await response.json()).toMatchObject({
			dataset: 'financials',
			partition: '20240331',
			data: [financialRow],
			pagination: { total: 1, limit: 25, offset: 0, next_offset: null },
			source: financialPublication,
			release: '20240630',
			release_generation: 'generation-42'
		});

		const publicationCall = calls.find((call) =>
			call.method === 'first' && call.sql.includes('FROM published_financials AS financial')
		);
		expect(publicationCall?.params).toEqual(['20240630', 'generation-42', '20240331']);
		expect(publicationCall?.sql).toContain("control.state = 'ready'");
		expect(publicationCall?.sql).toContain('JOIN release_attestations AS attestation');
		expect(publicationCall?.sql).toContain('financial.repdte <= control.release');
		expect(publicationCall?.sql).toContain("printf('%012d', MIN(financial.cert))");
		const dataCall = calls.find((call) => call.method === 'all');
		expect(dataCall?.sql).toContain('FROM published_financials');
		expect(dataCall?.sql).not.toContain('FROM financials ');
	});

	it('does not expose candidate or partial rows for a quarter absent from the elected release', async () => {
		const { db, calls } = mockDb(null);
		const handler = GET as unknown as (input: ReturnType<typeof event>) => Promise<Response>;
		const response = await handler(event(
			'https://bankgraph.test/api/v1/fdic/financials?partition=20240930',
			db
		));

		expect(response.status).toBe(404);
		expect(await response.json()).toEqual({ error: 'FDIC partition has not been published' });
		expect(calls).toHaveLength(1);
		expect(calls[0]).toMatchObject({
			method: 'first',
			params: ['20240630', 'generation-42', '20240930']
		});
	});

	it('rejects a stale page generation before touching D1', async () => {
		const prepare = vi.fn(() => { throw new Error('stale requests must not query D1'); });
		const db = { prepare } as unknown as D1Database;
		const handler = GET as unknown as (input: ReturnType<typeof event>) => Promise<Response>;
		const response = await handler(event(
			'https://bankgraph.test/api/v1/fdic/financials?partition=20240331&expected_release_generation=generation-41',
			db
		));

		expect(response.status).toBe(409);
		expect(await response.json()).toMatchObject({
			error: 'stale_page_release',
			expected_release_generation: 'generation-41',
			release: '20240630',
			release_generation: 'generation-42'
		});
		expect(prepare).not.toHaveBeenCalled();
	});

	it('fails closed when the request has no admitted release context', async () => {
		const { db, prepare } = mockDb();
		const input = event(
			'https://bankgraph.test/api/v1/fdic/financials?partition=20240331',
			db
		);
		input.locals = {};
		const handler = GET as unknown as (value: typeof input) => Promise<Response>;
		const response = await handler(input);

		expect(response.status).toBe(503);
		expect(await response.json()).toEqual({ error: 'Published release context is unavailable' });
		expect(prepare).not.toHaveBeenCalled();
	});
});
