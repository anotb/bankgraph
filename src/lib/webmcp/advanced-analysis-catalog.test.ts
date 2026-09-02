import { describe, expect, it, vi } from 'vitest';
import { deriveCohortTransition } from '$lib/analytics/cohort-transition';
import { deriveCompositionSnapshot } from '$lib/analytics/composition';
import { analyzeTemporalPattern } from '$lib/analytics/temporal-patterns';
import {
	applyWorkspaceCommand,
	applyWorkspaceCommands,
	createDefaultWorkspaceState,
	type WorkspaceCommand,
	type WorkspaceCommandOptions,
	type WorkspaceState
} from '$lib/workspace';
import {
	createWorkspaceWebMcpToolCatalog,
	createWorkspaceWebMcpTools,
	type WebMcpBankSearchRequest,
	type WorkspaceWebMcpDependencies
} from './catalog';
import { cohortIdentityKey, paginationKey } from './pagination';
import { validateToolDefinition } from './schema';
import type { FailurePatternsResponse } from '$lib/server/analytics/failure-patterns';

function harness() {
	let state: WorkspaceState = createDefaultWorkspaceState();
	const target = {
		get state() { return state; },
		execute(command: WorkspaceCommand, options?: WorkspaceCommandOptions) {
			const result = applyWorkspaceCommand(state, command, options);
			state = result.state;
			return result;
		},
		executeBatch(commands: readonly WorkspaceCommand[], options?: WorkspaceCommandOptions) {
			const result = applyWorkspaceCommands(state, commands, options);
			state = result.state;
			return result;
		}
	};
	const definition = {
		recipe: { ...state.peerRecipe, name: 'Current peers', maximumPeers: 3 },
		excludedCerts: [],
		screenDefinitionHash: null,
		screenFilters: null
	};
	const definitionHash = paginationKey(definition);
	const cohortHash = cohortIdentityKey({
		definitionHash, memberCerts: [1, 2, 3], sourceAsOf: '20260630', releaseGeneration: 'gen-1'
	});
	const context = {
		definition, definitionHash, cohortHash,
		sourceMode: 'live' as const, sourceAsOf: '20260630', retrievedAt: '2026-08-01T00:00:00Z'
	};
	const rows = [
		{ id: 1, name: 'One', state: 'NC', rows: [{ period: '20260331', values: { asset: 100 } }, { period: '20260630', values: { asset: 110 } }] },
		{ id: 2, name: 'Two', state: 'UT', rows: [{ period: '20260331', values: { asset: 200 } }, { period: '20260630', values: { asset: 190 } }] },
		{ id: 3, name: 'Three', state: 'OH', rows: [{ period: '20260331', values: { asset: 300 } }, { period: '20260630', values: { asset: 330 } }] }
	];
	const deps: WorkspaceWebMcpDependencies = {
		workspace: target,
		getDataContext: () => ({ sourceMode: 'live', sourceAsOf: '20260630', release: '20260630', releaseGeneration: 'gen-1' }),
		searchBanks: vi.fn(async (request: WebMcpBankSearchRequest) => ({
			banks: Array.from({ length: Math.min(request.limit, Math.max(0, 120 - (request.offset ?? 0))) }, (_, index) => {
				const cert = (request.offset ?? 0) + index + 1;
				return { cert, name: `Bank ${cert}`, state: 'NC', city: null, totalAssets: cert * 100, latestQuarter: '20260630' };
			}),
			total: 120, sourceMode: 'live' as const, asOf: '20260630', refreshedAt: null, truncated: true
		})),
		getCurrentCohortMemberCount: () => 3,
		analyzeCohortChange: vi.fn(async () => ({
			...context,
			transition: deriveCohortTransition({ openingPeriod: '20260331', closingPeriod: '20260630', metrics: ['asset'], entities: rows })
		})),
		findTemporalPatterns: vi.fn(async (request) => {
			const evaluation = analyzeTemporalPattern({
				metric: request.metrics[0],
				series: [{ period: '20260331', value: 100 }, { period: '20260630', value: 110 }],
				requiredPeriods: ['20260331', '20260630'], minimumObservations: 2,
				gapPolicy: 'require_complete', tolerance: 0,
				pattern: { kind: 'cumulative_change', operator: 'gt', threshold: 0 }
			});
			return {
				...context,
				counts: { cohort: 3, matched: 1, notMatched: 1, insufficientData: 1 },
				rows: [{ cert: 1, name: 'One', state: 'NC', evaluations: [evaluation] }]
			};
		}),
		analyzeFinancialComposition: vi.fn(async () => ({
			...context,
			scopeLabel: 'Bank One', memberCerts: [1],
			analysis: deriveCompositionSnapshot('loan_mix', [{ cert: 1, repdte: '20260630', lnlsnet: 100, lnre: 60, lnci: 20, lncon: 10 }])
		})),
		analyzeFailurePatterns: vi.fn(async (request) => ({
			analysis: 'historical_failure_pattern_and_current_similarity',
			semantics: {
				kind: 'descriptive_similarity',
				statement: 'Reported trajectories are mathematically similar.',
				notA: ['failure probability', 'forecast'],
			},
			request: { ...request, transactionType: 'FAILURE', anchorRule: 'latest FDIC quarter strictly before failure date' },
			featureSet: [],
			historicalCohort: {
				sourceFailureRecords: 12, withCertificate: 12, withPreFailureAnchor: 10, withExactQuarterHistory: 8,
				excludedWithoutCertificate: 0, excludedWithoutAnchor: 2, excludedForQuarterGaps: 2, members: [],
			},
			eventStudy: { timeBasis: 'quarters before failure', series: [] },
			currentAnalogues: {
				asOf: '20260630', activeInstitutionsWithFinancialRows: 4100, withExactQuarterHistory: 3900,
				returned: 0, rankingMethod: 'Robust distance.', data: [],
			},
			methodology: {
				historicalMembership: 'FDIC failures.', quarterCompleteness: 'Exact quarters.', referenceCenter: 'Median.',
				referenceScale: 'MAD.', missingness: 'Nulls stay null.', ranking: 'Descriptive only.', controls: 'No forecast.',
			},
			provenance: {
				release: '20260630', release_generation: 'gen-1', source: 'FDIC BankFind Suite',
				sourceUrl: 'https://banks.data.fdic.gov/bankfind-suite', datasets: ['Failures & Assistance Transactions', 'Financials', 'Institutions'],
				sourceAsOf: '20260630', sourceFields: {} as FailurePatternsResponse['provenance']['sourceFields'],
			},
		} satisfies FailurePatternsResponse)),
		origin: () => 'https://bankgraph.example'
	};
	return { deps, target };
}

const signal = new AbortController().signal;

describe('advanced workspace analysis catalog', () => {
	it('registers the advanced mutations and keeps result readers contextual', () => {
		const { deps } = harness();
		const tools = createWorkspaceWebMcpTools(deps, { page: 'workspace' });
		const names = tools.map((tool) => tool.name);
		for (const tool of tools) expect(validateToolDefinition(tool), tool.name).toEqual([]);
		expect(names).toEqual(expect.arrayContaining([
			'bankgraph.analyze_cohort_change',
			'bankgraph.find_temporal_patterns',
			'bankgraph.analyze_financial_composition',
			'bankgraph.analyze_failure_patterns'
		]));
		expect(tools.find((tool) => tool.name === 'bankgraph.read_analysis_result')).toBeUndefined();
		for (const name of names.filter((name) => name.startsWith('bankgraph.analyze_') || name === 'bankgraph.find_temporal_patterns')) {
			if (!['bankgraph.analyze_cohort_change', 'bankgraph.find_temporal_patterns', 'bankgraph.analyze_financial_composition', 'bankgraph.analyze_failure_patterns'].includes(name)) continue;
			const definition = tools.find((tool) => tool.name === name)!;
			expect(definition.inputSchema.required).toContain('ifRevision');
			const boardSpan = definition.inputSchema.properties.boardSpan as { enum?: readonly string[]; description?: string };
			expect(boardSpan.enum).toEqual(['quarter', 'half', 'three_quarter', 'full']);
			expect(boardSpan.description).toContain('12-column');
			expect(definition.description).toContain('three-quarter');
		}
	});

	it('publishes failure event-study and analogue views from one deterministic result', async () => {
		const { deps, target } = harness();
		const catalog = createWorkspaceWebMcpToolCatalog(deps);
		const analysis = await catalog['bankgraph.analyze_failure_patterns'].controller({
			startYear: 2007, endYear: 2012, quarters: 8, limit: 25,
			boardBlockId: 'failure-event', boardView: 'event_study', ifRevision: 0,
		}, { signal, scope: 'test', toolName: 'bankgraph.analyze_failure_patterns' });
		const resultId = (analysis.data as { resultId: string }).resultId;
		expect(target.state.board.blocks[0]).toMatchObject({ id: 'failure-event', kind: 'analysis', span: 'half', binding: { view: 'event_study' } });
		await catalog['bankgraph.publish_result_view'].controller({
			resultId, blockId: 'failure-analogues', title: 'Active banks with similar trajectories',
			view: 'analogues', span: 'full', focus: true, ifRevision: 1,
		}, { signal, scope: 'test', toolName: 'bankgraph.publish_result_view' });
		expect(target.state.board.blocks).toHaveLength(2);
		expect(target.state.board.blocks[1]).toMatchObject({ binding: { resultRef: { resultId }, view: 'analogues' } });
		await catalog['bankgraph.analyze_failure_patterns'].controller({
			boardBlockId: 'failure-both', ifRevision: 2,
		}, { signal, scope: 'test', toolName: 'bankgraph.analyze_failure_patterns' });
		expect(target.state.board.blocks[2]).toMatchObject({
			id: 'failure-both', span: 'full', binding: { view: 'both' },
		});
	});

	it('materializes once, rejects stale replacement, and pages the visible result', async () => {
		const { deps, target } = harness();
		const catalog = createWorkspaceWebMcpToolCatalog(deps);
		const analysis = await catalog['bankgraph.analyze_cohort_change'].controller({
			from: '20260331', to: '20260630', metrics: ['asset'], groupBy: 'none', boardSpan: 'three_quarter', ifRevision: 0
		}, { signal, scope: 'test', toolName: 'bankgraph.analyze_cohort_change' });
		const resultId = (analysis.data as { resultId: string }).resultId;
		expect(target.state).toMatchObject({
			revision: 1,
			analysisResult: { id: resultId, kind: 'cohort_change' },
			board: { blocks: [{ span: 'three_quarter' }] },
		});
		await expect(catalog['bankgraph.find_temporal_patterns'].controller({
			metrics: ['asset'], requiredPeriods: ['20260331', '20260630'], pattern: 'cumulative_change',
			operator: 'gt', threshold: 0, ifRevision: 0
		}, { signal, scope: 'test', toolName: 'bankgraph.find_temporal_patterns' })).rejects.toMatchObject({ code: 'stale_revision' });
		const read = await catalog['bankgraph.read_analysis_result'].controller(
			{ resultId, section: 'movers', pageSize: 1 },
			{ signal, scope: 'test', toolName: 'bankgraph.read_analysis_result' }
		);
		expect(read.data).toMatchObject({ resultId, kind: 'cohort_change', section: 'movers' });
	});

	it('continues bank-search pagination beyond offset 50', async () => {
		const { deps } = harness();
		const search = createWorkspaceWebMcpToolCatalog(deps)['bankgraph.search_banks'];
		const first = await search.controller(
			{ query: '', states: [], active: 'active', limit: 50 },
			{ signal, scope: 'test', toolName: 'bankgraph.search_banks' }
		);
		const cursor = (first.data as { pagination: { nextCursor: string } }).pagination.nextCursor;
		const second = await search.controller(
			{ query: '', states: [], active: 'active', limit: 10, cursor },
			{ signal, scope: 'test', toolName: 'bankgraph.search_banks' }
		);
		const page = second.data as { banks: Array<{ cert: number }>; pagination: { offset: number } };
		expect(page.banks[0]).toMatchObject({ cert: 51 });
		expect(page.pagination.offset).toBe(50);
	});
});
