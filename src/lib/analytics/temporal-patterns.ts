import {
	isResearchMetric,
	researchMetricDefinition,
	type ResearchMetric,
	type ResearchMetricChange,
	type ResearchMetricUnit
} from '$lib/research-metrics';
import { fdicQuarterIndex } from '$lib/utils/fdic-quarter';

export const TEMPORAL_PATTERN_MAX_PERIODS = 160;
export const TEMPORAL_PATTERN_MAX_SERIES_POINTS = 40;
export const TEMPORAL_PATTERN_MAX_TRIGGERS = 24;

export type TemporalGapPolicy = 'require_complete' | 'allow_missing';
export type TemporalDirection = 'increase' | 'decrease';
export type TemporalComparisonOperator = 'gt' | 'gte' | 'lt' | 'lte' | 'eq';
export type TemporalPatternStatus = 'matched' | 'not_matched' | 'insufficient_data';
export type TemporalPatternReason =
	| 'minimum_observations_not_met'
	| 'required_periods_missing'
	| 'no_comparable_intervals'
	| 'no_comparable_acceleration_intervals'
	| 'endpoint_unavailable'
	| 'canonical_change_unavailable';

export type TemporalPatternSpec =
	| {
		kind: 'direction_count';
		direction: TemporalDirection;
		atLeast: number;
	}
	| {
		kind: 'consecutive_streak';
		direction: TemporalDirection;
		minimumIntervals: number;
	}
	| {
		kind: 'cumulative_change';
		operator: TemporalComparisonOperator;
		threshold: number;
	}
	| {
		kind: 'change_acceleration';
		direction: 'accelerating' | 'decelerating';
		atLeast: number;
	}
	| {
		kind: 'threshold_cross';
		direction: 'above' | 'below';
		threshold: number;
	};

export interface TemporalSeriesPoint {
	period: string;
	value: number | null;
}

export interface TemporalPeriodWindow {
	startPeriod: string;
	endPeriod: string;
}

/**
 * `periodWindow` expands every exact FDIC quarter between its endpoints.
 * `requiredPeriods` evaluates only the explicitly named quarters. Callers must
 * supply exactly one selector. Missing observations are never filled or carried
 * across a calendar-quarter gap.
 */
export interface TemporalPatternInput {
	metric: string;
	series: readonly TemporalSeriesPoint[];
	periodWindow?: TemporalPeriodWindow;
	requiredPeriods?: readonly string[];
	minimumObservations: number;
	gapPolicy: TemporalGapPolicy;
	tolerance: number;
	pattern: TemporalPatternSpec;
}

export interface TemporalPatternUnits {
	value: ResearchMetricUnit;
	change: ResearchMetricChange | ResearchMetricUnit;
}

export interface TemporalPatternEndpoint {
	period: string;
	value: number | null;
}

export interface TemporalPatternEndpoints {
	start: TemporalPatternEndpoint;
	end: TemporalPatternEndpoint;
	levelChange: number | null;
	canonicalChange: number | null;
}

export interface TemporalPatternCoverage {
	requiredPeriodCount: number;
	observedPeriodCount: number;
	missingPeriodCount: number;
	missingPeriods: string[];
	observationRatio: number;
	exactIntervalCount: number;
	comparableIntervalCount: number;
	comparableAccelerationIntervalCount: number;
}

export interface TemporalPatternTrigger {
	kind: 'movement' | 'cumulative_change' | 'change_acceleration' | 'threshold_cross';
	periods: string[];
	values: number[];
	/** Raw level changes between each pair of consecutive values. */
	levelChanges: number[];
	/** Canonical endpoint change: percent change, percentage points, or absolute units. */
	canonicalChange: number | null;
	changeOfChange?: number;
	threshold?: number;
}

export interface CompactTemporalSeries {
	points: TemporalSeriesPoint[];
	totalPointCount: number;
	truncated: boolean;
}

export interface TemporalPatternEvaluation {
	testedComparisons: number;
	matchingComparisons: number;
	requiredMatches: number | null;
	longestStreak: number | null;
	comparisonValue: number | null;
}

export interface TemporalPatternResult {
	status: TemporalPatternStatus;
	reason: TemporalPatternReason | null;
	metric: ResearchMetric;
	pattern: TemporalPatternSpec;
	gapPolicy: TemporalGapPolicy;
	minimumObservations: number;
	tolerance: number;
	periods: string[];
	units: TemporalPatternUnits;
	coverage: TemporalPatternCoverage;
	endpoints: TemporalPatternEndpoints;
	evaluation: TemporalPatternEvaluation;
	triggerPeriods: string[];
	triggers: TemporalPatternTrigger[];
	totalTriggerCount: number;
	series: CompactTemporalSeries;
}

export class TemporalPatternInputError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'TemporalPatternInputError';
	}
}

interface ExactInterval {
	fromPeriod: string;
	toPeriod: string;
	fromValue: number;
	toValue: number;
	levelChange: number;
	canonicalChange: number | null;
}

interface AccelerationInterval {
	periods: [string, string, string];
	values: [number, number, number];
	levelChanges: [number, number];
	changeOfChange: number;
	canonicalChange: number | null;
}

const QUARTER_ENDINGS = ['0331', '0630', '0930', '1231'] as const;

function periodFromQuarterIndex(index: number): string {
	const year = Math.floor(index / 4);
	const quarter = index % 4;
	return `${year}${QUARTER_ENDINGS[quarter]}`;
}

function assertFinite(value: number, field: string): void {
	if (!Number.isFinite(value)) {
		throw new TemporalPatternInputError(`${field} must be a finite number`);
	}
}

function assertPositiveInteger(value: number, field: string): void {
	if (!Number.isInteger(value) || value < 1) {
		throw new TemporalPatternInputError(`${field} must be a positive integer`);
	}
}

function validPeriod(period: unknown, field: string): number {
	const index = fdicQuarterIndex(period);
	if (index === null) {
		throw new TemporalPatternInputError(`${field} must be an exact FDIC quarter end`);
	}
	return index;
}

function resolvePeriods(input: TemporalPatternInput): string[] {
	const hasWindow = input.periodWindow !== undefined;
	const hasRequiredPeriods = input.requiredPeriods !== undefined;
	if (hasWindow === hasRequiredPeriods) {
		throw new TemporalPatternInputError(
			'Provide exactly one of periodWindow or requiredPeriods'
		);
	}

	if (input.periodWindow) {
		const start = validPeriod(input.periodWindow.startPeriod, 'periodWindow.startPeriod');
		const end = validPeriod(input.periodWindow.endPeriod, 'periodWindow.endPeriod');
		if (end < start) {
			throw new TemporalPatternInputError('periodWindow.endPeriod must not precede startPeriod');
		}
		const count = end - start + 1;
		if (count < 2 || count > TEMPORAL_PATTERN_MAX_PERIODS) {
			throw new TemporalPatternInputError(
				`periodWindow must contain between 2 and ${TEMPORAL_PATTERN_MAX_PERIODS} quarters`
			);
		}
		return Array.from({ length: count }, (_, offset) => periodFromQuarterIndex(start + offset));
	}

	const requiredPeriods = input.requiredPeriods ?? [];
	if (requiredPeriods.length < 2 || requiredPeriods.length > TEMPORAL_PATTERN_MAX_PERIODS) {
		throw new TemporalPatternInputError(
			`requiredPeriods must contain between 2 and ${TEMPORAL_PATTERN_MAX_PERIODS} quarters`
		);
	}
	const indexed = requiredPeriods.map((period, index) => ({
		period,
		quarter: validPeriod(period, `requiredPeriods[${index}]`)
	}));
	if (new Set(indexed.map(({ period }) => period)).size !== indexed.length) {
		throw new TemporalPatternInputError('requiredPeriods must not contain duplicates');
	}
	return indexed.sort((a, b) => a.quarter - b.quarter).map(({ period }) => period);
}

function validatePattern(pattern: TemporalPatternSpec, periodCount: number): void {
	if (!pattern || typeof pattern !== 'object' || typeof pattern.kind !== 'string') {
		throw new TemporalPatternInputError('pattern must declare a supported kind');
	}
	switch (pattern.kind) {
		case 'direction_count':
			if (pattern.direction !== 'increase' && pattern.direction !== 'decrease') {
				throw new TemporalPatternInputError('pattern.direction must be increase or decrease');
			}
			assertPositiveInteger(pattern.atLeast, 'pattern.atLeast');
			if (pattern.atLeast > periodCount - 1) {
				throw new TemporalPatternInputError('pattern.atLeast exceeds the available quarter intervals');
			}
			break;
		case 'consecutive_streak':
			if (pattern.direction !== 'increase' && pattern.direction !== 'decrease') {
				throw new TemporalPatternInputError('pattern.direction must be increase or decrease');
			}
			assertPositiveInteger(pattern.minimumIntervals, 'pattern.minimumIntervals');
			if (pattern.minimumIntervals > periodCount - 1) {
				throw new TemporalPatternInputError(
					'pattern.minimumIntervals exceeds the available quarter intervals'
				);
			}
			break;
		case 'cumulative_change':
			if (!['gt', 'gte', 'lt', 'lte', 'eq'].includes(pattern.operator)) {
				throw new TemporalPatternInputError('pattern.operator is not supported');
			}
			assertFinite(pattern.threshold, 'pattern.threshold');
			break;
		case 'change_acceleration':
			if (pattern.direction !== 'accelerating' && pattern.direction !== 'decelerating') {
				throw new TemporalPatternInputError(
					'pattern.direction must be accelerating or decelerating'
				);
			}
			assertPositiveInteger(pattern.atLeast, 'pattern.atLeast');
			if (pattern.atLeast > Math.max(0, periodCount - 2)) {
				throw new TemporalPatternInputError(
					'pattern.atLeast exceeds the available acceleration intervals'
				);
			}
			break;
		case 'threshold_cross':
			if (pattern.direction !== 'above' && pattern.direction !== 'below') {
				throw new TemporalPatternInputError('pattern.direction must be above or below');
			}
			assertFinite(pattern.threshold, 'pattern.threshold');
			break;
		default:
			throw new TemporalPatternInputError(
				`Unsupported temporal pattern kind: ${String((pattern as { kind?: unknown }).kind)}`
			);
	}
}

function canonicalChange(metric: ResearchMetric, start: number, end: number): number | null {
	const mode = researchMetricDefinition(metric).change;
	if (mode === 'percent_change') return start === 0 ? null : (end / start - 1) * 100;
	return end - start;
}

function compactSeries(points: TemporalSeriesPoint[]): CompactTemporalSeries {
	if (points.length <= TEMPORAL_PATTERN_MAX_SERIES_POINTS) {
		return { points, totalPointCount: points.length, truncated: false };
	}
	const selected = Array.from(
		{ length: TEMPORAL_PATTERN_MAX_SERIES_POINTS },
		(_, index) => points[
			Math.round((index * (points.length - 1)) / (TEMPORAL_PATTERN_MAX_SERIES_POINTS - 1))
		]
	);
	return { points: selected, totalPointCount: points.length, truncated: true };
}

function boundedTriggers(triggers: TemporalPatternTrigger[]): TemporalPatternTrigger[] {
	if (triggers.length <= TEMPORAL_PATTERN_MAX_TRIGGERS) return triggers;
	const half = TEMPORAL_PATTERN_MAX_TRIGGERS / 2;
	return [...triggers.slice(0, half), ...triggers.slice(-half)];
}

function compare(value: number, operator: TemporalComparisonOperator, threshold: number, tolerance: number): boolean {
	const difference = value - threshold;
	switch (operator) {
		case 'gt': return difference > tolerance;
		case 'gte': return difference >= -tolerance;
		case 'lt': return difference < -tolerance;
		case 'lte': return difference <= tolerance;
		case 'eq': return Math.abs(difference) <= tolerance;
	}
}

function directionMatches(change: number, direction: TemporalDirection, tolerance: number): boolean {
	return direction === 'increase' ? change > tolerance : change < -tolerance;
}

function createTrigger(interval: ExactInterval): TemporalPatternTrigger {
	return {
		kind: 'movement',
		periods: [interval.fromPeriod, interval.toPeriod],
		values: [interval.fromValue, interval.toValue],
		levelChanges: [interval.levelChange],
		canonicalChange: interval.canonicalChange
	};
}

function uniqueTriggerPeriods(triggers: readonly TemporalPatternTrigger[]): string[] {
	return [...new Set(triggers.map((trigger) => trigger.periods.at(-1)!))];
}

/**
 * Evaluate one bank/metric series without interpolation, stale-value carry, or
 * statistical scoring. Direction, streak, crossing, and acceleration predicates
 * use raw metric levels; cumulative change uses the metric registry's canonical
 * change convention (percent change, percentage points, or absolute units).
 */
export function analyzeTemporalPattern(input: TemporalPatternInput): TemporalPatternResult {
	if (!isResearchMetric(input.metric)) {
		throw new TemporalPatternInputError(`Unsupported research metric: ${input.metric}`);
	}
	const metric = input.metric;
	const periods = resolvePeriods(input);
	assertPositiveInteger(input.minimumObservations, 'minimumObservations');
	if (input.minimumObservations < 2 || input.minimumObservations > periods.length) {
		throw new TemporalPatternInputError(
			'minimumObservations must be between 2 and the number of required periods'
		);
	}
	if (input.gapPolicy !== 'require_complete' && input.gapPolicy !== 'allow_missing') {
		throw new TemporalPatternInputError('gapPolicy must be require_complete or allow_missing');
	}
	assertFinite(input.tolerance, 'tolerance');
	if (input.tolerance < 0) {
		throw new TemporalPatternInputError('tolerance must be greater than or equal to zero');
	}
	validatePattern(input.pattern, periods.length);

	const values = new Map<string, number | null>();
	for (const [index, point] of input.series.entries()) {
		validPeriod(point.period, `series[${index}].period`);
		if (values.has(point.period)) {
			throw new TemporalPatternInputError(`series contains duplicate period ${point.period}`);
		}
		if (point.value !== null) assertFinite(point.value, `series[${index}].value`);
		values.set(point.period, point.value);
	}

	const requiredSeries = periods.map((period) => ({ period, value: values.get(period) ?? null }));
	const missingPeriods = requiredSeries
		.filter((point) => point.value === null)
		.map((point) => point.period);
	const observedPeriodCount = periods.length - missingPeriods.length;

	const exactIntervals: ExactInterval[] = [];
	for (let index = 1; index < requiredSeries.length; index++) {
		const from = requiredSeries[index - 1];
		const to = requiredSeries[index];
		if (fdicQuarterIndex(to.period)! - fdicQuarterIndex(from.period)! !== 1) continue;
		if (from.value === null || to.value === null) continue;
		exactIntervals.push({
			fromPeriod: from.period,
			toPeriod: to.period,
			fromValue: from.value,
			toValue: to.value,
			levelChange: to.value - from.value,
			canonicalChange: canonicalChange(metric, from.value, to.value)
		});
	}

	const accelerationIntervals: AccelerationInterval[] = [];
	for (let index = 2; index < requiredSeries.length; index++) {
		const first = requiredSeries[index - 2];
		const middle = requiredSeries[index - 1];
		const last = requiredSeries[index];
		const firstQuarter = fdicQuarterIndex(first.period)!;
		const middleQuarter = fdicQuarterIndex(middle.period)!;
		const lastQuarter = fdicQuarterIndex(last.period)!;
		if (middleQuarter - firstQuarter !== 1 || lastQuarter - middleQuarter !== 1) continue;
		if (first.value === null || middle.value === null || last.value === null) continue;
		const firstChange = middle.value - first.value;
		const secondChange = last.value - middle.value;
		accelerationIntervals.push({
			periods: [first.period, middle.period, last.period],
			values: [first.value, middle.value, last.value],
			levelChanges: [firstChange, secondChange],
			changeOfChange: secondChange - firstChange,
			canonicalChange: canonicalChange(metric, first.value, last.value)
		});
	}

	const startPoint = requiredSeries[0];
	const endPoint = requiredSeries.at(-1)!;
	const endpointLevelChange = startPoint.value === null || endPoint.value === null
		? null
		: endPoint.value - startPoint.value;
	const endpointCanonicalChange = startPoint.value === null || endPoint.value === null
		? null
		: canonicalChange(metric, startPoint.value, endPoint.value);
	const definition = researchMetricDefinition(metric);
	const exactIntervalCount = periods.slice(1).filter((period, index) =>
		fdicQuarterIndex(period)! - fdicQuarterIndex(periods[index])! === 1
	).length;
	const coverage: TemporalPatternCoverage = {
		requiredPeriodCount: periods.length,
		observedPeriodCount,
		missingPeriodCount: missingPeriods.length,
		missingPeriods,
		observationRatio: observedPeriodCount / periods.length,
		exactIntervalCount,
		comparableIntervalCount: exactIntervals.length,
		comparableAccelerationIntervalCount: accelerationIntervals.length
	};

	let status: TemporalPatternStatus = 'not_matched';
	let reason: TemporalPatternReason | null = null;
	let triggers: TemporalPatternTrigger[] = [];
	let evaluation: TemporalPatternEvaluation = {
		testedComparisons: 0,
		matchingComparisons: 0,
		requiredMatches: null,
		longestStreak: null,
		comparisonValue: null
	};

	if (observedPeriodCount < input.minimumObservations) {
		status = 'insufficient_data';
		reason = 'minimum_observations_not_met';
	} else if (input.gapPolicy === 'require_complete' && missingPeriods.length > 0) {
		status = 'insufficient_data';
		reason = 'required_periods_missing';
	} else {
		const pattern = input.pattern;
		switch (pattern.kind) {
			case 'direction_count': {
				evaluation.testedComparisons = exactIntervals.length;
				evaluation.requiredMatches = pattern.atLeast;
				if (exactIntervals.length === 0) {
					status = 'insufficient_data';
					reason = 'no_comparable_intervals';
					break;
				}
				const matching = exactIntervals.filter((interval) =>
					directionMatches(interval.levelChange, pattern.direction, input.tolerance)
				);
				triggers = matching.map(createTrigger);
				evaluation.matchingComparisons = matching.length;
				status = matching.length >= pattern.atLeast ? 'matched' : 'not_matched';
				break;
			}
			case 'consecutive_streak': {
				evaluation.testedComparisons = exactIntervals.length;
				evaluation.requiredMatches = pattern.minimumIntervals;
				if (exactIntervals.length === 0) {
					status = 'insufficient_data';
					reason = 'no_comparable_intervals';
					break;
				}
				const intervalByEnd = new Map(exactIntervals.map((interval) => [interval.toPeriod, interval]));
				let currentStreak = 0;
				let longestStreak = 0;
				const matching: ExactInterval[] = [];
				for (let index = 1; index < requiredSeries.length; index++) {
					const prior = requiredSeries[index - 1];
					const current = requiredSeries[index];
					const interval = intervalByEnd.get(current.period);
					const isExact = fdicQuarterIndex(current.period)! - fdicQuarterIndex(prior.period)! === 1;
					if (
						isExact && interval &&
						directionMatches(interval.levelChange, pattern.direction, input.tolerance)
					) {
						currentStreak += 1;
						longestStreak = Math.max(longestStreak, currentStreak);
						matching.push(interval);
					} else {
						currentStreak = 0;
					}
				}
				triggers = matching.map(createTrigger);
				evaluation.matchingComparisons = matching.length;
				evaluation.longestStreak = longestStreak;
				status = longestStreak >= pattern.minimumIntervals ? 'matched' : 'not_matched';
				break;
			}
			case 'cumulative_change': {
				evaluation.testedComparisons = endpointCanonicalChange === null ? 0 : 1;
				evaluation.requiredMatches = 1;
				evaluation.comparisonValue = endpointCanonicalChange;
				if (startPoint.value === null || endPoint.value === null) {
					status = 'insufficient_data';
					reason = 'endpoint_unavailable';
					break;
				}
				if (endpointCanonicalChange === null) {
					status = 'insufficient_data';
					reason = 'canonical_change_unavailable';
					break;
				}
				const matched = compare(
					endpointCanonicalChange,
					pattern.operator,
					pattern.threshold,
					input.tolerance
				);
				evaluation.matchingComparisons = matched ? 1 : 0;
				status = matched ? 'matched' : 'not_matched';
				if (matched) {
					triggers = [{
						kind: 'cumulative_change',
						periods: [startPoint.period, endPoint.period],
						values: [startPoint.value, endPoint.value],
						levelChanges: [endpointLevelChange!],
						canonicalChange: endpointCanonicalChange,
						threshold: pattern.threshold
					}];
				}
				break;
			}
			case 'change_acceleration': {
				evaluation.testedComparisons = accelerationIntervals.length;
				evaluation.requiredMatches = pattern.atLeast;
				if (accelerationIntervals.length === 0) {
					status = 'insufficient_data';
					reason = 'no_comparable_acceleration_intervals';
					break;
				}
				const matching = accelerationIntervals.filter((interval) =>
					pattern.direction === 'accelerating'
						? interval.changeOfChange > input.tolerance
						: interval.changeOfChange < -input.tolerance
				);
				triggers = matching.map((interval) => ({
					kind: 'change_acceleration',
					periods: [...interval.periods],
					values: [...interval.values],
					levelChanges: [...interval.levelChanges],
					canonicalChange: interval.canonicalChange,
					changeOfChange: interval.changeOfChange
				}));
				evaluation.matchingComparisons = matching.length;
				status = matching.length >= pattern.atLeast ? 'matched' : 'not_matched';
				break;
			}
			case 'threshold_cross': {
				evaluation.testedComparisons = exactIntervals.length;
				evaluation.requiredMatches = 1;
				evaluation.comparisonValue = pattern.threshold;
				if (exactIntervals.length === 0) {
					status = 'insufficient_data';
					reason = 'no_comparable_intervals';
					break;
				}
				const matching = exactIntervals.filter((interval) =>
					pattern.direction === 'above'
						? interval.fromValue <= pattern.threshold + input.tolerance &&
							interval.toValue > pattern.threshold + input.tolerance
						: interval.fromValue >= pattern.threshold - input.tolerance &&
							interval.toValue < pattern.threshold - input.tolerance
				);
				triggers = matching.map((interval) => ({
					...createTrigger(interval),
					kind: 'threshold_cross',
					threshold: pattern.threshold
				}));
				evaluation.matchingComparisons = matching.length;
				status = matching.length > 0 ? 'matched' : 'not_matched';
				break;
			}
		}
	}

	const totalTriggerCount = triggers.length;
	return {
		status,
		reason,
		metric,
		pattern: { ...input.pattern } as TemporalPatternSpec,
		gapPolicy: input.gapPolicy,
		minimumObservations: input.minimumObservations,
		tolerance: input.tolerance,
		periods,
		units: {
			value: definition.unit,
			change: definition.change === 'absolute_change' ? definition.unit : definition.change
		},
		coverage,
		endpoints: {
			start: startPoint,
			end: endPoint,
			levelChange: endpointLevelChange,
			canonicalChange: endpointCanonicalChange
		},
		evaluation,
		triggerPeriods: uniqueTriggerPeriods(triggers),
		triggers: boundedTriggers(triggers),
		totalTriggerCount,
		series: compactSeries(requiredSeries)
	};
}
