import {
	RESEARCH_METRICS,
	type ResearchScreenMetric,
	type ScreenableResearchMetricDefinition
} from '$lib/research-metrics';

/** Public, deterministic vocabulary for metrics stored on the latest institution snapshot. */
export const BANK_SCREEN_METRIC_DEFINITIONS = RESEARCH_METRICS.filter(
	(metric): metric is ScreenableResearchMetricDefinition => 'screen' in metric
);
export const BANK_SCREEN_METRICS = BANK_SCREEN_METRIC_DEFINITIONS.map(
	(metric) => metric.screen.id
) as ResearchScreenMetric[];

export type BankScreenMetric = ResearchScreenMetric;

export const BANK_SCREEN_METRIC_RULES: Record<BankScreenMetric, {
	unit: 'usd_thousands' | 'percent' | 'count';
	minimum: number;
	maximum: number;
	integer: boolean;
}> = Object.fromEntries(
	BANK_SCREEN_METRIC_DEFINITIONS.map(({ screen }) => [
		screen.id,
		{ unit: screen.unit, minimum: screen.minimum, maximum: screen.maximum, integer: screen.integer }
	])
) as Record<BankScreenMetric, { unit: 'usd_thousands' | 'percent' | 'count'; minimum: number; maximum: number; integer: boolean }>;

export const BANK_SCREEN_OPERATORS = ['eq', 'ne', 'gt', 'gte', 'lt', 'lte', 'between'] as const;
export type BankScreenOperator = typeof BANK_SCREEN_OPERATORS[number];

export const BANK_SCREEN_SORTS = ['name', ...BANK_SCREEN_METRICS] as const;
export type BankScreenSort = typeof BANK_SCREEN_SORTS[number];

export const BANK_SCREEN_MAX_CONDITIONS = 12;
/** Per-response page size. Complete screens are traversed through stable offsets. */
export const BANK_SCREEN_MAX_LIMIT = 1_000;

export interface BankScreenCondition {
	metric: BankScreenMetric;
	operator: BankScreenOperator;
	value: number;
	upperValue: number | null;
}

export interface BankScreenRequest {
	query: string;
	states: string[];
	active: 'any' | 'active' | 'inactive';
	assetMin: number | null;
	assetMax: number | null;
	conditions: BankScreenCondition[];
	sort: BankScreenSort;
	order: 'asc' | 'desc';
	limit: number;
	offset?: number;
}

export interface BankScreenRecipeInput {
	query?: string;
	states: string[];
	active: 'any' | 'active' | 'inactive';
	assetRange: { min: number | null; max: number | null };
	metricConditions: Array<{
		metric: string;
		operator: BankScreenOperator;
		value: number;
		upperValue: number | null;
	}>;
}

export const WORKSPACE_TO_BANK_SCREEN_METRIC: Readonly<Record<string, BankScreenMetric>> =
	Object.fromEntries(BANK_SCREEN_METRIC_DEFINITIONS.flatMap((definition) => {
		const aliases = 'aliases' in definition ? definition.aliases : [];
		return [definition.id, definition.screen.id, ...aliases].map((id) => [id, definition.screen.id]);
	})) as Readonly<Record<string, BankScreenMetric>>;

export const BANK_SCREEN_TO_RESEARCH_METRIC: Readonly<Record<BankScreenMetric, typeof BANK_SCREEN_METRIC_DEFINITIONS[number]['id']>> =
	Object.fromEntries(BANK_SCREEN_METRIC_DEFINITIONS.map((definition) => [definition.screen.id, definition.id])) as
	Readonly<Record<BankScreenMetric, typeof BANK_SCREEN_METRIC_DEFINITIONS[number]['id']>>;

export class BankScreenRecipeError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'BankScreenRecipeError';
	}
}

/** Convert either workspace filters or a peer recipe into the same server request shape. */
export function bankScreenRequestFromRecipe(
	recipe: BankScreenRecipeInput,
	options: {
		query?: string;
		sort?: BankScreenSort;
		order?: 'asc' | 'desc';
		limit?: number;
		offset?: number;
	} = {}
): BankScreenRequest {
	return {
		query: options.query ?? recipe.query ?? '',
		states: [...recipe.states],
		active: recipe.active,
		assetMin: recipe.assetRange.min,
		assetMax: recipe.assetRange.max,
		conditions: recipe.metricConditions.map((condition, index) => {
			const metric = WORKSPACE_TO_BANK_SCREEN_METRIC[condition.metric];
			if (!metric) {
				throw new BankScreenRecipeError(
					`metricConditions[${index}].metric ${condition.metric} is not stored on the latest institution snapshot`
				);
			}
			return { ...condition, metric };
		}),
		sort: options.sort ?? 'assets',
		order: options.order ?? 'desc',
		limit: options.limit ?? 50,
		offset: options.offset ?? 0
	};
}

/** Serialize the effective screen without allowing callers to construct SQL-shaped fields. */
export function bankScreenSearchParams(request: BankScreenRequest): URLSearchParams {
	const params = new URLSearchParams({
		active: request.active,
		sort: request.sort,
		order: request.order,
		limit: String(request.limit)
	});
	if (request.offset) params.set('offset', String(request.offset));
	if (request.query) params.set('q', request.query);
	if (request.states.length) params.set('state', request.states.join(','));
	if (request.assetMin !== null) params.set('asset_min', String(request.assetMin));
	if (request.assetMax !== null) params.set('asset_max', String(request.assetMax));
	if (request.conditions.length) params.set('conditions', JSON.stringify(request.conditions));
	return params;
}
