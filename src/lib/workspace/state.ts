import {
	WORKSPACE_SCHEMA_VERSION,
	type BankScreenFilters,
	type ChartSpec,
	type CohortTrendResultSet,
	type WorkspaceAnalysisResult,
	type MapSelection,
	type PeerRecipe,
	type PinnedFinding,
	type ResearchBoardBlock,
	type ResultsMetadata,
	type SelectedPeriod,
	type WatchlistDesiredEntry,
	type WorkspaceChartHistory,
	type WorkspaceComparisonSelection,
	type WorkspaceCommand,
	type WorkspaceCommandOptions,
	type WorkspaceCommandResult,
	type WorkspaceDepth,
	type WorkspacePanel,
	type WorkspaceScreenView,
	type WorkspaceState
} from './types';
import {
	WorkspaceValidationError,
	normalizeActiveMetric,
	normalizeChart,
	normalizeCharts,
	normalizeChartHistory,
	normalizeCohortTrendResult,
	normalizeAnalysisResult,
	normalizeComparisonSelection,
	normalizeFilters,
	normalizeFinding,
	normalizeFindings,
	normalizeMapSelection,
	normalizePeerRecipe,
	normalizePeriod,
	normalizeReportingQuarter,
	normalizeResearchBoard,
	normalizeResearchBoardBlock,
	normalizeResearchBoardBlockId,
	normalizeResearchBoardFocus,
	normalizeResearchBoardOrder,
	normalizeResults,
	normalizeScreenView,
	normalizeWatchlistEntries,
	normalizeWorkspaceState
} from './validation';

export class WorkspaceRevisionConflictError extends Error {
	readonly expected: number;
	readonly actual: number;

	constructor(expected: number, actual: number) {
		super(`Workspace revision conflict: expected ${expected}, current revision is ${actual}`);
		this.name = 'WorkspaceRevisionConflictError';
		this.expected = expected;
		this.actual = actual;
	}
}

export function createDefaultWorkspaceState(): WorkspaceState {
	return {
		version: WORKSPACE_SCHEMA_VERSION,
		revision: 0,
		question: '',
		filters: {
			query: '',
			states: [],
			assetRange: { min: null, max: null },
			active: 'active',
			metricConditions: []
		},
		screenView: { sort: 'assets', order: 'desc' },
		results: {
			total: 0,
			returned: 0,
			latestQuarter: null,
			refreshedAt: null,
			queryRevision: null,
			truncated: false
		},
		activeBank: null,
		selectedCerts: [],
		excludedCerts: [],
		peerRecipe: {
			name: '',
			basis: 'screen',
			states: [],
			assetRange: { min: null, max: null },
			active: 'active',
			metricConditions: [],
			minimumPeers: 2,
			maximumPeers: 50
		},
		asOfQuarter: null,
		comparison: {
			mode: 'prior-quarter',
			rangeStartQuarter: null,
			customQuarter: null,
			resolvedQuarter: null
		},
		chartHistory: { from: null, to: null },
		period: { kind: 'quarter', quarter: null },
		charts: [],
		activePanel: 'screen',
		depth: 'guided',
		activeMetric: null,
		mapSelection: { states: [], certs: [] },
		cohortTrendResult: null,
		analysisResult: null,
		board: { focusedBlockId: null, blocks: [] },
		findings: [],
		watchlistDesired: []
	};
}

function same(left: unknown, right: unknown): boolean {
	return JSON.stringify(left) === JSON.stringify(right);
}

function normalizeQuestion(value: unknown): string {
	const candidate = normalizeWorkspaceState({
		...createDefaultWorkspaceState(),
		question: value
	});
	return candidate.question;
}

function normalizePanel(panel: WorkspacePanel): WorkspacePanel {
	return normalizeWorkspaceState({
		...createDefaultWorkspaceState(),
		activePanel: panel
	}).activePanel;
}

function normalizeDepth(depth: WorkspaceDepth): WorkspaceDepth {
	return normalizeWorkspaceState({
		...createDefaultWorkspaceState(),
		depth
	}).depth;
}

function normalizeCertValue(cert: number | null): number | null {
	return normalizeWorkspaceState({
		...createDefaultWorkspaceState(),
		activeBank: cert
	}).activeBank;
}

function normalizeSelectedCerts(certs: number[]): number[] {
	return normalizeWorkspaceState({
		...createDefaultWorkspaceState(),
		selectedCerts: certs
	}).selectedCerts;
}

function normalizeExcludedCerts(certs: number[]): number[] {
	return normalizeWorkspaceState({
		...createDefaultWorkspaceState(),
		excludedCerts: certs
	}).excludedCerts;
}

function nextCandidate(state: WorkspaceState, command: WorkspaceCommand): WorkspaceState {
	switch (command.type) {
		case 'setQuestion':
			return { ...state, question: normalizeQuestion(command.question) };
		case 'setFilters':
			return { ...state, filters: normalizeFilters(command.filters) };
		case 'setScreenView':
			return { ...state, screenView: normalizeScreenView(command.screenView) };
		case 'setResults':
			return { ...state, results: normalizeResults(command.results) };
		case 'setActiveBank':
			return { ...state, activeBank: normalizeCertValue(command.cert) };
		case 'setSelectedCerts':
			return { ...state, selectedCerts: normalizeSelectedCerts(command.certs) };
		case 'setExcludedCerts':
			return { ...state, excludedCerts: normalizeExcludedCerts(command.certs) };
		case 'setPeerRecipe':
			return { ...state, peerRecipe: normalizePeerRecipe(command.recipe) };
		case 'setAsOfQuarter':
			return {
				...state,
				asOfQuarter: normalizeReportingQuarter(command.quarter, 'asOfQuarter', { nullable: true })
			};
		case 'setComparison':
			return {
				...state,
				comparison: normalizeComparisonSelection(
					command.comparison,
					state.asOfQuarter
				)
			};
		case 'setChartHistory':
			return { ...state, chartHistory: normalizeChartHistory(command.history) };
		case 'setPeriod': {
			// Schema-1 compatibility bridge. New callers should use the three
			// independent commands above.
			const period = normalizePeriod(command.period);
			if (period.kind === 'quarter') {
				return {
					...state,
					asOfQuarter: period.quarter,
					comparison: {
						mode: 'prior-quarter',
						rangeStartQuarter: null,
						customQuarter: null,
						resolvedQuarter: null
					},
					chartHistory: { from: null, to: null },
					period
				};
			}
			return {
				...state,
				asOfQuarter: period.to,
				comparison: {
					mode: 'range-start',
					rangeStartQuarter: period.from,
					customQuarter: null,
					resolvedQuarter: period.from
				},
				chartHistory: { from: period.from, to: period.to },
				period
			};
		}
		case 'setCharts':
			return { ...state, charts: normalizeCharts(command.charts) };
		case 'upsertChart': {
			const chart = normalizeChart(command.chart);
			const index = state.charts.findIndex((item) => item.id === chart.id);
			const charts = index < 0
				? [...state.charts, chart]
				: state.charts.map((item, itemIndex) => (itemIndex === index ? chart : item));
			return { ...state, charts: normalizeCharts(charts) };
		}
		case 'removeChart': {
			const id = normalizeChart({
				id: command.id,
				title: '',
				kind: 'line',
				metrics: [],
				certs: [],
				scale: 'value',
				stacked: false,
				visible: false
			}).id;
			return { ...state, charts: state.charts.filter((chart) => chart.id !== id) };
		}
		case 'setActivePanel':
			return { ...state, activePanel: normalizePanel(command.panel) };
		case 'setDepth':
			return { ...state, depth: normalizeDepth(command.depth) };
		case 'setActiveMetric':
			return { ...state, activeMetric: normalizeActiveMetric(command.metric) };
		case 'setMapSelection':
			return { ...state, mapSelection: normalizeMapSelection(command.selection) };
		case 'setCohortTrendResult':
			return { ...state, cohortTrendResult: normalizeCohortTrendResult(command.result) };
		case 'setAnalysisResult':
			return { ...state, analysisResult: normalizeAnalysisResult(command.result) };
		case 'upsertBoardBlock': {
			const block = normalizeResearchBoardBlock(command.block);
			const index = state.board.blocks.findIndex((item) => item.id === block.id);
			const blocks = index < 0
				? [...state.board.blocks, block]
				: state.board.blocks.map((item, itemIndex) => (itemIndex === index ? block : item));
			return {
				...state,
				board: normalizeResearchBoard({ ...state.board, blocks })
			};
		}
		case 'reorderBoardBlocks': {
			const order = normalizeResearchBoardOrder(command.orderedBlockIds, state.board);
			const byId = new Map(state.board.blocks.map((block) => [block.id, block]));
			return {
				...state,
				board: normalizeResearchBoard({
					...state.board,
					blocks: order.map((id) => byId.get(id))
				})
			};
		}
		case 'removeBoardBlock': {
			const id = normalizeResearchBoardBlockId(command.id);
			const blocks = state.board.blocks
				.filter((block) => block.id !== id)
				.map((block) => block.kind === 'takeaway'
					? { ...block, referenceBlockIds: block.referenceBlockIds.filter((referenceId) => referenceId !== id) }
					: block);
			return {
				...state,
				board: normalizeResearchBoard({
					focusedBlockId: state.board.focusedBlockId === id ? null : state.board.focusedBlockId,
					blocks
				})
			};
		}
		case 'focusBoardBlock':
			return {
				...state,
				board: {
					...state.board,
					focusedBlockId: normalizeResearchBoardFocus(command.id, state.board)
				}
			};
		case 'setFindings':
			return { ...state, findings: normalizeFindings(command.findings) };
		case 'upsertFinding': {
			const finding = normalizeFinding(command.finding);
			const index = state.findings.findIndex((item) => item.id === finding.id);
			const findings = index < 0
				? [...state.findings, finding]
				: state.findings.map((item, itemIndex) => (itemIndex === index ? finding : item));
			return { ...state, findings: normalizeFindings(findings) };
		}
		case 'removeFinding': {
			const id = normalizeFinding({
				id: command.id,
				title: '',
				note: '',
				certs: [],
				metrics: [],
				period: null,
				source: null
			}).id;
			return { ...state, findings: state.findings.filter((finding) => finding.id !== id) };
		}
		case 'setWatchlistDesired': {
			const entry = normalizeWatchlistEntries([{ cert: command.cert, watched: command.watched }])[0];
			const entries = state.watchlistDesired.filter((item) => item.cert !== entry.cert);
			return { ...state, watchlistDesired: normalizeWatchlistEntries([...entries, entry]) };
		}
		case 'setWatchlistDesiredState':
			return { ...state, watchlistDesired: normalizeWatchlistEntries(command.entries) };
	}
}

/**
 * Applies one absolute command. The input is never mutated, and revisions advance
 * exactly once for a material change.
 */
export function applyWorkspaceCommand(
	input: WorkspaceState,
	command: WorkspaceCommand,
	options: WorkspaceCommandOptions = {}
): WorkspaceCommandResult {
	const state = normalizeWorkspaceState(input);
	if (options.ifRevision !== undefined) {
		if (!Number.isSafeInteger(options.ifRevision) || options.ifRevision < 0) {
			throw new WorkspaceValidationError({ path: 'ifRevision', message: 'must be a non-negative safe integer' });
		}
		if (options.ifRevision !== state.revision) {
			throw new WorkspaceRevisionConflictError(options.ifRevision, state.revision);
		}
	}

	const candidate = normalizeWorkspaceState(nextCandidate(state, command));
	if (same(candidate, state)) return { state, changed: false, revision: state.revision };
	if (state.revision === Number.MAX_SAFE_INTEGER) {
		throw new WorkspaceValidationError({ path: 'workspace.revision', message: 'cannot be incremented safely' });
	}
	const next = normalizeWorkspaceState({ ...candidate, revision: state.revision + 1 });
	return { state: next, changed: true, revision: next.revision };
}

/**
 * Apply one user-level operation containing multiple absolute commands. The complete
 * operation is validated before any caller-visible state changes, and a material batch
 * advances the workspace revision exactly once.
 */
export function applyWorkspaceCommands(
	input: WorkspaceState,
	commands: readonly WorkspaceCommand[],
	options: WorkspaceCommandOptions = {}
): WorkspaceCommandResult {
	const state = normalizeWorkspaceState(input);
	if (options.ifRevision !== undefined) {
		if (!Number.isSafeInteger(options.ifRevision) || options.ifRevision < 0) {
			throw new WorkspaceValidationError({ path: 'ifRevision', message: 'must be a non-negative safe integer' });
		}
		if (options.ifRevision !== state.revision) {
			throw new WorkspaceRevisionConflictError(options.ifRevision, state.revision);
		}
	}

	let candidate = state;
	for (const command of commands) {
		candidate = normalizeWorkspaceState(nextCandidate(candidate, command));
	}
	if (same(candidate, state)) return { state, changed: false, revision: state.revision };
	if (state.revision === Number.MAX_SAFE_INTEGER) {
		throw new WorkspaceValidationError({ path: 'workspace.revision', message: 'cannot be incremented safely' });
	}
	const next = normalizeWorkspaceState({ ...candidate, revision: state.revision + 1 });
	return { state: next, changed: true, revision: next.revision };
}

export const workspaceCommands = {
	setQuestion: (question: string): WorkspaceCommand => ({ type: 'setQuestion', question }),
	setFilters: (filters: BankScreenFilters): WorkspaceCommand => ({ type: 'setFilters', filters }),
	setScreenView: (screenView: WorkspaceScreenView): WorkspaceCommand => ({ type: 'setScreenView', screenView }),
	setResults: (results: ResultsMetadata): WorkspaceCommand => ({ type: 'setResults', results }),
	setActiveBank: (cert: number | null): WorkspaceCommand => ({ type: 'setActiveBank', cert }),
	setSelectedCerts: (certs: number[]): WorkspaceCommand => ({ type: 'setSelectedCerts', certs }),
	setExcludedCerts: (certs: number[]): WorkspaceCommand => ({ type: 'setExcludedCerts', certs }),
	setPeerRecipe: (recipe: PeerRecipe): WorkspaceCommand => ({ type: 'setPeerRecipe', recipe }),
	setAsOfQuarter: (quarter: string | null): WorkspaceCommand => ({ type: 'setAsOfQuarter', quarter }),
	setComparison: (
		comparison: Omit<WorkspaceComparisonSelection, 'resolvedQuarter'>
	): WorkspaceCommand => ({ type: 'setComparison', comparison }),
	setChartHistory: (history: WorkspaceChartHistory): WorkspaceCommand => ({ type: 'setChartHistory', history }),
	setPeriod: (period: SelectedPeriod): WorkspaceCommand => ({ type: 'setPeriod', period }),
	setCharts: (charts: ChartSpec[]): WorkspaceCommand => ({ type: 'setCharts', charts }),
	upsertChart: (chart: ChartSpec): WorkspaceCommand => ({ type: 'upsertChart', chart }),
	removeChart: (id: string): WorkspaceCommand => ({ type: 'removeChart', id }),
	setActivePanel: (panel: WorkspacePanel): WorkspaceCommand => ({ type: 'setActivePanel', panel }),
	setDepth: (depth: WorkspaceDepth): WorkspaceCommand => ({ type: 'setDepth', depth }),
	setActiveMetric: (metric: string | null): WorkspaceCommand => ({ type: 'setActiveMetric', metric }),
	setMapSelection: (selection: MapSelection): WorkspaceCommand => ({ type: 'setMapSelection', selection }),
	setCohortTrendResult: (result: CohortTrendResultSet | null): WorkspaceCommand => ({
		type: 'setCohortTrendResult', result
	}),
	setAnalysisResult: (result: WorkspaceAnalysisResult | null): WorkspaceCommand => ({
		type: 'setAnalysisResult', result
	}),
	upsertBoardBlock: (block: ResearchBoardBlock): WorkspaceCommand => ({ type: 'upsertBoardBlock', block }),
	reorderBoardBlocks: (orderedBlockIds: string[]): WorkspaceCommand => ({
		type: 'reorderBoardBlocks', orderedBlockIds
	}),
	removeBoardBlock: (id: string): WorkspaceCommand => ({ type: 'removeBoardBlock', id }),
	focusBoardBlock: (id: string | null): WorkspaceCommand => ({ type: 'focusBoardBlock', id }),
	setFindings: (findings: PinnedFinding[]): WorkspaceCommand => ({ type: 'setFindings', findings }),
	upsertFinding: (finding: PinnedFinding): WorkspaceCommand => ({ type: 'upsertFinding', finding }),
	removeFinding: (id: string): WorkspaceCommand => ({ type: 'removeFinding', id }),
	setWatchlistDesired: (cert: number, watched: boolean): WorkspaceCommand => ({
		type: 'setWatchlistDesired', cert, watched
	}),
	setWatchlistDesiredState: (entries: WatchlistDesiredEntry[]): WorkspaceCommand => ({
		type: 'setWatchlistDesiredState', entries
	})
} as const;

/**
 * Build one atomic workspace operation for excluding a bank. A selected bank is
 * removed from the selection and every live focus surface before it enters the
 * exclusion set, so each intermediate command continues to satisfy the shared
 * selected/excluded invariant.
 */
export function workspaceBankExclusionCommands(
	input: WorkspaceState,
	cert: number
): WorkspaceCommand[] {
	const state = normalizeWorkspaceState(input);
	const normalizedCert = normalizeCertValue(cert);
	if (normalizedCert === null) {
		throw new WorkspaceValidationError({ path: 'cert', message: 'must identify a bank' });
	}
	const selectedCerts = state.selectedCerts.filter((item) => item !== normalizedCert);
	const commands: WorkspaceCommand[] = [workspaceCommands.setSelectedCerts(selectedCerts)];

	if (state.activeBank === normalizedCert) {
		commands.push(workspaceCommands.setActiveBank(selectedCerts[0] ?? null));
	}
	if (state.charts.some((chart) => chart.certs.includes(normalizedCert))) {
		commands.push(workspaceCommands.setCharts(state.charts.map((chart) => ({
			...chart,
			certs: chart.certs.filter((item) => item !== normalizedCert)
		}))));
	}
	if (state.mapSelection.certs.includes(normalizedCert)) {
		commands.push(workspaceCommands.setMapSelection({
			...state.mapSelection,
			certs: state.mapSelection.certs.filter((item) => item !== normalizedCert)
		}));
	}
	commands.push(workspaceCommands.setExcludedCerts([
		...new Set([...state.excludedCerts, normalizedCert])
	]));
	return commands;
}
