import type { Institution } from '$lib/types';
import type { ResearchBoardBlock, ResearchWorkspaceView } from '$lib/workspace/types';
import type { Board } from '$lib/atlas/board/board.svelte';
import type { BlockLayoutOverride } from '$lib/atlas/board/layout';
import {
	metricChange,
	metricSeries,
	metricValue,
	researchMetricDefinition,
	type ResearchMetric,
	yearAgo
} from './metrics';
import { cohortBand, cohortValues, effective, followsWorkspace, percentileOf } from '$lib/atlas/board/views/util';

export const ATLAS_STRUCTURED_READ_MAX_PAGE_SIZE = 200;

export interface AtlasStructuredReadPageInput {
	offset?: number;
	limit?: number;
}

export interface AtlasStructuredReadPage {
	offset: number;
	limit: number;
	total: number;
	returned: number;
	hasMore: boolean;
	nextOffset: number | null;
}

export interface AtlasStructuredReadContext {
	sourceAsOf?: string | null;
	retrievedAt?: string | null;
	release?: string | null;
	releaseGeneration?: string | null;
}

export interface AtlasStructuredReadSource {
	dataset: string;
	sourceUrl: string;
	grain: string;
	derivation: string | null;
	sourceAsOf: string | null;
	retrievedAt: string | null;
	release: string | null;
	releaseGeneration: string | null;
}

export interface AtlasMetricDescriptor {
	id: ResearchMetric;
	label: string;
	shortLabel: string;
	unit: 'usd_thousands' | 'percent' | 'count';
	sourceField: string;
	description: string;
	direction: 'higher' | 'lower' | 'neutral';
	changeUnit: 'percent_change' | 'percentage_points' | 'absolute_change';
}

export interface AtlasStructuredReadAnchors {
	certs: number[];
	metrics: ResearchMetric[];
	asOf: string;
	compareWith: string;
	from: string;
	to: string;
	quarters: string[];
	pinned: boolean;
}

export type AtlasStructuredViewData =
	| {
		kind: 'history';
		scale: 'value' | 'index';
		presentation: 'primary' | 'multiples';
		primaryMetric: ResearchMetric;
		observations: Array<{ cert: number; name: string; state: string | null; metric: ResearchMetric; period: string; value: number | null }>;
		peerBand: Array<{ period: string; p25: number | null; median: number | null; p75: number | null }> | null;
	}
	| {
		kind: 'exact_table';
		orientation: 'periods' | 'institutions';
		rows: Array<
			| { period: string; cert: number; name: string; values: Partial<Record<ResearchMetric, number | null>> }
			| { cert: number; name: string; state: string | null; values: Partial<Record<ResearchMetric, number | null>>; changes: Partial<Record<ResearchMetric, ReturnType<typeof metricChange>>> }
		>;
	}
	| {
		kind: 'comparison_matrix';
		orientation: 'measures' | 'institutions';
		focusCert: number | null;
		rows: Array<Record<string, unknown>>;
	}
	| {
		kind: 'peer_distribution';
		focusCert: number | null;
		activeMetric: ResearchMetric;
		summaries: Array<{
			metric: ResearchMetric;
			bankValue: number | null;
			p25: number | null;
			median: number | null;
			p75: number | null;
			percentile: number | null;
			rank: number | null;
			peerCount: number;
			change: ReturnType<typeof metricChange>;
		}>;
		points: Array<{ cert: number; name: string; state: string | null; value: number }>;
	}
	| {
		kind: 'metric_relationship';
		xMetric: ResearchMetric;
		yMetric: ResearchMetric;
		correlation: number | null;
		points: Array<{ cert: number; name: string; state: string | null; x: number; y: number; selected: boolean }>;
	}
	| {
		kind: 'headquarters_geography';
		activeMetric: ResearchMetric;
		mode: 'count' | 'assets' | 'median';
		states: Array<{ state: string; bankCount: number; totalAssets: number; metricMedian: number | null; metricObservationCount: number; selected: boolean }>;
	}
	| {
		kind: 'change_attribution';
		cert: number | null;
		name: string | null;
		bridge: 'assets' | 'funding' | 'quarterlyNetIncome' | 'loanToDeposit';
		comparison: { status: string; isConsecutiveQuarter: boolean; message: string | null } | null;
		values: { from: { period: string; value: number }; to: { period: string; value: number }; totalChange: number; unit: string } | null;
		components: Array<{ key: string; label: string; change: number; availability: string }>;
		residual: number | null;
		dataCoverage: number | null;
		method: string | null;
		reconciliation: string | null;
	}
	| {
		kind: 'economic_context';
		series: Array<{ id: string; title: string; units: string; period: string; value: number | null }>;
	}
	| {
		kind: 'bank_context';
		bank: Institution | null;
	}
	| {
		kind: 'takeaway';
		text: string;
		referenceBlockIds: string[];
	}
	| {
		kind: 'analysis';
		resultId: string;
		resultKind: string;
		view: string;
	};

export interface AtlasStructuredReadResult {
	block: {
		id: string;
		title: string;
		kind: ResearchBoardBlock['kind'];
		view: ResearchWorkspaceView | string | null;
	};
	anchors: AtlasStructuredReadAnchors;
	metrics: AtlasMetricDescriptor[];
	page: AtlasStructuredReadPage;
	sources: AtlasStructuredReadSource[];
	data: AtlasStructuredViewData;
}

export interface ReadAtlasStructuredViewOptions {
	board: Board;
	block: ResearchBoardBlock;
	page?: AtlasStructuredReadPageInput;
	fetcher?: typeof fetch;
	signal?: AbortSignal;
	context?: AtlasStructuredReadContext;
}

export class AtlasStructuredReadError extends Error {
	readonly code: 'invalid_page' | 'unsupported_view' | 'upstream_unavailable' | 'cancelled';
	readonly retryable: boolean;

	constructor(code: AtlasStructuredReadError['code'], message: string, retryable = false) {
		super(message);
		this.name = 'AtlasStructuredReadError';
		this.code = code;
		this.retryable = retryable;
	}
}

type ReadOverride = BlockLayoutOverride & {
	xMetric?: ResearchMetric;
	yMetric?: ResearchMetric;
	geographyMode?: 'count' | 'assets' | 'median';
	attributionMode?: 'assets' | 'funding' | 'quarterlyNetIncome' | 'loanToDeposit';
};

interface AttributionBridge {
	metric: string;
	unit: string;
	from: { repdte: string; value: number };
	to: { repdte: string; value: number };
	totalChange: number;
	contributions: Array<{ key: string; label: string; change: number; availability: string }>;
	residual: number;
	dataCoverage: number;
	method: string;
	reconciliation: string;
}

interface AttributionBrief {
	bank?: { name?: string };
	comparison: { status: string; isConsecutiveQuarter: boolean; message: string | null };
	bridges: Record<string, AttributionBridge> | null;
}

interface MacroSeriesResponse {
	series_id?: string;
	title: string;
	units: string;
	data: Array<{ date: string; value: number }>;
}

const BANK_SOURCE_URL = 'https://banks.data.fdic.gov/docs/';
const MACRO_SOURCE_URL = '/data-and-methods#macroeconomic-series';
const ECONOMY_SERIES = new Set([
	'UST10Y2Y', 'BLS_UNRATE', 'FRB_FEDFUNDS', 'UST2Y', 'UST10Y', 'BLS_CPI_YOY',
	'FRB_H8_BANK_CREDIT', 'FRB_H8_LOANS_LEASES', 'FRB_H8_DEPOSITS',
	'FRB_H8_REAL_ESTATE', 'FRB_H8_CI_LOANS', 'FRB_H8_CRE', 'FRB_H8_CONSUMER'
]);

function checkCancelled(signal?: AbortSignal) {
	if (signal?.aborted) throw new AtlasStructuredReadError('cancelled', 'The structured view read was cancelled.');
}

function normalizePage(input: AtlasStructuredReadPageInput | undefined): { offset: number; limit: number } {
	const offset = input?.offset ?? 0;
	const limit = input?.limit ?? 100;
	if (!Number.isInteger(offset) || offset < 0) {
		throw new AtlasStructuredReadError('invalid_page', 'offset must be a non-negative integer.');
	}
	if (!Number.isInteger(limit) || limit < 1 || limit > ATLAS_STRUCTURED_READ_MAX_PAGE_SIZE) {
		throw new AtlasStructuredReadError('invalid_page', `limit must be an integer from 1 to ${ATLAS_STRUCTURED_READ_MAX_PAGE_SIZE}.`);
	}
	return { offset, limit };
}

function paginate<T>(rows: readonly T[], input: AtlasStructuredReadPageInput | undefined): { rows: T[]; page: AtlasStructuredReadPage } {
	const { offset, limit } = normalizePage(input);
	const selected = rows.slice(offset, offset + limit);
	const nextOffset = offset + selected.length < rows.length ? offset + selected.length : null;
	return {
		rows: selected,
		page: { offset, limit, total: rows.length, returned: selected.length, hasMore: nextOffset != null, nextOffset }
	};
}

function source(context: AtlasStructuredReadContext | undefined, sourceAsOf: string | null, input: Pick<AtlasStructuredReadSource, 'dataset' | 'sourceUrl' | 'grain' | 'derivation'>): AtlasStructuredReadSource {
	return {
		...input,
		sourceAsOf: context?.sourceAsOf ?? sourceAsOf,
		retrievedAt: context?.retrievedAt ?? null,
		release: context?.release ?? null,
		releaseGeneration: context?.releaseGeneration ?? null
	};
}

function fdicSource(context: AtlasStructuredReadContext | undefined, sourceAsOf: string | null, grain: string, derivation: string | null): AtlasStructuredReadSource {
	return source(context, sourceAsOf, { dataset: 'FDIC BankFind Suite', sourceUrl: BANK_SOURCE_URL, grain, derivation });
}

function descriptor(metric: ResearchMetric): AtlasMetricDescriptor {
	const definition = researchMetricDefinition(metric);
	return {
		id: metric,
		label: definition.label,
		shortLabel: definition.shortLabel,
		unit: definition.unit,
		sourceField: definition.source,
		description: definition.description,
		direction: definition.direction,
		changeUnit: definition.change
	};
}

function median(values: readonly number[]): number | null {
	if (!values.length) return null;
	const sorted = [...values].sort((a, b) => a - b);
	const middle = Math.floor(sorted.length / 2);
	return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function quantile(sorted: readonly number[], p: number): number | null {
	if (!sorted.length) return null;
	const index = (sorted.length - 1) * p;
	const low = Math.floor(index);
	const high = Math.ceil(index);
	return sorted[low] + (sorted[high] - sorted[low]) * (index - low);
}

function rankOf(values: readonly number[], value: number, higherIsBetter: boolean): number {
	return [...values].sort((a, b) => (higherIsBetter ? b - a : a - b)).findIndex((candidate) => candidate === value) + 1;
}

function bankName(board: Board, cert: number): string {
	return board.data.institutions[cert]?.name ?? `Certificate ${cert}`;
}

function bankState(board: Board, cert: number): string | null {
	return board.data.institutions[cert]?.state ?? null;
}

function activeMetric(board: Board, metrics: readonly ResearchMetric[]): ResearchMetric {
	return metrics.includes(board.activeMetric) ? board.activeMetric : metrics[0] ?? board.activeMetric;
}

function blockView(block: ResearchBoardBlock): string | null {
	if (block.kind === 'workspace_view') return block.binding.view;
	if (block.kind === 'analysis') return block.binding.view;
	return block.kind;
}

function readHistory(board: Board, block: ResearchBoardBlock, pageInput: AtlasStructuredReadPageInput | undefined) {
	const anchors = effective(board, block);
	const override = board.overrides[block.id] as ReadOverride | undefined;
	const scale = block.kind === 'history' ? block.binding.scale : 'value';
	const presentation: 'primary' | 'multiples' = override?.presentation === 'multiples' && anchors.metrics.length > 1 ? 'multiples' : 'primary';
	const primaryMetric = activeMetric(board, anchors.metrics);
	const visibleMetrics = presentation === 'multiples' ? anchors.metrics : [primaryMetric];
	const observations: Array<{ cert: number; name: string; state: string | null; metric: ResearchMetric; period: string; value: number | null }> = [];
	for (const metric of visibleMetrics) {
		for (const cert of anchors.certs) {
			let values = metricSeries(metric, board.data.rows[cert], anchors.quarters, board.data.institutions[cert]);
			if (scale === 'index') {
				const base = values.find((value) => value != null) ?? null;
				values = values.map((value) => value == null || base == null || base === 0 ? null : (value / base) * 100);
			}
			anchors.quarters.forEach((period, index) => observations.push({
				cert,
				name: bankName(board, cert),
				state: bankState(board, cert),
				metric,
				period,
				value: values[index] ?? null
			}));
		}
	}
	const paged = paginate(observations, pageInput);
	const band = scale === 'value' && board.data.cohort.length >= 5 ? cohortBand(board, primaryMetric, anchors.quarters) : null;
	return {
		anchors,
		page: paged.page,
		data: {
			kind: 'history' as const,
			scale,
			presentation,
			primaryMetric,
			observations: paged.rows,
			peerBand: band ? anchors.quarters.map((period, index) => ({ period, p25: band.lo[index] ?? null, median: band.median[index] ?? null, p75: band.hi[index] ?? null })) : null
		}
	};
}

function readExactTable(board: Board, block: ResearchBoardBlock, pageInput: AtlasStructuredReadPageInput | undefined) {
	const anchors = effective(board, block);
	const followsCurrent = block.kind !== 'exact_table' || followsWorkspace(board, block) || block.binding.followCurrent;
	if (anchors.certs.length === 1 && !followsCurrent) {
		const cert = anchors.certs[0];
		const rows = [...anchors.quarters].reverse().map((period) => ({
			period,
			cert,
			name: bankName(board, cert),
			values: Object.fromEntries(anchors.metrics.map((metric) => [metric, metricValue(metric, board.data.rows[cert], period, board.data.institutions[cert])])) as Partial<Record<ResearchMetric, number | null>>
		}));
		const paged = paginate(rows, pageInput);
		return { anchors, page: paged.page, data: { kind: 'exact_table' as const, orientation: 'periods' as const, rows: paged.rows } };
	}
	const rows = anchors.certs.map((cert) => {
		const values = Object.fromEntries(anchors.metrics.map((metric) => [metric, metricValue(metric, board.data.rows[cert], anchors.asOf, board.data.institutions[cert])])) as Partial<Record<ResearchMetric, number | null>>;
		return {
			cert,
			name: bankName(board, cert),
			state: bankState(board, cert),
			values,
			changes: Object.fromEntries(anchors.metrics.map((metric) => [metric, metricChange(metric, values[metric] ?? null, metricValue(metric, board.data.rows[cert], anchors.compareWith, board.data.institutions[cert]))])) as Partial<Record<ResearchMetric, ReturnType<typeof metricChange>>>
		};
	});
	const paged = paginate(rows, pageInput);
	return { anchors, page: paged.page, data: { kind: 'exact_table' as const, orientation: 'institutions' as const, rows: paged.rows } };
}

function readComparisonMatrix(board: Board, block: ResearchBoardBlock, pageInput: AtlasStructuredReadPageInput | undefined) {
	const anchors = effective(board, block);
	const focusCert = board.state.activeBank && anchors.certs.includes(board.state.activeBank) ? board.state.activeBank : anchors.certs[0] ?? null;
	if (anchors.certs.length <= 1) {
		const rows = anchors.metrics.map((metric) => {
			const definition = researchMetricDefinition(metric);
			const current = focusCert == null ? null : metricValue(metric, board.data.rows[focusCert], anchors.asOf, board.data.institutions[focusCert]);
			const peers = cohortValues(board, metric, anchors.asOf).map((row) => row.value);
			const higherIsBetter = definition.direction !== 'lower';
			return {
				metric,
				value: current,
				change: metricChange(metric, current, focusCert == null ? null : metricValue(metric, board.data.rows[focusCert], anchors.compareWith, board.data.institutions[focusCert])),
				yearOverYearChange: metricChange(metric, current, focusCert == null ? null : metricValue(metric, board.data.rows[focusCert], yearAgo(anchors.asOf), board.data.institutions[focusCert])),
				peerMedian: median(peers),
				peerCount: peers.length,
				percentile: current != null && peers.length >= 5 ? percentileOf(peers, current, higherIsBetter) : null,
				rank: current != null && peers.length >= 5 ? rankOf([...peers, current], current, higherIsBetter) : null
			};
		});
		const paged = paginate(rows, pageInput);
		return { anchors, page: paged.page, data: { kind: 'comparison_matrix' as const, orientation: 'measures' as const, focusCert, rows: paged.rows } };
	}
	const rows = anchors.certs.map((cert) => ({
		cert,
		name: bankName(board, cert),
		state: bankState(board, cert),
		values: Object.fromEntries(anchors.metrics.map((metric) => [metric, metricValue(metric, board.data.rows[cert], anchors.asOf, board.data.institutions[cert])])),
		changes: Object.fromEntries(anchors.metrics.map((metric) => {
			const current = metricValue(metric, board.data.rows[cert], anchors.asOf, board.data.institutions[cert]);
			return [metric, metricChange(metric, current, metricValue(metric, board.data.rows[cert], anchors.compareWith, board.data.institutions[cert]))];
		}))
	}));
	const paged = paginate(rows, pageInput);
	return { anchors, page: paged.page, data: { kind: 'comparison_matrix' as const, orientation: 'institutions' as const, focusCert, rows: paged.rows } };
}

function readPeerDistribution(board: Board, block: ResearchBoardBlock, pageInput: AtlasStructuredReadPageInput | undefined) {
	const anchors = effective(board, block);
	const focusCert = board.state.activeBank && anchors.certs.includes(board.state.activeBank) ? board.state.activeBank : anchors.certs[0] ?? null;
	const primaryMetric = activeMetric(board, anchors.metrics);
	const summaries = anchors.metrics.map((metric) => {
		const definition = researchMetricDefinition(metric);
		const values = cohortValues(board, metric, anchors.asOf).map((row) => row.value).sort((a, b) => a - b);
		const current = focusCert == null ? null : metricValue(metric, board.data.rows[focusCert], anchors.asOf, board.data.institutions[focusCert]);
		const higherIsBetter = definition.direction !== 'lower';
		return {
			metric,
			bankValue: current,
			p25: quantile(values, 0.25),
			median: quantile(values, 0.5),
			p75: quantile(values, 0.75),
			percentile: current != null && values.length >= 5 ? percentileOf(values, current, higherIsBetter) : null,
			rank: current != null && values.length >= 5 ? rankOf([...values, current], current, higherIsBetter) : null,
			peerCount: values.length,
			change: metricChange(metric, current, focusCert == null ? null : metricValue(metric, board.data.rows[focusCert], anchors.compareWith, board.data.institutions[focusCert]))
		};
	});
	const points = cohortValues(board, primaryMetric, anchors.asOf).map(({ cert, value }) => ({ cert, name: bankName(board, cert), state: bankState(board, cert), value }));
	const paged = paginate(points, pageInput);
	return { anchors, page: paged.page, data: { kind: 'peer_distribution' as const, focusCert, activeMetric: primaryMetric, summaries, points: paged.rows } };
}

function correlation(points: ReadonlyArray<{ x: number; y: number }>): number | null {
	if (points.length < 8) return null;
	const meanX = points.reduce((sum, point) => sum + point.x, 0) / points.length;
	const meanY = points.reduce((sum, point) => sum + point.y, 0) / points.length;
	let cross = 0;
	let squareX = 0;
	let squareY = 0;
	for (const point of points) {
		cross += (point.x - meanX) * (point.y - meanY);
		squareX += (point.x - meanX) ** 2;
		squareY += (point.y - meanY) ** 2;
	}
	return squareX && squareY ? cross / Math.sqrt(squareX * squareY) : null;
}

function readRelationship(board: Board, block: ResearchBoardBlock, pageInput: AtlasStructuredReadPageInput | undefined) {
	const anchors = effective(board, block);
	const override = board.overrides[block.id] as ReadOverride | undefined;
	const yMetric = override?.yMetric ?? activeMetric(board, anchors.metrics);
	const xMetric = override?.xMetric ?? anchors.metrics.find((metric) => metric !== yMetric) ?? anchors.metrics[1] ?? 'asset';
	const universe = [...new Set([...board.data.cohort, ...anchors.certs])];
	const points = universe.flatMap((cert) => {
		const x = metricValue(xMetric, board.data.rows[cert], anchors.asOf, board.data.institutions[cert]);
		const y = metricValue(yMetric, board.data.rows[cert], anchors.asOf, board.data.institutions[cert]);
		return x == null || y == null ? [] : [{ cert, name: bankName(board, cert), state: bankState(board, cert), x, y, selected: anchors.certs.includes(cert) }];
	});
	const paged = paginate(points, pageInput);
	return { anchors, page: paged.page, data: { kind: 'metric_relationship' as const, xMetric, yMetric, correlation: correlation(points), points: paged.rows } };
}

function readGeography(board: Board, block: ResearchBoardBlock, pageInput: AtlasStructuredReadPageInput | undefined) {
	const anchors = effective(board, block);
	const override = board.overrides[block.id] as ReadOverride | undefined;
	const metric = activeMetric(board, anchors.metrics);
	const mode = override?.geographyMode ?? 'count';
	const selectedStates = new Set(anchors.certs.map((cert) => bankState(board, cert)).filter((value): value is string => Boolean(value)));
	const grouped = new Map<string, { count: number; assets: number; values: number[] }>();
	for (const cert of board.data.cohort) {
		const state = bankState(board, cert);
		if (!state) continue;
		const group = grouped.get(state) ?? { count: 0, assets: 0, values: [] };
		group.count += 1;
		group.assets += board.data.institutions[cert]?.total_assets ?? 0;
		const value = metricValue(metric, board.data.rows[cert], anchors.asOf, board.data.institutions[cert]);
		if (value != null) group.values.push(value);
		grouped.set(state, group);
	}
	const states = [...grouped.entries()].map(([state, group]) => ({
		state,
		bankCount: group.count,
		totalAssets: group.assets,
		metricMedian: median(group.values),
		metricObservationCount: group.values.length,
		selected: selectedStates.has(state)
	})).sort((a, b) => b.bankCount - a.bankCount || a.state.localeCompare(b.state));
	const paged = paginate(states, pageInput);
	return { anchors, page: paged.page, data: { kind: 'headquarters_geography' as const, activeMetric: metric, mode, states: paged.rows } };
}

async function readAttribution(board: Board, block: ResearchBoardBlock, pageInput: AtlasStructuredReadPageInput | undefined, fetcher: typeof fetch, signal?: AbortSignal) {
	const anchors = effective(board, block);
	const override = board.overrides[block.id] as ReadOverride | undefined;
	const cert = board.state.activeBank && anchors.certs.includes(board.state.activeBank) ? board.state.activeBank : anchors.certs[0] ?? null;
	const bridgeName = override?.attributionMode ?? 'assets';
	if (cert == null) {
		const paged = paginate([], pageInput);
		return { anchors, page: paged.page, data: { kind: 'change_attribution' as const, cert: null, name: null, bridge: bridgeName, comparison: null, values: null, components: [], residual: null, dataCoverage: null, method: null, reconciliation: null } };
	}
	checkCancelled(signal);
	const response = await fetcher(`/api/v1/banks/${cert}/quarter-brief?from=${anchors.compareWith}&to=${anchors.asOf}`, { signal });
	if (!response.ok) throw new AtlasStructuredReadError('upstream_unavailable', `Change attribution is unavailable (HTTP ${response.status}).`, response.status >= 500);
	const brief = await response.json() as AttributionBrief;
	checkCancelled(signal);
	const bridge = brief.bridges?.[bridgeName] ?? null;
	const components = [...(bridge?.contributions ?? [])].sort((a, b) => Math.abs(b.change) - Math.abs(a.change));
	const paged = paginate(components, pageInput);
	return {
		anchors,
		page: paged.page,
		data: {
			kind: 'change_attribution' as const,
			cert,
			name: brief.bank?.name ?? bankName(board, cert),
			bridge: bridgeName,
			comparison: brief.comparison,
			values: bridge ? { from: { period: bridge.from.repdte, value: bridge.from.value }, to: { period: bridge.to.repdte, value: bridge.to.value }, totalChange: bridge.totalChange, unit: bridge.unit } : null,
			components: paged.rows,
			residual: bridge?.residual ?? null,
			dataCoverage: bridge?.dataCoverage ?? null,
			method: bridge?.method ?? null,
			reconciliation: bridge?.reconciliation ?? null
		}
	};
}

function economyRange(board: Board, anchors: AtlasStructuredReadAnchors): { from: string; to: string; quarters: string[] } {
	if (board.eventTime) {
		return { from: '2006-01-01', to: '2012-12-31', quarters: Array.from({ length: 28 }, (_, index) => `${2006 + Math.floor(index / 4)}${['0331', '0630', '0930', '1231'][index % 4]}`) };
	}
	const first = anchors.quarters[0] ?? anchors.from;
	const last = anchors.quarters.at(-1) ?? anchors.to;
	return { from: `${Number(first.slice(0, 4)) - 1}-01-01`, to: `${last.slice(0, 4)}-${last.slice(4, 6)}-${last.slice(6, 8)}`, quarters: anchors.quarters };
}

function macroQuarter(date: string): string {
	const year = date.slice(0, 4);
	const month = Number(date.slice(5, 7));
	return `${year}${['0331', '0630', '0930', '1231'][Math.ceil(month / 3) - 1]}`;
}

async function readEconomy(board: Board, block: ResearchBoardBlock, pageInput: AtlasStructuredReadPageInput | undefined, fetcher: typeof fetch, signal?: AbortSignal) {
	const anchors = effective(board, block);
	const override = board.overrides[block.id] as ReadOverride | undefined;
	const configured = (override?.series ?? []).filter((id) => ECONOMY_SERIES.has(id)).slice(0, 3);
	const ids = configured.length ? configured : ['UST10Y2Y', 'BLS_UNRATE'];
	const range = economyRange(board, anchors);
	const responses = await Promise.all(ids.map(async (id) => {
		checkCancelled(signal);
		const response = await fetcher(`/api/v1/macro/${id}?from=${range.from}&to=${range.to}&limit=5000`, { signal });
		if (!response.ok) throw new AtlasStructuredReadError('upstream_unavailable', `${id} is unavailable (HTTP ${response.status}).`, response.status >= 500);
		return { id, body: await response.json() as MacroSeriesResponse };
	}));
	checkCancelled(signal);
	const series = responses.flatMap(({ id, body }) => {
		const buckets = new Map<string, number[]>();
		for (const observation of body.data) {
			const quarter = macroQuarter(observation.date);
			const values = buckets.get(quarter) ?? [];
			values.push(observation.value);
			buckets.set(quarter, values);
		}
		return range.quarters.map((period) => {
			const values = buckets.get(period);
			const average = values?.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
			const value = average != null && body.units.startsWith('Millions') ? average / 1e6 : average;
			return { id, title: body.title, units: body.units, period, value };
		});
	});
	const paged = paginate(series, pageInput);
	return { anchors, page: paged.page, data: { kind: 'economic_context' as const, series: paged.rows } };
}

function readBankContext(board: Board, block: ResearchBoardBlock, pageInput: AtlasStructuredReadPageInput | undefined) {
	const anchors = effective(board, block);
	const cert = board.state.activeBank && anchors.certs.includes(board.state.activeBank) ? board.state.activeBank : anchors.certs[0] ?? null;
	const banks = cert == null ? [] : [board.data.institutions[cert] ?? null];
	const paged = paginate(banks, pageInput);
	return { anchors, page: paged.page, data: { kind: 'bank_context' as const, bank: paged.rows[0] ?? null } };
}

/**
 * Read the semantic data behind one Atlas plate. This follows the same effective
 * bank, measure, and period bindings as the Svelte view and reads from the same
 * BoardData cache. Only views whose human rendering also calls a specialized API
 * (change attribution and economic context) make a network request here.
 */
export async function readAtlasStructuredView(options: ReadAtlasStructuredViewOptions): Promise<AtlasStructuredReadResult> {
	const { board, block } = options;
	checkCancelled(options.signal);
	const anchors = effective(board, block);
	let result: { anchors: AtlasStructuredReadAnchors; page: AtlasStructuredReadPage; data: AtlasStructuredViewData };
	let sources: AtlasStructuredReadSource[];

	if (block.kind === 'history' || (block.kind === 'workspace_view' && block.binding.view === 'metric_history')) {
		result = readHistory(board, block, options.page);
		sources = [fdicSource(options.context, board.data.latestQuarter, 'institution-quarter', 'Metric history and optional cohort quartiles are calculated deterministically from reported values.')];
	} else if (block.kind === 'exact_table') {
		result = readExactTable(board, block, options.page);
		sources = [fdicSource(options.context, board.data.latestQuarter, result.data.kind === 'exact_table' && result.data.orientation === 'periods' ? 'institution-quarter' : 'institution', 'Displayed measures and comparison changes are calculated from reported values.')];
	} else if (block.kind === 'workspace_view' && block.binding.view === 'comparison_matrix') {
		result = readComparisonMatrix(board, block, options.page);
		sources = [fdicSource(options.context, board.data.latestQuarter, 'institution-measure', 'Current values, period changes, peer medians, ranks, and percentiles are calculated deterministically.')];
	} else if (block.kind === 'workspace_view' && block.binding.view === 'peer_distribution') {
		result = readPeerDistribution(board, block, options.page);
		sources = [fdicSource(options.context, board.data.latestQuarter, 'institution-measure', 'Peer quartiles, ranks, and percentiles are calculated from the board cohort.')];
	} else if (block.kind === 'workspace_view' && block.binding.view === 'metric_relationship') {
		result = readRelationship(board, block, options.page);
		sources = [fdicSource(options.context, board.data.latestQuarter, 'institution-pair', 'Pearson correlation is calculated across institutions with both measures reported in the selected quarter.')];
	} else if (block.kind === 'workspace_view' && block.binding.view === 'headquarters_geography') {
		result = readGeography(board, block, options.page);
		sources = [fdicSource(options.context, board.data.latestQuarter, 'headquarters-state', 'Institution counts, assets, and metric medians are grouped by headquarters state.')];
	} else if (block.kind === 'workspace_view' && block.binding.view === 'change_attribution') {
		result = await readAttribution(board, block, options.page, options.fetcher ?? fetch, options.signal);
		sources = [fdicSource(options.context, board.data.latestQuarter, 'institution-quarter component', 'Reported component changes are reconciled to the bank-level change; any residual remains explicit.')];
	} else if (block.kind === 'workspace_view' && block.binding.view === 'economic_context') {
		result = await readEconomy(board, block, options.page, options.fetcher ?? fetch, options.signal);
		sources = [source(options.context, board.data.latestQuarter, { dataset: 'Bankgraph public macro series', sourceUrl: MACRO_SOURCE_URL, grain: 'series-quarter', derivation: 'Quarterly averages are calculated from the underlying public observations; H.8 levels are displayed in trillions of dollars.' })];
	} else if (block.kind === 'workspace_view' && block.binding.view === 'bank_context') {
		result = readBankContext(board, block, options.page);
		sources = [fdicSource(options.context, board.data.latestQuarter, 'institution', null)];
	} else if (block.kind === 'takeaway') {
		const paged = paginate([block.text], options.page);
		result = { anchors, page: paged.page, data: { kind: 'takeaway', text: paged.rows[0] ?? '', referenceBlockIds: block.referenceBlockIds } };
		sources = [];
	} else if (block.kind === 'analysis') {
		const paged = paginate([block.binding.resultRef.resultId], options.page);
		result = { anchors, page: paged.page, data: { kind: 'analysis', resultId: paged.rows[0] ?? block.binding.resultRef.resultId, resultKind: block.binding.resultRef.kind, view: block.binding.view } };
		sources = [];
	} else {
		throw new AtlasStructuredReadError('unsupported_view', `The ${blockView(block) ?? block.kind} view does not expose structured data.`);
	}

	return {
		block: { id: block.id, title: block.title, kind: block.kind, view: blockView(block) },
		anchors: result.anchors,
		metrics: result.anchors.metrics.map(descriptor),
		page: result.page,
		sources,
		data: result.data
	};
}
