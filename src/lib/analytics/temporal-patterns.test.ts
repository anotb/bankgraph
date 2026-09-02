import { describe, expect, it } from 'vitest';
import {
	TEMPORAL_PATTERN_MAX_SERIES_POINTS,
	TemporalPatternInputError,
	analyzeTemporalPattern,
	type TemporalPatternInput,
	type TemporalPatternSpec,
	type TemporalSeriesPoint
} from './temporal-patterns';

const PERIODS = ['20240331', '20240630', '20240930', '20241231', '20250331', '20250630'];

function points(values: Array<number | null>, periods = PERIODS): TemporalSeriesPoint[] {
	return periods.map((period, index) => ({ period, value: values[index] ?? null }));
}

function input(
	pattern: TemporalPatternSpec,
	overrides: Partial<TemporalPatternInput> = {}
): TemporalPatternInput {
	return {
		metric: 'roa',
		series: points([1, 2, 3, 4, 5, 6]),
		requiredPeriods: PERIODS,
		minimumObservations: 2,
		gapPolicy: 'require_complete',
		tolerance: 0,
		pattern,
		...overrides
	};
}

describe('temporal pattern analysis', () => {
	it('counts only exact consecutive increases and never bridges a missing quarter', () => {
		const result = analyzeTemporalPattern(input(
			{ kind: 'direction_count', direction: 'increase', atLeast: 2 },
			{
				series: points([1, 2, null, 4, 5, null]),
				gapPolicy: 'allow_missing',
				minimumObservations: 4
			}
		));

		expect(result.status).toBe('matched');
		expect(result.coverage).toMatchObject({
			observedPeriodCount: 4,
			missingPeriods: ['20240930', '20250630'],
			comparableIntervalCount: 2
		});
		expect(result.triggers.map(({ periods }) => periods)).toEqual([
			['20240331', '20240630'],
			['20241231', '20250331']
		]);
	});

	it('makes a complete-window gap insufficient instead of silently evaluating around it', () => {
		const result = analyzeTemporalPattern(input(
			{ kind: 'direction_count', direction: 'increase', atLeast: 1 },
			{ series: points([1, 2, null, 4, 5, 6]) }
		));

		expect(result.status).toBe('insufficient_data');
		expect(result.reason).toBe('required_periods_missing');
		expect(result.totalTriggerCount).toBe(0);
	});

	it('resets a consecutive streak at both missing observations and calendar gaps', () => {
		const requiredPeriods = ['20240331', '20240630', '20241231', '20250331', '20250630'];
		const result = analyzeTemporalPattern(input(
			{ kind: 'consecutive_streak', direction: 'increase', minimumIntervals: 2 },
			{
				requiredPeriods,
				series: points([1, 2, 4, 5, 6], requiredPeriods),
				gapPolicy: 'allow_missing'
			}
		));

		expect(result.status).toBe('matched');
		expect(result.evaluation.longestStreak).toBe(2);
		expect(result.coverage.exactIntervalCount).toBe(3);
		expect(result.triggers.map(({ periods }) => periods)).not.toContainEqual([
			'20240630',
			'20241231'
		]);
	});

	it('treats movements inside tolerance as ties', () => {
		const result = analyzeTemporalPattern(input(
			{ kind: 'direction_count', direction: 'increase', atLeast: 1 },
			{
				requiredPeriods: PERIODS.slice(0, 3),
				series: points([1, 1.05, 1.3], PERIODS.slice(0, 3)),
				tolerance: 0.1
			}
		));

		expect(result.status).toBe('matched');
		expect(result.evaluation).toMatchObject({ testedComparisons: 2, matchingComparisons: 1 });
		expect(result.triggerPeriods).toEqual(['20240930']);
	});

	it('applies the same exact-quarter rule to decreases', () => {
		const periods = PERIODS.slice(0, 4);
		const result = analyzeTemporalPattern(input(
			{ kind: 'direction_count', direction: 'decrease', atLeast: 2 },
			{ requiredPeriods: periods, series: points([4, 3, 3, 1], periods) }
		));

		expect(result.status).toBe('matched');
		expect(result.triggerPeriods).toEqual(['20240630', '20241231']);
	});

	it('uses canonical metric-change units for cumulative comparisons', () => {
		const assets = analyzeTemporalPattern(input(
			{ kind: 'cumulative_change', operator: 'gte', threshold: 20 },
			{
				metric: 'asset',
				requiredPeriods: ['20240331', '20250331'],
				series: points([100, 121], ['20240331', '20250331']),
				tolerance: 0.001
			}
		));
		const ratio = analyzeTemporalPattern(input(
			{ kind: 'cumulative_change', operator: 'eq', threshold: 0.5 },
			{
				requiredPeriods: ['20240331', '20250331'],
				series: points([2, 2.5], ['20240331', '20250331']),
				tolerance: 0.001
			}
		));

		expect(assets.status).toBe('matched');
		expect(assets.units.change).toBe('percent_change');
		expect(assets.endpoints.levelChange).toBe(21);
		expect(assets.endpoints.canonicalChange).toBeCloseTo(21);
		expect(ratio.status).toBe('matched');
		expect(ratio.units.change).toBe('percentage_points');
		expect(ratio.endpoints.canonicalChange).toBe(0.5);
	});

	it('reports an unavailable canonical percent change when the opening value is zero', () => {
		const result = analyzeTemporalPattern(input(
			{ kind: 'cumulative_change', operator: 'gt', threshold: 0 },
			{
				metric: 'asset',
				requiredPeriods: PERIODS.slice(0, 2),
				series: points([0, 10], PERIODS.slice(0, 2))
			}
		));

		expect(result.status).toBe('insufficient_data');
		expect(result.reason).toBe('canonical_change_unavailable');
		expect(result.endpoints.levelChange).toBe(10);
	});

	it('detects acceleration and deceleration from exact quarter-over-quarter changes', () => {
		const periods = PERIODS.slice(0, 4);
		const series = points([1, 2, 4, 5], periods);
		const accelerating = analyzeTemporalPattern(input(
			{ kind: 'change_acceleration', direction: 'accelerating', atLeast: 1 },
			{ requiredPeriods: periods, series }
		));
		const decelerating = analyzeTemporalPattern(input(
			{ kind: 'change_acceleration', direction: 'decelerating', atLeast: 1 },
			{ requiredPeriods: periods, series }
		));

		expect(accelerating.status).toBe('matched');
		expect(accelerating.triggers[0]).toMatchObject({
			periods: ['20240331', '20240630', '20240930'],
			levelChanges: [1, 2],
			changeOfChange: 1
		});
		expect(decelerating.status).toBe('matched');
		expect(decelerating.triggers[0]).toMatchObject({
			periods: ['20240630', '20240930', '20241231'],
			levelChanges: [2, 1],
			changeOfChange: -1
		});
	});

	it('does not derive acceleration across a missing exact quarter', () => {
		const result = analyzeTemporalPattern(input(
			{ kind: 'change_acceleration', direction: 'accelerating', atLeast: 1 },
			{
				requiredPeriods: PERIODS.slice(0, 3),
				series: points([1, null, 4], PERIODS.slice(0, 3)),
				gapPolicy: 'allow_missing'
			}
		));

		expect(result.status).toBe('insufficient_data');
		expect(result.reason).toBe('no_comparable_acceleration_intervals');
	});

	it('detects threshold crossings outside the declared tolerance band', () => {
		const periods = PERIODS.slice(0, 4);
		const above = analyzeTemporalPattern(input(
			{ kind: 'threshold_cross', direction: 'above', threshold: 2 },
			{
				requiredPeriods: periods,
				series: points([1.9, 2.05, 2.11, 2.5], periods),
				tolerance: 0.1
			}
		));
		const below = analyzeTemporalPattern(input(
			{ kind: 'threshold_cross', direction: 'below', threshold: 2 },
			{
				requiredPeriods: periods,
				series: points([2.2, 2.05, 1.89, 1.5], periods),
				tolerance: 0.1
			}
		));

		expect(above.triggerPeriods).toEqual(['20240930']);
		expect(below.triggerPeriods).toEqual(['20240930']);
	});

	it('expands exact period windows and bounds the materialization series', () => {
		const startYear = 1980;
		const series = Array.from({ length: 60 }, (_, index) => {
			const year = startYear + Math.floor(index / 4);
			const ending = ['0331', '0630', '0930', '1231'][index % 4];
			return { period: `${year}${ending}`, value: index };
		});
		const result = analyzeTemporalPattern(input(
			{ kind: 'direction_count', direction: 'increase', atLeast: 1 },
			{
				requiredPeriods: undefined,
				periodWindow: { startPeriod: series[0].period, endPeriod: series.at(-1)!.period },
				series
			}
		));

		expect(result.periods).toHaveLength(60);
		expect(result.series).toMatchObject({
			totalPointCount: 60,
			truncated: true
		});
		expect(result.series.points).toHaveLength(TEMPORAL_PATTERN_MAX_SERIES_POINTS);
		expect(result.series.points[0].period).toBe(series[0].period);
		expect(result.series.points.at(-1)!.period).toBe(series.at(-1)!.period);
	});

	it('rejects unsupported metrics and malformed period selectors', () => {
		expect(() => analyzeTemporalPattern(input(
			{ kind: 'direction_count', direction: 'increase', atLeast: 1 },
			{ metric: 'made_up_metric' }
		))).toThrow(TemporalPatternInputError);
		expect(() => analyzeTemporalPattern(input(
			{ kind: 'direction_count', direction: 'increase', atLeast: 1 },
			{ periodWindow: { startPeriod: '20240101', endPeriod: '20240630' } }
		))).toThrow('Provide exactly one of periodWindow or requiredPeriods');
	});
});
