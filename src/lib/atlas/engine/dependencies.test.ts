import { describe, expect, it, vi } from 'vitest';
import type { Financial, Institution } from '$lib/types';
import { createDefaultWorkspaceState, workspaceCommands } from '$lib/workspace/state';
import { createWorkspaceStore } from '$lib/workspace/workspace.svelte';
import { createAnalysisResultRef } from '$lib/workspace/analysis-result-repository';
import { createWorkspaceWebMcpToolCatalog, type WorkspaceWebMcpDependencies } from '$lib/webmcp/catalog';
import { BoardData } from './board-data.svelte';
import { createBoardDependencies } from './dependencies';
import { Board } from '$lib/atlas/board/board.svelte';
import { deserializeWorkspaceSearchParams, serializeWorkspaceSearch } from '$lib/workspace/codec';

vi.hoisted(() => {
	if (typeof window !== 'undefined' && !window.matchMedia) {
		Object.defineProperty(window, 'matchMedia', {
			configurable: true,
			value: () => ({
				matches: false,
				media: '',
				onchange: null,
				addListener() {},
				removeListener() {},
				addEventListener() {},
				removeEventListener() {},
				dispatchEvent: () => false
			})
		});
	}
});

const Q1 = '20251231';
const Q2 = '20260331';
const Q3 = '20260630';

function institution(cert: number, state: string): Institution {
	return {
		cert,
		rssd_id: cert + 10_000,
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
		asset_tier: 1,
		total_assets: cert * 1_000,
		total_deposits: cert * 700,
		num_branches: cert * 2,
		num_employees: cert * 10,
		latest_repdte: Q3,
		latest_roa: cert,
		latest_roe: cert * 2,
		latest_nim: 3,
		latest_npl_ratio: 1,
		latest_tier1_ratio: 12
	};
}

function row(
	cert: number,
	repdte: string,
	asset: number | null,
	roa: number | null,
	loan: { total: number; realEstate: number; commercial: number; consumer: number | null }
): Financial {
	return {
		cert,
		repdte,
		asset,
		dep: asset === null ? null : asset * 0.7,
		eq: asset === null ? null : asset * 0.1,
		lnlsnet: loan.total,
		lnre: loan.realEstate,
		lnci: loan.commercial,
		lncon: loan.consumer,
		sec: asset === null ? null : asset * 0.2,
		netinc: null,
		intinc: null,
		eintexp: null,
		nim: null,
		nonii: null,
		nonix: null,
		elnatr: null,
		roa,
		roe: roa === null ? null : roa * 2,
		nimy: 3,
		eeffr: 60,
		rbcrwaj: 14,
		rbc1rwaj: 12,
		rbc1aaj: 9,
		eqv: 10,
		nclnlsr: 1,
		lnatresr: 100,
		nco_ratio: 0.2,
		lnlsdepr: 80 + cert,
		othbfhlb: 10,
		numemp: cert * 10,
		asset_bucket: 1
	};
}

const institutions = [institution(1, 'NC'), institution(2, 'UT'), institution(3, 'OH')];
const sourceRows: Financial[] = [
	row(1, Q1, 100, 1.0, { total: 70, realEstate: 35, commercial: 20, consumer: 10 }),
	row(1, Q2, 110, 1.1, { total: 77, realEstate: 38, commercial: 22, consumer: 11 }),
	row(1, Q3, 120, 1.2, { total: 84, realEstate: 42, commercial: 24, consumer: 12 }),
	row(2, Q1, 200, 2.0, { total: 140, realEstate: 70, commercial: 40, consumer: 20 }),
	row(2, Q2, 190, 1.9, { total: 133, realEstate: 65, commercial: 40, consumer: 19 }),
	row(2, Q3, 180, 1.8, { total: 126, realEstate: 60, commercial: 40, consumer: 18 }),
	row(3, Q1, null, null, { total: 210, realEstate: 105, commercial: 60, consumer: null }),
	row(3, Q2, 310, 3.1, { total: 217, realEstate: 108, commercial: 62, consumer: 31 }),
	row(3, Q3, 320, 3.2, { total: 224, realEstate: 112, commercial: 64, consumer: 32 })
];

function json(value: unknown, status = 200): Response {
	return new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } });
}

function harness(withBoard = false) {
	const fetcher = vi.fn<typeof fetch>(async (input) => {
		const url = new URL(String(input), 'https://bankgraph.test');
		if (url.pathname === '/api/v2/banks/screen') {
			return json({ data: institutions, total: institutions.length, asOf: Q3 });
		}
		if (url.pathname === '/api/v1/compare') {
			const certs = new Set((url.searchParams.get('certs') ?? '').split(',').map(Number));
			const metrics = (url.searchParams.get('metrics') ?? '').split(',').filter(Boolean);
			const from = url.searchParams.get('from');
			const to = url.searchParams.get('to');
			const data = Object.fromEntries([...certs].map((cert) => [String(cert), sourceRows
				.filter((item) => item.cert === cert && (!from || item.repdte >= from) && (!to || item.repdte <= to))
				.map((item) => Object.fromEntries([
					['cert', item.cert],
					['repdte', item.repdte],
					...metrics.map((metric) => [metric, item[metric as keyof Financial]])
				]))]));
			return json({ data });
		}
		return json({ error: 'not found' }, 404);
	});
	const initialState = createDefaultWorkspaceState();
	initialState.selectedCerts = [1, 2];
	initialState.activeBank = 1;
	initialState.peerRecipe = { ...initialState.peerRecipe, name: 'All test banks', maximumPeers: 3 };
	const store = createWorkspaceStore({ initialState, storage: null, persist: false });
	const data = new BoardData(fetcher);
	const board = withBoard ? new Board(store, data, `atlas.test.${Math.random()}`) : undefined;
	const base = createBoardDependencies({
		store,
		data,
		...(board ? { board } : {}),
		fetcher,
		context: () => ({
			sourceAsOf: Q3,
			retrievedAt: '2026-08-01T00:00:00Z',
			pageLoadedAt: '2026-08-01T00:00:01Z',
			release: Q3,
			releaseGeneration: 'generation-1'
		})
	});
	const deps: WorkspaceWebMcpDependencies = {
		...base,
		storeAnalysisResult: async (result) => createAnalysisResultRef(result)
	};
	return { catalog: createWorkspaceWebMcpToolCatalog(deps), deps, store, fetcher, board };
}

const controllerContext = (toolName: string) => ({
	signal: new AbortController().signal,
	scope: 'test',
	toolName
});

describe('Atlas advanced-analysis dependencies', () => {
	it('persists partial metric/width edits while curated banks and periods keep following the workspace', async () => {
		const { catalog, deps, store } = harness(true);
		store.execute(workspaceCommands.setSelectedCerts([1, 2, 3, 4]));
		store.execute(workspaceCommands.upsertBoardBlock({
			id: 'peer_comparison-2', title: 'Over time', kind: 'history', span: 'half',
			binding: { certs: [1, 2, 3, 4], metrics: ['asset'], from: Q1, to: Q3, chartKind: 'line', scale: 'value' }
		}));

		const configured = await catalog['bankgraph.configure_board_view'].controller({
			blockId: 'peer_comparison-2', metrics: ['roa'], scale: 'index', width: 'full'
		}, controllerContext('bankgraph.configure_board_view'));
		expect(configured.data).toMatchObject({
			block: {
				span: 'full',
				binding: { metrics: ['roa'], scale: 'index' },
				anchorConfig: { bankSource: 'workspace', metricSource: 'fixed', periodSource: 'workspace', metrics: ['roa'] }
			}
		});

		store.execute(workspaceCommands.setSelectedCerts([1, 2, 3, 4, 5, 6, 7]));
		const read = await catalog['bankgraph.read_research_board'].controller({}, controllerContext('bankgraph.read_research_board'));
		expect(read.data).toMatchObject({
			blocks: [{
				span: 'full',
				binding: { certs: [1, 2, 3, 4, 5, 6, 7], metrics: ['roa'], scale: 'index' },
				anchorConfig: { bankSource: 'workspace', metricSource: 'fixed', periodSource: 'workspace' }
			}]
		});

		const restored = deserializeWorkspaceSearchParams(serializeWorkspaceSearch(store.state));
		expect(restored.board.blocks[0]).toMatchObject({
			span: 'full',
			anchorConfig: { bankSource: 'workspace', metricSource: 'fixed', periodSource: 'workspace', metrics: ['roa'] }
		});
		expect(deps.getBoardPresentation?.().overrides['peer_comparison-2']).toEqual({ span: 12 });
	});

	it('reattaches only published-view banks through bankSource without losing fixed metrics or periods', async () => {
		const { catalog, store } = harness(true);
		store.execute(workspaceCommands.setSelectedCerts([1, 2, 3, 4, 5, 6, 7]));
		store.execute(workspaceCommands.upsertBoardBlock({
			id: 'published-history', title: 'Published', kind: 'history', span: 'half',
			binding: { certs: [1, 2, 3, 4], metrics: ['asset'], from: Q1, to: Q2, chartKind: 'line', scale: 'value' },
			anchorConfig: {
				bankSource: 'fixed', metricSource: 'fixed', periodSource: 'fixed', certs: [1, 2, 3, 4], metrics: ['asset'],
				asOf: Q2, compareWith: Q1, historyFrom: Q1, historyTo: Q2
			}
		}));

		const configured = await catalog['bankgraph.configure_board_view'].controller({
			blockId: 'published-history', bankSource: 'workspace'
		}, controllerContext('bankgraph.configure_board_view'));
		expect(configured.data).toMatchObject({
			block: {
				binding: { certs: [1, 2, 3, 4, 5, 6, 7], metrics: ['asset'], from: Q1, to: Q2 },
				anchorConfig: { bankSource: 'workspace', metricSource: 'fixed', periodSource: 'fixed' }
			}
		});
	});

	it('persists a human single-anchor measure pin without freezing banks or periods', () => {
		const { board, deps, store } = harness(true);
		store.execute(workspaceCommands.setSelectedCerts([1, 2, 3, 4]));
		store.execute(workspaceCommands.upsertBoardBlock({
			id: 'peer_comparison-2', title: 'Over time', kind: 'history', span: 'half',
			binding: { certs: [1, 2, 3, 4], metrics: ['asset'], from: Q1, to: Q3, chartKind: 'line', scale: 'value' }
		}));

		board!.setOverride('peer_comparison-2', { pins: { metrics: ['roa'] } });
		expect(store.state.board.blocks[0]).toMatchObject({
			anchorConfig: { bankSource: 'workspace', metricSource: 'fixed', periodSource: 'workspace', metrics: ['roa'] }
		});
		store.execute(workspaceCommands.setSelectedCerts([1, 2, 3, 4, 5, 6, 7]));
		expect(deps.resolveBoardBlock?.(store.state.board.blocks[0])).toMatchObject({
			binding: { certs: [1, 2, 3, 4, 5, 6, 7], metrics: ['roa'] }
		});
	});
	it('turns a loan-to-deposit screen into the ordered cohort and ranks exact values from it', async () => {
		const { catalog, store, fetcher } = harness();
		store.execute(workspaceCommands.setPeerRecipe({
			...store.state.peerRecipe,
			name: 'Old custom cohort',
			basis: 'custom',
			maximumPeers: 3
		}));
		store.execute(workspaceCommands.setExcludedCerts([3]));

		const configured = await catalog['bankgraph.configure_screen'].controller({
			question: 'Which active banks over $10B have the highest loan-to-deposit ratios?',
			query: '',
			states: [],
			active: 'active',
			assetMin: 10_000_000,
			conditions: [],
			sort: 'loanToDeposit',
			order: 'desc',
			ifRevision: store.state.revision
		}, controllerContext('bankgraph.configure_screen'));

		expect(configured.data).toMatchObject({
			screenView: { sort: 'loanToDeposit', order: 'desc' },
			cohort: { basis: 'screen', loaded: 3, matching: 3, maximumBanks: 200, truncated: false }
		});
		expect(store.state.peerRecipe).toMatchObject({ basis: 'screen', name: 'Current screen', maximumPeers: 200 });
		expect(store.state.excludedCerts).toEqual([]);
		const screenCall = fetcher.mock.calls
			.map(([input]) => new URL(String(input), 'https://bankgraph.test'))
			.find((url) => url.pathname === '/api/v2/banks/screen');
		expect(screenCall?.searchParams.get('sort')).toBe('loanToDeposit');
		expect(screenCall?.searchParams.get('order')).toBe('desc');
		expect(screenCall?.searchParams.get('limit')).toBe('200');

		const ranked = await catalog['bankgraph.rank_cohort_on_board'].controller({
			metric: 'lnlsdepr',
			direction: 'highest',
			bankCount: 2,
			metrics: ['lnlsdepr', 'asset'],
			boardMode: 'keep',
			ifRevision: store.state.revision
		}, controllerContext('bankgraph.rank_cohort_on_board'));

		expect(ranked.data).toMatchObject({
			metric: 'lnlsdepr',
			unit: 'percent',
			selectedBanks: [
				{ cert: 3, value: 83 },
				{ cert: 2, value: 82 }
			]
		});
		// Workspace identity is canonicalized by certificate number; the tool result
		// above preserves the analytical rank and reported values.
		expect(store.state.selectedCerts).toEqual([2, 3]);
		expect(store.state.activeBank).toBe(3);
	});

	it('publishes an exact fixed-cohort change result with independent missingness', async () => {
		const { catalog, store } = harness();
		const result = await catalog['bankgraph.analyze_cohort_change'].controller({
			from: Q1,
			to: Q3,
			metrics: ['asset', 'roa'],
			groupBy: 'state',
			boardBlockId: 'cohort-change',
			ifRevision: 0
		}, controllerContext('bankgraph.analyze_cohort_change'));

		expect(result.data).toMatchObject({
			kind: 'cohort_change',
			analyzedCount: 3,
			board: { blockId: 'cohort-change', view: 'breadth', visible: true }
		});
		expect(store.state.analysisResult?.kind).toBe('cohort_change');
		if (store.state.analysisResult?.kind !== 'cohort_change') throw new Error('Expected a cohort-change result');
		expect(store.state.analysisResult.transition.cohort.count).toBe(3);
		expect(store.state.analysisResult.transition.metrics.map((metric) => ({
			metric: metric.metric,
			paired: metric.coverage.paired,
			openingOnly: metric.coverage.openingOnly,
			closingOnly: metric.coverage.closingOnly
		}))).toEqual([
			{ metric: 'asset', paired: 2, openingOnly: 0, closingOnly: 1 },
			{ metric: 'roa', paired: 2, openingOnly: 0, closingOnly: 1 }
		]);
		expect(store.state.analysisResult.transition.groups.find((group) => group.key === 'NC'))
			.toMatchObject({ key: 'NC', label: 'NC', cohort: 1 });
		expect(store.state.board.blocks[0]).toMatchObject({
			id: 'cohort-change',
			kind: 'analysis',
			binding: { view: 'breadth', resultRef: { kind: 'cohort_change' } }
		});
	});

	it('matches temporal predicates across exact quarter series and publishes only conjunctive matches', async () => {
		const { catalog, store } = harness();
		const result = await catalog['bankgraph.find_temporal_patterns'].controller({
			metrics: ['asset'],
			requiredPeriods: [Q1, Q2, Q3],
			pattern: 'direction_count',
			direction: 'increase',
			atLeast: 2,
			minimumObservations: 3,
			gapPolicy: 'require_complete',
			boardBlockId: 'growth-pattern',
			ifRevision: 0
		}, controllerContext('bankgraph.find_temporal_patterns'));

		expect(result.data).toMatchObject({
			kind: 'temporal_pattern',
			counts: { cohort: 3, matched: 1, notMatched: 1, insufficientData: 1 },
			rows: [{ cert: 1 }],
			board: { blockId: 'growth-pattern', view: 'matched_banks', visible: true }
		});
		expect(store.state.analysisResult).toMatchObject({
			kind: 'temporal_pattern',
			rows: [{ cert: 1, evaluations: [{ status: 'matched', coverage: { missingPeriodCount: 0 } }] }]
		});
	});

	it('fetches the exact composition fields and keeps matched-reporter change coverage visible', async () => {
		const { catalog, store, fetcher } = harness();
		const result = await catalog['bankgraph.analyze_financial_composition'].controller({
			composition: 'loan_mix',
			scope: 'current_cohort',
			period: Q3,
			compareFrom: Q1,
			boardBlockId: 'loan-mix',
			ifRevision: 0
		}, controllerContext('bankgraph.analyze_financial_composition'));

		expect(result.data).toMatchObject({
			kind: 'financial_composition',
			scope: { type: 'current_cohort', memberCount: 3 },
			analysis: {
				id: 'loan_mix',
				status: 'partial_coverage',
				matchedReporters: { identityMatchedReporters: 3, comparableReporters: 2, nonComparableReporters: 1 }
			},
			board: { blockId: 'loan-mix', view: 'stacked_composition', visible: true }
		});
		expect(store.state.analysisResult).toMatchObject({
			kind: 'financial_composition',
			memberCerts: [1, 2, 3],
			analysis: { matchedReporters: { comparableReporters: 2 } }
		});
		const compositionCall = fetcher.mock.calls
			.map(([input]) => String(input))
			.find((url) => url.includes('metrics=lnlsnet%2Clnre%2Clnci%2Clncon'));
		expect(compositionCall).toContain('expected_release_generation=generation-1');
	});
});
