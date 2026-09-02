import {
	researchMetricDefinition,
	type ResearchMetric,
	type ResearchMetricAggregation,
	type ResearchMetricChange,
	type ResearchMetricUnit
} from '$lib/research-metrics';

export interface CohortTransitionRow {
	period: string;
	/** Canonical endpoint values. Derived metrics must already be materialized. */
	values: Partial<Record<ResearchMetric, number | null>>;
}

export interface CohortTransitionGroup {
	key: string;
	label: string;
}

export interface CohortTransitionEntity {
	id: string | number;
	name: string;
	state?: string | null;
	group?: CohortTransitionGroup | null;
	rows: CohortTransitionRow[];
}

export interface TransitionQuantiles {
	count: number;
	minimum: number | null;
	p10: number | null;
	p25: number | null;
	median: number | null;
	p75: number | null;
	p90: number | null;
	maximum: number | null;
}

export interface CohortTransitionCoverage {
	cohort: number;
	openingReported: number;
	closingReported: number;
	paired: number;
	primaryChangeEligible: number;
	openingOnly: number;
	closingOnly: number;
	neither: number;
}

export interface CohortTransitionBreadth {
	increasing: number;
	decreasing: number;
	unchanged: number;
	increasingShare: number;
	decreasingShare: number;
	unchangedShare: number;
	equality: 'exact_endpoint_value';
}

export interface CohortTransitionMover {
	id: string | number;
	name: string;
	state: string | null;
	group: CohortTransitionGroup | null;
	opening: number;
	closing: number;
	change: number;
	primaryChange: number | null;
	shareOfGrossMovement: number;
	shareOfDirectionalMovement: number;
}

export interface CohortTransitionMetricSummary {
	metric: ResearchMetric;
	label: string;
	unit: ResearchMetricUnit;
	change: ResearchMetricChange;
	aggregation: ResearchMetricAggregation;
	coverage: CohortTransitionCoverage;
	breadth: CohortTransitionBreadth;
	distribution: {
		population: 'paired_metric_reporters';
		opening: TransitionQuantiles;
		closing: TransitionQuantiles;
		primaryChange: TransitionQuantiles;
	};
	additiveMatchedTotals: {
		opening: number;
		closing: number;
		change: number;
		percentChange: number | null;
	} | null;
	movement: {
		basis: 'absolute_endpoint_difference';
		positive: number;
		negativeAbsolute: number;
		grossAbsolute: number;
		net: number;
		concentration: {
			top1Share: number;
			top5Share: number;
			top10Share: number;
		};
	};
	topMovers: {
		interpretation: 'contributors_to_matched_total_change' | 'metric_movers';
		limitPerDirection: number;
		increases: CohortTransitionMover[];
		decreases: CohortTransitionMover[];
	};
}

export interface CohortTransitionGroupMetricSummary {
	metric: ResearchMetric;
	paired: number;
	increasing: number;
	decreasing: number;
	unchanged: number;
	grossMovement: number;
	shareOfMetricGrossMovement: number;
	additiveNetChange: number | null;
}

export interface CohortTransitionGroupSummary {
	key: string;
	label: string;
	cohort: number;
	metrics: CohortTransitionGroupMetricSummary[];
}

export interface CohortTransition {
	period: { opening: string; closing: string };
	cohort: { definition: 'caller_supplied_exact_entities'; count: number };
	metrics: CohortTransitionMetricSummary[];
	groups: CohortTransitionGroupSummary[];
}

export interface DeriveCohortTransitionInput {
	openingPeriod: string;
	closingPeriod: string;
	metrics: readonly ResearchMetric[];
	entities: readonly CohortTransitionEntity[];
	topLimit?: number;
}

interface Observation {
	entity: CohortTransitionEntity;
	opening: number;
	closing: number;
	delta: number;
	primaryChange: number | null;
}

function finite(value: number | null | undefined): value is number {
	return typeof value === 'number' && Number.isFinite(value);
}

function share(value: number, denominator: number): number {
	return denominator === 0 ? 0 : (value / denominator) * 100;
}

function percentChange(opening: number, closing: number): number | null {
	return opening === 0 ? null : ((closing - opening) / Math.abs(opening)) * 100;
}

function primaryChange(change: ResearchMetricChange, opening: number, closing: number): number | null {
	return change === 'percent_change' ? percentChange(opening, closing) : closing - opening;
}

function quantile(sorted: readonly number[], probability: number): number | null {
	if (sorted.length === 0) return null;
	const index = (sorted.length - 1) * probability;
	const lower = Math.floor(index);
	const fraction = index - lower;
	return sorted[lower + 1] === undefined
		? sorted[lower]
		: sorted[lower] + fraction * (sorted[lower + 1] - sorted[lower]);
}

function quantiles(values: readonly number[]): TransitionQuantiles {
	const sorted = [...values].sort((a, b) => a - b);
	return {
		count: sorted.length,
		minimum: sorted[0] ?? null,
		p10: quantile(sorted, 0.1),
		p25: quantile(sorted, 0.25),
		median: quantile(sorted, 0.5),
		p75: quantile(sorted, 0.75),
		p90: quantile(sorted, 0.9),
		maximum: sorted.at(-1) ?? null
	};
}

function valueAt(entity: CohortTransitionEntity, period: string, metric: ResearchMetric): number | null {
	const matching = entity.rows.filter((row) => row.period === period);
	if (matching.length > 1) throw new Error(`Duplicate period ${period} for cohort entity ${entity.id}`);
	const value = matching[0]?.values[metric];
	return finite(value) ? value : null;
}

function entityKey(id: string | number): string {
	return `${typeof id}:${id}`;
}

function compareEntityIds(left: string | number, right: string | number): number {
	return typeof left === 'number' && typeof right === 'number'
		? left - right
		: entityKey(left).localeCompare(entityKey(right));
}

function mover(
	observation: Observation,
	grossMovement: number,
	directionalMovement: number
): CohortTransitionMover {
	return {
		id: observation.entity.id,
		name: observation.entity.name,
		state: observation.entity.state ?? null,
		group: observation.entity.group ?? null,
		opening: observation.opening,
		closing: observation.closing,
		change: observation.delta,
		primaryChange: observation.primaryChange,
		shareOfGrossMovement: share(Math.abs(observation.delta), grossMovement),
		shareOfDirectionalMovement: share(Math.abs(observation.delta), directionalMovement)
	};
}

function concentration(observations: readonly Observation[], gross: number, limit: number): number {
	return share(
		[...observations]
			.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta) || compareEntityIds(a.entity.id, b.entity.id))
			.slice(0, limit)
			.reduce((total, observation) => total + Math.abs(observation.delta), 0),
		gross
	);
}

function deriveMetric(
	metric: ResearchMetric,
	entities: readonly CohortTransitionEntity[],
	openingPeriod: string,
	closingPeriod: string,
	topLimit: number
): { summary: CohortTransitionMetricSummary; observations: Observation[] } {
	const definition = researchMetricDefinition(metric);
	let openingReported = 0;
	let closingReported = 0;
	let openingOnly = 0;
	let closingOnly = 0;
	let neither = 0;
	const observations: Observation[] = [];
	for (const entity of entities) {
		const opening = valueAt(entity, openingPeriod, metric);
		const closing = valueAt(entity, closingPeriod, metric);
		if (opening !== null) openingReported++;
		if (closing !== null) closingReported++;
		if (opening === null && closing === null) neither++;
		else if (opening !== null && closing === null) openingOnly++;
		else if (opening === null && closing !== null) closingOnly++;
		else if (opening !== null && closing !== null) {
			observations.push({
				entity,
				opening,
				closing,
				delta: closing - opening,
				primaryChange: primaryChange(definition.change, opening, closing)
			});
		}
	}
	const increasing = observations.filter((observation) => observation.delta > 0).length;
	const decreasing = observations.filter((observation) => observation.delta < 0).length;
	const unchanged = observations.length - increasing - decreasing;
	const openingTotal = observations.reduce((total, observation) => total + observation.opening, 0);
	const closingTotal = observations.reduce((total, observation) => total + observation.closing, 0);
	const positive = observations.reduce((total, observation) => total + Math.max(observation.delta, 0), 0);
	const negativeAbsolute = observations.reduce((total, observation) => total + Math.max(-observation.delta, 0), 0);
	const grossAbsolute = positive + negativeAbsolute;
	const increases = observations
		.filter((observation) => observation.delta > 0)
		.sort((a, b) => b.delta - a.delta || compareEntityIds(a.entity.id, b.entity.id))
		.slice(0, topLimit)
		.map((observation) => mover(observation, grossAbsolute, positive));
	const decreases = observations
		.filter((observation) => observation.delta < 0)
		.sort((a, b) => a.delta - b.delta || compareEntityIds(a.entity.id, b.entity.id))
		.slice(0, topLimit)
		.map((observation) => mover(observation, grossAbsolute, negativeAbsolute));

	return {
		observations,
		summary: {
			metric,
			label: definition.label,
			unit: definition.unit,
			change: definition.change,
			aggregation: definition.aggregation,
			coverage: {
				cohort: entities.length,
				openingReported,
				closingReported,
				paired: observations.length,
				primaryChangeEligible: observations.filter((observation) => observation.primaryChange !== null).length,
				openingOnly,
				closingOnly,
				neither
			},
			breadth: {
				increasing,
				decreasing,
				unchanged,
				increasingShare: share(increasing, observations.length),
				decreasingShare: share(decreasing, observations.length),
				unchangedShare: share(unchanged, observations.length),
				equality: 'exact_endpoint_value'
			},
			distribution: {
				population: 'paired_metric_reporters',
				opening: quantiles(observations.map((observation) => observation.opening)),
				closing: quantiles(observations.map((observation) => observation.closing)),
				primaryChange: quantiles(observations.flatMap((observation) =>
					observation.primaryChange === null ? [] : [observation.primaryChange]
				))
			},
			additiveMatchedTotals: definition.aggregation === 'additive'
				? {
					opening: openingTotal,
					closing: closingTotal,
					change: closingTotal - openingTotal,
					percentChange: percentChange(openingTotal, closingTotal)
				}
				: null,
			movement: {
				basis: 'absolute_endpoint_difference',
				positive,
				negativeAbsolute,
				grossAbsolute,
				net: positive - negativeAbsolute,
				concentration: {
					top1Share: concentration(observations, grossAbsolute, 1),
					top5Share: concentration(observations, grossAbsolute, 5),
					top10Share: concentration(observations, grossAbsolute, 10)
				}
			},
			topMovers: {
				interpretation: definition.aggregation === 'additive'
					? 'contributors_to_matched_total_change'
					: 'metric_movers',
				limitPerDirection: topLimit,
				increases,
				decreases
			}
		}
	};
}

/**
 * Derive one transition over a caller-defined cohort. Each metric is paired
 * independently, so missing values never leak another metric's denominator.
 */
export function deriveCohortTransition(input: DeriveCohortTransitionInput): CohortTransition {
	if (input.openingPeriod === input.closingPeriod) {
		throw new Error('Opening and closing periods must differ');
	}
	const topLimit = Math.max(1, Math.floor(input.topLimit ?? 5));
	const seenEntities = new Set<string>();
	for (const entity of input.entities) {
		const key = entityKey(entity.id);
		if (seenEntities.has(key)) throw new Error(`Duplicate cohort entity ${entity.id}`);
		seenEntities.add(key);
	}
	const metrics = [...new Set(input.metrics)];
	const derived = metrics.map((metric) =>
		deriveMetric(metric, input.entities, input.openingPeriod, input.closingPeriod, topLimit)
	);
	const groupingEnabled = input.entities.some((entity) => entity.group !== undefined);
	const groupMap = new Map<string, { label: string; entities: CohortTransitionEntity[] }>();
	if (groupingEnabled) {
		for (const entity of input.entities) {
			const group = entity.group ?? { key: 'ungrouped', label: 'Ungrouped' };
			const current = groupMap.get(group.key);
			if (current) current.entities.push(entity);
			else groupMap.set(group.key, { label: group.label, entities: [entity] });
		}
	}
	const groups = [...groupMap.entries()]
		.sort(([a], [b]) => a.localeCompare(b))
		.map(([key, group]): CohortTransitionGroupSummary => ({
			key,
			label: group.label,
			cohort: group.entities.length,
			metrics: derived.map(({ summary, observations }) => {
				const entityIds = new Set(group.entities.map((entity) => entityKey(entity.id)));
				const members = observations.filter((observation) => entityIds.has(entityKey(observation.entity.id)));
				const grossMovement = members.reduce((total, observation) => total + Math.abs(observation.delta), 0);
				return {
					metric: summary.metric,
					paired: members.length,
					increasing: members.filter((observation) => observation.delta > 0).length,
					decreasing: members.filter((observation) => observation.delta < 0).length,
					unchanged: members.filter((observation) => observation.delta === 0).length,
					grossMovement,
					shareOfMetricGrossMovement: share(grossMovement, summary.movement.grossAbsolute),
					additiveNetChange: summary.aggregation === 'additive'
						? members.reduce((total, observation) => total + observation.delta, 0)
						: null
				};
			})
		}));

	return {
		period: { opening: input.openingPeriod, closing: input.closingPeriod },
		cohort: { definition: 'caller_supplied_exact_entities', count: input.entities.length },
		metrics: derived.map(({ summary }) => summary),
		groups
	};
}
