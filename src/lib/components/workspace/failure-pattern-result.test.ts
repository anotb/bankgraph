import { describe, expect, it } from 'vitest';
import type {
	CurrentAnalogue,
	FailurePatternSeries
} from '$lib/server/analytics/failure-patterns';
import {
	chartX,
	failureBandPaths,
	failureMedianPaths,
	failureSeriesDomain,
	sortFailureAnalogues,
	topFailureContributions,
	type FailureChartGeometry
} from './failure-pattern-result';

const geometry: FailureChartGeometry = {
	width: 100,
	height: 80,
	left: 10,
	top: 10,
	right: 10,
	bottom: 10
};

const series: FailurePatternSeries = {
	metric: 'roa',
	label: 'Return on assets',
	unit: 'percent',
	points: [
		{ relativeQuarter: -3, median: 1, q25: 0.5, q75: 1.5, count: 8, cohortCount: 10, coverage: 0.8, referenceScale: 1, referenceScaleMethod: 'mad' },
		{ relativeQuarter: -2, median: null, q25: null, q75: null, count: 0, cohortCount: 10, coverage: 0, referenceScale: 1, referenceScaleMethod: 'feature_floor' },
		{ relativeQuarter: -1, median: -1, q25: -2, q75: 0, count: 10, cohortCount: 10, coverage: 1, referenceScale: 1, referenceScaleMethod: 'iqr' }
	]
};

function analogue(rank: number, distance: number, coverage: number): CurrentAnalogue {
	return {
		rank,
		cert: rank,
		name: `Bank ${rank}`,
		city: null,
		state: null,
		asOf: '20260630',
		distance,
		coverageAdjustedDistance: distance,
		coverage: {
			observedCells: 8,
			referenceCells: 10,
			expectedCells: 10,
			missingBankCells: 2,
			unavailableReferenceCells: 0,
			ratio: coverage
		},
		featureContributions: [
			{ metric: 'roa', label: 'Return on assets', observedPeriods: 3, expectedPeriods: 3, coverage: 1, rmsStandardizedDistance: 1.4, squaredDistanceShare: 0.7, observations: [] },
			{ metric: 'net_interest_margin', label: 'Net interest margin', observedPeriods: 3, expectedPeriods: 3, coverage: 1, rmsStandardizedDistance: 0.8, squaredDistanceShare: 0.3, observations: [] }
		]
	};
}

describe('failed-bank result geometry', () => {
	it('leaves a final interval for the failure event and breaks paths around missing points', () => {
		const domain = failureSeriesDomain(series);
		expect(chartX(2, 3, geometry)).toBeLessThan(geometry.width - geometry.right);
		expect(failureMedianPaths(series, domain, geometry)).toHaveLength(2);
		expect(failureBandPaths(series, domain, geometry)).toHaveLength(2);
		expect(domain[0]).toBeLessThan(-2);
		expect(domain[1]).toBeGreaterThan(1.5);
	});
});

describe('failed-bank analogue ranking helpers', () => {
	it('sorts without mutating the API order and exposes the largest distance contributions', () => {
		const data = [analogue(1, 2, 0.8), analogue(2, 1, 0.6)];
		expect(sortFailureAnalogues(data, 'distance', 'asc').map((item) => item.rank)).toEqual([2, 1]);
		expect(data.map((item) => item.rank)).toEqual([1, 2]);
		expect(topFailureContributions(data[0], 1)[0].metric).toBe('roa');
	});
});
