import {
	WORKSPACE_LIMITS,
	workspaceCommands,
	normalizeResearchBoardBlock,
	type AnalysisResultRef,
	type AnalysisResultPage,
	type AnalysisResultSection,
	type ResearchAnalysisBlock,
	type ResearchAnalysisView,
	type ResearchBoardBlock,
	type ResearchBoardSpan,
	type ResearchExactTableBinding,
	type ResearchHistoryBinding,
	type ResearchHistoryChartKind,
	type ResearchHistoryScale,
	type ResearchWorkspaceView,
	type WorkspaceCommand,
	type WorkspaceCommandOptions,
	type WorkspaceCommandResult,
	type WorkspaceState,
} from '$lib/workspace/index.js';
import { RESEARCH_METRIC_IDS, type ResearchMetric } from '$lib/research-metrics.js';
import {
	RESEARCH_BOARD_TEMPLATES,
	createResearchBoardTemplate,
	type ResearchBoardTemplateId,
} from '$lib/workspace/board-templates.js';
import { BOARD_TEMPLATES as ATLAS_BOARD_TEMPLATES } from '$lib/atlas/templates.js';
import {
	arrayValue,
	cert,
	enumValue,
	inputObject,
	integer,
	reportingPeriod,
	stringValue,
	WebMcpInputError,
	WebMcpToolError,
} from './runtime.js';
import { createResultEnvelope, MAX_WEBMCP_EXTENDED_ENVELOPE_CHARS } from './envelope.js';
import type {
	TightArraySchema,
	TightJsonSchema,
	TightNumberSchema,
	TightObjectSchema,
	TightStringSchema,
	WebMcpControllerContext,
	WebMcpToolDefinition,
} from './types.js';

const BOARD_BLOCK_ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,63}$/;
const RESULT_SECTIONS = [
	'metrics', 'groups', 'rows', 'members', 'components', 'series', 'analogues', 'analogue_details',
] as const satisfies readonly AnalysisResultSection[];
const ANALYSIS_VIEWS = [
	'summary', 'breadth', 'distribution', 'movers', 'waterfall', 'matched_banks',
	'small_multiples', 'timeline', 'stacked_composition', 'change_waterfall', 'both',
	'event_study', 'analogues', 'event_trajectories', 'analogue_table', 'exact_table',
] as const satisfies readonly ResearchAnalysisView[];
const ANALYSIS_VIEWS_BY_KIND = {
	cohort_change: ['summary', 'breadth', 'distribution', 'movers', 'waterfall', 'exact_table'],
	temporal_pattern: ['summary', 'matched_banks', 'small_multiples', 'timeline', 'exact_table'],
	financial_composition: ['summary', 'stacked_composition', 'change_waterfall', 'exact_table'],
	failure_pattern: [
		'summary', 'both', 'event_study', 'analogues', 'event_trajectories',
		'small_multiples', 'analogue_table', 'exact_table',
	],
} as const satisfies Record<AnalysisResultRef['kind'], readonly ResearchAnalysisView[]>;
const SPANS = ['quarter', 'half', 'three_quarter', 'full'] as const satisfies readonly ResearchBoardSpan[];
const WORKSPACE_VIEWS = [
	'comparison_matrix',
	'metric_history',
	'peer_distribution',
	'change_attribution',
	'metric_relationship',
	'headquarters_geography',
	'economic_context',
	'bank_context',
] as const satisfies readonly ResearchWorkspaceView[];
const BOARD_TEMPLATE_IDS = ATLAS_BOARD_TEMPLATES.map((template) => template.id);
const BOARD_TEMPLATE_MODES = ['append', 'replace'] as const;
const THEMES = ['light', 'dark'] as const;
const BOARD_WIDTHS = ['auto', 'quarter', 'half', 'three_quarter', 'full'] as const;
const BOARD_HEIGHTS = ['standard', 'tall'] as const;
const BOARD_ROLES = ['auto', 'lead', 'support', 'contrast', 'reference', 'multiples', 'context', 'investigation'] as const;
const BOARD_PRESENTATIONS = ['auto', 'primary', 'multiples'] as const;
const ECONOMY_SERIES = ['UST10Y2Y', 'BLS_UNRATE', 'FRB_FEDFUNDS', 'UST2Y', 'UST10Y', 'BLS_CPI_YOY', 'FRB_H8_BANK_CREDIT', 'FRB_H8_LOANS_LEASES', 'FRB_H8_DEPOSITS', 'FRB_H8_REAL_ESTATE', 'FRB_H8_CI_LOANS', 'FRB_H8_CRE', 'FRB_H8_CONSUMER'] as const;
const GEOGRAPHY_MODES = ['count', 'assets', 'median'] as const;
const ATTRIBUTION_MODES = ['assets', 'funding', 'quarterlyNetIncome', 'loanToDeposit'] as const;

const STRING = (maxLength: number, description?: string, pattern?: string): TightStringSchema => ({
	type: 'string', maxLength, ...(description ? { description } : {}), ...(pattern ? { pattern } : {}),
});
const ENUM = <T extends string>(values: readonly T[], description?: string): TightStringSchema => ({
	type: 'string', maxLength: Math.max(...values.map((value) => value.length)), enum: values,
	...(description ? { description } : {}),
});
const INTEGER = (minimum: number, maximum: number, description?: string): TightNumberSchema => ({
	type: 'integer', minimum, maximum, ...(description ? { description } : {}),
});
const ARRAY = (items: TightJsonSchema, maxItems: number, minItems = 0): TightArraySchema => ({
	type: 'array', items, maxItems, ...(minItems ? { minItems } : {}),
});
const OBJECT = (
	properties: Record<string, TightJsonSchema>,
	required: readonly string[] = [],
): TightObjectSchema => ({
	type: 'object', properties, additionalProperties: false,
	...(required.length ? { required } : {}),
});

const ID_SCHEMA = STRING(64, 'Stable caller-supplied board view ID.', BOARD_BLOCK_ID.source);
const TITLE_SCHEMA = STRING(160, 'Visible, natural-language view title.');
const REVISION_SCHEMA = INTEGER(0, Number.MAX_SAFE_INTEGER, 'Workspace revision from bankgraph.get_context.');
const PRESENTATION_REVISION_SCHEMA = INTEGER(0, Number.MAX_SAFE_INTEGER, 'Board presentation revision from bankgraph.read_research_board.');
const CERTS_SCHEMA = ARRAY(INTEGER(1, 99_999_999), WORKSPACE_LIMITS.selectedBanks, 1);
const METRICS_SCHEMA = ARRAY(ENUM(RESEARCH_METRIC_IDS), WORKSPACE_LIMITS.visibleMetrics, 1);
const SPAN_SCHEMA = ENUM(
	SPANS,
	'Width on the 12-column human board: quarter (3 columns), half (6), three_quarter (9), or full (12).',
);
const WORKSPACE_VIEW_SCHEMA = ENUM(
	WORKSPACE_VIEWS,
	'Live semantic workspace view. Its current values are rendered from shared workspace state, not persisted snapshot rows.',
);

export interface ResearchBoardCommandTarget {
	readonly state: WorkspaceState;
	execute(command: WorkspaceCommand, options?: WorkspaceCommandOptions): WorkspaceCommandResult;
	executeBatch(commands: readonly WorkspaceCommand[], options?: WorkspaceCommandOptions): WorkspaceCommandResult;
}

export interface ResearchBoardBlockReadResult {
	section: string;
	items: unknown[];
	total: number;
	offset: number;
	pageSize: number;
	nextCursor: string | null;
	metadata?: unknown;
}

export interface ResearchBoardPresentation {
	presentationRevision: number;
	theme: 'light' | 'dark';
	timeAxis: 'auto' | 'calendar' | 'event';
	pinnedTimebar: boolean;
	pendingViewCount: number;
	overrides: Record<string, unknown>;
	strips: Array<{
		id: string;
		title: string;
		views: Array<{ blockId: string; role: string; columns: number }>;
	}>;
}

export interface ResearchBoardTemplateSummary {
	id: string;
	name: string;
	description: string;
	needs: string[];
	timeForm: string;
	strips: Array<{ title: string; views: Array<{ kind: string; role: string; title?: string }> }>;
	thumb: number[][];
}

export interface ResearchBoardViewConfiguration {
	title?: string;
	width?: 'auto' | 'quarter' | 'half' | 'three_quarter' | 'full';
	height?: 'standard' | 'tall';
	role?: 'auto' | 'lead' | 'support' | 'contrast' | 'reference' | 'multiples' | 'context' | 'investigation';
	presentation?: 'auto' | 'primary' | 'multiples';
	followWorkspace?: boolean;
	certs?: number[];
	metrics?: ResearchMetric[];
	asOf?: string;
	compareWith?: string;
	historyFrom?: string;
	historyTo?: string;
	chartKind?: ResearchHistoryChartKind;
	scale?: ResearchHistoryScale;
	view?: ResearchAnalysisView;
	sortMetric?: ResearchMetric;
	sortBasis?: 'level' | 'change';
	sortDirection?: 'asc' | 'desc';
	series?: string[];
	xMetric?: ResearchMetric;
	yMetric?: ResearchMetric;
	geographyMode?: 'count' | 'assets' | 'median';
	attributionMode?: 'assets' | 'funding' | 'quarterlyNetIncome' | 'loanToDeposit';
}

export interface ResearchBoardWebMcpDependencies {
	workspace: ResearchBoardCommandTarget;
	prepareBoardHistory?(
		binding: ResearchHistoryBinding,
		context: WebMcpControllerContext,
	): Promise<void>;
	prepareBoardTable?(
		binding: ResearchExactTableBinding,
		context: WebMcpControllerContext,
	): Promise<void>;
	resolveAnalysisResultRef?(
		resultId: string,
		context: WebMcpControllerContext,
	): Promise<AnalysisResultRef | null>;
	readAnalysisResultPage?(
		ref: AnalysisResultRef,
		section: AnalysisResultSection,
		options: { cursor?: string; pageSize?: number },
		context: WebMcpControllerContext,
	): Promise<AnalysisResultPage>;
	readBoardBlockData?(
		block: ResearchBoardBlock,
		request: { section?: string; cursor?: string; pageSize: number },
		context: WebMcpControllerContext,
	): Promise<ResearchBoardBlockReadResult | null>;
	listBoardTemplates?(): ResearchBoardTemplateSummary[];
	getBoardPresentation?(): ResearchBoardPresentation;
	applyBoardTemplate?(
		request: {
			templateId: string;
			mode: 'append' | 'replace';
			focus: boolean;
			/** Internal handoff used when a measure-driven result becomes a board. */
			sortMetric?: ResearchMetric;
			sortBasis?: 'level' | 'change';
			sortDirection?: 'asc' | 'desc';
		},
		context: WebMcpControllerContext,
	): Promise<{ changed: boolean; blockIds: string[] }>;
	setAppearance?(theme: 'light' | 'dark'): { changed: boolean; theme: 'light' | 'dark' };
	clearResearchBoard?(): { changed: boolean; blockIds: string[] };
	resetBoardLayout?(): { changed: boolean };
	resetResearchBoard?(): { changed: boolean };
	configureBoardView?(
		blockId: string,
		configuration: ResearchBoardViewConfiguration,
	): { changed: boolean };
}

function mutation(
	definition: Omit<WebMcpToolDefinition, 'annotations'>,
): WebMcpToolDefinition {
	return { ...definition, annotations: { readOnlyHint: false, untrustedContentHint: true } };
}

function readOnly(
	definition: Omit<WebMcpToolDefinition, 'annotations'>,
): WebMcpToolDefinition {
	return { ...definition, annotations: { readOnlyHint: true, untrustedContentHint: true } };
}

function blockId(value: unknown, path = 'blockId'): string {
	const id = stringValue(value, path, { min: 1, max: 64 });
	if (!BOARD_BLOCK_ID.test(id)) throw new WebMcpInputError(`${path} contains unsupported characters`);
	return id;
}

function revision(value: unknown): number {
	return integer(value, 'ifRevision', 0, Number.MAX_SAFE_INTEGER);
}

function unique<T>(values: T[], path: string): T[] {
	if (new Set(values).size !== values.length) throw new WebMcpInputError(`${path} must not contain duplicates`);
	return values;
}

function certs(value: unknown): number[] {
	return unique(arrayValue(value, 'certs', {
		min: 1,
		max: WORKSPACE_LIMITS.selectedBanks,
		map: (item, index) => cert(item, `certs[${index}]`),
	}), 'certs');
}

function metrics(value: unknown): ResearchMetric[] {
	return unique(arrayValue(value, 'metrics', {
		min: 1,
		max: WORKSPACE_LIMITS.visibleMetrics,
		map: (item, index) => enumValue(item, `metrics[${index}]`, RESEARCH_METRIC_IDS),
	}), 'metrics');
}

function same(left: unknown, right: unknown): boolean {
	return JSON.stringify(left) === JSON.stringify(right);
}

function stale(expected: number, current: number): WebMcpToolError {
	return new WebMcpToolError(
		'stale_revision',
		`Workspace revision ${expected} is stale; the current revision is ${current}. Read bankgraph.get_context and retry.`,
		{ expectedRevision: expected, currentRevision: current, nextAction: 'bankgraph.get_context' },
		true,
	);
}

function stalePresentation(expected: number, current: number): WebMcpToolError {
	return new WebMcpToolError(
		'stale_presentation_revision',
		`Board presentation revision ${expected} is stale; the current revision is ${current}. Read bankgraph.read_research_board and retry.`,
		{ expectedPresentationRevision: expected, currentPresentationRevision: current, nextAction: 'bankgraph.read_research_board' },
		true,
	);
}

function exactBlock(state: WorkspaceState, desired: ResearchBoardBlock): boolean {
	const current = state.board.blocks.find((block) => block.id === desired.id);
	return Boolean(current && same(current, desired));
}

function receipt(
	state: WorkspaceState,
	changed: boolean,
	options: { blockIds?: string[]; idempotentReplay?: boolean } = {},
) {
	return {
		changed,
		revision: state.revision,
		blockIds: options.blockIds ?? [],
		focusedBlockId: state.board.focusedBlockId,
		orderedBlockIds: state.board.blocks.map((block) => block.id),
		renderStatus: 'visible',
		idempotentReplay: options.idempotentReplay ?? false,
	};
}

function commitDesiredBlock(
	deps: ResearchBoardWebMcpDependencies,
	desired: ResearchBoardBlock,
	ifRevision: number,
	focus: boolean,
	context: WebMcpControllerContext,
) {
	if (context.signal.aborted) throw context.signal.reason;
	const state = deps.workspace.state;
	const alreadyExact = exactBlock(state, desired) && (!focus || state.board.focusedBlockId === desired.id);
	if (state.revision !== ifRevision) {
		if (alreadyExact) return receipt(state, false, { blockIds: [desired.id], idempotentReplay: true });
		throw stale(ifRevision, state.revision);
	}
	const commands: WorkspaceCommand[] = [workspaceCommands.upsertBoardBlock(desired)];
	if (focus) commands.push(workspaceCommands.focusBoardBlock(desired.id));
	const result = deps.workspace.executeBatch(commands, { ifRevision });
	return receipt(result.state, result.changed, { blockIds: [desired.id] });
}

function analysisRefFromBoard(state: WorkspaceState, resultId: string): AnalysisResultRef | null {
	for (const block of state.board.blocks) {
		if (block.kind === 'analysis' && block.binding.resultRef.resultId === resultId) {
			return block.binding.resultRef;
		}
	}
	return null;
}

function analysisSections(block: ResearchAnalysisBlock): { available: AnalysisResultSection[]; defaultSection: AnalysisResultSection } {
	if (block.binding.resultRef.kind === 'failure_pattern') {
		const available: AnalysisResultSection[] = ['series', 'analogues', 'analogue_details', 'members'];
		const defaultSection: AnalysisResultSection = block.binding.view === 'analogue_table' || block.binding.view === 'analogues' || block.binding.view === 'matched_banks'
			? 'analogues'
			: block.binding.view === 'event_trajectories'
				? 'analogue_details'
				: 'series';
		return { available, defaultSection };
	}
	if (block.binding.resultRef.kind === 'financial_composition') return { available: ['components', 'members'], defaultSection: 'components' };
	if (block.binding.resultRef.kind === 'cohort_change') return { available: ['metrics', 'groups'], defaultSection: block.binding.view === 'movers' ? 'groups' : 'metrics' };
	return { available: ['rows'], defaultSection: 'rows' };
}

function configurationAffordance(block: ResearchBoardBlock) {
	const commonFields = ['title', 'width', 'height', 'role'] as const;
	const anchorFields = ['followWorkspace', 'certs', 'metrics', 'asOf', 'compareWith'] as const;
	if (block.kind === 'history') {
		return {
			blockId: block.id,
			kind: block.kind,
			fields: [...commonFields, ...anchorFields, 'presentation', 'historyFrom', 'historyTo', 'chartKind', 'scale'],
		};
	}
	if (block.kind === 'exact_table') {
		return {
			blockId: block.id,
			kind: block.kind,
			fields: [...commonFields, ...anchorFields, 'sortMetric', 'sortBasis', 'sortDirection'],
		};
	}
	if (block.kind === 'analysis') {
		return {
			blockId: block.id,
			kind: block.kind,
			fields: [...commonFields, ...anchorFields, 'view'],
			viewValues: ANALYSIS_VIEWS_BY_KIND[block.binding.resultRef.kind],
		};
	}
	if (block.kind === 'workspace_view') {
		const viewFields = block.binding.view === 'economic_context'
			? ['series'] as const
			: block.binding.view === 'metric_relationship'
				? ['xMetric', 'yMetric'] as const
				: block.binding.view === 'headquarters_geography'
					? ['geographyMode'] as const
					: block.binding.view === 'change_attribution'
						? ['attributionMode'] as const
						: [] as const;
		return {
			blockId: block.id,
			kind: block.kind,
			view: block.binding.view,
			fields: [...commonFields, ...anchorFields, ...viewFields],
		};
	}
	return { blockId: block.id, kind: block.kind, fields: [...commonFields, ...anchorFields] };
}

function currentTemplateMetrics(state: WorkspaceState): ResearchMetric[] {
	const configured = state.charts.find((chart) => chart.id === 'linked-analysis')?.metrics ?? [];
	const metrics = [...new Set(configured.filter((metric): metric is ResearchMetric =>
		RESEARCH_METRIC_IDS.includes(metric as ResearchMetric)
	))];
	if (metrics.length) return metrics.slice(0, WORKSPACE_LIMITS.visibleMetrics);
	if (state.activeMetric && RESEARCH_METRIC_IDS.includes(state.activeMetric as ResearchMetric)) {
		return [state.activeMetric as ResearchMetric];
	}
	return ['asset'];
}

function currentTemplatePeriods(state: WorkspaceState): { from: string; to: string } {
	const to = state.chartHistory.to ?? state.asOfQuarter;
	const from = state.chartHistory.from ?? state.comparison.resolvedQuarter ?? to;
	if (!from || !to) {
		throw new WebMcpToolError(
			'board_template_context_unavailable',
			'Choose an available reporting period before applying a board template.',
			{ nextAction: 'bankgraph.configure_comparison' },
		);
	}
	return { from, to };
}

export function createResearchBoardWebMcpToolCatalog(
	deps: ResearchBoardWebMcpDependencies,
): Record<string, WebMcpToolDefinition> {
	const readNumericalBlockData = async (
		block: ResearchBoardBlock,
		request: { section?: string; cursor?: string; pageSize: number },
		context: WebMcpControllerContext,
	): Promise<ResearchBoardBlockReadResult | AnalysisResultPage | null> => {
		const analysisRead = block.kind === 'analysis' ? analysisSections(block) : null;
		const section = request.section ?? analysisRead?.defaultSection;
		if (block.kind === 'analysis' && deps.readAnalysisResultPage && section && RESULT_SECTIONS.includes(section as AnalysisResultSection)) {
			return deps.readAnalysisResultPage(
				block.binding.resultRef,
				section as AnalysisResultSection,
				{ ...(request.cursor ? { cursor: request.cursor } : {}), pageSize: request.pageSize },
				context,
			);
		}
		if (!deps.readBoardBlockData) return null;
		return deps.readBoardBlockData(block, {
			...(section ? { section } : {}),
			...(request.cursor ? { cursor: request.cursor } : {}),
			pageSize: request.pageSize,
		}, context);
	};

	const readBoard = readOnly({
		name: 'bankgraph.read_research_board',
		title: 'Read the research board',
		description: 'Read the exact visible answer order, focus, titles, spans, semantic bindings, and valid configuration fields on the current Bankgraph research board. The default is a fast structure-only read; then use bankgraph.read_board_block for exact data from each needed view. includeData focused or all is an optional bounded overview whose requested page size may be reduced to fit, without limiting continuation through read_board_block. No screenshot or DOM reading is needed.',
		maxResultChars: MAX_WEBMCP_EXTENDED_ENVELOPE_CHARS,
		inputSchema: OBJECT({
			includeData: ENUM(
				['none', 'focused', 'all'] as const,
				'Optional bounded exact-data overview. none (default) reads structure and per-view read affordances; focused reads one view; all samples every visible view. For complete data, follow with read_board_block.',
			),
			pageSize: INTEGER(1, 10, 'Requested values per visible view for the bounded overview; defaults to 2 and may be reduced to fit. Use bankgraph.read_board_block for up to 100 rows and continuation cursors.'),
		}),
		controller: async (input, context) => {
			const source = inputObject(input, ['includeData', 'pageSize']);
			const includeData = source.includeData === undefined
				? 'none'
				: enumValue(source.includeData, 'includeData', ['none', 'focused', 'all'] as const);
			const pageSize = source.pageSize === undefined ? 2 : integer(source.pageSize, 'pageSize', 1, 10);
			const state = deps.workspace.state;
			const presentation = deps.getBoardPresentation?.() ?? null;
			const targetBlocks = includeData === 'all'
				? state.board.blocks
				: includeData === 'focused'
					? [state.board.blocks.find((block) => block.id === state.board.focusedBlockId) ?? state.board.blocks[0]].filter((block): block is ResearchBoardBlock => Boolean(block))
					: [];
			const baseData = {
				workspaceRevision: state.revision,
				focusedBlockId: state.board.focusedBlockId,
				blocks: state.board.blocks,
				configurationAffordances: state.board.blocks.map(configurationAffordance),
				presentation,
				counts: { blocks: state.board.blocks.length, maximum: WORKSPACE_LIMITS.boardBlocks },
			};
			const baseSummary = `${state.board.blocks.length} ${state.board.blocks.length === 1 ? 'view' : 'views'} on the research board; workspace revision ${state.revision}.`;
			if (!targetBlocks.length) return { summary: baseSummary, data: baseData };

			let fittedPageSize = pageSize;
			while (true) {
				const viewData = await Promise.all(targetBlocks.map(async (block) => {
					const analysisRead = block.kind === 'analysis' ? analysisSections(block) : null;
					const section = analysisRead?.defaultSection;
					const effectivePageSize = section === 'analogue_details' ? Math.min(fittedPageSize, 10) : fittedPageSize;
					try {
						const numerical = await readNumericalBlockData(block, { ...(section ? { section } : {}), pageSize: effectivePageSize }, context);
						return {
							blockId: block.id,
							title: block.title,
							kind: block.kind,
							section: numerical?.section ?? section ?? null,
							numerical,
						};
					} catch (error) {
						return {
							blockId: block.id,
							title: block.title,
							kind: block.kind,
							section: section ?? null,
							error: error instanceof Error ? error.message : 'This view could not be read.',
						};
					}
				}));
				const summary = `${baseSummary} Exact data included for ${viewData.length} ${viewData.length === 1 ? 'view' : 'views'}.`;
				const data = {
					...baseData,
					viewData,
					dataOverview: {
						requestedPageSize: pageSize,
						pageSize: fittedPageSize,
						reducedToFit: fittedPageSize < pageSize,
					},
				};
				if (createResultEnvelope({ summary, data }, MAX_WEBMCP_EXTENDED_ENVELOPE_CHARS).ok) {
					return { summary, data };
				}
				if (fittedPageSize === 1) break;
				fittedPageSize = Math.max(1, Math.floor(fittedPageSize / 2));
			}

			return {
				summary: `${baseSummary} Exact values were omitted from this overview; read the listed views individually.`,
				data: {
					...baseData,
					dataOverview: { requestedPageSize: pageSize, omittedToFit: true },
					dataReadPlan: targetBlocks.map((block) => ({
						tool: 'bankgraph.read_board_block',
						input: { blockId: block.id },
					})),
				},
			};
		},
	});

	const readBlock = readOnly({
		name: 'bankgraph.read_board_block',
		title: 'Read one board view',
		description: 'Read one visible board view and a page of the exact source data behind it: rows, series, groups, components, members, or analogues. This is the semantic data used to draw the live view, not a screenshot. Failure analogue details default to 5 complete bank trajectories per page and support up to 10; other sections default to 25 and support up to 100.',
		maxResultChars: MAX_WEBMCP_EXTENDED_ENVELOPE_CHARS,
		inputSchema: OBJECT({
			blockId: ID_SCHEMA,
			section: STRING(32),
			pageSize: INTEGER(1, 100),
			cursor: STRING(160),
		}, ['blockId']),
		controller: async (input, context) => {
			const source = inputObject(input, ['blockId', 'section', 'pageSize', 'cursor']);
			const id = blockId(source.blockId);
			const block = deps.workspace.state.board.blocks.find((item) => item.id === id);
			if (!block) throw new WebMcpToolError('board_block_not_found', `Board view ${id} is not visible.`, { blockId: id });
			const analysisRead = block.kind === 'analysis' ? analysisSections(block) : null;
			const section = source.section === undefined
				? analysisRead?.defaultSection
				: stringValue(source.section, 'section', { min: 1, max: 32 });
			const requestedPageSize = source.pageSize === undefined
				? (section === 'analogue_details' ? 5 : 25)
				: integer(source.pageSize, 'pageSize', 1, 100);
			if (section === 'analogue_details' && requestedPageSize > 10) {
				throw new WebMcpInputError('pageSize must not exceed 10 for analogue_details; use the returned cursor for additional complete bank trajectories');
			}
			const pageSize = requestedPageSize;
			const numerical = await readNumericalBlockData(block, {
				...(section ? { section } : {}),
				...(source.cursor === undefined ? {} : { cursor: stringValue(source.cursor, 'cursor', { max: 160 }) }),
				pageSize,
			}, context);
			return {
				summary: `${block.title} is view ${deps.workspace.state.board.blocks.findIndex((item) => item.id === id) + 1} of ${deps.workspace.state.board.blocks.length}.`,
				data: {
					workspaceRevision: deps.workspace.state.revision,
					block,
					availableSections: analysisRead?.available ?? (numerical ? [numerical.section] : []),
					defaultSection: analysisRead?.defaultSection ?? numerical?.section ?? null,
					numerical
				},
			};
		},
	});

	const listTemplates = readOnly({
		name: 'bankgraph.list_board_templates',
		title: 'List research board templates',
		description: 'List the same curated research-board starting points available to a person in Bankgraph. Templates contain semantic live views and source-bound history, never copied result rows.',
		maxResultChars: MAX_WEBMCP_EXTENDED_ENVELOPE_CHARS,
		inputSchema: OBJECT({}),
		controller: (input) => {
			inputObject(input, []);
			const state = deps.workspace.state;
			const templates = deps.listBoardTemplates?.() ?? ATLAS_BOARD_TEMPLATES;
			return {
				summary: `${templates.length} curated board templates are available.`,
				data: {
					workspaceRevision: state.revision,
					templates,
					context: {
						selectedBanks: state.selectedCerts.length,
						selectedMetrics: currentTemplateMetrics(state),
						from: state.chartHistory.from,
						to: state.chartHistory.to ?? state.asOfQuarter,
					},
				},
			};
		},
	});

	const applyTemplate = mutation({
		name: 'bankgraph.apply_board_template',
		title: 'Apply a research board template',
		description: 'Build one curated live board from the current selected banks, measures, and history window. Append it to the current board or replace the board; the same template is available in the human interface.',
		maxResultChars: MAX_WEBMCP_EXTENDED_ENVELOPE_CHARS,
		inputSchema: OBJECT({
			templateId: ENUM(BOARD_TEMPLATE_IDS),
			mode: ENUM(BOARD_TEMPLATE_MODES),
			idPrefix: STRING(32, 'Optional stable prefix used only by legacy board hosts.', BOARD_BLOCK_ID.source),
			focus: { type: 'boolean' },
			ifRevision: REVISION_SCHEMA,
			ifPresentationRevision: PRESENTATION_REVISION_SCHEMA,
		}, ['templateId', 'mode', 'focus', 'ifRevision', 'ifPresentationRevision']),
		controller: async (input, context) => {
			const source = inputObject(input, ['templateId', 'mode', 'idPrefix', 'focus', 'ifRevision', 'ifPresentationRevision']);
			const expected = revision(source.ifRevision);
			const templateId = enumValue(source.templateId, 'templateId', BOARD_TEMPLATE_IDS);
			const mode = enumValue(source.mode, 'mode', BOARD_TEMPLATE_MODES);
			const idPrefix = source.idPrefix === undefined ? 'template' : stringValue(source.idPrefix, 'idPrefix', { min: 1, max: 32 });
			if (!BOARD_BLOCK_ID.test(idPrefix)) throw new WebMcpInputError('idPrefix contains unsupported characters');
			const state = deps.workspace.state;
			if (deps.applyBoardTemplate) {
				if (state.revision !== expected) throw stale(expected, state.revision);
				const currentPresentation = deps.getBoardPresentation?.().presentationRevision ?? 0;
				const expectedPresentation = integer(source.ifPresentationRevision, 'ifPresentationRevision', 0, Number.MAX_SAFE_INTEGER);
				if (currentPresentation !== expectedPresentation) throw stalePresentation(expectedPresentation, currentPresentation);
				const result = await deps.applyBoardTemplate({ templateId, mode, focus: source.focus === true }, context);
				const next = deps.workspace.state;
				const name = deps.listBoardTemplates?.().find((template) => template.id === templateId)?.name ?? templateId;
				return {
					summary: `${name} is visible as ${result.blockIds.length} linked board views.`,
					data: { ...receipt(next, result.changed, { blockIds: result.blockIds }), templateId, mode, presentation: deps.getBoardPresentation?.() ?? null },
				};
			}
			if (state.selectedCerts.length === 0) {
				throw new WebMcpToolError(
					'board_template_context_unavailable',
					'Choose at least one bank before applying a board template.',
					{ nextAction: 'bankgraph.search_banks' },
				);
			}
			const periods = currentTemplatePeriods(state);
			const blocks = createResearchBoardTemplate({
				templateId: templateId as ResearchBoardTemplateId,
				selectedCerts: state.selectedCerts,
				selectedMetrics: currentTemplateMetrics(state),
				...periods,
				idPrefix,
			});
			const templateIds = blocks.map((block) => block.id);
			const retainedIds = mode === 'replace'
				? []
				: state.board.blocks.map((block) => block.id).filter((id) => !templateIds.includes(id));
			const orderedBlockIds = [...retainedIds, ...templateIds];
			if (orderedBlockIds.length > WORKSPACE_LIMITS.boardBlocks) {
				throw new WebMcpToolError(
					'board_limit_exceeded',
					`This board would contain ${orderedBlockIds.length} views; the maximum is ${WORKSPACE_LIMITS.boardBlocks}.`,
					{ current: state.board.blocks.length, requested: blocks.length, maximum: WORKSPACE_LIMITS.boardBlocks },
				);
			}
			const focus = source.focus === true
				? (blocks[0]?.id ?? null)
				: (state.board.focusedBlockId && orderedBlockIds.includes(state.board.focusedBlockId)
					? state.board.focusedBlockId
					: null);
			const alreadyExact = same(orderedBlockIds, state.board.blocks.map((block) => block.id))
				&& blocks.every((block) => exactBlock(state, block))
				&& state.board.focusedBlockId === focus;
			if (state.revision !== expected) {
				if (alreadyExact) {
					return {
						summary: `${RESEARCH_BOARD_TEMPLATES.find((template) => template.id === templateId)?.name} is already visible.`,
						data: { ...receipt(state, false, { blockIds: templateIds, idempotentReplay: true }), templateId, mode },
					};
				}
				throw stale(expected, state.revision);
			}
			for (const block of blocks) {
				if (block.kind === 'history' && deps.prepareBoardHistory) {
					await deps.prepareBoardHistory(block.binding, context);
				}
			}
			if (deps.workspace.state.revision !== expected) throw stale(expected, deps.workspace.state.revision);
			if (context.signal.aborted) throw context.signal.reason;
			const desiredIds = new Set(templateIds);
			const commands: WorkspaceCommand[] = [];
			if (mode === 'replace') {
				for (const block of state.board.blocks) {
					if (!desiredIds.has(block.id)) commands.push(workspaceCommands.removeBoardBlock(block.id));
				}
			}
			commands.push(...blocks.map((block) => workspaceCommands.upsertBoardBlock(block)));
			commands.push(workspaceCommands.reorderBoardBlocks(orderedBlockIds));
			commands.push(workspaceCommands.focusBoardBlock(focus));
			const result = deps.workspace.executeBatch(commands, { ifRevision: expected });
			const template = RESEARCH_BOARD_TEMPLATES.find((item) => item.id === templateId)!;
			return {
				summary: `${template.name} is visible as ${blocks.length} linked board views.`,
				data: { ...receipt(result.state, result.changed, { blockIds: templateIds }), templateId, mode },
			};
		},
	});

	const addWorkspaceView = mutation({
		name: 'bankgraph.add_workspace_view',
		title: 'Add a live workspace view',
		description: 'Add or replace one live semantic workspace view on the research board. The binding follows the current comparison, banks, metrics, cohort, geography, or economic context as the shared workspace changes; it never stores snapshot rows. Choose quarter, half, three-quarter, or full width on the 12-column board.',
		inputSchema: OBJECT({
			blockId: ID_SCHEMA,
			title: TITLE_SCHEMA,
			view: WORKSPACE_VIEW_SCHEMA,
			span: SPAN_SCHEMA,
			focus: { type: 'boolean' },
			ifRevision: REVISION_SCHEMA,
		}, ['blockId', 'title', 'view', 'span', 'focus', 'ifRevision']),
		controller: (input, context) => {
			const source = inputObject(input, ['blockId', 'title', 'view', 'span', 'focus', 'ifRevision']);
			const desired = normalizeResearchBoardBlock({
				id: blockId(source.blockId),
				kind: 'workspace_view',
				title: stringValue(source.title, 'title', { min: 1, max: 160 }),
				span: enumValue(source.span, 'span', SPANS),
				binding: { view: enumValue(source.view, 'view', WORKSPACE_VIEWS) },
			});
			const data = commitDesiredBlock(deps, desired, revision(source.ifRevision), source.focus === true, context);
			return { summary: `${desired.title} is visible on the research board and follows current workspace state.`, data };
		},
	});

	const plotHistory = mutation({
		name: 'bankgraph.plot_metric_history',
		title: 'Plot bank metric history',
		description: 'Publish a source-bound bank history chart on the visible research board. The view stores bank certificates, canonical measures, dates, and presentation choices; Bankgraph loads the reported values. Choose quarter, half, three-quarter, or full width on the 12-column board according to the comparison density.',
		inputSchema: OBJECT({
			blockId: ID_SCHEMA, title: TITLE_SCHEMA, certs: CERTS_SCHEMA, metrics: METRICS_SCHEMA,
			from: STRING(8), to: STRING(8), chartKind: ENUM(['line', 'area']), scale: ENUM(['value', 'index']),
			span: SPAN_SCHEMA, focus: { type: 'boolean' }, ifRevision: REVISION_SCHEMA,
		}, ['blockId', 'title', 'certs', 'metrics', 'from', 'to', 'chartKind', 'scale', 'span', 'focus', 'ifRevision']),
		controller: async (input, context) => {
			const source = inputObject(input, ['blockId', 'title', 'certs', 'metrics', 'from', 'to', 'chartKind', 'scale', 'span', 'focus', 'ifRevision']);
			const binding: ResearchHistoryBinding = {
				certs: certs(source.certs), metrics: metrics(source.metrics),
				from: reportingPeriod(source.from, 'from'), to: reportingPeriod(source.to, 'to'),
				chartKind: enumValue(source.chartKind, 'chartKind', ['line', 'area'] as const),
				scale: enumValue(source.scale, 'scale', ['value', 'index'] as const),
			};
			if (binding.from > binding.to) throw new WebMcpInputError('from must not be after to');
			const desired = normalizeResearchBoardBlock({
				id: blockId(source.blockId), kind: 'history', title: stringValue(source.title, 'title', { min: 1, max: 160 }),
				span: enumValue(source.span, 'span', SPANS), binding,
			});
			const expected = revision(source.ifRevision);
			if (deps.workspace.state.revision !== expected && !exactBlock(deps.workspace.state, desired)) throw stale(expected, deps.workspace.state.revision);
			if (deps.prepareBoardHistory) await deps.prepareBoardHistory(binding, context);
			const data = commitDesiredBlock(deps, desired, expected, source.focus === true, context);
			return { summary: `${desired.title} is visible on the research board.`, data };
		},
	});

	const publishResult = mutation({
		name: 'bankgraph.publish_result_view',
		title: 'Publish another analysis view',
		description: 'Publish another visible view of an existing deterministic analysis result without recomputing it. Use the resultId from an analysis receipt or a current board view, and choose quarter, half, three-quarter, or full width on the 12-column board according to the presentation density.',
		inputSchema: OBJECT({
			resultId: STRING(96), blockId: ID_SCHEMA, title: TITLE_SCHEMA, view: ENUM(ANALYSIS_VIEWS),
			span: SPAN_SCHEMA, focus: { type: 'boolean' }, ifRevision: REVISION_SCHEMA,
		}, ['resultId', 'blockId', 'title', 'view', 'span', 'focus', 'ifRevision']),
		controller: async (input, context) => {
			const source = inputObject(input, ['resultId', 'blockId', 'title', 'view', 'span', 'focus', 'ifRevision']);
			const resultId = stringValue(source.resultId, 'resultId', { min: 1, max: 96 });
			const expected = revision(source.ifRevision);
			let ref = analysisRefFromBoard(deps.workspace.state, resultId);
			if (!ref && deps.resolveAnalysisResultRef) ref = await deps.resolveAnalysisResultRef(resultId, context);
			if (!ref) throw new WebMcpToolError('analysis_result_not_found', `Analysis result ${resultId} is not available in this workspace.`, { resultId });
			const desired: ResearchAnalysisBlock = normalizeResearchBoardBlock({
				id: blockId(source.blockId), kind: 'analysis', title: stringValue(source.title, 'title', { min: 1, max: 160 }),
				span: enumValue(source.span, 'span', SPANS),
				binding: { resultRef: ref, view: enumValue(source.view, 'view', ANALYSIS_VIEWS) },
			}) as ResearchAnalysisBlock;
			const data = commitDesiredBlock(deps, desired, expected, source.focus === true, context);
			return { summary: `${desired.title} is visible on the research board.`, data };
		},
	});

	const publishExactTable = mutation({
		name: 'bankgraph.publish_exact_table',
		title: 'Publish an exact bank table',
		description: 'Publish a horizontally scrollable exact bank-by-measure table into the visible research board. Choose fixed reporting endpoints or follow the workspace comparison; Bankgraph loads reported values from the published data. Quarter and half widths pack beside related views; three-quarter and full widths suit denser tables.',
		inputSchema: OBJECT({
			blockId: ID_SCHEMA, title: TITLE_SCHEMA, certs: CERTS_SCHEMA, metrics: METRICS_SCHEMA,
			followCurrent: { type: 'boolean' }, from: STRING(8), to: STRING(8),
			span: SPAN_SCHEMA, focus: { type: 'boolean' }, ifRevision: REVISION_SCHEMA,
		}, ['blockId', 'title', 'certs', 'metrics', 'followCurrent', 'span', 'focus', 'ifRevision']),
		controller: async (input, context) => {
			const source = inputObject(input, ['blockId', 'title', 'certs', 'metrics', 'followCurrent', 'from', 'to', 'span', 'focus', 'ifRevision']);
			if (typeof source.followCurrent !== 'boolean') throw new WebMcpInputError('followCurrent must be a boolean');
			const fixed = source.followCurrent === false;
			if (fixed !== (source.from !== undefined && source.to !== undefined)) {
				throw new WebMcpInputError('from and to are required only when followCurrent is false');
			}
			const from = fixed ? reportingPeriod(source.from, 'from') : null;
			const to = fixed ? reportingPeriod(source.to, 'to') : null;
			if (from && to && from > to) throw new WebMcpInputError('from must not be after to');
			const binding: ResearchExactTableBinding = {
				certs: certs(source.certs), metrics: metrics(source.metrics), from, to,
				followCurrent: source.followCurrent,
			};
			const desired = normalizeResearchBoardBlock({
				id: blockId(source.blockId), kind: 'exact_table', title: stringValue(source.title, 'title', { min: 1, max: 160 }),
				span: enumValue(source.span, 'span', SPANS), binding,
			});
			const expected = revision(source.ifRevision);
			if (deps.workspace.state.revision !== expected && !exactBlock(deps.workspace.state, desired)) throw stale(expected, deps.workspace.state.revision);
			if (deps.prepareBoardTable) await deps.prepareBoardTable(binding, context);
			const data = commitDesiredBlock(deps, desired, expected, source.focus === true, context);
			return { summary: `${desired.title} is visible on the research board.`, data };
		},
	});

	const upsertTakeaway = mutation({
		name: 'bankgraph.upsert_takeaway',
		title: 'Add or edit a takeaway',
		description: 'Add or replace one plain-text takeaway on the visible board. The text must refer to at least one existing board view and cannot contain executable markup or numerical arrays. Choose quarter, half, three-quarter, or full width on the 12-column board.',
		inputSchema: OBJECT({
			blockId: ID_SCHEMA, title: TITLE_SCHEMA, text: STRING(WORKSPACE_LIMITS.noteLength),
			referenceBlockIds: ARRAY(ID_SCHEMA, WORKSPACE_LIMITS.boardBlocks, 1),
			span: SPAN_SCHEMA, ifRevision: REVISION_SCHEMA,
		}, ['blockId', 'title', 'text', 'referenceBlockIds', 'span', 'ifRevision']),
		controller: (input, context) => {
			const source = inputObject(input, ['blockId', 'title', 'text', 'referenceBlockIds', 'span', 'ifRevision']);
			const referenceBlockIds = unique(arrayValue(source.referenceBlockIds, 'referenceBlockIds', {
				min: 1, max: WORKSPACE_LIMITS.boardBlocks,
				map: (item, index) => blockId(item, `referenceBlockIds[${index}]`),
			}), 'referenceBlockIds');
			const existingIds = new Set(deps.workspace.state.board.blocks.map((block) => block.id));
			for (const referenceId of referenceBlockIds) {
				if (!existingIds.has(referenceId)) throw new WebMcpInputError(`referenceBlockIds contains unknown view ${referenceId}`);
			}
			const desired = normalizeResearchBoardBlock({
				id: blockId(source.blockId), kind: 'takeaway', title: stringValue(source.title, 'title', { min: 1, max: 160 }),
				span: enumValue(source.span, 'span', SPANS),
				text: stringValue(source.text, 'text', { max: WORKSPACE_LIMITS.noteLength, trim: false }),
				referenceBlockIds,
			});
			const data = commitDesiredBlock(deps, desired, revision(source.ifRevision), true, context);
			return { summary: `${desired.title} is visible on the research board.`, data };
		},
	});

	const updateBlock = mutation({
		name: 'bankgraph.update_board_block',
		title: 'Update a board view',
		description: 'Update any visible board view after it is created. Rename or resize it, change a history chart between line and area or values and index, or switch the compatible view of a stored analysis result. Send the complete desired presentation so retries are idempotent.',
		inputSchema: OBJECT({
			blockId: ID_SCHEMA, title: TITLE_SCHEMA, span: SPAN_SCHEMA, view: ENUM(ANALYSIS_VIEWS),
			chartKind: ENUM(['line', 'area']), scale: ENUM(['value', 'index']), ifRevision: REVISION_SCHEMA,
		}, ['blockId', 'title', 'span', 'ifRevision']),
		controller: (input, context) => {
			const source = inputObject(input, ['blockId', 'title', 'span', 'view', 'chartKind', 'scale', 'ifRevision']);
			const id = blockId(source.blockId);
			const current = deps.workspace.state.board.blocks.find((block) => block.id === id);
			if (!current) throw new WebMcpToolError('board_block_not_found', `Board view ${id} is not visible.`, { blockId: id });
			let desired: ResearchBoardBlock = { ...current, title: stringValue(source.title, 'title', { min: 1, max: 160 }), span: enumValue(source.span, 'span', SPANS) };
			if (current.kind === 'history') {
				if (source.chartKind === undefined || source.scale === undefined || source.view !== undefined) throw new WebMcpInputError('history blocks require chartKind and scale, and do not accept view');
				desired = { ...desired, kind: 'history', binding: { ...current.binding,
					chartKind: enumValue(source.chartKind, 'chartKind', ['line', 'area'] as const),
					scale: enumValue(source.scale, 'scale', ['value', 'index'] as const),
				} };
			} else if (current.kind === 'analysis') {
				if (source.view === undefined || source.chartKind !== undefined || source.scale !== undefined) throw new WebMcpInputError('analysis blocks require view, and do not accept chartKind or scale');
				desired = { ...desired, kind: 'analysis', binding: { ...current.binding, view: enumValue(source.view, 'view', ANALYSIS_VIEWS) } };
			} else if (source.view !== undefined || source.chartKind !== undefined || source.scale !== undefined) {
				throw new WebMcpInputError('this block kind does not accept view, chartKind, or scale');
			}
			desired = normalizeResearchBoardBlock(desired);
			const data = commitDesiredBlock(deps, desired, revision(source.ifRevision), deps.workspace.state.board.focusedBlockId === id, context);
			return { summary: `${desired.title} was updated on the research board.`, data };
		},
	});

	const arrangeBoard = mutation({
		name: 'bankgraph.arrange_research_board',
		title: 'Arrange the research board',
		description: 'Set the complete answer order exactly once. Every current view ID must appear exactly once. Focus can be kept, cleared, or set in the same atomic workspace revision.',
		inputSchema: OBJECT({
			orderedBlockIds: ARRAY(ID_SCHEMA, WORKSPACE_LIMITS.boardBlocks),
			focusMode: ENUM(['keep', 'clear', 'set']), focusedBlockId: ID_SCHEMA, ifRevision: REVISION_SCHEMA,
		}, ['orderedBlockIds', 'focusMode', 'ifRevision']),
		controller: (input, context) => {
			const source = inputObject(input, ['orderedBlockIds', 'focusMode', 'focusedBlockId', 'ifRevision']);
			const orderedBlockIds = unique(arrayValue(source.orderedBlockIds, 'orderedBlockIds', {
				max: WORKSPACE_LIMITS.boardBlocks, map: (item, index) => blockId(item, `orderedBlockIds[${index}]`),
			}), 'orderedBlockIds');
			const focusMode = enumValue(source.focusMode, 'focusMode', ['keep', 'clear', 'set'] as const);
			if ((focusMode === 'set') !== (source.focusedBlockId !== undefined)) throw new WebMcpInputError('focusedBlockId is required only when focusMode is set');
			const focused = focusMode === 'keep' ? deps.workspace.state.board.focusedBlockId : focusMode === 'clear' ? null : blockId(source.focusedBlockId);
			const already = same(orderedBlockIds, deps.workspace.state.board.blocks.map((block) => block.id)) && focused === deps.workspace.state.board.focusedBlockId;
			const expected = revision(source.ifRevision);
			if (deps.workspace.state.revision !== expected) {
				if (already) return { summary: 'The research board already has this order.', data: receipt(deps.workspace.state, false, { idempotentReplay: true }) };
				throw stale(expected, deps.workspace.state.revision);
			}
			const commands = [workspaceCommands.reorderBoardBlocks(orderedBlockIds)];
			if (focusMode !== 'keep') commands.push(workspaceCommands.focusBoardBlock(focused));
			if (context.signal.aborted) throw context.signal.reason;
			const result = deps.workspace.executeBatch(commands, { ifRevision: expected });
			return { summary: 'The research board answer order is visible.', data: receipt(result.state, result.changed) };
		},
	});

	const setAppearance = mutation({
		name: 'bankgraph.set_appearance',
		title: 'Set the board appearance',
		description: 'Set Bankgraph to its day or night appearance. This changes the same visible theme control a person uses and is exact rather than a non-idempotent toggle.',
		maxResultChars: MAX_WEBMCP_EXTENDED_ENVELOPE_CHARS,
		inputSchema: OBJECT({ theme: ENUM(THEMES) }, ['theme']),
		controller: (input) => {
			const source = inputObject(input, ['theme']);
			if (!deps.setAppearance) throw new WebMcpToolError('capability_unavailable', 'Appearance control is unavailable on this page.', {});
			const desired = enumValue(source.theme, 'theme', THEMES);
			const result = deps.setAppearance(desired);
			return {
				summary: `Bankgraph is using its ${result.theme === 'dark' ? 'night' : 'day'} appearance.`,
				data: { ...result, workspaceRevision: deps.workspace.state.revision, presentation: deps.getBoardPresentation?.() ?? null },
			};
		},
	});

	const configureBoardView = mutation({
		name: 'bankgraph.configure_board_view',
		title: 'Edit a board view',
		description: 'Change only the requested part of an existing view and preserve everything else. First read bankgraph.read_research_board and use that block\'s configurationAffordances: live workspace views accept only their listed subtype fields, history views accept history dates and chart style, exact tables accept sorting, and stored analyses accept only the listed compatible view values. Data-anchor fields can pin any data-bearing view; followWorkspace reconnects it to the board. Revision guards are optional because every field is an exact, idempotent setting.',
		maxResultChars: MAX_WEBMCP_EXTENDED_ENVELOPE_CHARS,
		inputSchema: {
			...OBJECT({
			blockId: STRING(64, 'Existing block ID from read_research_board; consult its configurationAffordances entry before choosing fields.', BOARD_BLOCK_ID.source),
			title: TITLE_SCHEMA,
			width: ENUM(BOARD_WIDTHS, 'Valid for every view.'),
			height: ENUM(BOARD_HEIGHTS, 'Valid for every view.'),
			role: ENUM(BOARD_ROLES, 'Valid for every view.'),
			presentation: ENUM(BOARD_PRESENTATIONS, 'Source-bound history views only; chooses one primary measure or small multiples.'),
			followWorkspace: { type: 'boolean', description: 'Data-bearing views only. true clears pins and follows board anchors; false keeps a separate selection. Do not combine true with anchor or history-date fields.' },
			certs: { ...ARRAY(INTEGER(1, 99_999_999), WORKSPACE_LIMITS.selectedBanks), description: 'Data-anchor override for a data-bearing view. Do not send with followWorkspace=true.' },
			metrics: { ...ARRAY(ENUM(RESEARCH_METRIC_IDS), WORKSPACE_LIMITS.visibleMetrics), description: 'Data-anchor override for a data-bearing view. Do not send with followWorkspace=true.' },
			asOf: STRING(8, 'Data-anchor reporting period for a data-bearing view. Do not send with followWorkspace=true.'),
			compareWith: STRING(8, 'Data-anchor comparison period for a data-bearing view. Do not send with followWorkspace=true.'),
			historyFrom: STRING(8, 'Source-bound history views only.'),
			historyTo: STRING(8, 'Source-bound history views only.'),
			chartKind: ENUM(['line', 'area'], 'Source-bound history views only.'),
			scale: ENUM(['value', 'index'], 'Source-bound history views only.'),
			view: ENUM(ANALYSIS_VIEWS, 'Stored analysis views only. Use that block\'s configurationAffordances.viewValues; compatible values depend on result kind.'),
			sortMetric: ENUM(RESEARCH_METRIC_IDS, 'Source-bound exact-table views only.'),
			sortBasis: ENUM(['level', 'change'], 'Source-bound exact-table views only.'),
			sortDirection: ENUM(['asc', 'desc'], 'Source-bound exact-table views only.'),
			series: { ...ARRAY(ENUM(ECONOMY_SERIES), 3, 1), description: 'Live economic_context workspace views only.' },
			xMetric: ENUM(RESEARCH_METRIC_IDS, 'Live metric_relationship workspace views only.'),
			yMetric: ENUM(RESEARCH_METRIC_IDS, 'Live metric_relationship workspace views only.'),
			geographyMode: ENUM(GEOGRAPHY_MODES, 'Live headquarters_geography workspace views only.'),
			attributionMode: ENUM(ATTRIBUTION_MODES, 'Live change_attribution workspace views only.'),
			ifRevision: REVISION_SCHEMA,
			ifPresentationRevision: PRESENTATION_REVISION_SCHEMA,
			}, ['blockId']),
			minProperties: 2,
		},
		controller: (input) => {
			const source = inputObject(input, [
				'blockId', 'title', 'width', 'height', 'role', 'presentation', 'followWorkspace',
				'certs', 'metrics', 'asOf', 'compareWith', 'historyFrom', 'historyTo',
				'chartKind', 'scale', 'view', 'sortMetric', 'sortBasis', 'sortDirection',
				'series', 'xMetric', 'yMetric', 'geographyMode', 'attributionMode',
				'ifRevision', 'ifPresentationRevision',
			]);
			if (!deps.configureBoardView) throw new WebMcpToolError('capability_unavailable', 'Board presentation control is unavailable on this page.', {});
			const editFields = [
				'title', 'width', 'height', 'role', 'presentation', 'followWorkspace', 'certs', 'metrics',
				'asOf', 'compareWith', 'historyFrom', 'historyTo', 'chartKind', 'scale', 'view',
				'sortMetric', 'sortBasis', 'sortDirection', 'series', 'xMetric', 'yMetric',
				'geographyMode', 'attributionMode',
			];
			if (!editFields.some((field) => source[field] !== undefined)) {
				throw new WebMcpInputError('Provide at least one view change');
			}
			if (source.ifRevision !== undefined) {
				const expected = revision(source.ifRevision);
				if (deps.workspace.state.revision !== expected) throw stale(expected, deps.workspace.state.revision);
			}
			const currentPresentation = deps.getBoardPresentation?.().presentationRevision ?? 0;
			if (source.ifPresentationRevision !== undefined) {
				const expectedPresentation = integer(source.ifPresentationRevision, 'ifPresentationRevision', 0, Number.MAX_SAFE_INTEGER);
				if (currentPresentation !== expectedPresentation) throw stalePresentation(expectedPresentation, currentPresentation);
			}
			const id = blockId(source.blockId);
			const block = deps.workspace.state.board.blocks.find((block) => block.id === id);
			if (!block) throw new WebMcpToolError('board_block_not_found', `Board view ${id} is not visible.`, { blockId: id });
			if (source.followWorkspace !== undefined && typeof source.followWorkspace !== 'boolean') throw new WebMcpInputError('followWorkspace must be a boolean');
			const historyRequested = source.historyFrom !== undefined || source.historyTo !== undefined;
			const pinsRequested = source.certs !== undefined || source.metrics !== undefined || source.asOf !== undefined || source.compareWith !== undefined;
			if (source.followWorkspace === true && (pinsRequested || historyRequested)) {
				throw new WebMcpInputError('Banks, measures, or dates cannot be pinned while followWorkspace is true');
			}
			if (historyRequested && block.kind !== 'history') throw new WebMcpInputError('historyFrom and historyTo are accepted only for a history view');
			if ((source.chartKind !== undefined || source.scale !== undefined) && block.kind !== 'history') throw new WebMcpInputError('chartKind and scale are accepted only for a history view');
			if (source.presentation !== undefined && block.kind !== 'history') throw new WebMcpInputError('presentation is accepted only for a history view');
			if (source.view !== undefined && block.kind !== 'analysis') throw new WebMcpInputError('view is accepted only for a stored analysis result');
			const compatibleAnalysisViews = block.kind === 'analysis'
				? ANALYSIS_VIEWS_BY_KIND[block.binding.resultRef.kind]
				: ANALYSIS_VIEWS;
			const sortRequested = source.sortMetric !== undefined || source.sortBasis !== undefined || source.sortDirection !== undefined;
			if (sortRequested && block.kind !== 'exact_table') throw new WebMcpInputError('sortMetric, sortBasis, and sortDirection are accepted only for an exact table');
			const view = block.kind === 'workspace_view' ? block.binding.view : null;
			if (source.series !== undefined && view !== 'economic_context') throw new WebMcpInputError('series is accepted only for an economic_context view');
			if ((source.xMetric !== undefined || source.yMetric !== undefined) && view !== 'metric_relationship') throw new WebMcpInputError('xMetric and yMetric are accepted only for a metric_relationship view');
			if (source.geographyMode !== undefined && view !== 'headquarters_geography') throw new WebMcpInputError('geographyMode is accepted only for a headquarters_geography view');
			if (source.attributionMode !== undefined && view !== 'change_attribution') throw new WebMcpInputError('attributionMode is accepted only for a change_attribution view');
			const configuration: ResearchBoardViewConfiguration = {
				...(source.title === undefined ? {} : { title: stringValue(source.title, 'title', { min: 1, max: 160 }) }),
				...(source.width === undefined ? {} : { width: enumValue(source.width, 'width', BOARD_WIDTHS) }),
				...(source.height === undefined ? {} : { height: enumValue(source.height, 'height', BOARD_HEIGHTS) }),
				...(source.role === undefined ? {} : { role: enumValue(source.role, 'role', BOARD_ROLES) }),
				...(source.presentation === undefined ? {} : { presentation: enumValue(source.presentation, 'presentation', BOARD_PRESENTATIONS) }),
				...(source.followWorkspace === undefined ? {} : { followWorkspace: source.followWorkspace }),
				...(source.certs === undefined ? {} : { certs: certs(source.certs) }),
				...(source.metrics === undefined ? {} : { metrics: metrics(source.metrics) }),
				...(source.asOf === undefined ? {} : { asOf: reportingPeriod(source.asOf, 'asOf') }),
				...(source.compareWith === undefined ? {} : { compareWith: reportingPeriod(source.compareWith, 'compareWith') }),
				...(source.historyFrom === undefined ? {} : { historyFrom: reportingPeriod(source.historyFrom, 'historyFrom') }),
				...(source.historyTo === undefined ? {} : { historyTo: reportingPeriod(source.historyTo, 'historyTo') }),
				...(source.chartKind === undefined ? {} : { chartKind: enumValue(source.chartKind, 'chartKind', ['line', 'area'] as const) }),
				...(source.scale === undefined ? {} : { scale: enumValue(source.scale, 'scale', ['value', 'index'] as const) }),
				...(source.view === undefined ? {} : { view: enumValue(source.view, 'view', compatibleAnalysisViews) }),
				...(source.sortMetric === undefined ? {} : { sortMetric: enumValue(source.sortMetric, 'sortMetric', RESEARCH_METRIC_IDS) }),
				...(source.sortBasis === undefined ? {} : { sortBasis: enumValue(source.sortBasis, 'sortBasis', ['level', 'change'] as const) }),
				...(source.sortDirection === undefined ? {} : { sortDirection: enumValue(source.sortDirection, 'sortDirection', ['asc', 'desc'] as const) }),
				...(source.series === undefined ? {} : { series: unique(arrayValue(source.series, 'series', { min: 1, max: 3, map: (item, index) => enumValue(item, `series[${index}]`, ECONOMY_SERIES) }), 'series') }),
				...(source.xMetric === undefined ? {} : { xMetric: enumValue(source.xMetric, 'xMetric', RESEARCH_METRIC_IDS) }),
				...(source.yMetric === undefined ? {} : { yMetric: enumValue(source.yMetric, 'yMetric', RESEARCH_METRIC_IDS) }),
				...(source.geographyMode === undefined ? {} : { geographyMode: enumValue(source.geographyMode, 'geographyMode', GEOGRAPHY_MODES) }),
				...(source.attributionMode === undefined ? {} : { attributionMode: enumValue(source.attributionMode, 'attributionMode', ATTRIBUTION_MODES) }),
			};
			if (configuration.historyFrom && configuration.historyTo && configuration.historyFrom > configuration.historyTo) {
				throw new WebMcpInputError('historyFrom must not be after historyTo');
			}
			const result = deps.configureBoardView(id, configuration);
			const updated = deps.workspace.state.board.blocks.find((item) => item.id === id) ?? block;
			return {
				summary: `${updated.title} now reflects the requested changes.`,
				data: { ...result, workspaceRevision: deps.workspace.state.revision, blockIds: [id], block: updated, presentation: deps.getBoardPresentation?.() ?? null },
			};
		},
	});

	const clearBoard = mutation({
		name: 'bankgraph.clear_research_board',
		title: 'Clear the research board',
		description: 'Remove every visible board view in one operation while retaining the selected banks, cohort, measures, and period. The human interface offers the same recoverable clear action.',
		maxResultChars: MAX_WEBMCP_EXTENDED_ENVELOPE_CHARS,
		inputSchema: OBJECT({ ifRevision: REVISION_SCHEMA, ifPresentationRevision: PRESENTATION_REVISION_SCHEMA }, ['ifRevision', 'ifPresentationRevision']),
		controller: (input, context) => {
			const source = inputObject(input, ['ifRevision', 'ifPresentationRevision']);
			if (!deps.clearResearchBoard) throw new WebMcpToolError('capability_unavailable', 'Board clearing is unavailable on this page.', {});
			const expected = revision(source.ifRevision);
			const currentPresentation = deps.getBoardPresentation?.().presentationRevision ?? 0;
			const expectedPresentation = integer(source.ifPresentationRevision, 'ifPresentationRevision', 0, Number.MAX_SAFE_INTEGER);
			if (currentPresentation !== expectedPresentation) throw stalePresentation(expectedPresentation, currentPresentation);
			const ids = deps.workspace.state.board.blocks.map((block) => block.id);
			if (deps.workspace.state.revision !== expected) {
				if (!ids.length) return { summary: 'The research board is already clear.', data: receipt(deps.workspace.state, false, { idempotentReplay: true }) };
				throw stale(expected, deps.workspace.state.revision);
			}
			if (context.signal.aborted) throw context.signal.reason;
			const result = deps.clearResearchBoard();
			return { summary: `${result.blockIds.length} board ${result.blockIds.length === 1 ? 'view' : 'views'} cleared.`, data: { ...receipt(deps.workspace.state, result.changed, { blockIds: result.blockIds }), presentation: deps.getBoardPresentation?.() ?? null } };
		},
	});

	const resetBoard = mutation({
		name: 'bankgraph.reset_board_layout',
		title: 'Reset the board layout',
		description: 'Keep every view and analytical selection, but return the board to its automatic layout, default view sizes, default time ruler, and no focused view.',
		maxResultChars: MAX_WEBMCP_EXTENDED_ENVELOPE_CHARS,
		inputSchema: OBJECT({ ifRevision: REVISION_SCHEMA, ifPresentationRevision: PRESENTATION_REVISION_SCHEMA }, ['ifRevision', 'ifPresentationRevision']),
		controller: (input) => {
			const source = inputObject(input, ['ifRevision', 'ifPresentationRevision']);
			if (!deps.resetBoardLayout) throw new WebMcpToolError('capability_unavailable', 'Board layout reset is unavailable on this page.', {});
			const expected = revision(source.ifRevision);
			if (deps.workspace.state.revision !== expected) throw stale(expected, deps.workspace.state.revision);
			const currentPresentation = deps.getBoardPresentation?.().presentationRevision ?? 0;
			const expectedPresentation = integer(source.ifPresentationRevision, 'ifPresentationRevision', 0, Number.MAX_SAFE_INTEGER);
			if (currentPresentation !== expectedPresentation) throw stalePresentation(expectedPresentation, currentPresentation);
			const result = deps.resetBoardLayout();
			return { summary: 'The board is using its automatic layout.', data: { ...receipt(deps.workspace.state, result.changed), presentation: deps.getBoardPresentation?.() ?? null } };
		},
	});

	const resetResearchBoard = mutation({
		name: 'bankgraph.reset_research_board',
		title: 'Start a fresh research board',
		description: 'Clear the board and its research question, selected banks, cohort, measures, dates, saved findings, and analysis results in one exact operation. The product-level watchlist is retained.',
		maxResultChars: MAX_WEBMCP_EXTENDED_ENVELOPE_CHARS,
		inputSchema: OBJECT({ ifRevision: REVISION_SCHEMA, ifPresentationRevision: PRESENTATION_REVISION_SCHEMA }, ['ifRevision', 'ifPresentationRevision']),
		controller: (input) => {
			const source = inputObject(input, ['ifRevision', 'ifPresentationRevision']);
			if (!deps.resetResearchBoard) throw new WebMcpToolError('capability_unavailable', 'A full research-board reset is unavailable on this page.', {});
			const expected = revision(source.ifRevision);
			if (deps.workspace.state.revision !== expected) throw stale(expected, deps.workspace.state.revision);
			const currentPresentation = deps.getBoardPresentation?.().presentationRevision ?? 0;
			const expectedPresentation = integer(source.ifPresentationRevision, 'ifPresentationRevision', 0, Number.MAX_SAFE_INTEGER);
			if (currentPresentation !== expectedPresentation) throw stalePresentation(expectedPresentation, currentPresentation);
			const result = deps.resetResearchBoard();
			return { summary: 'A fresh research board is ready.', data: { ...receipt(deps.workspace.state, result.changed), presentation: deps.getBoardPresentation?.() ?? null } };
		},
	});

	const removeBlocks = mutation({
		name: 'bankgraph.remove_board_blocks',
		title: 'Remove board views',
		description: 'Remove one or more visible board views by stable ID. A retry after those views are already absent is a successful no-op.',
		inputSchema: OBJECT({
			blockIds: ARRAY(ID_SCHEMA, WORKSPACE_LIMITS.boardBlocks, 1), ifRevision: REVISION_SCHEMA,
		}, ['blockIds', 'ifRevision']),
		controller: (input, context) => {
			const source = inputObject(input, ['blockIds', 'ifRevision']);
			const ids = unique(arrayValue(source.blockIds, 'blockIds', {
				min: 1, max: WORKSPACE_LIMITS.boardBlocks, map: (item, index) => blockId(item, `blockIds[${index}]`),
			}), 'blockIds');
			const existing = ids.filter((id) => deps.workspace.state.board.blocks.some((block) => block.id === id));
			const expected = revision(source.ifRevision);
			if (deps.workspace.state.revision !== expected) {
				if (!existing.length) return { summary: 'The requested views are already absent.', data: receipt(deps.workspace.state, false, { blockIds: ids, idempotentReplay: true }) };
				throw stale(expected, deps.workspace.state.revision);
			}
			if (context.signal.aborted) throw context.signal.reason;
			const result = deps.workspace.executeBatch(existing.map(workspaceCommands.removeBoardBlock), { ifRevision: expected });
			return { summary: `${existing.length} board ${existing.length === 1 ? 'view' : 'views'} removed.`, data: receipt(result.state, result.changed, { blockIds: existing }) };
		},
	});

	const focusBlock = mutation({
		name: 'bankgraph.focus_board_block',
		title: 'Focus a board view',
		description: 'Set the shared focused board view, or omit blockId to clear focus. Human focus changes are visible to the next agent read.',
		inputSchema: OBJECT({ blockId: ID_SCHEMA, ifRevision: REVISION_SCHEMA }, ['ifRevision']),
		controller: (input, context) => {
			const source = inputObject(input, ['blockId', 'ifRevision']);
			const id = source.blockId === undefined ? null : blockId(source.blockId);
			const already = deps.workspace.state.board.focusedBlockId === id;
			const expected = revision(source.ifRevision);
			if (deps.workspace.state.revision !== expected) {
				if (already) return { summary: 'Board focus already matches.', data: receipt(deps.workspace.state, false, { idempotentReplay: true }) };
				throw stale(expected, deps.workspace.state.revision);
			}
			if (context.signal.aborted) throw context.signal.reason;
			const result = deps.workspace.execute(workspaceCommands.focusBoardBlock(id), { ifRevision: expected });
			return { summary: id ? `Focused ${id}.` : 'Board focus cleared.', data: receipt(result.state, result.changed, { blockIds: id ? [id] : [] }) };
		},
	});

	return Object.fromEntries([
		readBoard, readBlock, listTemplates, applyTemplate, addWorkspaceView, plotHistory, publishExactTable, publishResult, upsertTakeaway, updateBlock,
		arrangeBoard, configureBoardView, removeBlocks, clearBoard, resetBoard, resetResearchBoard, focusBlock, setAppearance,
	].map((tool) => [tool.name, tool]));
}
