import type { AnalysisProvenance } from '$lib/types';
import type { BankScreenSort } from '$lib/bank-screen';
import type { CohortTransition } from '$lib/analytics/cohort-transition';
import type {
	TemporalGapPolicy,
	TemporalPatternResult,
	TemporalPatternSpec
} from '$lib/analytics/temporal-patterns';
import type {
	CompositionChange,
	CompositionId,
	CompositionSnapshot
} from '$lib/analytics/composition';
import type { ResearchMetric } from '$lib/research-metrics';
import type { FailurePatternsResponse } from '$lib/server/analytics/failure-patterns';
import type { AnalysisResultRef } from './analysis-result-repository';

export const WORKSPACE_SCHEMA_VERSION = 3 as const;

export const WORKSPACE_LIMITS = {
	/** Large enough for a working comparison set; views may progressively disclose dense series. */
	selectedBanks: 25,
	visibleMetrics: 6,
	findings: 20,
	/** One current, fully inspectable cohort-trend result. Older scans are replaced. */
	cohortTrendRows: 200,
	cohortTrendGroups: 100,
	cohortTrendConditions: 6,
	analysisRows: 200,
	analysisGroups: 100,
	analysisMetrics: 6,
	analysisResultCharacters: 1_000_000,
	boardBlocks: 24,
	boardBlockTitleLength: 160,
	boardTakeawayLength: 4_000,
	boardSpecCharacters: 32_768,
	metricConditions: 12,
	charts: 12,
	mapStates: 56,
	excludedBanks: 250,
	questionLength: 1_000,
	noteLength: 4_000
} as const;

export type ActiveFilter = 'any' | 'active' | 'inactive';
export type MetricOperator = 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte' | 'between';

export interface AssetRange {
	min: number | null;
	max: number | null;
}

export interface MetricCondition {
	metric: string;
	operator: MetricOperator;
	value: number;
	upperValue: number | null;
}

export interface BankScreenFilters {
	query: string;
	states: string[];
	assetRange: AssetRange;
	active: ActiveFilter;
	metricConditions: MetricCondition[];
}

export interface ResultsMetadata {
	total: number;
	returned: number;
	latestQuarter: string | null;
	refreshedAt: string | null;
	queryRevision: string | null;
	truncated: boolean;
}

/** The exact ordering of the visible bank screen. */
export interface WorkspaceScreenView {
	sort: BankScreenSort;
	order: 'asc' | 'desc';
}

export type PeerBasis = 'screen' | 'asset-range' | 'custom';

export interface PeerRecipe {
	name: string;
	basis: PeerBasis;
	states: string[];
	assetRange: AssetRange;
	active: ActiveFilter;
	metricConditions: MetricCondition[];
	minimumPeers: number;
	maximumPeers: number;
}

export type SelectedPeriod =
	| { kind: 'quarter'; quarter: string | null }
	| { kind: 'range'; from: string; to: string };

export type WorkspaceComparisonMode =
	| 'prior-quarter'
	| 'year-ago'
	| 'range-start'
	| 'custom';

/**
 * A comparison selection stores both the user intent and the deterministic
 * period that intent resolves to. `resolvedQuarter` is null when the current
 * inputs cannot form a valid earlier comparison.
 */
export interface WorkspaceComparisonSelection {
	mode: WorkspaceComparisonMode;
	rangeStartQuarter: string | null;
	customQuarter: string | null;
	resolvedQuarter: string | null;
}

/** Chart history is independent from the point-in-time analytical comparison. */
export interface WorkspaceChartHistory {
	from: string | null;
	to: string | null;
}

export interface WorkspaceComparisonPair {
	asOf: string;
	compareWith: string;
	mode: WorkspaceComparisonMode;
}

export type ChartKind = 'line' | 'bar' | 'area' | 'scatter' | 'radar';
export type ChartScale = 'value' | 'percent' | 'index';

export interface ChartSpec {
	id: string;
	title: string;
	kind: ChartKind;
	metrics: string[];
	certs: number[];
	scale: ChartScale;
	stacked: boolean;
	visible: boolean;
}

export type WorkspacePanel =
	| 'screen'
	| 'map'
	| 'bank'
	| 'compare'
	| 'peers'
	| 'charts'
	| 'findings';

export type WorkspaceDepth = 'guided' | 'pro';

export interface MapSelection {
	states: string[];
	certs: number[];
}

export interface PinnedFinding {
	id: string;
	title: string;
	note: string;
	certs: number[];
	metrics: string[];
	period: string | null;
	source: string | null;
	/** Exact analytical inputs and release used when this finding was pinned. */
	provenance?: AnalysisProvenance | null;
}

/** Explicit desired values are retained even when `watched` is false. */
export interface WatchlistDesiredEntry {
	cert: number;
	watched: boolean;
}

export type CohortTrendChangeUnit =
	| 'percent_change'
	| 'percentage_points'
	| 'absolute_change';

export interface CohortTrendResultRow {
	cert: number;
	name: string;
	state: string | null;
	assetBucket: number | null;
	totalAssets: number | null;
	changes: Record<string, number | null>;
}

export interface CohortTrendResultGroup {
	key: string;
	label: string;
	matchingCount: number;
	shareOfMatches: number;
}

/**
 * The latest semantic cohort scan published into the shared workspace.
 *
 * This is deliberately one bounded, replace-in-place result rather than an
 * accumulating report store. Public share links omit it; the exact lineage is
 * retained in the local workspace so the human can inspect what the agent saw.
 */
export interface CohortTrendResultSet {
	id: string;
	basedOnRevision: number;
	publishedRevision: number;
	from: string;
	to: string;
	conditions: MetricCondition[];
	groupBy: 'state' | 'asset_bucket';
	metrics: string[];
	changeUnits: Record<string, CohortTrendChangeUnit>;
	rows: CohortTrendResultRow[];
	groups: CohortTrendResultGroup[];
	counts: {
		cohort: number;
		comparable: number;
		matching: number;
	};
	coverage: {
		status: 'ready' | 'partial';
		missingCount: number;
	};
	peerRecipe: PeerRecipe;
	excludedCount: number;
	definitionHash: string;
	cohortHash: string;
	sourceMode: 'live' | 'recorded';
	sourceAsOf: string | null;
	retrievedAt: string | null;
	release: string | null;
	releaseGeneration: string | null;
}

export interface AnalysisResultLineage {
	sourceMode: 'live' | 'recorded';
	sourceAsOf: string | null;
	retrievedAt: string | null;
	release: string | null;
	releaseGeneration: string | null;
}

export interface AnalysisResultPopulation {
	membershipBasis:
		| 'current_workspace_members'
		| 'current_selected_banks'
		| 'current_selected_bank'
		| 'published_failure_and_active_universe';
	/** Exact count passed to the deterministic analysis. */
	analyzedCount: number;
	definitionHash: string;
	cohortHash: string;
	peerRecipe: PeerRecipe | null;
	excludedCount: number;
}

export interface AnalysisResultBase {
	id: string;
	basedOnRevision: number;
	publishedRevision: number;
	title: string;
	population: AnalysisResultPopulation;
	lineage: AnalysisResultLineage;
}

export interface CohortChangeAnalysisResult extends AnalysisResultBase {
	kind: 'cohort_change';
	spec: {
		from: string;
		to: string;
		metrics: ResearchMetric[];
		groupBy: 'none' | 'state' | 'asset_bucket';
	};
	transition: CohortTransition;
}

export interface TemporalPatternBankResult {
	cert: number;
	name: string;
	state: string | null;
	evaluations: TemporalPatternResult[];
}

export interface TemporalPatternAnalysisResult extends AnalysisResultBase {
	kind: 'temporal_pattern';
	spec: {
		metrics: ResearchMetric[];
		periodWindow: { startPeriod: string; endPeriod: string } | null;
		requiredPeriods: string[];
		minimumObservations: number;
		gapPolicy: TemporalGapPolicy;
		tolerance: number;
		pattern: TemporalPatternSpec;
	};
	counts: {
		cohort: number;
		matched: number;
		notMatched: number;
		insufficientData: number;
	};
	rows: TemporalPatternBankResult[];
}

export interface FinancialCompositionAnalysisResult extends AnalysisResultBase {
	kind: 'financial_composition';
	spec: {
		composition: CompositionId;
		scope: 'selected_bank' | 'selected_banks' | 'current_cohort';
		cert: number | null;
		period: string;
		compareFrom: string | null;
	};
	scopeLabel: string;
	memberCerts: number[];
	analysis: CompositionSnapshot | CompositionChange;
}

export interface FailurePatternAnalysisResult extends AnalysisResultBase {
	kind: 'failure_pattern';
	spec: {
		startYear: number;
		endYear: number;
		quarters: number;
		limit: number;
	};
	result: FailurePatternsResponse;
}

/** One replace-in-place, locally persisted analysis shared by the human and WebMCP. */
export type WorkspaceAnalysisResult =
	| CohortChangeAnalysisResult
	| TemporalPatternAnalysisResult
	| FinancialCompositionAnalysisResult
	| FailurePatternAnalysisResult;

export type ResearchBoardSpan = 'quarter' | 'half' | 'three_quarter' | 'full';
export type ResearchHistoryChartKind = 'line' | 'area';
export type ResearchHistoryScale = 'value' | 'index';

export interface ResearchBoardBlockBase {
	/** Stable caller-supplied identifier used for safe retries and references. */
	id: string;
	title: string;
	span: ResearchBoardSpan;
}

export interface ResearchHistoryBinding {
	certs: number[];
	metrics: ResearchMetric[];
	from: string;
	to: string;
	chartKind: ResearchHistoryChartKind;
	scale: ResearchHistoryScale;
}

export interface ResearchHistoryBlock extends ResearchBoardBlockBase {
	kind: 'history';
	binding: ResearchHistoryBinding;
}

export interface ResearchExactTableBinding {
	certs: number[];
	metrics: ResearchMetric[];
	/** Fixed inclusive range. Both values are null when following current workspace periods. */
	from: string | null;
	to: string | null;
	followCurrent: boolean;
}

export interface ResearchExactTableBlock extends ResearchBoardBlockBase {
	kind: 'exact_table';
	binding: ResearchExactTableBinding;
}

export type ResearchAnalysisView =
	| 'summary'
	| 'breadth'
	| 'distribution'
	| 'movers'
	| 'waterfall'
	| 'matched_banks'
	| 'small_multiples'
	| 'timeline'
	| 'stacked_composition'
	| 'change_waterfall'
	| 'both'
	| 'event_study'
	| 'analogues'
	| 'event_trajectories'
	| 'analogue_table'
	| 'exact_table';

export interface ResearchAnalysisBinding {
	/** Content-addressed pointer only. The materialized analysis never enters board state. */
	resultRef: AnalysisResultRef;
	view: ResearchAnalysisView;
}

export interface ResearchAnalysisBlock extends ResearchBoardBlockBase {
	kind: 'analysis';
	binding: ResearchAnalysisBinding;
}

export type ResearchWorkspaceView =
	| 'comparison_matrix'
	| 'metric_history'
	| 'peer_distribution'
	| 'change_attribution'
	| 'metric_relationship'
	| 'headquarters_geography'
	| 'economic_context'
	| 'bank_context';

export interface ResearchWorkspaceViewBinding {
	/** Live semantic view of the current workspace; no snapshot rows are persisted in the board. */
	view: ResearchWorkspaceView;
}

export interface ResearchWorkspaceViewBlock extends ResearchBoardBlockBase {
	kind: 'workspace_view';
	binding: ResearchWorkspaceViewBinding;
}

export interface ResearchTakeawayBlock extends ResearchBoardBlockBase {
	kind: 'takeaway';
	/** Bounded plain text. Renderers must never interpret this as HTML. */
	text: string;
	/** Existing board blocks cited by this takeaway. */
	referenceBlockIds: string[];
}

/** Ordered semantic research views; never raw chart/table values, HTML, SVG, or SQL. */
export type ResearchBoardBlock =
	| ResearchHistoryBlock
	| ResearchExactTableBlock
	| ResearchAnalysisBlock
	| ResearchWorkspaceViewBlock
	| ResearchTakeawayBlock;

export interface ResearchBoard {
	focusedBlockId: string | null;
	blocks: ResearchBoardBlock[];
}

export interface WorkspaceState {
	version: typeof WORKSPACE_SCHEMA_VERSION;
	revision: number;
	question: string;
	filters: BankScreenFilters;
	screenView: WorkspaceScreenView;
	results: ResultsMetadata;
	activeBank: number | null;
	selectedCerts: number[];
	excludedCerts: number[];
	peerRecipe: PeerRecipe;
	/** Canonical point-in-time analytical period. */
	asOfQuarter: string | null;
	/** Canonical comparison intent plus its deterministic resolution. */
	comparison: WorkspaceComparisonSelection;
	/** Canonical chart window; changing it never changes the analytical pair. */
	chartHistory: WorkspaceChartHistory;
	/**
	 * @deprecated Compatibility projection for callers created before schema 2.
	 * New code must use asOfQuarter, comparison, and chartHistory.
	 */
	period: SelectedPeriod;
	charts: ChartSpec[];
	activePanel: WorkspacePanel;
	depth: WorkspaceDepth;
	activeMetric: string | null;
	mapSelection: MapSelection;
	/** Latest visible human/agent cohort scan; public share serialization omits it. */
	cohortTrendResult: CohortTrendResultSet | null;
	/** Latest high-level deterministic analysis. Public share URLs intentionally omit it. */
	analysisResult: WorkspaceAnalysisResult | null;
	/** Ordered semantic research board. Materialized results remain outside workspace state. */
	board: ResearchBoard;
	findings: PinnedFinding[];
	watchlistDesired: WatchlistDesiredEntry[];
}

export type WorkspaceCommand =
	| { type: 'setQuestion'; question: string }
	| { type: 'setFilters'; filters: BankScreenFilters }
	| { type: 'setScreenView'; screenView: WorkspaceScreenView }
	| { type: 'setResults'; results: ResultsMetadata }
	| { type: 'setActiveBank'; cert: number | null }
	| { type: 'setSelectedCerts'; certs: number[] }
	| { type: 'setExcludedCerts'; certs: number[] }
	| { type: 'setPeerRecipe'; recipe: PeerRecipe }
	| { type: 'setAsOfQuarter'; quarter: string | null }
	| { type: 'setComparison'; comparison: Omit<WorkspaceComparisonSelection, 'resolvedQuarter'> }
	| { type: 'setChartHistory'; history: WorkspaceChartHistory }
	| { type: 'setPeriod'; period: SelectedPeriod }
	| { type: 'setCharts'; charts: ChartSpec[] }
	| { type: 'upsertChart'; chart: ChartSpec }
	| { type: 'removeChart'; id: string }
	| { type: 'setActivePanel'; panel: WorkspacePanel }
	| { type: 'setDepth'; depth: WorkspaceDepth }
	| { type: 'setActiveMetric'; metric: string | null }
	| { type: 'setMapSelection'; selection: MapSelection }
	| { type: 'setCohortTrendResult'; result: CohortTrendResultSet | null }
	| { type: 'setAnalysisResult'; result: WorkspaceAnalysisResult | null }
	| { type: 'upsertBoardBlock'; block: ResearchBoardBlock }
	| { type: 'reorderBoardBlocks'; orderedBlockIds: string[] }
	| { type: 'removeBoardBlock'; id: string }
	| { type: 'focusBoardBlock'; id: string | null }
	| { type: 'setFindings'; findings: PinnedFinding[] }
	| { type: 'upsertFinding'; finding: PinnedFinding }
	| { type: 'removeFinding'; id: string }
	| { type: 'setWatchlistDesired'; cert: number; watched: boolean }
	| { type: 'setWatchlistDesiredState'; entries: WatchlistDesiredEntry[] };

export interface WorkspaceCommandOptions {
	ifRevision?: number;
}

export interface WorkspaceCommandResult {
	state: WorkspaceState;
	changed: boolean;
	revision: number;
}

export interface StorageLike {
	getItem(key: string): string | null;
	setItem(key: string, value: string): void;
	removeItem?(key: string): void;
}
