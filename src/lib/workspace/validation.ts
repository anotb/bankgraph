import {
	WORKSPACE_LIMITS,
	WORKSPACE_SCHEMA_VERSION,
	type ActiveFilter,
	type AssetRange,
	type BankScreenFilters,
	type ChartKind,
	type ChartScale,
	type ChartSpec,
	type CohortTrendChangeUnit,
	type CohortTrendResultSet,
	type MapSelection,
	type MetricCondition,
	type MetricOperator,
	type PeerBasis,
	type PeerRecipe,
	type PinnedFinding,
	type ResearchAnalysisView,
	type ResearchBoard,
	type ResearchBoardBlock,
	type ResearchBoardSpan,
	type ResearchWorkspaceView,
	type ResultsMetadata,
	type SelectedPeriod,
	type WatchlistDesiredEntry,
	type WorkspaceChartHistory,
	type WorkspaceComparisonSelection,
	type WorkspaceDepth,
	type WorkspacePanel,
	type WorkspaceScreenView,
	type WorkspaceAnalysisResult,
	type WorkspaceState
} from './types';
import type { AnalysisProvenance } from '$lib/types';
import type { AnalysisResultRef, NormalizedJson } from './analysis-result-repository';
import { BANK_SCREEN_SORTS, type BankScreenSort } from '$lib/bank-screen';
import { isResearchMetric, type ResearchMetric } from '$lib/research-metrics';
import {
	compareReportingQuarters,
	parseReportingQuarter,
	resolvedWorkspaceComparison
} from './periods';

export interface WorkspaceValidationIssue {
	path: string;
	message: string;
}

export class WorkspaceValidationError extends Error {
	readonly issues: WorkspaceValidationIssue[];

	constructor(issues: WorkspaceValidationIssue[] | WorkspaceValidationIssue) {
		const list = Array.isArray(issues) ? issues : [issues];
		super(`Invalid workspace state: ${list.map((issue) => `${issue.path} ${issue.message}`).join('; ')}`);
		this.name = 'WorkspaceValidationError';
		this.issues = list;
	}
}

const ACTIVE_FILTERS = ['any', 'active', 'inactive'] as const;
const METRIC_OPERATORS = ['eq', 'ne', 'gt', 'gte', 'lt', 'lte', 'between'] as const;
const PEER_BASES = ['screen', 'asset-range', 'custom'] as const;
const CHART_KINDS = ['line', 'bar', 'area', 'scatter', 'radar'] as const;
const CHART_SCALES = ['value', 'percent', 'index'] as const;
const PANELS = ['screen', 'map', 'bank', 'compare', 'peers', 'charts', 'findings'] as const;
const DEPTHS = ['guided', 'pro'] as const;
const COMPARISON_MODES = ['prior-quarter', 'year-ago', 'range-start', 'custom'] as const;
const COHORT_TREND_CHANGE_UNITS = ['percent_change', 'percentage_points', 'absolute_change'] as const;
const BOARD_BLOCK_KINDS = ['history', 'exact_table', 'analysis', 'workspace_view', 'takeaway'] as const;
const BOARD_SPANS = ['quarter', 'half', 'three_quarter', 'full'] as const;
const BOARD_WORKSPACE_VIEWS = [
	'comparison_matrix',
	'metric_history',
	'peer_distribution',
	'change_attribution',
	'metric_relationship',
	'headquarters_geography',
	'economic_context',
	'bank_context'
] as const satisfies readonly ResearchWorkspaceView[];
const BOARD_ANALYSIS_KINDS = [
	'cohort_change',
	'temporal_pattern',
	'financial_composition',
	'failure_pattern'
] as const;
const BOARD_ANALYSIS_VIEWS: Record<(typeof BOARD_ANALYSIS_KINDS)[number], readonly ResearchAnalysisView[]> = {
	cohort_change: ['summary', 'breadth', 'distribution', 'movers', 'waterfall', 'exact_table'],
	temporal_pattern: ['summary', 'matched_banks', 'small_multiples', 'timeline', 'exact_table'],
	financial_composition: ['summary', 'stacked_composition', 'change_waterfall', 'exact_table'],
	failure_pattern: [
		'summary', 'both', 'event_study', 'analogues', 'event_trajectories',
		'small_multiples', 'analogue_table', 'exact_table'
	]
};
const REPORTING_PERIOD = /^(?:\d{8}|\d{4}Q[1-4])$/;
const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,63}$/;
const METRIC = /^[A-Za-z][A-Za-z0-9_:. -]{0,63}$/;
const CONTENT_HASH = /^sha256:[a-f0-9]{64}$/;
const BOARD_FORBIDDEN_SPEC_KEY = /^(?:data|dataset|html|markup|payload|raw|rawData|rawValues|result|results|rows|series|sql|svg|values)$/i;

function issue(path: string, message: string): never {
	throw new WorkspaceValidationError({ path, message });
}

function record(value: unknown, path: string): Record<string, unknown> {
	if (typeof value !== 'object' || value === null || Array.isArray(value)) issue(path, 'must be an object');
	return value as Record<string, unknown>;
}

function onlyKeys(source: Record<string, unknown>, path: string, allowed: readonly string[]): void {
	const allowedKeys = new Set(allowed);
	for (const key of Object.keys(source)) {
		if (!allowedKeys.has(key)) issue(`${path}.${key}`, 'is not allowed');
	}
}

function string(value: unknown, path: string, maxLength: number, allowEmpty = true): string {
	if (typeof value !== 'string') issue(path, 'must be a string');
	if (!allowEmpty && value.length === 0) issue(path, 'must not be empty');
	if (value.length > maxLength) issue(path, `must be at most ${maxLength} characters`);
	return value;
}

function finiteNumber(value: unknown, path: string): number {
	if (typeof value !== 'number' || !Number.isFinite(value)) issue(path, 'must be a finite number');
	return value;
}

function nonNegativeInteger(value: unknown, path: string): number {
	if (!Number.isSafeInteger(value) || (value as number) < 0) issue(path, 'must be a non-negative safe integer');
	return value as number;
}

function cert(value: unknown, path: string): number {
	if (!Number.isSafeInteger(value) || (value as number) <= 0) issue(path, 'must be a positive certificate number');
	return value as number;
}

function nullableString(value: unknown, path: string, maxLength: number): string | null {
	return value === null ? null : string(value, path, maxLength);
}

function enumValue<T extends string>(value: unknown, path: string, values: readonly T[]): T {
	if (typeof value !== 'string' || !values.includes(value as T)) {
		issue(path, `must be one of ${values.join(', ')}`);
	}
	return value as T;
}

function array(value: unknown, path: string): unknown[] {
	if (!Array.isArray(value)) issue(path, 'must be an array');
	return value;
}

function uniqueSorted<T>(values: T[], compare: (left: T, right: T) => number): T[] {
	return [...new Set(values)].sort(compare);
}

function normalizeStateCodes(value: unknown, path: string, limit = WORKSPACE_LIMITS.mapStates): string[] {
	const values = array(value, path);
	if (values.length > limit) issue(path, `must contain at most ${limit} states`);
	return uniqueSorted(
		values.map((item, index) => {
			const state = string(item, `${path}[${index}]`, 2, false).toUpperCase();
			if (!/^[A-Z]{2}$/.test(state)) issue(`${path}[${index}]`, 'must be a two-letter state code');
			return state;
		}),
		(left, right) => left.localeCompare(right)
	);
}

function normalizeCerts(value: unknown, path: string, limit: number): number[] {
	const values = array(value, path);
	if (values.length > limit) issue(path, `must contain at most ${limit} certificate numbers`);
	return uniqueSorted(
		values.map((item, index) => cert(item, `${path}[${index}]`)),
		(left, right) => left - right
	);
}

function normalizeMetrics(
	value: unknown,
	path: string,
	limit: number = WORKSPACE_LIMITS.visibleMetrics
): string[] {
	const values = array(value, path);
	if (values.length > limit) issue(path, `must contain at most ${limit} metrics`);
	return uniqueSorted(
		values.map((item, index) => {
			const metric = string(item, `${path}[${index}]`, 64, false);
			if (!METRIC.test(metric)) issue(`${path}[${index}]`, 'contains unsupported characters');
			return metric;
		}),
		(left, right) => left.localeCompare(right)
	);
}

export function normalizeAssetRange(value: unknown, path = 'assetRange'): AssetRange {
	const source = record(value, path);
	const min = source.min === null ? null : finiteNumber(source.min, `${path}.min`);
	const max = source.max === null ? null : finiteNumber(source.max, `${path}.max`);
	if (min !== null && min < 0) issue(`${path}.min`, 'must be at least 0');
	if (max !== null && max < 0) issue(`${path}.max`, 'must be at least 0');
	if (min !== null && max !== null && min > max) issue(path, 'minimum must not exceed maximum');
	return { min, max };
}

export function normalizeMetricCondition(value: unknown, path = 'condition'): MetricCondition {
	const source = record(value, path);
	const metric = string(source.metric, `${path}.metric`, 64, false);
	if (!METRIC.test(metric)) issue(`${path}.metric`, 'contains unsupported characters');
	const operator = enumValue<MetricOperator>(source.operator, `${path}.operator`, METRIC_OPERATORS);
	const conditionValue = finiteNumber(source.value, `${path}.value`);
	const upperValue = source.upperValue === null ? null : finiteNumber(source.upperValue, `${path}.upperValue`);
	if (operator === 'between') {
		if (upperValue === null) issue(`${path}.upperValue`, 'is required for a between condition');
		if (conditionValue > upperValue) issue(path, 'lower value must not exceed upper value');
	} else if (upperValue !== null) {
		issue(`${path}.upperValue`, 'must be null unless operator is between');
	}
	return { metric, operator, value: conditionValue, upperValue };
}

export function normalizeMetricConditions(value: unknown, path = 'metricConditions'): MetricCondition[] {
	const values = array(value, path);
	if (values.length > WORKSPACE_LIMITS.metricConditions) {
		issue(path, `must contain at most ${WORKSPACE_LIMITS.metricConditions} conditions`);
	}
	const normalized = values.map((item, index) => normalizeMetricCondition(item, `${path}[${index}]`));
	const keyed = new Map(normalized.map((item) => [JSON.stringify(item), item]));
	return [...keyed.values()].sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
}

export function normalizeActiveMetric(value: unknown, path = 'activeMetric'): string | null {
	if (value === null) return null;
	const metric = string(value, path, 64, false);
	if (!METRIC.test(metric)) issue(path, 'contains unsupported characters');
	return metric;
}

export function normalizeFilters(value: unknown, path = 'filters'): BankScreenFilters {
	const source = record(value, path);
	return {
		query: string(source.query, `${path}.query`, 200).trim(),
		states: normalizeStateCodes(source.states, `${path}.states`),
		assetRange: normalizeAssetRange(source.assetRange, `${path}.assetRange`),
		active: enumValue<ActiveFilter>(source.active, `${path}.active`, ACTIVE_FILTERS),
		metricConditions: normalizeMetricConditions(source.metricConditions, `${path}.metricConditions`)
	};
}

export function normalizeScreenView(value: unknown, path = 'screenView'): WorkspaceScreenView {
	const source = record(value, path);
	return {
		sort: enumValue<BankScreenSort>(source.sort, `${path}.sort`, BANK_SCREEN_SORTS),
		order: enumValue(source.order, `${path}.order`, ['asc', 'desc'] as const)
	};
}

export function normalizeResults(value: unknown, path = 'results'): ResultsMetadata {
	const source = record(value, path);
	const total = nonNegativeInteger(source.total, `${path}.total`);
	const returned = nonNegativeInteger(source.returned, `${path}.returned`);
	if (returned > total) issue(`${path}.returned`, 'must not exceed total');
	const latestQuarter = nullableString(source.latestQuarter, `${path}.latestQuarter`, 8);
	if (latestQuarter !== null && !REPORTING_PERIOD.test(latestQuarter)) {
		issue(`${path}.latestQuarter`, 'must be YYYYMMDD or YYYYQn');
	}
	const refreshedAt = nullableString(source.refreshedAt, `${path}.refreshedAt`, 40);
	const queryRevision = nullableString(source.queryRevision, `${path}.queryRevision`, 128);
	if (typeof source.truncated !== 'boolean') issue(`${path}.truncated`, 'must be a boolean');
	return { total, returned, latestQuarter, refreshedAt, queryRevision, truncated: source.truncated };
}

export function normalizePeerRecipe(value: unknown, path = 'peerRecipe'): PeerRecipe {
	const source = record(value, path);
	const minimumPeers = nonNegativeInteger(source.minimumPeers, `${path}.minimumPeers`);
	const maximumPeers = nonNegativeInteger(source.maximumPeers, `${path}.maximumPeers`);
	if (minimumPeers > maximumPeers) issue(path, 'minimumPeers must not exceed maximumPeers');
	if (maximumPeers > 1_000) issue(`${path}.maximumPeers`, 'must be at most 1000');
	return {
		name: string(source.name, `${path}.name`, 120).trim(),
		basis: enumValue<PeerBasis>(source.basis, `${path}.basis`, PEER_BASES),
		states: normalizeStateCodes(source.states, `${path}.states`),
		assetRange: normalizeAssetRange(source.assetRange, `${path}.assetRange`),
		active: enumValue<ActiveFilter>(source.active, `${path}.active`, ACTIVE_FILTERS),
		metricConditions: normalizeMetricConditions(source.metricConditions, `${path}.metricConditions`),
		minimumPeers,
		maximumPeers
	};
}

export function normalizePeriod(value: unknown, path = 'period'): SelectedPeriod {
	const source = record(value, path);
	const kind = enumValue(source.kind, `${path}.kind`, ['quarter', 'range'] as const);
	if (kind === 'quarter') {
		const quarter = nullableString(source.quarter, `${path}.quarter`, 8);
		if (quarter !== null && !REPORTING_PERIOD.test(quarter)) issue(`${path}.quarter`, 'must be YYYYMMDD or YYYYQn');
		return { kind, quarter };
	}
	const from = string(source.from, `${path}.from`, 8, false);
	const to = string(source.to, `${path}.to`, 8, false);
	if (!REPORTING_PERIOD.test(from)) issue(`${path}.from`, 'must be YYYYMMDD or YYYYQn');
	if (!REPORTING_PERIOD.test(to)) issue(`${path}.to`, 'must be YYYYMMDD or YYYYQn');
	if (from.length === to.length && from > to) issue(path, 'from must not be after to');
	return { kind, from, to };
}

export function normalizeReportingQuarter(value: unknown, path: string): string;
export function normalizeReportingQuarter(
	value: unknown,
	path: string,
	options: { nullable: true }
): string | null;
export function normalizeReportingQuarter(
	value: unknown,
	path: string,
	options: { nullable?: boolean } = {}
): string | null {
	if (value === null && options.nullable) return null;
	const quarter = string(value, path, 8, false);
	if (!parseReportingQuarter(quarter)) issue(path, 'must be YYYYQn or a quarter-end YYYYMMDD');
	return quarter;
}

export function normalizeChartHistory(value: unknown, path = 'chartHistory'): WorkspaceChartHistory {
	const source = record(value, path);
	const from = normalizeReportingQuarter(source.from, `${path}.from`, { nullable: true });
	const to = normalizeReportingQuarter(source.to, `${path}.to`, { nullable: true });
	if ((from === null) !== (to === null)) issue(path, 'from and to must both be set or both be null');
	if (from !== null && to !== null) {
		const order = compareReportingQuarters(from, to);
		if (order === null || order > 0) issue(path, 'from must not be after to');
	}
	return { from, to };
}

export function normalizeComparisonSelection(
	value: unknown,
	asOfQuarter: string | null,
	path = 'comparison'
): WorkspaceComparisonSelection {
	const source = record(value, path);
	const mode = enumValue(source.mode, `${path}.mode`, COMPARISON_MODES);
	const rangeStartQuarter = normalizeReportingQuarter(
		source.rangeStartQuarter ?? null,
		`${path}.rangeStartQuarter`,
		{ nullable: true }
	);
	const customQuarter = normalizeReportingQuarter(
		source.customQuarter ?? null,
		`${path}.customQuarter`,
		{ nullable: true }
	);
	return resolvedWorkspaceComparison(asOfQuarter, mode, rangeStartQuarter, customQuarter);
}

export function normalizeChart(value: unknown, path = 'chart'): ChartSpec {
	const source = record(value, path);
	const id = string(source.id, `${path}.id`, 64, false);
	if (!IDENTIFIER.test(id)) issue(`${path}.id`, 'contains unsupported characters');
	if (typeof source.stacked !== 'boolean') issue(`${path}.stacked`, 'must be a boolean');
	if (typeof source.visible !== 'boolean') issue(`${path}.visible`, 'must be a boolean');
	const visible = source.visible;
	return {
		id,
		title: string(source.title, `${path}.title`, 160).trim(),
		kind: enumValue<ChartKind>(source.kind, `${path}.kind`, CHART_KINDS),
		metrics: normalizeMetrics(
			source.metrics,
			`${path}.metrics`,
			visible ? WORKSPACE_LIMITS.visibleMetrics : 64
		),
		certs: normalizeCerts(source.certs, `${path}.certs`, WORKSPACE_LIMITS.selectedBanks),
		scale: enumValue<ChartScale>(source.scale, `${path}.scale`, CHART_SCALES),
		stacked: source.stacked,
		visible
	};
}

export function normalizeCharts(value: unknown, path = 'charts'): ChartSpec[] {
	const values = array(value, path);
	if (values.length > WORKSPACE_LIMITS.charts) issue(path, `must contain at most ${WORKSPACE_LIMITS.charts} charts`);
	const charts = values.map((item, index) => normalizeChart(item, `${path}[${index}]`));
	const ids = new Set<string>();
	for (const [index, chart] of charts.entries()) {
		if (ids.has(chart.id)) issue(`${path}[${index}].id`, 'must be unique');
		ids.add(chart.id);
	}
	const visibleMetrics = new Set(charts.filter((chart) => chart.visible).flatMap((chart) => chart.metrics));
	if (visibleMetrics.size > WORKSPACE_LIMITS.visibleMetrics) {
		issue(path, `visible charts must use at most ${WORKSPACE_LIMITS.visibleMetrics} distinct metrics`);
	}
	return charts;
}

export function normalizeMapSelection(value: unknown, path = 'mapSelection'): MapSelection {
	const source = record(value, path);
	return {
		states: normalizeStateCodes(source.states, `${path}.states`),
		certs: normalizeCerts(source.certs, `${path}.certs`, WORKSPACE_LIMITS.selectedBanks)
	};
}

function normalizeStringMap(
	value: unknown,
	path: string,
	valueKind: 'string' | 'string_array'
): Record<string, string> | Record<string, string[]> {
	const source = record(value, path);
	const entries = Object.entries(source);
	if (entries.length > 32) issue(path, 'must contain at most 32 metric definitions');
	if (valueKind === 'string') {
		return Object.fromEntries(entries.map(([key, item]) => [
			string(key, `${path}.key`, 64, false),
			string(item, `${path}.${key}`, 1_000, false)
		]));
	}
	return Object.fromEntries(entries.map(([key, item]) => {
		const fields = array(item, `${path}.${key}`);
		if (fields.length > 32) issue(`${path}.${key}`, 'must contain at most 32 source fields');
		return [
			string(key, `${path}.key`, 64, false),
			uniqueSorted(
				fields.map((field, index) => string(field, `${path}.${key}[${index}]`, 64, false)),
				(left, right) => left.localeCompare(right)
			)
		];
	}));
}

function normalizeFindingProvenance(value: unknown, path: string): AnalysisProvenance {
	const source = record(value, path);
	return {
		source: string(source.source, `${path}.source`, 160, false),
		source_url: string(source.source_url, `${path}.source_url`, 500, false),
		source_as_of: nullableString(source.source_as_of, `${path}.source_as_of`, 40),
		retrieved_at: nullableString(source.retrieved_at, `${path}.retrieved_at`, 40),
		release: nullableString(source.release, `${path}.release`, 40),
		release_generation: nullableString(source.release_generation, `${path}.release_generation`, 128),
		source_fields: normalizeStringMap(source.source_fields, `${path}.source_fields`, 'string_array') as Record<string, string[]>,
		formulas: normalizeStringMap(source.formulas, `${path}.formulas`, 'string') as Record<string, string>,
		cohort_hash: nullableString(source.cohort_hash, `${path}.cohort_hash`, 128)
	};
}

export function normalizeFinding(value: unknown, path = 'finding'): PinnedFinding {
	const source = record(value, path);
	const id = string(source.id, `${path}.id`, 64, false);
	if (!IDENTIFIER.test(id)) issue(`${path}.id`, 'contains unsupported characters');
	const period = nullableString(source.period, `${path}.period`, 8);
	if (period !== null && !REPORTING_PERIOD.test(period)) issue(`${path}.period`, 'must be YYYYMMDD or YYYYQn');
	return {
		id,
		title: string(source.title, `${path}.title`, 160).trim(),
		note: string(source.note, `${path}.note`, WORKSPACE_LIMITS.noteLength),
		certs: normalizeCerts(source.certs, `${path}.certs`, WORKSPACE_LIMITS.selectedBanks),
		metrics: normalizeMetrics(source.metrics, `${path}.metrics`),
		period,
		source: nullableString(source.source, `${path}.source`, 500),
		provenance: source.provenance === undefined || source.provenance === null
			? null
			: normalizeFindingProvenance(source.provenance, `${path}.provenance`)
	};
}

export function normalizeFindings(value: unknown, path = 'findings'): PinnedFinding[] {
	const values = array(value, path);
	if (values.length > WORKSPACE_LIMITS.findings) issue(path, `must contain at most ${WORKSPACE_LIMITS.findings} findings`);
	const findings = values.map((item, index) => normalizeFinding(item, `${path}[${index}]`));
	const ids = new Set<string>();
	for (const [index, finding] of findings.entries()) {
		if (ids.has(finding.id)) issue(`${path}[${index}].id`, 'must be unique');
		ids.add(finding.id);
	}
	return findings;
}

export function normalizeWatchlistEntries(value: unknown, path = 'watchlistDesired'): WatchlistDesiredEntry[] {
	const values = array(value, path);
	if (values.length > WORKSPACE_LIMITS.excludedBanks) issue(path, `must contain at most ${WORKSPACE_LIMITS.excludedBanks} entries`);
	const byCert = new Map<number, WatchlistDesiredEntry>();
	for (const [index, item] of values.entries()) {
		const source = record(item, `${path}[${index}]`);
		const entryCert = cert(source.cert, `${path}[${index}].cert`);
		if (typeof source.watched !== 'boolean') issue(`${path}[${index}].watched`, 'must be a boolean');
		if (byCert.has(entryCert)) issue(`${path}[${index}].cert`, 'must be unique');
		byCert.set(entryCert, { cert: entryCert, watched: source.watched });
	}
	return [...byCert.values()].sort((left, right) => left.cert - right.cert);
}

export function normalizeCohortTrendResult(
	value: unknown,
	path = 'cohortTrendResult'
): CohortTrendResultSet | null {
	if (value === null || value === undefined) return null;
	const source = record(value, path);
	const id = string(source.id, `${path}.id`, 64, false);
	if (!IDENTIFIER.test(id)) issue(`${path}.id`, 'contains unsupported characters');
	const basedOnRevision = nonNegativeInteger(source.basedOnRevision, `${path}.basedOnRevision`);
	const publishedRevision = nonNegativeInteger(source.publishedRevision, `${path}.publishedRevision`);
	if (publishedRevision <= basedOnRevision) {
		issue(`${path}.publishedRevision`, 'must be later than basedOnRevision');
	}
	const from = normalizeReportingQuarter(source.from, `${path}.from`);
	const to = normalizeReportingQuarter(source.to, `${path}.to`);
	if (from === null || to === null) issue(path, 'from and to are required');
	const order = compareReportingQuarters(from, to);
	if (order === null || order >= 0) issue(path, 'from must be earlier than to');

	const conditionValues = array(source.conditions, `${path}.conditions`);
	if (conditionValues.length < 1 || conditionValues.length > WORKSPACE_LIMITS.cohortTrendConditions) {
		issue(`${path}.conditions`, `must contain 1 to ${WORKSPACE_LIMITS.cohortTrendConditions} conditions`);
	}
	const conditions = conditionValues.map((condition, index) =>
		normalizeMetricCondition(condition, `${path}.conditions[${index}]`)
	);
	const metrics = array(source.metrics, `${path}.metrics`).map((metric, index) => {
		const normalized = string(metric, `${path}.metrics[${index}]`, 64, false);
		if (!METRIC.test(normalized)) issue(`${path}.metrics[${index}]`, 'contains unsupported characters');
		return normalized;
	});
	if (metrics.length < 1 || metrics.length > WORKSPACE_LIMITS.cohortTrendConditions) {
		issue(`${path}.metrics`, `must contain 1 to ${WORKSPACE_LIMITS.cohortTrendConditions} metrics`);
	}
	if (new Set(metrics).size !== metrics.length) issue(`${path}.metrics`, 'must not contain duplicates');
	const conditionMetrics = [...new Set(conditions.map((condition) => condition.metric))];
	if (JSON.stringify(metrics) !== JSON.stringify(conditionMetrics)) {
		issue(`${path}.metrics`, 'must match condition metrics in first-use order');
	}

	const unitSource = record(source.changeUnits, `${path}.changeUnits`);
	const changeUnits = Object.fromEntries(metrics.map((metric) => [
		metric,
		enumValue<CohortTrendChangeUnit>(
			unitSource[metric],
			`${path}.changeUnits.${metric}`,
			COHORT_TREND_CHANGE_UNITS
		)
	]));
	if (Object.keys(unitSource).some((metric) => !metrics.includes(metric))) {
		issue(`${path}.changeUnits`, 'must not include unrequested metrics');
	}

	const rowValues = array(source.rows, `${path}.rows`);
	if (rowValues.length > WORKSPACE_LIMITS.cohortTrendRows) {
		issue(`${path}.rows`, `must contain at most ${WORKSPACE_LIMITS.cohortTrendRows} rows`);
	}
	const rowCerts = new Set<number>();
	const rows = rowValues.map((row, index) => {
		const rowPath = `${path}.rows[${index}]`;
		const rowSource = record(row, rowPath);
		const rowCert = cert(rowSource.cert, `${rowPath}.cert`);
		if (rowCerts.has(rowCert)) issue(`${rowPath}.cert`, 'must be unique');
		rowCerts.add(rowCert);
		const changesSource = record(rowSource.changes, `${rowPath}.changes`);
		if (Object.keys(changesSource).some((metric) => !metrics.includes(metric))) {
			issue(`${rowPath}.changes`, 'must not include unrequested metrics');
		}
		const changes = Object.fromEntries(metrics.map((metric) => {
			const change = changesSource[metric];
			return [metric, change === null || change === undefined
				? null
				: finiteNumber(change, `${rowPath}.changes.${metric}`)];
		}));
		return {
			cert: rowCert,
			name: string(rowSource.name, `${rowPath}.name`, 200, false),
			state: nullableString(rowSource.state, `${rowPath}.state`, 2),
			assetBucket: rowSource.assetBucket === null
				? null
				: nonNegativeInteger(rowSource.assetBucket, `${rowPath}.assetBucket`),
			totalAssets: rowSource.totalAssets === null
				? null
				: finiteNumber(rowSource.totalAssets, `${rowPath}.totalAssets`),
			changes
		};
	});

	const countSource = record(source.counts, `${path}.counts`);
	const cohort = nonNegativeInteger(countSource.cohort, `${path}.counts.cohort`);
	const comparable = nonNegativeInteger(countSource.comparable, `${path}.counts.comparable`);
	const matching = nonNegativeInteger(countSource.matching, `${path}.counts.matching`);
	if (cohort > WORKSPACE_LIMITS.cohortTrendRows) issue(`${path}.counts.cohort`, 'exceeds the bounded result limit');
	if (comparable > cohort) issue(`${path}.counts.comparable`, 'must not exceed cohort');
	if (matching > comparable) issue(`${path}.counts.matching`, 'must not exceed comparable');
	if (rows.length !== matching) issue(`${path}.rows`, 'must contain every matching row');

	const groupValues = array(source.groups, `${path}.groups`);
	if (groupValues.length > WORKSPACE_LIMITS.cohortTrendGroups) {
		issue(`${path}.groups`, `must contain at most ${WORKSPACE_LIMITS.cohortTrendGroups} groups`);
	}
	const groupKeys = new Set<string>();
	const groups = groupValues.map((group, index) => {
		const groupPath = `${path}.groups[${index}]`;
		const groupSource = record(group, groupPath);
		const key = string(groupSource.key, `${groupPath}.key`, 80, false);
		if (groupKeys.has(key)) issue(`${groupPath}.key`, 'must be unique');
		groupKeys.add(key);
		const matchingCount = nonNegativeInteger(groupSource.matchingCount, `${groupPath}.matchingCount`);
		if (matchingCount > matching) issue(`${groupPath}.matchingCount`, 'must not exceed matching count');
		const shareOfMatches = finiteNumber(groupSource.shareOfMatches, `${groupPath}.shareOfMatches`);
		if (shareOfMatches < 0 || shareOfMatches > 1) issue(`${groupPath}.shareOfMatches`, 'must be between 0 and 1');
		return {
			key,
			label: string(groupSource.label, `${groupPath}.label`, 120, false),
			matchingCount,
			shareOfMatches
		};
	});

	const coverageSource = record(source.coverage, `${path}.coverage`);
	const missingCount = nonNegativeInteger(coverageSource.missingCount, `${path}.coverage.missingCount`);
	if (missingCount !== cohort - comparable) {
		issue(`${path}.coverage.missingCount`, 'must equal cohort minus comparable');
	}

	return {
		id,
		basedOnRevision,
		publishedRevision,
		from,
		to,
		conditions,
		groupBy: enumValue(source.groupBy, `${path}.groupBy`, ['state', 'asset_bucket'] as const),
		metrics,
		changeUnits,
		rows,
		groups,
		counts: { cohort, comparable, matching },
		coverage: {
			status: enumValue(coverageSource.status, `${path}.coverage.status`, ['ready', 'partial'] as const),
			missingCount
		},
		peerRecipe: normalizePeerRecipe(source.peerRecipe, `${path}.peerRecipe`),
		excludedCount: nonNegativeInteger(source.excludedCount, `${path}.excludedCount`),
		definitionHash: string(source.definitionHash, `${path}.definitionHash`, 128, false),
		cohortHash: string(source.cohortHash, `${path}.cohortHash`, 128, false),
		sourceMode: enumValue(source.sourceMode, `${path}.sourceMode`, ['live', 'recorded'] as const),
		sourceAsOf: nullableString(source.sourceAsOf, `${path}.sourceAsOf`, 40),
		retrievedAt: nullableString(source.retrievedAt, `${path}.retrievedAt`, 40),
		release: nullableString(source.release, `${path}.release`, 40),
		releaseGeneration: nullableString(source.releaseGeneration, `${path}.releaseGeneration`, 128)
	};
}

function normalizeAnalysisJson(value: unknown, path: string, depth = 0): unknown {
	if (depth > 18) issue(path, 'is nested too deeply');
	if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
	if (typeof value === 'number') return finiteNumber(value, path);
	if (Array.isArray(value)) {
		return value.map((item, index) => normalizeAnalysisJson(item, `${path}[${index}]`, depth + 1));
	}
	const source = record(value, path);
	return Object.fromEntries(Object.entries(source).map(([key, item]) => [
		key,
		normalizeAnalysisJson(item, `${path}.${key}`, depth + 1)
	]));
}

/** Validate the revisioned analysis envelope and its bounded, deterministic payload. */
export function normalizeAnalysisResult(
	value: unknown,
	path = 'analysisResult'
): WorkspaceAnalysisResult | null {
	if (value === null || value === undefined) return null;
	let encoded: string;
	try {
		encoded = JSON.stringify(value);
	} catch {
		issue(path, 'must be JSON serializable');
	}
	if (encoded.length > WORKSPACE_LIMITS.analysisResultCharacters) {
		issue(path, `must be at most ${WORKSPACE_LIMITS.analysisResultCharacters} serialized characters`);
	}
	const cloned = normalizeAnalysisJson(JSON.parse(encoded), path) as Record<string, unknown>;
	const kind = enumValue(
		cloned.kind,
		`${path}.kind`,
		['cohort_change', 'temporal_pattern', 'financial_composition', 'failure_pattern'] as const
	);
	const id = string(cloned.id, `${path}.id`, 64, false);
	if (!IDENTIFIER.test(id)) issue(`${path}.id`, 'contains unsupported characters');
	const basedOnRevision = nonNegativeInteger(cloned.basedOnRevision, `${path}.basedOnRevision`);
	const publishedRevision = nonNegativeInteger(cloned.publishedRevision, `${path}.publishedRevision`);
	if (publishedRevision <= basedOnRevision) issue(`${path}.publishedRevision`, 'must be later than basedOnRevision');
	const title = string(cloned.title, `${path}.title`, 200, false);

	const populationSource = record(cloned.population, `${path}.population`);
	const analyzedCount = nonNegativeInteger(populationSource.analyzedCount, `${path}.population.analyzedCount`);
	if (kind !== 'failure_pattern' && analyzedCount > WORKSPACE_LIMITS.analysisRows) issue(`${path}.population.analyzedCount`, 'exceeds the browser analysis boundary');
	const population = {
		membershipBasis: enumValue(populationSource.membershipBasis, `${path}.population.membershipBasis`, ['current_workspace_members', 'current_selected_banks', 'current_selected_bank', 'published_failure_and_active_universe'] as const),
		analyzedCount,
		definitionHash: string(populationSource.definitionHash, `${path}.population.definitionHash`, 128, false),
		cohortHash: string(populationSource.cohortHash, `${path}.population.cohortHash`, 128, false),
		peerRecipe: populationSource.peerRecipe === null
			? null
			: normalizePeerRecipe(populationSource.peerRecipe, `${path}.population.peerRecipe`),
		excludedCount: nonNegativeInteger(populationSource.excludedCount, `${path}.population.excludedCount`)
	};
	const lineageSource = record(cloned.lineage, `${path}.lineage`);
	const lineage = {
		sourceMode: enumValue(lineageSource.sourceMode, `${path}.lineage.sourceMode`, ['live', 'recorded'] as const),
		sourceAsOf: nullableString(lineageSource.sourceAsOf, `${path}.lineage.sourceAsOf`, 40),
		retrievedAt: nullableString(lineageSource.retrievedAt, `${path}.lineage.retrievedAt`, 40),
		release: nullableString(lineageSource.release, `${path}.lineage.release`, 40),
		releaseGeneration: nullableString(lineageSource.releaseGeneration, `${path}.lineage.releaseGeneration`, 128)
	};

	if (kind === 'cohort_change') {
		const spec = record(cloned.spec, `${path}.spec`);
		const from = normalizeReportingQuarter(spec.from, `${path}.spec.from`);
		const to = normalizeReportingQuarter(spec.to, `${path}.spec.to`);
		if (from === null || to === null || (compareReportingQuarters(from, to) ?? 0) >= 0) issue(`${path}.spec`, 'from must be earlier than to');
		const metrics = normalizeMetrics(spec.metrics, `${path}.spec.metrics`, WORKSPACE_LIMITS.analysisMetrics);
		if (metrics.length < 1) issue(`${path}.spec.metrics`, 'must contain at least one metric');
		const transition = record(cloned.transition, `${path}.transition`);
		const metricSummaries = array(transition.metrics, `${path}.transition.metrics`);
		const groups = array(transition.groups, `${path}.transition.groups`);
		if (metricSummaries.length !== metrics.length) issue(`${path}.transition.metrics`, 'must match requested metric count');
		if (groups.length > WORKSPACE_LIMITS.analysisGroups) issue(`${path}.transition.groups`, 'contains too many groups');
		return {
			...cloned,
			kind,
			id,
			basedOnRevision,
			publishedRevision,
			title,
			population,
			lineage,
			spec: {
				from,
				to,
				metrics,
				groupBy: enumValue(spec.groupBy, `${path}.spec.groupBy`, ['none', 'state', 'asset_bucket'] as const)
			}
		} as WorkspaceAnalysisResult;
	}

	if (kind === 'temporal_pattern') {
		const spec = record(cloned.spec, `${path}.spec`);
		const metrics = normalizeMetrics(spec.metrics, `${path}.spec.metrics`, 3);
		if (metrics.length < 1) issue(`${path}.spec.metrics`, 'must contain at least one metric');
		const rows = array(cloned.rows, `${path}.rows`);
		if (rows.length > WORKSPACE_LIMITS.analysisRows) issue(`${path}.rows`, 'contains too many rows');
		const rowCerts = new Set<number>();
		for (const [index, row] of rows.entries()) {
			const rowSource = record(row, `${path}.rows[${index}]`);
			const rowCert = cert(rowSource.cert, `${path}.rows[${index}].cert`);
			if (rowCerts.has(rowCert)) issue(`${path}.rows[${index}].cert`, 'must be unique');
			rowCerts.add(rowCert);
			if (array(rowSource.evaluations, `${path}.rows[${index}].evaluations`).length !== metrics.length) {
				issue(`${path}.rows[${index}].evaluations`, 'must match requested metric count');
			}
		}
		const counts = record(cloned.counts, `${path}.counts`);
		const cohort = nonNegativeInteger(counts.cohort, `${path}.counts.cohort`);
		const matched = nonNegativeInteger(counts.matched, `${path}.counts.matched`);
		const notMatched = nonNegativeInteger(counts.notMatched, `${path}.counts.notMatched`);
		const insufficientData = nonNegativeInteger(counts.insufficientData, `${path}.counts.insufficientData`);
		if (cohort !== matched + notMatched + insufficientData) issue(`${path}.counts`, 'must partition the analyzed cohort');
		if (rows.length !== matched) issue(`${path}.rows`, 'must contain every matched bank');
		return {
			...cloned,
			kind,
			id,
			basedOnRevision,
			publishedRevision,
			title,
			population,
			lineage,
			spec: { ...spec, metrics },
			counts: { cohort, matched, notMatched, insufficientData }
		} as WorkspaceAnalysisResult;
	}

	if (kind === 'failure_pattern') {
		const spec = record(cloned.spec, `${path}.spec`);
		const startYear = nonNegativeInteger(spec.startYear, `${path}.spec.startYear`);
		const endYear = nonNegativeInteger(spec.endYear, `${path}.spec.endYear`);
		if (startYear > endYear) issue(`${path}.spec`, 'startYear must not exceed endYear');
		const quarters = nonNegativeInteger(spec.quarters, `${path}.spec.quarters`);
		if (quarters < 4 || quarters > 12) issue(`${path}.spec.quarters`, 'must be from 4 to 12');
		const limit = nonNegativeInteger(spec.limit, `${path}.spec.limit`);
		if (limit < 1 || limit > 100) issue(`${path}.spec.limit`, 'must be from 1 to 100');
		const result = record(cloned.result, `${path}.result`);
		if (result.analysis !== 'historical_failure_pattern_and_current_similarity') {
			issue(`${path}.result.analysis`, 'must identify the deterministic failure-pattern analysis');
		}
		const historical = record(result.historicalCohort, `${path}.result.historicalCohort`);
		const eventStudy = record(result.eventStudy, `${path}.result.eventStudy`);
		const current = record(result.currentAnalogues, `${path}.result.currentAnalogues`);
		if (array(historical.members, `${path}.result.historicalCohort.members`).length > 2_000) issue(`${path}.result.historicalCohort.members`, 'contains too many members');
		if (array(eventStudy.series, `${path}.result.eventStudy.series`).length > 12) issue(`${path}.result.eventStudy.series`, 'contains too many series');
		if (array(current.data, `${path}.result.currentAnalogues.data`).length > 100) issue(`${path}.result.currentAnalogues.data`, 'contains too many analogues');
		return {
			...cloned,
			kind,
			id,
			basedOnRevision,
			publishedRevision,
			title,
			population,
			lineage,
			spec: { startYear, endYear, quarters, limit }
		} as WorkspaceAnalysisResult;
	}

	const spec = record(cloned.spec, `${path}.spec`);
	const memberCerts = normalizeCerts(cloned.memberCerts, `${path}.memberCerts`, WORKSPACE_LIMITS.analysisRows);
	const analysis = record(cloned.analysis, `${path}.analysis`);
	const components = array(analysis.components, `${path}.analysis.components`);
	if (components.length > 20) issue(`${path}.analysis.components`, 'contains too many components');
	return {
		...cloned,
		kind,
		id,
		basedOnRevision,
		publishedRevision,
		title,
		population,
		lineage,
		spec: {
			composition: enumValue(spec.composition, `${path}.spec.composition`, ['asset_mix', 'funding_mix', 'loan_mix'] as const),
			scope: enumValue(spec.scope, `${path}.spec.scope`, ['selected_bank', 'selected_banks', 'current_cohort'] as const),
			cert: spec.cert === null ? null : cert(spec.cert, `${path}.spec.cert`),
			period: normalizeReportingQuarter(spec.period, `${path}.spec.period`),
			compareFrom: spec.compareFrom === null ? null : normalizeReportingQuarter(spec.compareFrom, `${path}.spec.compareFrom`)
		},
		scopeLabel: string(cloned.scopeLabel, `${path}.scopeLabel`, 200, false),
		memberCerts
	} as WorkspaceAnalysisResult;
}

export function normalizeResearchBoardBlockId(value: unknown, path = 'blockId'): string {
	const id = string(value, path, 64, false);
	if (!IDENTIFIER.test(id)) issue(path, 'contains unsupported characters');
	return id;
}

function normalizeBoardCerts(value: unknown, path: string): number[] {
	const values = array(value, path);
	if (values.length < 1 || values.length > WORKSPACE_LIMITS.selectedBanks) {
		issue(path, `must contain from 1 to ${WORKSPACE_LIMITS.selectedBanks} certificate numbers`);
	}
	const normalized = values.map((item, index) => cert(item, `${path}[${index}]`));
	if (new Set(normalized).size !== normalized.length) issue(path, 'must not contain duplicate certificate numbers');
	return normalized;
}

function normalizeBoardMetrics(value: unknown, path: string): ResearchMetric[] {
	const values = array(value, path);
	if (values.length < 1 || values.length > WORKSPACE_LIMITS.visibleMetrics) {
		issue(path, `must contain from 1 to ${WORKSPACE_LIMITS.visibleMetrics} canonical research metrics`);
	}
	const metrics = values.map((item, index) => {
		const metric = string(item, `${path}[${index}]`, 64, false);
		if (!isResearchMetric(metric)) issue(`${path}[${index}]`, 'must be a canonical research metric');
		return metric;
	});
	if (new Set(metrics).size !== metrics.length) issue(path, 'must not contain duplicate metrics');
	return metrics;
}

function normalizeBoardRange(
	fromValue: unknown,
	toValue: unknown,
	path: string
): { from: string; to: string } {
	const from = normalizeReportingQuarter(fromValue, `${path}.from`);
	const to = normalizeReportingQuarter(toValue, `${path}.to`);
	const order = compareReportingQuarters(from, to);
	if (order === null || order > 0) issue(path, 'from must not be after to');
	return { from, to };
}

function normalizeBoardSpecJson(value: unknown, path: string, depth = 0): NormalizedJson {
	if (depth > 10) issue(path, 'is nested too deeply');
	if (value === null || typeof value === 'boolean') return value;
	if (typeof value === 'number') return finiteNumber(value, path);
	if (typeof value === 'string') {
		const normalized = string(value, path, 1_000);
		if (/<\/?[a-z][^>]*>/i.test(normalized)) issue(path, 'must not contain HTML or SVG markup');
		if (/^\s*(?:select|insert|update|delete|drop|alter|create|with)\b/i.test(normalized)) {
			issue(path, 'must not contain SQL');
		}
		return normalized;
	}
	if (Array.isArray(value)) {
		if (value.length > 256) issue(path, 'must contain at most 256 specification items');
		return value.map((item, index) => normalizeBoardSpecJson(item, `${path}[${index}]`, depth + 1));
	}
	const source = record(value, path);
	const entries = Object.entries(source);
	if (entries.length > 64) issue(path, 'must contain at most 64 specification fields');
	return Object.fromEntries(entries.map(([key, item]) => {
		if (!/^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(key)) issue(`${path}.${key}`, 'has an invalid specification field name');
		if (BOARD_FORBIDDEN_SPEC_KEY.test(key)) issue(`${path}.${key}`, 'raw or executable material is not allowed');
		return [key, normalizeBoardSpecJson(item, `${path}.${key}`, depth + 1)];
	}));
}

function positiveInteger(value: unknown, path: string): number {
	const normalized = nonNegativeInteger(value, path);
	if (normalized < 1) issue(path, 'must be a positive safe integer');
	return normalized;
}

function normalizeTemporalPatternPredicate(value: unknown, path: string): NormalizedJson {
	const source = record(value, path);
	const kind = enumValue(source.kind, `${path}.kind`, [
		'direction_count', 'consecutive_streak', 'cumulative_change',
		'change_acceleration', 'threshold_cross'
	] as const);
	if (kind === 'direction_count') {
		onlyKeys(source, path, ['kind', 'direction', 'atLeast']);
		return {
			kind,
			direction: enumValue(source.direction, `${path}.direction`, ['increase', 'decrease'] as const),
			atLeast: positiveInteger(source.atLeast, `${path}.atLeast`)
		};
	}
	if (kind === 'consecutive_streak') {
		onlyKeys(source, path, ['kind', 'direction', 'minimumIntervals']);
		return {
			kind,
			direction: enumValue(source.direction, `${path}.direction`, ['increase', 'decrease'] as const),
			minimumIntervals: positiveInteger(source.minimumIntervals, `${path}.minimumIntervals`)
		};
	}
	if (kind === 'cumulative_change') {
		onlyKeys(source, path, ['kind', 'operator', 'threshold']);
		return {
			kind,
			operator: enumValue(source.operator, `${path}.operator`, ['gt', 'gte', 'lt', 'lte', 'eq'] as const),
			threshold: finiteNumber(source.threshold, `${path}.threshold`)
		};
	}
	if (kind === 'change_acceleration') {
		onlyKeys(source, path, ['kind', 'direction', 'atLeast']);
		return {
			kind,
			direction: enumValue(source.direction, `${path}.direction`, ['accelerating', 'decelerating'] as const),
			atLeast: positiveInteger(source.atLeast, `${path}.atLeast`)
		};
	}
	onlyKeys(source, path, ['kind', 'direction', 'threshold']);
	return {
		kind,
		direction: enumValue(source.direction, `${path}.direction`, ['above', 'below'] as const),
		threshold: finiteNumber(source.threshold, `${path}.threshold`)
	};
}

function normalizeBoardAnalysisSpec(
	kind: (typeof BOARD_ANALYSIS_KINDS)[number],
	value: unknown,
	path: string
): { [key: string]: NormalizedJson } {
	// First apply the generic material/executable guard recursively, then apply
	// the exact deterministic query shape for the referenced analysis kind.
	const guarded = normalizeBoardSpecJson(value, path);
	if (guarded === null || Array.isArray(guarded) || typeof guarded !== 'object') {
		issue(path, 'must be an object');
	}
	const source = record(guarded, path);
	if (kind === 'cohort_change') {
		onlyKeys(source, path, ['from', 'to', 'metrics', 'groupBy']);
		const range = normalizeBoardRange(source.from, source.to, path);
		if (range.from === range.to) issue(path, 'from must be earlier than to');
		return {
			...range,
			metrics: normalizeBoardMetrics(source.metrics, `${path}.metrics`),
			groupBy: enumValue(source.groupBy, `${path}.groupBy`, ['none', 'state', 'asset_bucket'] as const)
		};
	}
	if (kind === 'financial_composition') {
		onlyKeys(source, path, ['composition', 'scope', 'cert', 'period', 'compareFrom']);
		return {
			composition: enumValue(source.composition, `${path}.composition`, ['asset_mix', 'funding_mix', 'loan_mix'] as const),
			scope: enumValue(source.scope, `${path}.scope`, ['selected_bank', 'selected_banks', 'current_cohort'] as const),
			cert: source.cert === null ? null : cert(source.cert, `${path}.cert`),
			period: normalizeReportingQuarter(source.period, `${path}.period`),
			compareFrom: source.compareFrom === null
				? null
				: normalizeReportingQuarter(source.compareFrom, `${path}.compareFrom`)
		};
	}
	if (kind === 'failure_pattern') {
		onlyKeys(source, path, ['startYear', 'endYear', 'quarters', 'limit']);
		const startYear = positiveInteger(source.startYear, `${path}.startYear`);
		const endYear = positiveInteger(source.endYear, `${path}.endYear`);
		if (startYear < 1934 || startYear > 2099) issue(`${path}.startYear`, 'must be from 1934 to 2099');
		if (endYear < 1934 || endYear > 2099) issue(`${path}.endYear`, 'must be from 1934 to 2099');
		if (startYear > endYear || endYear - startYear + 1 > 20) issue(path, 'failure-year range must be ordered and span at most 20 years');
		const quarters = positiveInteger(source.quarters, `${path}.quarters`);
		if (quarters < 4 || quarters > 12) issue(`${path}.quarters`, 'must be from 4 to 12');
		const limit = positiveInteger(source.limit, `${path}.limit`);
		if (limit > 100) issue(`${path}.limit`, 'must be at most 100');
		return { startYear, endYear, quarters, limit };
	}

	onlyKeys(source, path, [
		'metrics', 'periodWindow', 'requiredPeriods', 'minimumObservations',
		'gapPolicy', 'tolerance', 'pattern'
	]);
	const metrics = normalizeBoardMetrics(source.metrics, `${path}.metrics`);
	const periodWindowSource = source.periodWindow === null
		? null
		: record(source.periodWindow, `${path}.periodWindow`);
	let periodWindow: { startPeriod: string; endPeriod: string } | null = null;
	if (periodWindowSource) {
		onlyKeys(periodWindowSource, `${path}.periodWindow`, ['startPeriod', 'endPeriod']);
		const range = normalizeBoardRange(
			periodWindowSource.startPeriod,
			periodWindowSource.endPeriod,
			`${path}.periodWindow`
		);
		periodWindow = { startPeriod: range.from, endPeriod: range.to };
	}
	const requiredPeriods = array(source.requiredPeriods, `${path}.requiredPeriods`).map((period, index) =>
		normalizeReportingQuarter(period, `${path}.requiredPeriods[${index}]`)
	);
	if (requiredPeriods.length > 160) issue(`${path}.requiredPeriods`, 'must contain at most 160 periods');
	if (new Set(requiredPeriods).size !== requiredPeriods.length) issue(`${path}.requiredPeriods`, 'must not contain duplicates');
	if ((periodWindow === null) === (requiredPeriods.length === 0)) {
		issue(path, 'must provide exactly one of periodWindow or requiredPeriods');
	}
	const minimumObservations = positiveInteger(source.minimumObservations, `${path}.minimumObservations`);
	if (minimumObservations < 2) issue(`${path}.minimumObservations`, 'must be at least 2');
	const tolerance = finiteNumber(source.tolerance, `${path}.tolerance`);
	if (tolerance < 0) issue(`${path}.tolerance`, 'must be at least 0');
	return {
		metrics,
		periodWindow,
		requiredPeriods,
		minimumObservations,
		gapPolicy: enumValue(source.gapPolicy, `${path}.gapPolicy`, ['require_complete', 'allow_missing'] as const),
		tolerance,
		pattern: normalizeTemporalPatternPredicate(source.pattern, `${path}.pattern`)
	};
}

/** Validate a content-addressed pointer without admitting its materialized result. */
export function normalizeAnalysisResultRef(
	value: unknown,
	path = 'resultRef'
): AnalysisResultRef {
	const source = record(value, path);
	onlyKeys(source, path, ['version', 'contentHash', 'kind', 'resultId', 'release', 'scope', 'query']);
	if (source.version !== 1) issue(`${path}.version`, 'must be 1');
	const contentHash = string(source.contentHash, `${path}.contentHash`, 71, false);
	if (!CONTENT_HASH.test(contentHash)) issue(`${path}.contentHash`, 'must be a sha256 content hash');
	const kind = enumValue(source.kind, `${path}.kind`, BOARD_ANALYSIS_KINDS);
	const resultId = normalizeResearchBoardBlockId(source.resultId, `${path}.resultId`);

	const releaseSource = record(source.release, `${path}.release`);
	onlyKeys(releaseSource, `${path}.release`, ['sourceMode', 'sourceAsOf', 'release', 'releaseGeneration']);
	const release = {
		sourceMode: enumValue(releaseSource.sourceMode, `${path}.release.sourceMode`, ['live', 'recorded'] as const),
		sourceAsOf: nullableString(releaseSource.sourceAsOf, `${path}.release.sourceAsOf`, 40),
		release: nullableString(releaseSource.release, `${path}.release.release`, 40),
		releaseGeneration: nullableString(releaseSource.releaseGeneration, `${path}.release.releaseGeneration`, 128)
	};

	const scopeSource = record(source.scope, `${path}.scope`);
	onlyKeys(scopeSource, `${path}.scope`, [
		'membershipBasis', 'analyzedCount', 'definitionHash', 'cohortHash', 'excludedCount'
	]);
	const scope = {
		membershipBasis: enumValue(scopeSource.membershipBasis, `${path}.scope.membershipBasis`, [
			'current_workspace_members', 'current_selected_banks', 'current_selected_bank',
			'published_failure_and_active_universe'
		] as const),
		analyzedCount: nonNegativeInteger(scopeSource.analyzedCount, `${path}.scope.analyzedCount`),
		definitionHash: string(scopeSource.definitionHash, `${path}.scope.definitionHash`, 128, false),
		cohortHash: string(scopeSource.cohortHash, `${path}.scope.cohortHash`, 128, false),
		excludedCount: nonNegativeInteger(scopeSource.excludedCount, `${path}.scope.excludedCount`)
	};

	const querySource = record(source.query, `${path}.query`);
	onlyKeys(querySource, `${path}.query`, ['kind', 'spec', 'queryHash']);
	const queryKind = enumValue(querySource.kind, `${path}.query.kind`, BOARD_ANALYSIS_KINDS);
	if (queryKind !== kind) issue(`${path}.query.kind`, 'must match resultRef.kind');
	const spec = normalizeBoardAnalysisSpec(kind, querySource.spec, `${path}.query.spec`);
	const encodedSpec = JSON.stringify(spec);
	if (encodedSpec.length > WORKSPACE_LIMITS.boardSpecCharacters) {
		issue(`${path}.query.spec`, `must be at most ${WORKSPACE_LIMITS.boardSpecCharacters} serialized characters`);
	}
	const queryHash = string(querySource.queryHash, `${path}.query.queryHash`, 71, false);
	if (!CONTENT_HASH.test(queryHash)) issue(`${path}.query.queryHash`, 'must be a sha256 content hash');

	return {
		version: 1,
		contentHash,
		kind,
		resultId,
		release,
		scope,
		query: { kind, spec, queryHash }
	} as AnalysisResultRef;
}

/** Normalize one semantic board block. Unknown/raw fields are rejected, not silently retained. */
export function normalizeResearchBoardBlock(
	value: unknown,
	path = 'block'
): ResearchBoardBlock {
	const source = record(value, path);
	const kind = enumValue(source.kind, `${path}.kind`, BOARD_BLOCK_KINDS);
	const common = {
		id: normalizeResearchBoardBlockId(source.id, `${path}.id`),
		title: string(source.title, `${path}.title`, WORKSPACE_LIMITS.boardBlockTitleLength, false).trim(),
		span: enumValue<ResearchBoardSpan>(source.span, `${path}.span`, BOARD_SPANS)
	};
	if (common.title.length === 0) issue(`${path}.title`, 'must not be empty');

	if (kind === 'history') {
		onlyKeys(source, path, ['id', 'title', 'span', 'kind', 'binding']);
		const binding = record(source.binding, `${path}.binding`);
		onlyKeys(binding, `${path}.binding`, ['certs', 'metrics', 'from', 'to', 'chartKind', 'scale']);
		const range = normalizeBoardRange(binding.from, binding.to, `${path}.binding`);
		return {
			...common,
			kind,
			binding: {
				certs: normalizeBoardCerts(binding.certs, `${path}.binding.certs`),
				metrics: normalizeBoardMetrics(binding.metrics, `${path}.binding.metrics`),
				...range,
				chartKind: enumValue(binding.chartKind, `${path}.binding.chartKind`, ['line', 'area'] as const),
				scale: enumValue(binding.scale, `${path}.binding.scale`, ['value', 'index'] as const)
			}
		};
	}

	if (kind === 'exact_table') {
		onlyKeys(source, path, ['id', 'title', 'span', 'kind', 'binding']);
		const binding = record(source.binding, `${path}.binding`);
		onlyKeys(binding, `${path}.binding`, ['certs', 'metrics', 'from', 'to', 'followCurrent']);
		if (typeof binding.followCurrent !== 'boolean') issue(`${path}.binding.followCurrent`, 'must be a boolean');
		const range = binding.followCurrent
			? { from: null, to: null }
			: normalizeBoardRange(binding.from, binding.to, `${path}.binding`);
		if (binding.followCurrent && (binding.from !== null || binding.to !== null)) {
			issue(`${path}.binding`, 'from and to must be null when followCurrent is true');
		}
		return {
			...common,
			kind,
			binding: {
				certs: normalizeBoardCerts(binding.certs, `${path}.binding.certs`),
				metrics: normalizeBoardMetrics(binding.metrics, `${path}.binding.metrics`),
				...range,
				followCurrent: binding.followCurrent
			}
		};
	}

	if (kind === 'analysis') {
		onlyKeys(source, path, ['id', 'title', 'span', 'kind', 'binding']);
		const binding = record(source.binding, `${path}.binding`);
		onlyKeys(binding, `${path}.binding`, ['resultRef', 'view']);
		const resultRef = normalizeAnalysisResultRef(binding.resultRef, `${path}.binding.resultRef`);
		const compatibleViews = BOARD_ANALYSIS_VIEWS[resultRef.kind as keyof typeof BOARD_ANALYSIS_VIEWS];
		const view = enumValue(binding.view, `${path}.binding.view`, compatibleViews);
		return { ...common, kind, binding: { resultRef, view } };
	}

	if (kind === 'workspace_view') {
		onlyKeys(source, path, ['id', 'title', 'span', 'kind', 'binding']);
		const binding = record(source.binding, `${path}.binding`);
		onlyKeys(binding, `${path}.binding`, ['view']);
		return {
			...common,
			kind,
			binding: {
				view: enumValue<ResearchWorkspaceView>(binding.view, `${path}.binding.view`, BOARD_WORKSPACE_VIEWS)
			}
		};
	}

	onlyKeys(source, path, ['id', 'title', 'span', 'kind', 'text', 'referenceBlockIds']);
	const text = string(source.text, `${path}.text`, WORKSPACE_LIMITS.boardTakeawayLength).trim();
	if (/<\/?(?:script|style|svg|iframe|object|embed|math)\b/i.test(text)) {
		issue(`${path}.text`, 'must be plain text, not HTML or SVG');
	}
	const references = array(source.referenceBlockIds, `${path}.referenceBlockIds`).map((item, index) =>
		normalizeResearchBoardBlockId(item, `${path}.referenceBlockIds[${index}]`)
	);
	if (references.length > WORKSPACE_LIMITS.boardBlocks) issue(`${path}.referenceBlockIds`, 'contains too many references');
	if (new Set(references).size !== references.length) issue(`${path}.referenceBlockIds`, 'must not contain duplicates');
	return { ...common, kind, text, referenceBlockIds: references };
}

export function normalizeResearchBoard(value: unknown, path = 'board'): ResearchBoard {
	const source = record(value, path);
	onlyKeys(source, path, ['focusedBlockId', 'blocks']);
	const values = array(source.blocks, `${path}.blocks`);
	if (values.length > WORKSPACE_LIMITS.boardBlocks) {
		issue(`${path}.blocks`, `must contain at most ${WORKSPACE_LIMITS.boardBlocks} blocks`);
	}
	const blocks = values.map((item, index) => normalizeResearchBoardBlock(item, `${path}.blocks[${index}]`));
	const ids = new Set<string>();
	for (const [index, block] of blocks.entries()) {
		if (ids.has(block.id)) issue(`${path}.blocks[${index}].id`, 'must be unique');
		ids.add(block.id);
	}
	for (const [index, block] of blocks.entries()) {
		if (block.kind !== 'takeaway') continue;
		for (const [referenceIndex, referenceId] of block.referenceBlockIds.entries()) {
			if (referenceId === block.id) {
				issue(`${path}.blocks[${index}].referenceBlockIds[${referenceIndex}]`, 'must not reference itself');
			}
			if (!ids.has(referenceId)) {
				issue(`${path}.blocks[${index}].referenceBlockIds[${referenceIndex}]`, 'must reference an existing block');
			}
		}
	}
	const focusedBlockId = source.focusedBlockId === null
		? null
		: normalizeResearchBoardBlockId(source.focusedBlockId, `${path}.focusedBlockId`);
	if (focusedBlockId !== null && !ids.has(focusedBlockId)) {
		issue(`${path}.focusedBlockId`, 'must reference an existing block or be null');
	}
	return { focusedBlockId, blocks };
}

/** Validate an absolute reorder: every current block ID must appear exactly once. */
export function normalizeResearchBoardOrder(
	value: unknown,
	board: ResearchBoard,
	path = 'orderedBlockIds'
): string[] {
	const values = array(value, path).map((item, index) => normalizeResearchBoardBlockId(item, `${path}[${index}]`));
	if (values.length !== board.blocks.length) issue(path, 'must contain every current block ID exactly once');
	if (new Set(values).size !== values.length) issue(path, 'must contain every current block ID exactly once');
	const currentIds = new Set(board.blocks.map((block) => block.id));
	if (values.some((id) => !currentIds.has(id))) issue(path, 'must contain every current block ID exactly once');
	return values;
}

export function normalizeResearchBoardFocus(
	value: unknown,
	board: ResearchBoard,
	path = 'focusedBlockId'
): string | null {
	if (value === null) return null;
	const id = normalizeResearchBoardBlockId(value, path);
	if (!board.blocks.some((block) => block.id === id)) issue(path, 'must reference an existing block or be null');
	return id;
}

export function normalizeWorkspaceState(value: unknown, path = 'workspace'): WorkspaceState {
	const source = record(value, path);
	if (source.version !== WORKSPACE_SCHEMA_VERSION) {
		issue(`${path}.version`, `must be ${WORKSPACE_SCHEMA_VERSION}`);
	}
	const selectedCerts = normalizeCerts(source.selectedCerts, `${path}.selectedCerts`, WORKSPACE_LIMITS.selectedBanks);
	const excludedCerts = normalizeCerts(source.excludedCerts, `${path}.excludedCerts`, WORKSPACE_LIMITS.excludedBanks);
	const overlap = selectedCerts.find((selected) => excludedCerts.includes(selected));
	if (overlap !== undefined) issue(path, `certificate ${overlap} cannot be both selected and excluded`);
	const legacyPeriod = normalizePeriod(source.period, `${path}.period`);
	let asOfQuarter = normalizeReportingQuarter(source.asOfQuarter, `${path}.asOfQuarter`, { nullable: true });
	let chartHistory = normalizeChartHistory(source.chartHistory, `${path}.chartHistory`);
	let comparison = normalizeComparisonSelection(
		source.comparison,
		asOfQuarter,
		`${path}.comparison`
	);
	// During the schema-2 transition, some callers still construct a current
	// state by replacing only the legacy `period` field. Honor that value only
	// when every canonical period field is still at its empty default.
	const canonicalPeriodsAreEmpty = asOfQuarter === null
		&& chartHistory.from === null
		&& chartHistory.to === null
		&& comparison.mode === 'prior-quarter'
		&& comparison.rangeStartQuarter === null
		&& comparison.customQuarter === null;
	if (canonicalPeriodsAreEmpty) {
		if (legacyPeriod.kind === 'range') {
			const from = normalizeReportingQuarter(legacyPeriod.from, `${path}.period.from`);
			const to = normalizeReportingQuarter(legacyPeriod.to, `${path}.period.to`);
			asOfQuarter = to;
			chartHistory = { from, to };
			comparison = resolvedWorkspaceComparison(asOfQuarter, 'range-start', from, null);
		} else if (legacyPeriod.quarter !== null) {
			asOfQuarter = normalizeReportingQuarter(legacyPeriod.quarter, `${path}.period.quarter`);
			comparison = resolvedWorkspaceComparison(asOfQuarter, 'prior-quarter', null, null);
		}
	}
	// Replace the compatibility field with a deterministic projection of the
	// canonical schema-2 period fields.
	const period: SelectedPeriod = chartHistory.from !== null && chartHistory.to !== null
		? { kind: 'range', from: chartHistory.from, to: chartHistory.to }
		: { kind: 'quarter', quarter: asOfQuarter };
	return {
		version: WORKSPACE_SCHEMA_VERSION,
		revision: nonNegativeInteger(source.revision, `${path}.revision`),
		question: string(source.question, `${path}.question`, WORKSPACE_LIMITS.questionLength).trim(),
		filters: normalizeFilters(source.filters, `${path}.filters`),
		screenView: normalizeScreenView(source.screenView, `${path}.screenView`),
		results: normalizeResults(source.results, `${path}.results`),
		activeBank: source.activeBank === null ? null : cert(source.activeBank, `${path}.activeBank`),
		selectedCerts,
		excludedCerts,
		peerRecipe: normalizePeerRecipe(source.peerRecipe, `${path}.peerRecipe`),
		asOfQuarter,
		comparison,
		chartHistory,
		period,
		charts: normalizeCharts(source.charts, `${path}.charts`),
		activePanel: enumValue<WorkspacePanel>(source.activePanel, `${path}.activePanel`, PANELS),
		depth: enumValue<WorkspaceDepth>(source.depth, `${path}.depth`, DEPTHS),
		activeMetric: normalizeActiveMetric(source.activeMetric, `${path}.activeMetric`),
		mapSelection: normalizeMapSelection(source.mapSelection, `${path}.mapSelection`),
		cohortTrendResult: normalizeCohortTrendResult(
			source.cohortTrendResult ?? null,
			`${path}.cohortTrendResult`
		),
		analysisResult: normalizeAnalysisResult(
			source.analysisResult ?? null,
			`${path}.analysisResult`
		),
		board: normalizeResearchBoard(
			source.board ?? { focusedBlockId: null, blocks: [] },
			`${path}.board`
		),
		findings: normalizeFindings(source.findings, `${path}.findings`),
		watchlistDesired: normalizeWatchlistEntries(source.watchlistDesired, `${path}.watchlistDesired`)
	};
}
