import { describe, expect, it, vi } from 'vitest';
import { GET } from '../../routes/api/v2/research/failure-patterns/+server';
import type {
	ActiveHistoryRow,
	FailureHistoryRow,
	FailurePatternFinancialRow
} from './analytics/failure-patterns';

const dates = ['20200331', '20200630', '20200930', '20201231'];

function financial(
	cert: number,
	repdte: string,
	overrides: Partial<FailurePatternFinancialRow> = {}
): FailurePatternFinancialRow {
	return {
		cert,
		repdte,
		asset: 1_000_000,
		dep: 800_000,
		lnlsnet: 600_000,
		lnre: 360_000,
		lnci: 120_000,
		lncon: 60_000,
		othbfhlb: 50_000,
		roa: 1,
		nimy: 3.5,
		nclnlsr: 1.2,
		nco_ratio: 0.4,
		rbcrwaj: 13,
		rbc1aaj: 9,
		lnlsdepr: 75,
		...overrides
	};
}

function mockDb() {
	const calls: Array<{ sql: string; params: unknown[]; method: 'first' | 'all' }> = [];
	const failureRows: FailureHistoryRow[] = dates.map((repdte, index) => ({
		...financial(100, repdte),
		source_id: 'failure-100',
		failure_cert: 100,
		failure_name: 'Failed Bank',
		failure_city: 'Example',
		failure_state: 'IL',
		fail_date: '20210115',
		anchor_repdte: '20201231',
		history_rank: dates.length - index
	}));
	const activeRows: ActiveHistoryRow[] = dates.map((repdte, index) => ({
		...financial(200, repdte),
		name: 'Current Bank',
		city: 'Example',
		state: 'NC',
		active: 1,
		history_rank: dates.length - index
	}));
	const prepare = vi.fn((sql: string) => ({
		bind: (...params: unknown[]) => ({
			first: async () => {
				calls.push({ sql, params, method: 'first' });
				return { total_failures: 1, with_certificate: 1 };
			},
			all: async () => {
				calls.push({ sql, params, method: 'all' });
				return { results: sql.includes('selected_failures') ? failureRows : activeRows };
			}
		})
	}));
	return { db: { prepare } as unknown as D1Database, prepare, calls };
}

async function call(
	url: string,
	db: D1Database,
	locals: App.Locals = { liveDataRelease: '20201231', liveDataGeneration: 'generation-42' }
): Promise<Response> {
	const handler = GET as unknown as (event: {
		url: URL;
		request: Request;
		platform: App.Platform;
		locals: App.Locals;
	}) => Promise<Response>;
	return handler({
		url: new URL(url),
		request: new Request(url),
		platform: { env: { DB: db } } as App.Platform,
		locals
	});
}

describe('GET /api/v2/research/failure-patterns', () => {
	it('returns an exact-quarter event pattern, ranked current analogues, and release lineage', async () => {
		const { db, calls } = mockDb();
		const response = await call(
			'https://bankgraph.test/api/v2/research/failure-patterns?start_year=2021&end_year=2021&quarters=4&limit=1',
			db
		);
		const body = await response.json() as Record<string, any>;

		expect(response.status).toBe(200);
		expect(body).toMatchObject({
			analysis: 'historical_failure_pattern_and_current_similarity',
			semantics: { kind: 'descriptive_similarity' },
			request: {
				startYear: 2021,
				endYear: 2021,
				quarters: 4,
				limit: 1,
				transactionType: 'FAILURE'
			},
			historicalCohort: {
				sourceFailureRecords: 1,
				withExactQuarterHistory: 1,
				excludedForQuarterGaps: 0
			},
			currentAnalogues: {
				asOf: '20201231',
				withExactQuarterHistory: 1,
				returned: 1,
				data: [{ rank: 1, cert: 200, name: 'Current Bank' }]
			},
			provenance: {
				release: '20201231',
				release_generation: 'generation-42',
				source: 'FDIC BankFind Suite'
			}
		});
		expect(body.eventStudy.series).toHaveLength(11);
		expect(body.eventStudy.series[0].points).toHaveLength(4);
		expect(body.featureSet.find((feature: any) => feature.id === 'net_charge_off_ratio').sourceFields).toEqual(['NTLNLSR']);
		expect(calls.find((entry) => entry.sql.includes('selected_failures'))?.params).toEqual([
			'20210101', '20211231', 4
		]);
		expect(calls.find((entry) => entry.sql.includes('financial.repdte IN'))?.params).toEqual(dates);
	});

	it('rejects invalid bounds before touching D1', async () => {
		const { db, prepare } = mockDb();
		const response = await call(
			'https://bankgraph.test/api/v2/research/failure-patterns?quarters=24',
			db
		);

		expect(response.status).toBe(400);
		expect(await response.json()).toEqual({ error: 'quarters must be between 4 and 12' });
		expect(prepare).not.toHaveBeenCalled();
	});

	it('applies the release-generation fence before touching D1', async () => {
		const { db, prepare } = mockDb();
		const response = await call(
			'https://bankgraph.test/api/v2/research/failure-patterns?expected_release_generation=stale',
			db
		);

		expect(response.status).toBe(409);
		expect(await response.json()).toMatchObject({
			error: 'stale_page_release',
			release: '20201231',
			release_generation: 'generation-42'
		});
		expect(prepare).not.toHaveBeenCalled();
	});
});
