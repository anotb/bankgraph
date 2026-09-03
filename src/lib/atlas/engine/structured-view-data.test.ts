import { describe, expect, it, vi } from 'vitest';
import type { Financial, Institution } from '$lib/types';
import type { ResearchBoardBlock, ResearchWorkspaceViewBlock } from '$lib/workspace/types';
import type { Board } from '$lib/atlas/board/board.svelte';
import { AtlasStructuredReadError, readAtlasStructuredView } from './structured-view-data';

const Q1 = '20250331';
const Q2 = '20250630';
const Q3 = '20250930';

function institution(cert: number, state = cert % 2 ? 'NY' : 'CA'): Institution {
	return {
		cert,
		rssd_id: cert + 1000,
		name: `Bank ${cert}`,
		city: 'City',
		state,
		zip: '10000',
		county: 'County',
		charter_class: 'NM',
		regulator: 'FDIC',
		active: 1,
		established_date: '20000101',
		insured_date: '20000101',
		holding_company: null,
		hc_rssd_id: null,
		asset_tier: 4,
		total_assets: cert * 1_000,
		total_deposits: cert * 700,
		num_branches: cert,
		num_employees: cert * 10,
		latest_repdte: Q3,
		latest_roa: cert,
		latest_roe: cert * 2,
		latest_nim: 3,
		latest_npl_ratio: 1,
		latest_tier1_ratio: 12
	};
}

function financial(cert: number, repdte: string, asset: number, roa = asset / 100): Financial {
	return {
		cert,
		repdte,
		asset,
		dep: asset * 0.7,
		eq: asset * 0.1,
		lnlsnet: asset * 0.6,
		lnre: null,
		lnci: null,
		lncon: null,
		sec: null,
		netinc: asset * 0.01,
		intinc: null,
		eintexp: null,
		nim: null,
		nonii: null,
		nonix: null,
		elnatr: null,
		roa,
		roe: roa * 2,
		nimy: 3,
		eeffr: 60,
		rbcrwaj: 14,
		rbc1rwaj: 12,
		rbc1aaj: 9,
		eqv: 10,
		nclnlsr: 1,
		lnatresr: 100,
		nco_ratio: 0.2,
		lnlsdepr: 80,
		othbfhlb: 10,
		numemp: cert * 10,
		asset_bucket: 4
	};
}

function board(overrides: Partial<Board> = {}): Board {
	const certs = Array.from({ length: 8 }, (_, index) => index + 1);
	const institutions = Object.fromEntries(certs.map((cert) => [cert, institution(cert)]));
	const rows = Object.fromEntries(certs.map((cert) => [cert, [
		financial(cert, Q1, cert * 100, cert),
		financial(cert, Q2, cert * 110, cert * 1.1),
		financial(cert, Q3, cert * 120, cert * 1.2)
	]]));
	return {
		overrides: {},
		selectedCerts: [1],
		metrics: ['asset', 'roa'],
		activeMetric: 'asset',
		historyFrom: Q1,
		historyTo: Q3,
		asOf: Q3,
		compareWith: Q2,
		eventTime: null,
		state: { activeBank: 1 },
		data: { institutions, rows, cohort: certs, latestQuarter: Q3 },
		...overrides
	} as unknown as Board;
}

function view(id: string, bindingView: ResearchWorkspaceViewBlock['binding']['view']): ResearchWorkspaceViewBlock {
	return { id, title: id, span: 'full', kind: 'workspace_view', binding: { view: bindingView } };
}

describe('readAtlasStructuredView', () => {
	it('uses the effective pinned bindings, visible history presentation, indexing, and bounded pages', async () => {
		const block: ResearchBoardBlock = {
			id: 'history',
			title: 'Pinned history',
			span: 'full',
			kind: 'history',
			binding: { certs: [2], metrics: ['asset', 'roa'], from: Q1, to: Q3, chartKind: 'line', scale: 'index' }
		};
		const atlas = board({
			overrides: { history: { pins: { certs: [3], metrics: ['roa'], asOf: Q2, compareWith: Q1 }, presentation: 'multiples' } }
		} as Partial<Board>);

		const result = await readAtlasStructuredView({ board: atlas, block, page: { offset: 1, limit: 2 } });

		expect(result.anchors.certs).toEqual([3]);
		expect(result.anchors.metrics).toEqual(['roa']);
		expect(result.anchors.asOf).toBe(Q2);
		expect(result.anchors.from).toBe(Q1);
		expect(result.anchors.to).toBe(Q2);
		expect(result.page).toEqual({ offset: 1, limit: 2, total: 2, returned: 1, hasMore: false, nextOffset: null });
		expect(result.data.kind).toBe('history');
		if (result.data.kind !== 'history') return;
		expect(result.data.presentation).toBe('primary');
		expect(result.data.observations[0]?.value).toBeCloseTo(110);
		expect(result.data.peerBand).toBeNull();
		expect(result.sources[0]).toMatchObject({ dataset: 'FDIC BankFind Suite', grain: 'institution-quarter' });
	});

	it('returns exact table rows and the same peer-relative comparison values shown in a single-bank matrix', async () => {
		const atlas = board();
		const table: ResearchBoardBlock = {
			id: 'table', title: 'Exact', span: 'full', kind: 'exact_table',
			binding: { certs: [1], metrics: ['asset', 'roa'], from: Q1, to: Q3, followCurrent: false }
		};
		const exact = await readAtlasStructuredView({ board: atlas, block: table, page: { limit: 2 } });
		expect(exact.data.kind).toBe('exact_table');
		if (exact.data.kind === 'exact_table') {
			expect(exact.data.orientation).toBe('periods');
			expect(exact.data.rows[0]).toMatchObject({ period: Q3, cert: 1, values: { asset: 120, roa: 1.2 } });
		}
		expect(exact.page).toMatchObject({ total: 3, returned: 2, hasMore: true, nextOffset: 2 });

		const reattached = await readAtlasStructuredView({
			board: board({ selectedCerts: [1, 2], overrides: { table: { followWorkspace: true } } } as Partial<Board>),
			block: table
		});
		expect(reattached.data.kind).toBe('exact_table');
		if (reattached.data.kind === 'exact_table') {
			expect(reattached.data.orientation).toBe('institutions');
			expect(reattached.data.rows).toHaveLength(2);
		}

		const matrix = await readAtlasStructuredView({ board: atlas, block: view('matrix', 'comparison_matrix') });
		expect(matrix.data.kind).toBe('comparison_matrix');
		if (matrix.data.kind === 'comparison_matrix') {
			expect(matrix.data.orientation).toBe('measures');
			expect(matrix.data.rows[0]).toMatchObject({ metric: 'asset', value: 120, peerMedian: 540, peerCount: 8 });
		}
	});

	it('keeps curated peer tables and histories synchronized with the board bank selection', async () => {
		const atlas = board({ selectedCerts: [1, 2, 3] } as Partial<Board>);
		const curatedTable: ResearchBoardBlock = {
			id: 'peer_comparison-1', title: 'Exact values', span: 'full', kind: 'exact_table',
			binding: { certs: [1], metrics: ['asset', 'roa'], from: null, to: null, followCurrent: true }
		};
		const curatedHistory: ResearchBoardBlock = {
			id: 'peer_comparison-2', title: 'Over time', span: 'full', kind: 'history',
			binding: { certs: [1], metrics: ['asset'], from: Q1, to: Q3, chartKind: 'line', scale: 'value' }
		};

		const table = await readAtlasStructuredView({ board: atlas, block: curatedTable });
		const history = await readAtlasStructuredView({ board: atlas, block: curatedHistory });

		expect(table.anchors.certs).toEqual([1, 2, 3]);
		expect(history.anchors.certs).toEqual([1, 2, 3]);
	});

	it('reads distributions, relationships, geography, and institution records from the shared BoardData cache', async () => {
		const atlas = board();
		const distribution = await readAtlasStructuredView({ board: atlas, block: view('distribution', 'peer_distribution'), page: { offset: 2, limit: 3 } });
		expect(distribution.data.kind).toBe('peer_distribution');
		if (distribution.data.kind === 'peer_distribution') {
			expect(distribution.data.points).toHaveLength(3);
			expect(distribution.data.summaries[0]).toMatchObject({ metric: 'asset', peerCount: 8, median: 540 });
		}
		expect(distribution.page).toMatchObject({ total: 8, returned: 3, nextOffset: 5 });

		const relationship = await readAtlasStructuredView({ board: atlas, block: view('relationship', 'metric_relationship') });
		expect(relationship.data.kind).toBe('metric_relationship');
		if (relationship.data.kind === 'metric_relationship') {
			expect(relationship.data).toMatchObject({ xMetric: 'roa', yMetric: 'asset', correlation: 1 });
			expect(relationship.data.points).toHaveLength(8);
		}

		const geography = await readAtlasStructuredView({ board: atlas, block: view('map', 'headquarters_geography') });
		expect(geography.data.kind).toBe('headquarters_geography');
		if (geography.data.kind === 'headquarters_geography') {
			expect(geography.data.states).toEqual([
				expect.objectContaining({ state: 'CA', bankCount: 4, totalAssets: 20_000 }),
				expect.objectContaining({ state: 'NY', bankCount: 4, totalAssets: 16_000, selected: true })
			]);
		}

		const record = await readAtlasStructuredView({ board: atlas, block: view('record', 'bank_context') });
		expect(record.data.kind).toBe('bank_context');
		if (record.data.kind === 'bank_context') expect(record.data.bank).toMatchObject({ cert: 1, name: 'Bank 1' });
	});

	it('returns reconciled attribution components and quarterly macro observations from their live view endpoints', async () => {
		const atlas = board({
			overrides: {
				attribution: { attributionMode: 'funding' },
				economy: { series: ['UST10Y2Y'] }
			}
		} as Partial<Board>);
		const fetcher = vi.fn<typeof fetch>(async (input) => {
			const url = String(input);
			if (url.includes('quarter-brief')) return new Response(JSON.stringify({
				bank: { name: 'Bank 1' },
				comparison: { status: 'ready', isConsecutiveQuarter: true, message: null },
				bridges: {
					funding: {
						metric: 'dep', unit: 'usd_thousands', from: { repdte: Q2, value: 70 }, to: { repdte: Q3, value: 84 }, totalChange: 14,
						contributions: [
							{ key: 'domestic', label: 'Domestic deposits', change: 10, availability: 'reported' },
							{ key: 'other', label: 'Other funding', change: 4, availability: 'reported' }
						],
						residual: 0, dataCoverage: 1, method: 'reported_bridge', reconciliation: 'reconciled'
					}
				}
			}), { status: 200, headers: { 'content-type': 'application/json' } });
			if (url.includes('/macro/UST10Y2Y')) return new Response(JSON.stringify({
				series_id: 'UST10Y2Y', title: '10-Year minus 2-Year Treasury spread', units: 'Percent',
				data: [{ date: '2025-07-01', value: 0.2 }, { date: '2025-08-01', value: 0.4 }]
			}), { status: 200, headers: { 'content-type': 'application/json' } });
			return new Response(null, { status: 404 });
		});

		const attribution = await readAtlasStructuredView({ board: atlas, block: view('attribution', 'change_attribution'), fetcher, page: { limit: 1 } });
		expect(attribution.data.kind).toBe('change_attribution');
		if (attribution.data.kind === 'change_attribution') {
			expect(attribution.data).toMatchObject({ bridge: 'funding', residual: 0, reconciliation: 'reconciled' });
			expect(attribution.data.components).toEqual([{ key: 'domestic', label: 'Domestic deposits', change: 10, availability: 'reported' }]);
		}
		expect(attribution.page).toMatchObject({ total: 2, returned: 1, hasMore: true });

		const economy = await readAtlasStructuredView({ board: atlas, block: view('economy', 'economic_context'), fetcher });
		expect(economy.data.kind).toBe('economic_context');
		if (economy.data.kind === 'economic_context') {
			const q3 = economy.data.series.find((row) => row.period === Q3);
			expect(q3).toMatchObject({ id: 'UST10Y2Y' });
			expect(q3?.value).toBeCloseTo(0.3);
		}
		expect(fetcher).toHaveBeenCalledWith(expect.stringContaining('/macro/UST10Y2Y?'), expect.objectContaining({ signal: undefined }));
	});

	it('rejects oversized pages before reading data', async () => {
		await expect(readAtlasStructuredView({ board: board(), block: view('record', 'bank_context'), page: { limit: 201 } }))
			.rejects.toMatchObject({ code: 'invalid_page', retryable: false } satisfies Partial<AtlasStructuredReadError>);
	});
});
