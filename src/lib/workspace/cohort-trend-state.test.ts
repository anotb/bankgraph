import { describe, expect, it } from 'vitest';
import type { CohortTrendResultSet } from './types';
import { deserializeWorkspaceSearchParams, serializeWorkspaceSearchParams } from './codec';
import {
	WorkspaceRevisionConflictError,
	applyWorkspaceCommand,
	createDefaultWorkspaceState,
	workspaceCommands
} from './state';
import { createWorkspaceStore } from './workspace.svelte';

function trendResult(): CohortTrendResultSet {
	return {
		id: 'trend-a1b2c3d4',
		basedOnRevision: 0,
		publishedRevision: 1,
		from: '20250930',
		to: '20251231',
		conditions: [{ metric: 'dep', operator: 'gt', value: 2, upperValue: null }],
		groupBy: 'state',
		metrics: ['dep'],
		changeUnits: { dep: 'percent_change' },
		rows: [
			{
				cert: 3510,
				name: 'Bank of America',
				state: 'NC',
				assetBucket: 7,
				totalAssets: 3_200_000_000,
				changes: { dep: 2.5 }
			}
		],
		groups: [{ key: 'NC', label: 'NC', matchingCount: 1, shareOfMatches: 1 }],
		counts: { cohort: 3, comparable: 2, matching: 1 },
		coverage: { status: 'partial', missingCount: 1 },
		peerRecipe: createDefaultWorkspaceState().peerRecipe,
		excludedCount: 0,
		definitionHash: 'definition-a1',
		cohortHash: 'cohort-a1',
		sourceMode: 'live',
		sourceAsOf: '20251231',
		retrievedAt: '2026-01-30T12:00:00Z',
		release: '20251231',
		releaseGeneration: 'generation-42'
	};
}

describe('materialized cohort trend workspace state', () => {
	it('publishes one bounded result through the ordinary revisioned reducer', () => {
		const result = applyWorkspaceCommand(
			createDefaultWorkspaceState(),
			workspaceCommands.setCohortTrendResult(trendResult()),
			{ ifRevision: 0 }
		);
		expect(result).toMatchObject({ changed: true, revision: 1 });
		expect(result.state.cohortTrendResult).toMatchObject({
			id: 'trend-a1b2c3d4',
			basedOnRevision: 0,
			publishedRevision: 1,
			counts: { cohort: 3, comparable: 2, matching: 1 }
		});
	});

	it('does not overwrite a human edit made against the scan revision', () => {
		const store = createWorkspaceStore({ persist: false });
		store.setQuestion('Human changed the question');
		expect(() => store.setCohortTrendResult(trendResult(), { ifRevision: 0 }))
			.toThrow(WorkspaceRevisionConflictError);
		expect(store.state.cohortTrendResult).toBeNull();
	});

	it('keeps the local result out of public share URLs', () => {
		const state = applyWorkspaceCommand(
			createDefaultWorkspaceState(),
			workspaceCommands.setCohortTrendResult(trendResult())
		).state;
		const params = serializeWorkspaceSearchParams(state);
		const decoded = deserializeWorkspaceSearchParams(params);
		expect(state.cohortTrendResult?.rows).toHaveLength(1);
		expect(decoded.cohortTrendResult).toBeNull();
	});
});
