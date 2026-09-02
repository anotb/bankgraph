import { describe, expect, it } from 'vitest';
import type { CohortTrendResultSet } from '$lib/workspace';
import {
	cohortTrendOperatorLabel,
	cohortTrendResultIsCurrent,
	sortCohortTrendRows
} from './cohort-trend-result';

const result: CohortTrendResultSet = {
	id: 'trend-abc123',
	basedOnRevision: 4,
	publishedRevision: 5,
	from: '20250930',
	to: '20251231',
	conditions: [{ metric: 'dep', operator: 'gt', value: 2, upperValue: null }],
	groupBy: 'state',
	metrics: ['dep'],
	changeUnits: { dep: 'percent_change' },
	rows: [
		{ cert: 3, name: 'Zulu Bank', state: null, assetBucket: 3, totalAssets: null, changes: { dep: null } },
		{ cert: 2, name: 'Beta Bank', state: 'UT', assetBucket: 5, totalAssets: 200, changes: { dep: 8.2 } },
		{ cert: 1, name: 'Alpha Bank', state: 'NC', assetBucket: 4, totalAssets: 100, changes: { dep: 2.5 } }
	],
	groups: [],
	counts: { cohort: 3, comparable: 3, matching: 3 },
	coverage: { status: 'ready', missingCount: 0 },
	peerRecipe: {
		name: 'Regional peers', basis: 'custom', states: ['NC', 'UT'],
		assetRange: { min: null, max: null }, active: 'active', metricConditions: [],
		minimumPeers: 2, maximumPeers: 50
	},
	excludedCount: 0,
	definitionHash: 'definition',
	cohortHash: 'cohort',
	sourceMode: 'live',
	sourceAsOf: '20251231',
	retrievedAt: '2026-01-30T12:00:00Z',
	release: '20251231',
	releaseGeneration: 'generation-42'
};

describe('cohort trend result table', () => {
	it('sorts change values in either direction and always leaves missing values last', () => {
		expect(sortCohortTrendRows(result.rows, 'change:dep', 'desc').map((row) => row.cert))
			.toEqual([2, 1, 3]);
		expect(sortCohortTrendRows(result.rows, 'change:dep', 'asc').map((row) => row.cert))
			.toEqual([1, 2, 3]);
	});

	it('supports exact identity context and plain operator labels', () => {
		expect(cohortTrendResultIsCurrent(result, 'cohort')).toBe(true);
		expect(cohortTrendResultIsCurrent(result, 'new-cohort')).toBe(false);
		expect(cohortTrendOperatorLabel('gte')).toBe('≥');
	});
});
