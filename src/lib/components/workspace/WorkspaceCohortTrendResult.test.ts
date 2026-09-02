import { fireEvent, render, screen, within } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';
import type { CohortTrendResultSet } from '$lib/workspace';
import WorkspaceCohortTrendResult from './WorkspaceCohortTrendResult.svelte';

const result: CohortTrendResultSet = {
	id: 'trend-a1b2c3d4',
	basedOnRevision: 8,
	publishedRevision: 9,
	from: '20250930',
	to: '20251231',
	conditions: [{ metric: 'dep', operator: 'gt', value: 2, upperValue: null }],
	groupBy: 'state',
	metrics: ['dep'],
	changeUnits: { dep: 'percent_change' },
	rows: [
		{ cert: 3510, name: 'Bank of America', state: 'NC', assetBucket: 7, totalAssets: 3_200_000_000, changes: { dep: 2.5 } },
		{ cert: 26881, name: 'SoFi Bank', state: 'UT', assetBucket: 5, totalAssets: 46_568_000, changes: { dep: 8.2 } }
	],
	groups: [
		{ key: 'NC', label: 'North Carolina', matchingCount: 1, shareOfMatches: 0.5 },
		{ key: 'UT', label: 'Utah', matchingCount: 1, shareOfMatches: 0.5 }
	],
	counts: { cohort: 3, comparable: 3, matching: 2 },
	coverage: { status: 'ready', missingCount: 0 },
	peerRecipe: {
		name: 'Regional peers', basis: 'custom', states: ['NC', 'UT'],
		assetRange: { min: null, max: null }, active: 'active', metricConditions: [],
		minimumPeers: 2, maximumPeers: 50
	},
	excludedCount: 0,
	definitionHash: 'definition-a1',
	cohortHash: 'cohort-a1',
	sourceMode: 'live',
	sourceAsOf: '20251231',
	retrievedAt: '2026-01-30T12:00:00Z',
	release: '20251231',
	releaseGeneration: 'generation-42'
};

describe('WorkspaceCohortTrendResult', () => {
	it('renders exact scan context, rows, groups, coverage, and result identity', () => {
		render(WorkspaceCohortTrendResult, {
			result,
			currentCohortHash: 'cohort-a1',
			currentRevision: 9,
			onFocus: vi.fn(),
			onClear: vi.fn()
		});
		expect(screen.getByRole('heading', { name: '2 banks match' })).toBeTruthy();
		expect(screen.getByText('trend-a1b2c3d4')).toBeTruthy();
		expect(screen.getByText('Deposits > +2.00%')).toBeTruthy();
		expect(screen.getByText('North Carolina')).toBeTruthy();
		expect(screen.getByText('Complete endpoint coverage')).toBeTruthy();
		expect(screen.getByRole('button', { name: /SoFi Bank/i })).toBeTruthy();
	});

	it('sorts exact rows and connects row and clear actions to the parent workspace', async () => {
		const onFocus = vi.fn();
		const onClear = vi.fn();
		render(WorkspaceCohortTrendResult, {
			result,
			currentCohortHash: 'cohort-a1',
			currentRevision: 9,
			onFocus,
			onClear
		});
		const table = screen.getByRole('table');
		let rows = within(table).getAllByRole('row').slice(1);
		expect(rows[0].textContent).toContain('SoFi Bank');
		await fireEvent.click(screen.getByRole('button', { name: /Deposits.*% change/i }));
		rows = within(table).getAllByRole('row').slice(1);
		expect(rows[0].textContent).toContain('Bank of America');
		await fireEvent.click(screen.getByRole('button', { name: /Bank of America/i }));
		await fireEvent.click(screen.getByRole('button', { name: 'Clear result' }));
		expect(onFocus).toHaveBeenCalledWith(3510);
		expect(onClear).toHaveBeenCalledOnce();
	});

	it('marks an exact result stale when the live cohort identity changes', () => {
		render(WorkspaceCohortTrendResult, {
			result,
			currentCohortHash: 'cohort-new',
			currentRevision: 10,
			onFocus: vi.fn(),
			onClear: vi.fn()
		});
		expect(screen.getByRole('status').textContent).toContain('peer cohort has changed');
		expect(screen.getByRole('status').textContent).toContain('cohort-a1');
	});
});
