import type { WorkspaceStore } from '$lib/workspace/workspace.svelte';
import type { WorkspaceState, ResearchHistoryBinding, ResearchExactTableBinding, WorkspaceAnalysisResult } from '$lib/workspace/types';
import type {
	WorkspaceWebMcpDependencies,
	WebMcpDataContext,
	WebMcpMetricHistoryRequest,
	WebMcpMetricHistoryResult,
	WebMcpCurrentCohortResult,
	WebMcpCohortTrendRequest,
	WebMcpCohortTrendResult,
	WebMcpCurrentComparisonResult,
	WebMcpDistributionRequest,
	WebMcpPeerDistributionResult,
	WebMcpMetricRelationshipRequest,
	WebMcpMetricRelationshipResult,
	WebMcpGeographyRequest,
	WebMcpGeographySummaryResult,
	WebMcpWorkspaceMacroResult,
	WebMcpChangeRequest,
	WebMcpChangeResult,
	WebMcpCohortChangeRequest,
	WebMcpCohortChangeResult,
	WebMcpTemporalPatternRequest,
	WebMcpTemporalPatternResult,
	WebMcpFinancialCompositionRequest,
	WebMcpFinancialCompositionResult,
	WebMcpFailurePatternRequest,
	WebMcpArtifactRequest,
	WebMcpArtifactResult
} from '$lib/webmcp/catalog';
import type { WebMcpControllerContext } from '$lib/webmcp/types';
import { WebMcpToolError } from '$lib/webmcp/runtime';
import { createBrowserBankSearch } from '$lib/webmcp/browser-services';
import type { FailurePatternsResponse } from '$lib/server/analytics/failure-patterns';
import {
	createBrowserAnalysisResultRepository,
	type AnalysisResultRef,
	type AnalysisResultRepository,
	type AnalysisResultSection
} from '$lib/workspace/analysis-result-repository';
import { lineageHash } from '$lib/provenance';
import { serializeWorkspaceSearchParams } from '$lib/workspace/codec';
import type { BoardData } from './board-data.svelte';
import type { Board } from '$lib/atlas/board/board.svelte';
import {
	metricValue,
	metricChange,
	previousQuarter,
	quartersBetween,
	researchMetricDefinition,
	type ResearchMetric
} from './metrics';
import { effective } from '$lib/atlas/board/views/util';
import type { BlockLayoutOverride } from '$lib/atlas/board/layout';
import { readAtlasStructuredView, AtlasStructuredReadError } from './structured-view-data';
import { BOARD_TEMPLATES, templateById } from '$lib/atlas/templates';
import { getTheme, setTheme } from '$lib/stores/theme.svelte';
import { deriveCohortTransition, type CohortTransitionGroup } from '$lib/analytics/cohort-transition';
import { analyzeTemporalPattern } from '$lib/analytics/temporal-patterns';
import {
	compositionDefinition,
	deriveCompositionChange,
	deriveCompositionSnapshot,
	type CompositionRow
} from '$lib/analytics/composition';
import { cohortIdentityKey, paginationKey } from '$lib/webmcp/pagination';

export interface DataContext {
	sourceAsOf: string | null;
	retrievedAt: string | null;
	pageLoadedAt: string;
	release: string | null;
	releaseGeneration: string | null;
}

function aborted(context: WebMcpControllerContext) {
	if (context.signal?.aborted) throw new WebMcpToolError('cancelled', 'The request was cancelled.', {}, false);
}

function median(values: number[]): number | null {
	if (!values.length) return null;
	const s = [...values].sort((a, b) => a - b);
	const mid = Math.floor(s.length / 2);
	return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}
function quantile(sorted: number[], p: number): number | null {
	if (!sorted.length) return null;
	const idx = (sorted.length - 1) * p, lo = Math.floor(idx), hi = Math.ceil(idx);
	return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

function pearson(points: Array<{ x: number; y: number }>): number | null {
	if (points.length < 2) return null;
	const meanX = points.reduce((sum, point) => sum + point.x, 0) / points.length;
	const meanY = points.reduce((sum, point) => sum + point.y, 0) / points.length;
	let cross = 0;
	let squareX = 0;
	let squareY = 0;
	for (const point of points) {
		const x = point.x - meanX;
		const y = point.y - meanY;
		cross += x * y;
		squareX += x * x;
		squareY += y * y;
	}
	return squareX && squareY ? cross / Math.sqrt(squareX * squareY) : null;
}

/**
 * Build the WebMCP dependency object for a board. Every adapter reads the same
 * BoardData the views render from, so the agent sees exactly what the person sees.
 */
export function createBoardDependencies(options: {
	store: WorkspaceStore;
	data: BoardData;
	context: () => DataContext;
	fetcher?: typeof fetch;
	boardPath?: string;
	board?: Board;
}): WorkspaceWebMcpDependencies {
	const { store, data } = options;
	const fetcher = options.fetcher ?? fetch;
	const boardPath = options.boardPath ?? '/b';
	let repository: Promise<AnalysisResultRepository> | null = null;
	const repo = () => (repository ??= createBrowserAnalysisResultRepository());
	const state = (): WorkspaceState => store.state;

	function cohortHash(): string {
		return lineageHash({ certs: [...data.cohort].sort((a, b) => a - b), asOf: data.cohortAsOf });
	}
	function cohortDefinition() {
		const s = state();
		return {
			recipe: s.peerRecipe,
			excludedCerts: s.excludedCerts,
			screenDefinitionHash: lineageHash(s.filters),
			screenFilters: s.peerRecipe.basis === 'screen' ? s.filters : null
		};
	}
	function analysisContext() {
		const definition = cohortDefinition();
		const definitionHash = paginationKey(definition);
		const c = options.context();
		return {
			definition,
			definitionHash,
			cohortHash: cohortIdentityKey({
				definitionHash,
				memberCerts: data.cohort,
				sourceAsOf: c.sourceAsOf ?? data.latestQuarter,
				releaseGeneration: c.releaseGeneration
			}),
			sourceMode: 'live' as const,
			sourceAsOf: c.sourceAsOf ?? data.latestQuarter,
			retrievedAt: c.retrievedAt
		};
	}
	function asOf(): string | null {
		return state().asOfQuarter ?? data.latestQuarter ?? options.context().sourceAsOf;
	}
	function comparisonQuarter(): string | null {
		const s = state();
		if (s.comparison.resolvedQuarter) return s.comparison.resolvedQuarter;
		const q = asOf();
		return q ? previousQuarter(q) : null;
	}
	async function hydrate(certs: readonly number[], context: WebMcpControllerContext, from?: string) {
		const s = state();
		const start = from ?? previousQuarter(asOf() ?? '20260630', 12);
		await Promise.all([
			data.ensureInstitutions(certs, context.signal),
			data.ensureRows(certs, start, context.signal)
		]);
		aborted(context);
		return s;
	}
	async function exactFinancialRows(
		certs: readonly number[],
		fields: readonly string[],
		from: string,
		to: string,
		context: WebMcpControllerContext
	): Promise<CompositionRow[]> {
		const uniqueCerts = [...new Set(certs)];
		const batches: number[][] = [];
		for (let index = 0; index < uniqueCerts.length; index += 10) batches.push(uniqueCerts.slice(index, index + 10));
		const rows: CompositionRow[] = [];
		let cursor = 0;
		const worker = async () => {
			while (cursor < batches.length) {
				const batch = batches[cursor++];
				const params = new URLSearchParams({
					certs: batch.join(','),
					metrics: [...new Set(fields)].join(','),
					from,
					to
				});
				const generation = options.context().releaseGeneration;
				if (generation) params.set('expected_release_generation', generation);
				const response = await fetcher(`/api/v1/compare?${params}`, { signal: context.signal });
				if (!response.ok) {
					throw new WebMcpToolError(
						'upstream_unavailable',
						`Exact financial composition is unavailable (HTTP ${response.status}).`,
						{ httpStatus: response.status },
						response.status >= 500
					);
				}
				const body = (await response.json()) as { data?: Record<string, CompositionRow[]> };
				for (const cert of batch) rows.push(...(body.data?.[String(cert)] ?? []));
			}
		};
		await Promise.all(Array.from({ length: Math.min(4, batches.length) }, worker));
		aborted(context);
		return rows.sort((left, right) => left.cert - right.cert || left.repdte.localeCompare(right.repdte));
	}
	function name(cert: number) { return data.institutions[cert]?.name ?? `Certificate ${cert}`; }
	function stateOf(cert: number) { return data.institutions[cert]?.state ?? null; }
	function exactMetricValue(metric: ResearchMetric, cert: number, period: string): number | null {
		const definition = researchMetricDefinition(metric);
		if (definition.endpointDependency === 'latest_snapshot') {
			const latest = options.context().sourceAsOf ?? data.latestQuarter;
			if (!latest || period !== latest) return null;
		}
		return metricValue(metric, data.rows[cert], period, data.institutions[cert]);
	}
	function assetBucket(asset: number | null): number | null {
		if (asset === null) return null;
		if (asset < 100_000) return 1;
		if (asset < 300_000) return 2;
		if (asset < 1_000_000) return 3;
		if (asset < 10_000_000) return 4;
		if (asset < 50_000_000) return 5;
		if (asset < 250_000_000) return 6;
		return 7;
	}
	function assetBucketLabel(bucket: number): string {
		return ({
			1: 'Under $100M',
			2: '$100M–$300M',
			3: '$300M–$1B',
			4: '$1B–$10B',
			5: '$10B–$50B',
			6: '$50B–$250B',
			7: 'Over $250B'
		} as Record<number, string>)[bucket] ?? `Asset bucket ${bucket}`;
	}
	function transitionGroup(cert: number, period: string, groupBy: WebMcpCohortChangeRequest['groupBy']): CohortTransitionGroup | null | undefined {
		if (groupBy === 'none') return undefined;
		if (groupBy === 'state') {
			const bankState = stateOf(cert);
			return bankState ? { key: bankState, label: bankState } : null;
		}
		const bucket = assetBucket(exactMetricValue('asset', cert, period));
		return bucket === null ? null : { key: String(bucket), label: assetBucketLabel(bucket) };
	}
	function trendConditionMatches(value: number, condition: WebMcpCohortTrendRequest['conditions'][number]): boolean {
		switch (condition.operator) {
			case 'eq': return value === condition.value;
			case 'ne': return value !== condition.value;
			case 'gt': return value > condition.value;
			case 'gte': return value >= condition.value;
			case 'lt': return value < condition.value;
			case 'lte': return value <= condition.value;
			case 'between': return condition.upperValue !== null && value >= condition.value && value <= condition.upperValue;
		}
	}

	return {
		workspace: {
			get state() { return store.state; },
			execute(command, opts) { return store.execute(command, opts); },
			executeBatch(commands, opts) { return store.executeBatch(commands, opts); }
		},
		getDataContext: (): WebMcpDataContext => {
			const c = options.context();
			return { sourceMode: 'live', sourceAsOf: c.sourceAsOf ?? data.latestQuarter, retrievedAt: c.retrievedAt, pageLoadedAt: c.pageLoadedAt, release: c.release, releaseGeneration: c.releaseGeneration, cohortHash: cohortHash() };
		},
		searchBanks: createBrowserBankSearch({ fetch: fetcher, getAsOf: () => options.context().sourceAsOf, getReleaseGeneration: () => options.context().releaseGeneration }),
		ensureBanksLoaded: async (certs, context) => { await hydrate(certs, context); },
		getCurrentCohortMemberCount: () => data.cohort.length,

		prepareScreen: async (filters, context) => {
			const next: WorkspaceState = { ...state(), filters, peerRecipe: { ...state().peerRecipe, basis: 'screen' } };
			await data.loadCohort(next, context.signal);
			aborted(context);
			return { results: { total: data.cohortTotal, returned: data.cohort.length, latestQuarter: data.cohortAsOf, refreshedAt: new Date().toISOString(), queryRevision: data.cohortKey.slice(0, 32), truncated: data.cohortTotal > data.cohort.length }, commit() { /* cohort already published to BoardData */ } };
		},
		preparePeerCohort: async (recipe, excludedCerts, context) => {
			const next: WorkspaceState = { ...state(), peerRecipe: recipe, excludedCerts };
			await data.loadCohort(next, context.signal);
			aborted(context);
			return { commit() { /* published */ } };
		},
		readCurrentCohort: async (context): Promise<WebMcpCurrentCohortResult> => {
			const s = state();
			await data.loadCohort(s, context.signal);
			const q = asOf();
			const required = q ? [previousQuarter(q), q] : [];
			await hydrate(data.cohort, context, q ? previousQuarter(q, 12) : undefined);
			const members = data.cohort.map((cert) => ({ cert, name: name(cert), state: stateOf(cert), assetBucket: data.institutions[cert]?.asset_tier ?? null, totalAssets: data.institutions[cert]?.total_assets ?? null }));
			const withHistory = data.cohort.filter((c) => (data.rows[c]?.length ?? 0) > 0).length;
			const withRequired = data.cohort.filter((c) => required.every((p) => data.rows[c]?.some((r) => r.repdte === p))).length;
			const all = data.quartersFor(data.cohort);
			const c = options.context();
			const analysis = analysisContext();
			return {
				members,
				definition: analysis.definition,
				definitionHash: analysis.definitionHash,
				cohortHash: analysis.cohortHash,
				coverage: { status: withRequired === data.cohort.length ? 'ready' : 'partial', memberCount: data.cohort.length, membersWithHistory: withHistory, membersWithRequiredPeriods: withRequired, requiredPeriods: required, earliestPeriod: all[0] ?? null, latestPeriod: all.at(-1) ?? null },
				sourceMode: 'live', sourceAsOf: c.sourceAsOf ?? data.latestQuarter, retrievedAt: c.retrievedAt
			};
		},

		analyzeCohortTrends: async (
			request: WebMcpCohortTrendRequest,
			context
		): Promise<WebMcpCohortTrendResult> => {
			const s = state();
			await data.loadCohort(s, context.signal);
			// Four extra quarters are required for year-over-year derived measures at the opening date.
			await hydrate(data.cohort, context, previousQuarter(request.from, 4));
			const metrics = [...new Set(request.conditions.map((condition) => condition.metric))] as ResearchMetric[];
			const comparable = data.cohort.flatMap((cert) => {
				const changes = Object.fromEntries(metrics.map((metric) => {
					const from = exactMetricValue(metric, cert, request.from);
					const to = exactMetricValue(metric, cert, request.to);
					return [metric, metricChange(metric, to, from).value];
				})) as Partial<Record<ResearchMetric, number | null>>;
				return metrics.every((metric) => changes[metric] !== null) ? [{ cert, changes }] : [];
			});
			const matches = comparable.filter(({ changes }) => request.conditions.every((condition) =>
				trendConditionMatches(changes[condition.metric as ResearchMetric] as number, condition)
			));
			const groups = new Map<string, { label: string; matchingCount: number }>();
			for (const { cert } of matches) {
				const openingBucket = assetBucket(exactMetricValue('asset', cert, request.from));
				const key = request.groupBy === 'state' ? stateOf(cert) ?? 'Unknown' : openingBucket === null ? 'Unknown' : String(openingBucket);
				const label = request.groupBy === 'state' ? key : openingBucket === null ? 'Asset group unknown' : assetBucketLabel(openingBucket);
				const group = groups.get(key) ?? { label, matchingCount: 0 };
				group.matchingCount += 1;
				groups.set(key, group);
			}
			const analysis = analysisContext();
			aborted(context);
			return {
				matches: matches.map(({ cert, changes }) => ({
					cert,
					name: name(cert),
					state: stateOf(cert),
					assetBucket: assetBucket(exactMetricValue('asset', cert, request.from)),
					totalAssets: data.institutions[cert]?.total_assets ?? null,
					changes
				})).sort((left, right) => left.cert - right.cert),
				cohortCount: data.cohort.length,
				comparableCount: comparable.length,
				groups: [...groups.entries()].map(([key, group]) => ({
					key,
					label: group.label,
					matchingCount: group.matchingCount,
					shareOfMatches: matches.length ? group.matchingCount / matches.length : 0
				})).sort((left, right) => right.matchingCount - left.matchingCount || left.key.localeCompare(right.key)),
				changeUnits: Object.fromEntries(metrics.map((metric) => [metric, researchMetricDefinition(metric).change])),
				definition: analysis.definition,
				definitionHash: analysis.definitionHash,
				cohortHash: analysis.cohortHash,
				coverage: {
					status: comparable.length === data.cohort.length ? 'ready' : 'partial',
					from: request.from,
					to: request.to,
					missingCount: data.cohort.length - comparable.length
				},
				sourceMode: analysis.sourceMode,
				sourceAsOf: analysis.sourceAsOf,
				retrievedAt: analysis.retrievedAt
			};
		},

		readMetricHistory: async (request: WebMcpMetricHistoryRequest, context): Promise<WebMcpMetricHistoryResult> => {
			const end = request.endingAt ?? asOf() ?? '20260630';
			const start = previousQuarter(end, request.periods + 4);
			await hydrate(request.certs, context, start);
			const ordered: string[] = [];
			let cur = end;
			for (let i = 0; i < request.periods; i++) { ordered.unshift(cur); cur = previousQuarter(cur); }
			const c = options.context();
			return {
				periods: ordered,
				series: request.certs.map((cert) => ({ cert, name: name(cert), values: ordered.map((p) => metricValue(request.metric as ResearchMetric, data.rows[cert], p, data.institutions[cert])) })),
				sourceMode: 'live', asOf: c.sourceAsOf ?? data.latestQuarter, refreshedAt: c.retrievedAt, truncated: false
			};
		},

		readCurrentComparison: async (context): Promise<WebMcpCurrentComparisonResult> => {
			const s = state();
			const certs = s.selectedCerts;
			await hydrate(certs, context);
			const q = asOf();
			const metrics = s.charts[0]?.metrics?.length ? (s.charts[0].metrics as ResearchMetric[]) : (['asset', 'dep', 'roa', 'nimy', 'loanGrowth', 'nclnlsr'] as ResearchMetric[]);
			const c = options.context();
			return {
				period: q, metrics,
				banks: certs.map((cert) => ({ cert, name: name(cert), state: stateOf(cert), values: Object.fromEntries(metrics.map((m) => [m, q ? metricValue(m, data.rows[cert], q, data.institutions[cert]) : null])) })),
				sourceMode: 'live', sourceAsOf: c.sourceAsOf ?? data.latestQuarter, retrievedAt: c.retrievedAt
			};
		},

		analyzePeerDistribution: async (request: WebMcpDistributionRequest, context): Promise<WebMcpPeerDistributionResult> => {
			const s = state();
			await data.loadCohort(s, context.signal);
			const q = asOf();
			const universe = [...new Set([...data.cohort, ...s.selectedCerts])];
			await hydrate(universe, context, q ? previousQuarter(q, 6) : undefined);
			const metric = request.metric as ResearchMetric;
			const rows = universe.map((cert) => ({ cert, name: name(cert), state: stateOf(cert), value: q ? metricValue(metric, data.rows[cert], q, data.institutions[cert]) : null }));
			const present = rows.filter((r): r is typeof r & { value: number } => r.value != null).sort((a, b) => a.value - b.value);
			const values = present.map((r) => r.value);
			const focusCert = s.activeBank ?? s.selectedCerts[0] ?? null;
			const focused = focusCert != null ? present.find((r) => r.cert === focusCert) ?? null : null;
			const rank = focused ? present.findIndex((r) => r.cert === focused.cert) + 1 : null;
			const c = options.context();
			return {
				metric: request.metric, period: q, count: present.length, missingCount: rows.length - present.length,
				statistics: { minimum: values[0] ?? null, p25: quantile(values, 0.25), median: median(values), p75: quantile(values, 0.75), maximum: values.at(-1) ?? null },
				focusedBank: focused ? { ...focused, percentile: rank != null && present.length > 1 ? ((rank - 1) / (present.length - 1)) * 100 : null, rank } : null,
				lowest: present.slice(0, 10), highest: present.slice(-10).reverse(),
				sourceMode: 'live', sourceAsOf: c.sourceAsOf ?? data.latestQuarter, retrievedAt: c.retrievedAt
			};
		},

		analyzeMetricRelationship: async (request: WebMcpMetricRelationshipRequest, context): Promise<WebMcpMetricRelationshipResult> => {
			const s = state();
			await data.loadCohort(s, context.signal);
			const q = asOf();
			await hydrate(data.cohort, context, q ? previousQuarter(q, 2) : undefined);
			const points = data.cohort.flatMap((cert) => {
				const x = q ? metricValue(request.xMetric as ResearchMetric, data.rows[cert], q, data.institutions[cert]) : null;
				const y = q ? metricValue(request.yMetric as ResearchMetric, data.rows[cert], q, data.institutions[cert]) : null;
				return x == null || y == null ? [] : [{ cert, name: name(cert), state: stateOf(cert), x, y }];
			});
			const c = options.context();
			return {
				xMetric: request.xMetric,
				yMetric: request.yMetric,
				period: q,
				method: 'pearson_cross_sectional_levels',
				correlation: pearson(points),
				cohortCount: data.cohort.length,
				comparableCount: points.length,
				points: points.slice(0, request.maxPoints),
				truncated: points.length > request.maxPoints,
				sourceMode: 'live',
				sourceAsOf: c.sourceAsOf ?? data.latestQuarter,
				retrievedAt: c.retrievedAt
			};
		},

		readGeographySummary: async (request: WebMcpGeographyRequest, context): Promise<WebMcpGeographySummaryResult> => {
			const s = state();
			await data.loadCohort(s, context.signal);
			const q = asOf();
			await hydrate(data.cohort, context, q ? previousQuarter(q, 2) : undefined);
			const metric = request.metric as ResearchMetric;
			const byState = new Map<string, { certs: number[]; assets: number; values: number[] }>();
			for (const cert of data.cohort) {
				const st = stateOf(cert); if (!st) continue;
				const g = byState.get(st) ?? { certs: [], assets: 0, values: [] };
				g.certs.push(cert); g.assets += data.institutions[cert]?.total_assets ?? 0;
				const v = q ? metricValue(metric, data.rows[cert], q, data.institutions[cert]) : null; if (v != null) g.values.push(v);
				byState.set(st, g);
			}
			const states = [...byState.entries()].map(([st, g]) => ({ state: st, bankCount: g.certs.length, totalAssets: g.assets, metricMedian: median(g.values), metricMean: g.values.length ? g.values.reduce((a, b) => a + b, 0) / g.values.length : null })).sort((a, b) => b.bankCount - a.bankCount);
			const c = options.context();
			return { metric: request.metric, period: q, cohortCount: data.cohort.length, states: states.slice(0, request.maxStates), omittedStateCount: Math.max(0, states.length - request.maxStates), sourceMode: 'live', sourceAsOf: c.sourceAsOf ?? data.latestQuarter, retrievedAt: c.retrievedAt };
		},

		analyzeCohortChange: async (
			request: WebMcpCohortChangeRequest,
			context
		): Promise<WebMcpCohortChangeResult> => {
			const s = state();
			await data.loadCohort(s, context.signal);
			await hydrate(data.cohort, context, previousQuarter(request.from, 4));
			const entities = data.cohort.map((cert) => ({
				id: cert,
				name: name(cert),
				state: stateOf(cert),
				group: transitionGroup(cert, request.from, request.groupBy),
				rows: [request.from, request.to].map((period) => ({
					period,
					values: Object.fromEntries(
						request.metrics.map((metric) => [metric, exactMetricValue(metric as ResearchMetric, cert, period)])
					)
				}))
			}));
			aborted(context);
			return {
				...analysisContext(),
				transition: deriveCohortTransition({
					openingPeriod: request.from,
					closingPeriod: request.to,
					metrics: request.metrics as ResearchMetric[],
					entities
				})
			};
		},

		findTemporalPatterns: async (
			request: WebMcpTemporalPatternRequest,
			context
		): Promise<WebMcpTemporalPatternResult> => {
			const s = state();
			await data.loadCohort(s, context.signal);
			const periods = request.periodWindow
				? quartersBetween(request.periodWindow.startPeriod, request.periodWindow.endPeriod)
				: [...request.requiredPeriods].sort();
			await hydrate(data.cohort, context, previousQuarter(periods[0], 4));
			let matched = 0;
			let notMatched = 0;
			let insufficientData = 0;
			const rows = data.cohort.flatMap((cert) => {
				const evaluations = request.metrics.map((metric) => analyzeTemporalPattern({
					metric,
					series: periods.map((period) => ({
						period,
						value: exactMetricValue(metric as ResearchMetric, cert, period)
					})),
					...(request.periodWindow ? { periodWindow: request.periodWindow } : { requiredPeriods: request.requiredPeriods }),
					minimumObservations: request.minimumObservations,
					gapPolicy: request.gapPolicy,
					tolerance: request.tolerance,
					pattern: request.pattern
				}));
				if (evaluations.every((evaluation) => evaluation.status === 'matched')) {
					matched += 1;
					return [{ cert, name: name(cert), state: stateOf(cert), evaluations }];
				}
				if (evaluations.some((evaluation) => evaluation.status === 'not_matched')) notMatched += 1;
				else insufficientData += 1;
				return [];
			});
			aborted(context);
			return {
				...analysisContext(),
				counts: { cohort: data.cohort.length, matched, notMatched, insufficientData },
				rows
			};
		},

		analyzeFinancialComposition: async (
			request: WebMcpFinancialCompositionRequest,
			context
		): Promise<WebMcpFinancialCompositionResult> => {
			const s = state();
			if (request.scope === 'current_cohort') await data.loadCohort(s, context.signal);
			const memberCerts = request.scope === 'selected_bank'
				? request.cert === null ? [] : [request.cert]
				: request.scope === 'selected_banks'
					? [...new Set(s.selectedCerts)]
					: [...data.cohort];
			await data.ensureInstitutions(memberCerts, context.signal);
			const definition = compositionDefinition(request.composition);
			const fields = [definition.denominator.field, ...definition.components.map((component) => component.field)];
			const from = request.compareFrom ?? request.period;
			const exactRows = await exactFinancialRows(memberCerts, fields, from, request.period, context);
			const currentRows = exactRows.filter((row) => row.repdte === request.period);
			const analysis = request.compareFrom
				? deriveCompositionChange(
					request.composition,
					exactRows.filter((row) => row.repdte === request.compareFrom),
					currentRows
				)
				: deriveCompositionSnapshot(request.composition, currentRows);
			const scopeLabel = request.scope === 'selected_bank'
				? memberCerts[0] === undefined ? 'Selected bank' : name(memberCerts[0])
				: request.scope === 'selected_banks'
					? `${memberCerts.length} selected bank${memberCerts.length === 1 ? '' : 's'}`
					: `${memberCerts.length} current cohort bank${memberCerts.length === 1 ? '' : 's'}`;
			aborted(context);
			return {
				...analysisContext(),
				scopeLabel,
				memberCerts,
				analysis
			};
		},

		readWorkspaceMacroContext: async (context): Promise<WebMcpWorkspaceMacroResult> => {
			const res = await fetcher('/api/v2/system-brief', { signal: context.signal });
			const c = options.context();
			if (!res.ok) return { status: 'unavailable', series: [], sourceMode: 'live', sourceAsOf: c.sourceAsOf, retrievedAt: c.retrievedAt };
			const body = (await res.json()) as { macroOverlays?: { series: Array<{ seriesId: string; title: string; units: string; observationDate: string; value: number }> } };
			return {
				status: body.macroOverlays?.series?.length ? 'ready' : 'unavailable',
				series: (body.macroOverlays?.series ?? []).map((s) => ({ id: s.seriesId, label: s.title, unit: s.units, period: s.observationDate, value: s.value, priorPeriod: null, priorValue: null, change: null, source: s.seriesId.startsWith('BLS') ? 'Bureau of Labor Statistics' : s.seriesId.startsWith('UST') ? 'U.S. Treasury' : 'Federal Reserve Board' })),
				sourceMode: 'live', sourceAsOf: c.sourceAsOf, retrievedAt: c.retrievedAt
			};
		},

		inspectChange: async (request: WebMcpChangeRequest, context): Promise<WebMcpChangeResult> => {
			const res = await fetcher(`/api/v1/banks/${request.cert}/quarter-brief?from=${request.from}&to=${request.to}`, { signal: context.signal });
			if (!res.ok) throw new WebMcpToolError('upstream_unavailable', `Change attribution is unavailable (HTTP ${res.status}).`, { httpStatus: res.status }, true);
			const brief = (await res.json()) as { bridges: Record<string, { unit: string; totalChange: number; contributions: Array<{ label: string; change: number }>; residual: number; method: string; reconciliation: string }>; comparison: { status: string; message: string | null } };
			const bridgeKey = request.metric === 'asset' ? 'assets' : request.metric === 'dep' ? 'funding' : request.metric === 'netinc' ? 'quarterlyNetIncome' : request.metric === 'lnlsdepr' ? 'loanToDeposit' : 'assets';
			const bridge = brief.bridges[bridgeKey] ?? Object.values(brief.bridges)[0];
			const components = (bridge?.contributions ?? []).slice().sort((a, b) => Math.abs(b.change) - Math.abs(a.change)).slice(0, request.maxComponents).map((x) => ({ label: x.label, change: x.change, unit: bridge.unit }));
			const c = options.context();
			return {
				summary: bridge ? `${bridgeKey} moved ${bridge.totalChange >= 0 ? '+' : ''}${bridge.totalChange} (${bridge.unit}) from ${request.from} to ${request.to}; ${bridge.reconciliation.replace(/_/g, ' ')}.` : brief.comparison.message ?? 'No bridge available.',
				components, bankChange: bridge?.totalChange ?? null, unit: 'usd_thousands', method: bridge?.method, provenance: 'FDIC BankFind Financials · reported components',
				sourceMode: 'live', asOf: c.sourceAsOf ?? data.latestQuarter, refreshedAt: c.retrievedAt, truncated: (bridge?.contributions.length ?? 0) > components.length
			};
		},

		analyzeFailurePatterns: async (request: WebMcpFailurePatternRequest, context): Promise<FailurePatternsResponse> => {
			const params = new URLSearchParams({ start_year: String(request.startYear), end_year: String(request.endYear), quarters: String(request.quarters), limit: String(request.limit) });
			const res = await fetcher(`/api/v2/research/failure-patterns?${params}`, { signal: context.signal });
			if (!res.ok) throw new WebMcpToolError('upstream_unavailable', `The failure-pattern analysis is unavailable (HTTP ${res.status}).`, { httpStatus: res.status }, true);
			return (await res.json()) as FailurePatternsResponse;
		},
		storeAnalysisResult: async (result: WorkspaceAnalysisResult, context) => { aborted(context); return (await repo()).put(result); },
		resolveAnalysisResultRef: async (resultId, context) => {
			aborted(context);
			const current = state().analysisResult;
			if (!current || current.id !== resultId) return null;
			return (await repo()).put(current);
		},
		readAnalysisResultPage: async (ref: AnalysisResultRef, section: AnalysisResultSection, opts, context) => { aborted(context); return (await repo()).readPage(ref, section, opts); },
		readBoardBlockData: options.board ? async (block, request, context) => {
			const board = options.board!;
			const anchors = effective(board, block);
			const cohortViews = new Set(['peer_distribution', 'metric_relationship', 'headquarters_geography']);
			if (block.kind === 'workspace_view' && cohortViews.has(block.binding.view)) await data.loadCohort(state(), context.signal);
			const universe = block.kind === 'workspace_view' && cohortViews.has(block.binding.view)
				? [...new Set([...anchors.certs, ...data.cohort])]
				: anchors.certs;
			if (universe.length) await hydrate(universe, context, anchors.from);
			const offset = request.cursor === undefined ? 0 : Number(request.cursor);
			if (!Number.isSafeInteger(offset) || offset < 0) throw new WebMcpToolError('invalid_cursor', 'The board-view cursor is invalid. Start again without a cursor.', request.cursor === undefined ? {} : { cursor: request.cursor });
			try {
				const result = await readAtlasStructuredView({
					board,
					block,
					page: { offset, limit: request.pageSize },
					fetcher,
					signal: context.signal,
					context: options.context()
				});
				const viewData = result.data as unknown as Record<string, unknown>;
				const items = (() => {
					for (const key of ['observations', 'rows', 'points', 'states', 'components', 'series'] as const) {
						if (Array.isArray(viewData[key])) return viewData[key] as unknown[];
					}
					if (viewData.kind === 'bank_context') return viewData.bank == null ? [] : [viewData.bank];
					return [viewData];
				})();
				return {
					section: request.section ?? result.data.kind,
					items,
					total: result.page.total,
					offset: result.page.offset,
					pageSize: result.page.limit,
					nextCursor: result.page.nextOffset == null ? null : String(result.page.nextOffset),
					metadata: {
						block: result.block,
						anchors: result.anchors,
						metrics: result.metrics,
						sources: result.sources,
						data: Object.fromEntries(Object.entries(viewData).filter(([key]) => !['observations', 'rows', 'points', 'states', 'components', 'series'].includes(key)))
					}
				};
			} catch (error) {
				if (error instanceof AtlasStructuredReadError) throw new WebMcpToolError(error.code, error.message, {}, error.retryable);
				throw error;
			}
		} : undefined,

		listBoardTemplates: options.board ? () => BOARD_TEMPLATES.map((template) => ({
			id: template.id,
			name: template.name,
			description: template.description,
			needs: [...template.needs],
			timeForm: template.timeForm,
			strips: template.strips.map((strip) => ({
				title: strip.title,
				views: strip.views.map((view) => ({ kind: view.kind, role: view.role, ...(view.title ? { title: view.title } : {}) }))
			})),
			thumb: template.thumb.map((row) => [...row])
		})) : undefined,
		getBoardPresentation: options.board ? () => ({
			presentationRevision: options.board!.presentationRevision,
			theme: getTheme(),
			timeAxis: options.board!.timeAxisChoice === null ? 'auto' : options.board!.timeAxisChoice === 'calendar' ? 'calendar' : 'event',
			pinnedTimebar: options.board!.pinnedTimebar,
			pendingViewCount: options.board!.pendingViews.length,
			overrides: JSON.parse(JSON.stringify(options.board!.overrides)),
			strips: options.board!.strips.map((strip) => ({
				id: strip.id,
				title: strip.title,
				views: strip.blocks.map((item) => ({ blockId: item.block.id, role: item.role, columns: item.span }))
			}))
		}) : undefined,
		applyBoardTemplate: options.board ? async (request, context) => {
			aborted(context);
			const template = templateById(request.templateId);
			if (!template) throw new WebMcpToolError('unknown_board_template', `Board template ${request.templateId} is not available in this interface.`, { templateId: request.templateId });
			const before = new Set(options.board!.blocks.map((block) => block.id));
			const beforeState = JSON.stringify({ blocks: options.board!.blocks, overrides: options.board!.overrides });
			await options.board!.applyTemplate(template, request.mode);
			aborted(context);
			const blockIds = options.board!.blocks.filter((block) => request.mode === 'replace' || !before.has(block.id)).map((block) => block.id);
			if (request.sortMetric) {
				for (const block of options.board!.blocks) {
					if (!blockIds.includes(block.id) || block.kind !== 'exact_table') continue;
					options.board!.setOverride(block.id, {
						sortMetric: request.sortMetric,
						sortBasis: request.sortBasis ?? 'level',
						sortDirection: request.sortDirection ?? 'desc'
					});
				}
			}
			if (request.focus && blockIds[0]) options.board!.select(blockIds[0]);
			return { changed: beforeState !== JSON.stringify({ blocks: options.board!.blocks, overrides: options.board!.overrides }), blockIds };
		} : undefined,
		setAppearance: options.board ? (theme) => ({ changed: setTheme(theme), theme: getTheme() }) : undefined,
		clearResearchBoard: options.board ? () => {
			const blockIds = options.board!.blocks.map((block) => block.id);
			options.board!.clearBoard(true);
			return { changed: blockIds.length > 0, blockIds };
		} : undefined,
		resetBoardLayout: options.board ? () => {
			const presentationChanged = options.board!.clearOverrides();
			const hadSharedFocus = options.board!.state.board.focusedBlockId !== null;
			if (hadSharedFocus) options.board!.select(null);
			return { changed: presentationChanged || hadSharedFocus };
		} : undefined,
		resetResearchBoard: options.board ? () => ({ changed: options.board!.resetResearchBoard() }) : undefined,
		configureBoardView: options.board ? (blockId, configuration) => {
			const board = options.board!;
			const block = board.blocks.find((item) => item.id === blockId);
			if (!block) return { changed: false };

			let nextBlock = block;
			if (configuration.title !== undefined && configuration.title !== block.title) {
				nextBlock = { ...nextBlock, title: configuration.title };
			}
			if (nextBlock.kind === 'history' && (
				configuration.historyFrom !== undefined || configuration.historyTo !== undefined ||
				configuration.chartKind !== undefined || configuration.scale !== undefined
			)) {
				nextBlock = {
					...nextBlock,
					binding: {
						...nextBlock.binding,
						from: configuration.historyFrom ?? nextBlock.binding.from,
						to: configuration.historyTo ?? nextBlock.binding.to,
						chartKind: configuration.chartKind ?? nextBlock.binding.chartKind,
						scale: configuration.scale ?? nextBlock.binding.scale,
					},
				};
			}
			if (nextBlock.kind === 'analysis' && configuration.view !== undefined) {
				nextBlock = { ...nextBlock, binding: { ...nextBlock.binding, view: configuration.view } };
			}
			const blockChanged = JSON.stringify(nextBlock) !== JSON.stringify(block);
			if (blockChanged) board.upsertBlock(nextBlock);

			const patch: BlockLayoutOverride = {};
			if (configuration.width !== undefined) {
				patch.span = { auto: undefined, quarter: 3, half: 6, three_quarter: 9, full: 12 }[configuration.width];
			}
			if (configuration.height !== undefined) patch.tall = configuration.height === 'tall' ? true : undefined;
			if (configuration.role !== undefined) patch.role = configuration.role === 'auto' ? undefined : configuration.role;
			if (configuration.presentation !== undefined) patch.presentation = configuration.presentation === 'auto' ? undefined : configuration.presentation;

			const pinEdit = configuration.certs !== undefined || configuration.metrics !== undefined || configuration.asOf !== undefined || configuration.compareWith !== undefined;
			if (configuration.followWorkspace === true) {
				patch.followWorkspace = true;
				patch.pins = undefined;
			} else if (pinEdit) {
				patch.followWorkspace = false;
				patch.pins = {
					...(board.overrides[blockId]?.pins ?? {}),
					...(configuration.certs === undefined ? {} : { certs: configuration.certs }),
					...(configuration.metrics === undefined ? {} : { metrics: configuration.metrics }),
					...(configuration.asOf === undefined ? {} : { asOf: configuration.asOf }),
					...(configuration.compareWith === undefined ? {} : { compareWith: configuration.compareWith }),
				};
			} else if (configuration.followWorkspace === false) {
				patch.followWorkspace = false;
			}
			if ((configuration.historyFrom !== undefined || configuration.historyTo !== undefined) && configuration.followWorkspace === undefined) {
				patch.followWorkspace = false;
			}
			if (configuration.series !== undefined) patch.series = configuration.series;
			if (configuration.xMetric !== undefined) patch.xMetric = configuration.xMetric;
			if (configuration.yMetric !== undefined) patch.yMetric = configuration.yMetric;
			if (configuration.geographyMode !== undefined) patch.geographyMode = configuration.geographyMode;
			if (configuration.attributionMode !== undefined) patch.attributionMode = configuration.attributionMode;
			if (configuration.sortMetric !== undefined) patch.sortMetric = configuration.sortMetric;
			if (configuration.sortBasis !== undefined) patch.sortBasis = configuration.sortBasis;
			if (configuration.sortDirection !== undefined) patch.sortDirection = configuration.sortDirection;
			const presentationChanged = Object.keys(patch).length > 0 && board.setOverride(blockId, patch);
			return { changed: blockChanged || presentationChanged };
		} : undefined,

		prepareBoardHistory: async (binding: ResearchHistoryBinding, context) => { await hydrate(binding.certs, context, previousQuarter(binding.from, 4)); },
		prepareBoardTable: async (binding: ResearchExactTableBinding, context) => { await hydrate(binding.certs, context, binding.from ? previousQuarter(binding.from, 4) : undefined); },

		createArtifact: async (request: WebMcpArtifactRequest, context): Promise<WebMcpArtifactResult> => {
			aborted(context);
			if (request.format === 'share_link') {
				const origin = typeof location !== 'undefined' ? location.origin : '';
				return { url: `${origin}${boardPath}?${request.search}`, message: 'Live board link. It replays these choices against the current published release.' };
			}
			if (request.format === 'workspace_json') {
				const params = serializeWorkspaceSearchParams(state());
				return { content: JSON.stringify({ version: 3, search: params.toString(), state: state() }), contentType: 'application/json', filename: 'bankgraph-board.json' };
			}
			throw new WebMcpToolError('capability_unavailable', 'CSV export is not available from this board yet.', {}, false);
		},
		workspacePath: boardPath,
		origin: () => (typeof location !== 'undefined' ? location.origin : '')
	} as WorkspaceWebMcpDependencies;
}
