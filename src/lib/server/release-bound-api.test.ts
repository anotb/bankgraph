import { describe, expect, it, vi } from 'vitest';
import { GET as listBanks } from '../../routes/api/v1/banks/+server';
import { GET as readBank } from '../../routes/api/v1/banks/[cert]/+server';
import { GET as readFinancials } from '../../routes/api/v1/banks/[cert]/financials/+server';
import { GET as readQuarterBrief } from '../../routes/api/v1/banks/[cert]/quarter-brief/+server';
import { GET as readMacro } from '../../routes/api/v1/macro/[series_id]/+server';
import { GET as readSystemBrief } from '../../routes/api/v2/system-brief/+server';

const locals: App.Locals = {
	liveDataRelease: '20260630',
	liveDataGeneration: 'generation-42'
};

function event(url: string, db: D1Database, params: Record<string, string> = {}) {
	return {
		url: new URL(url),
		request: new Request(url),
		params,
		locals,
		platform: { env: { DB: db } } as App.Platform
	};
}

describe('release-bound workspace APIs', () => {
	it('adds release identity to bank search results', async () => {
		const prepare = vi.fn((sql: string) => ({
			bind: (..._params: unknown[]) => ({
				first: async () => ({ total: 1 }),
				all: async () => ({
					results: [{ cert: 100, name: 'Example Bank', active: 1, latest_repdte: '20260630' }]
				})
			})
		}));
		const db = { prepare } as unknown as D1Database;
		const handler = listBanks as unknown as (input: ReturnType<typeof event>) => Promise<Response>;
		const response = await handler(event(
			'https://bankgraph.test/api/v1/banks?q=example&expected_release_generation=generation-42',
			db
		));

		expect(response.status).toBe(200);
		expect(await response.json()).toMatchObject({
			total: 1,
			release: '20260630',
			release_generation: 'generation-42'
		});
		expect(prepare).toHaveBeenCalledTimes(2);
	});

	it('adds release identity to bank hydration and financial history', async () => {
		const prepare = vi.fn((sql: string) => ({
			bind: (..._params: unknown[]) => ({
				first: async () => sql.includes('published_institutions')
					? { cert: 100, name: 'Example Bank', active: 1 }
					: { cert: 100, repdte: '20260630', roa: 1.2 },
				all: async () => ({ results: [{ cert: 100, repdte: '20260630', roa: 1.2 }] })
			})
		}));
		const db = { prepare } as unknown as D1Database;
		const bankHandler = readBank as unknown as (input: ReturnType<typeof event>) => Promise<Response>;
		const financialsHandler = readFinancials as unknown as (input: ReturnType<typeof event>) => Promise<Response>;

		const bankResponse = await bankHandler(event(
			'https://bankgraph.test/api/v1/banks/100?expected_release_generation=generation-42',
			db,
			{ cert: '100' }
		));
		const historyResponse = await financialsHandler(event(
			'https://bankgraph.test/api/v1/banks/100/financials?fields=roa&expected_release_generation=generation-42',
			db,
			{ cert: '100' }
		));

		expect(await bankResponse.json()).toMatchObject({
			cert: 100,
			release: '20260630',
			release_generation: 'generation-42'
		});
		expect(await historyResponse.json()).toMatchObject({
			cert: 100,
			data: [{ cert: 100, repdte: '20260630', roa: 1.2 }],
			release: '20260630',
			release_generation: 'generation-42'
		});
	});

	it('adds lineage to macro and system context responses', async () => {
		const prepare = vi.fn((sql: string) => ({
			bind: (..._params: unknown[]) => ({
				first: async () => {
					if (sql.includes("demo_fixture_mode")) return { value: null };
					if (sql.includes('MAX(repdte)')) return { repdte: null };
					if (sql.includes('FROM macro_series WHERE')) {
						return {
							series_id: 'UST10Y', title: '10-Year Treasury', category: 'rates',
							source_agency: 'U.S. Treasury', source_series: 'BC_10YEAR',
							source_url: 'https://example.test/source', source_page_url: 'https://example.test/page',
							rights_url: 'https://example.test/rights', rights_note: 'Public data', cadence: 'daily',
							units: 'percent', transform: 'none', seasonal_adjustment: 'not_seasonally_adjusted',
							retrieved_at: '2026-08-30T00:00:00.000Z', observed_through: '2026-08-29',
							coverage_start: '2016-08-30', coverage_end: '2026-08-29'
						};
					}
					return null;
				},
				all: async () => ({ results: [] })
			})
		}));
		const db = { prepare } as unknown as D1Database;
		const macroHandler = readMacro as unknown as (input: ReturnType<typeof event>) => Promise<Response>;
		const systemHandler = readSystemBrief as unknown as (input: ReturnType<typeof event>) => Promise<Response>;

		const macroResponse = await macroHandler(event(
			'https://bankgraph.test/api/v1/macro/UST10Y?limit=1&expected_release_generation=generation-42',
			db,
			{ series_id: 'UST10Y' }
		));
		const systemResponse = await systemHandler(event(
			'https://bankgraph.test/api/v2/system-brief?expected_release_generation=generation-42',
			db
		));

		expect(await macroResponse.json()).toMatchObject({
			series_id: 'UST10Y',
			release: '20260630',
			release_generation: 'generation-42'
		});
		expect(await systemResponse.json()).toMatchObject({
			status: 'unavailable',
			release: '20260630',
			release_generation: 'generation-42'
		});
	});

	it('fences every dynamic route before database access when the page is stale', async () => {
		const prepare = vi.fn(() => { throw new Error('database must not be touched'); });
		const db = { prepare } as unknown as D1Database;
		const suffix = 'expected_release_generation=generation-41';
		const calls = [
			(readBank as unknown as (input: ReturnType<typeof event>) => Promise<Response>)(event(`https://bankgraph.test/api/v1/banks/100?${suffix}`, db, { cert: '100' })),
			(readFinancials as unknown as (input: ReturnType<typeof event>) => Promise<Response>)(event(`https://bankgraph.test/api/v1/banks/100/financials?${suffix}`, db, { cert: '100' })),
			(readQuarterBrief as unknown as (input: ReturnType<typeof event>) => Promise<Response>)(event(`https://bankgraph.test/api/v1/banks/100/quarter-brief?${suffix}`, db, { cert: '100' })),
			(readMacro as unknown as (input: ReturnType<typeof event>) => Promise<Response>)(event(`https://bankgraph.test/api/v1/macro/UST10Y?${suffix}`, db, { series_id: 'UST10Y' })),
			(readSystemBrief as unknown as (input: ReturnType<typeof event>) => Promise<Response>)(event(`https://bankgraph.test/api/v2/system-brief?${suffix}`, db))
		];
		const responses = await Promise.all(calls);

		expect(responses.map((response) => response.status)).toEqual([409, 409, 409, 409, 409]);
		for (const response of responses) {
			expect(await response.json()).toMatchObject({ error: 'stale_page_release' });
		}
		expect(prepare).not.toHaveBeenCalled();
	});
});
