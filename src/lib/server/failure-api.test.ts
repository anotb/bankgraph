import { describe, expect, it, vi } from 'vitest';
import { GET } from '../../routes/api/v1/industry/failures/+server';

const records = [
	{
		source_id: '4115',
		cert: 100,
		name: 'Example Bank',
		city: 'Raleigh',
		state: 'NC',
		fail_date: '20240101',
		transaction_type: 'FAILURE',
		resolution_type: 'PA',
		insurance_fund: 'DIF',
		acquiring_institution: 'Example Acquirer',
		cost: 2500,
		total_assets: 100000,
		total_deposits: 90000
	}
];

function mockDb() {
	const calls: Array<{ sql: string; params: unknown[]; method: 'all' | 'first' }> = [];
	const prepare = vi.fn((sql: string) => ({
		bind: (...params: unknown[]) => ({
			all: async () => {
				calls.push({ sql, params, method: 'all' });
				return { results: records };
			},
			first: async () => {
				calls.push({ sql, params, method: 'first' });
				return { count: records.length };
			}
		})
	}));
	return { db: { prepare } as unknown as D1Database, prepare, calls };
}

async function call(url: string, db: D1Database): Promise<Response> {
	const handler = GET as unknown as (event: {
		url: URL;
		platform: App.Platform;
	}) => Promise<Response>;
	return handler({ url: new URL(url), platform: { env: { DB: db } } as App.Platform });
}

describe('GET /api/v1/industry/failures', () => {
	it('defaults to true failures', async () => {
		const { db, calls } = mockDb();
		const response = await call('https://bankgraph.test/api/v1/industry/failures', db);
		const body = await response.json() as Record<string, unknown>;

		expect(response.status).toBe(200);
		expect(body).toMatchObject({
			type: 'failure',
			data: records,
			total: 1,
			limit: 100,
			offset: 0,
			source_fields: {
				source_id: 'ID',
				transaction_type: 'RESTYPE',
				resolution_type: 'RESTYPE1',
				insurance_fund: 'SAVR',
				acquiring_institution: 'BIDNAME'
			}
		});
		expect(calls).toHaveLength(2);
		const dataCall = calls.find((entry) => entry.method === 'all');
		expect(dataCall?.sql).toContain('WHERE transaction_type = ?');
		expect(dataCall?.params).toEqual(['FAILURE', 100, 0]);
	});

	it('exposes assistance transactions only when requested', async () => {
		const { db, calls } = mockDb();
		const response = await call(
			'https://bankgraph.test/api/v1/industry/failures?type=assistance',
			db
		);

		expect(response.status).toBe(200);
		expect(calls.find((entry) => entry.method === 'all')?.params).toEqual(['ASSISTANCE', 100, 0]);
		expect((await response.json()) as Record<string, unknown>).toMatchObject({ type: 'assistance' });
	});

	it('labels CSV source fields and units accurately', async () => {
		const { db } = mockDb();
		const response = await call(
			'https://bankgraph.test/api/v1/industry/failures?format=csv',
			db
		);
		const csv = await response.text();

		expect(response.headers.get('content-disposition')).toContain('bank_failures.csv');
		expect(response.headers.get('x-total-count')).toBe('1');
		expect(csv.split('\n')[0]).toContain('fdic_source_id,name,cert');
		expect(csv.split('\n')[0]).toContain('fdic_savr_insurance_fund,fdic_bidname_acquiring_institution,estimated_loss_thousands_usd');
		expect(csv).toContain('DIF,Example Acquirer,2500');
	});

	it('applies a bounded limit and offset to JSON and export queries', async () => {
		const { db, calls } = mockDb();
		const response = await call(
			'https://bankgraph.test/api/v1/industry/failures?type=all&limit=250&offset=500',
			db
		);

		expect(response.status).toBe(200);
		expect(calls.find((entry) => entry.method === 'all')?.params).toEqual([250, 500]);
		expect(await response.json()).toMatchObject({ type: 'all', limit: 250, offset: 500 });
	});

	it('rejects an unbounded limit before querying D1', async () => {
		const { db, prepare } = mockDb();
		const response = await call(
			'https://bankgraph.test/api/v1/industry/failures?limit=5001',
			db
		);

		expect(response.status).toBe(400);
		expect(await response.json()).toEqual({ error: 'limit must be between 1 and 5000' });
		expect(prepare).not.toHaveBeenCalled();
	});

	it('rejects unknown transaction filters before querying D1', async () => {
		const { db, prepare } = mockDb();
		const response = await call(
			'https://bankgraph.test/api/v1/industry/failures?type=receivership',
			db
		);

		expect(response.status).toBe(400);
		expect(await response.json()).toEqual({ error: 'type must be one of: failure, assistance, all' });
		expect(prepare).not.toHaveBeenCalled();
	});
});
