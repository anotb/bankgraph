import { describe, expect, it } from 'vitest';
import { deriveCohortTransition } from '$lib/analytics/cohort-transition';
import {
	applyWorkspaceCommand,
	createDefaultWorkspaceState,
	WorkspaceRevisionConflictError,
	workspaceCommands
} from './state';
import { serializeWorkspaceSearch } from './codec';
import type { CohortChangeAnalysisResult } from './types';

function result(): CohortChangeAnalysisResult {
	return {
		id: 'change-deadbeef',
		kind: 'cohort_change',
		basedOnRevision: 0,
		publishedRevision: 1,
		title: 'Total assets · Q1 to Q2',
		spec: { from: '20260331', to: '20260630', metrics: ['asset'], groupBy: 'none' },
		population: {
			membershipBasis: 'current_workspace_members',
			analyzedCount: 1,
			definitionHash: 'definition',
			cohortHash: 'cohort',
			peerRecipe: createDefaultWorkspaceState().peerRecipe,
			excludedCount: 0
		},
		lineage: {
			sourceMode: 'live', sourceAsOf: '20260630', retrievedAt: null,
			release: '20260630', releaseGeneration: 'generation-1'
		},
		transition: deriveCohortTransition({
			openingPeriod: '20260331', closingPeriod: '20260630', metrics: ['asset'],
			entities: [{ id: 1, name: 'Bank One', rows: [
				{ period: '20260331', values: { asset: 100 } },
				{ period: '20260630', values: { asset: 120 } }
			] }]
		})
	};
}

describe('workspace analysis result state', () => {
	it('commits atomically, rejects a stale replacement, and omits the block from share URLs', () => {
		const initial = createDefaultWorkspaceState();
		const committed = applyWorkspaceCommand(initial, workspaceCommands.setAnalysisResult(result()), { ifRevision: 0 });
		expect(committed).toMatchObject({ changed: true, revision: 1 });
		expect(committed.state.analysisResult).toMatchObject({ id: 'change-deadbeef', publishedRevision: 1 });
		expect(() => applyWorkspaceCommand(
			committed.state,
			workspaceCommands.setAnalysisResult({ ...result(), id: 'change-new' }),
			{ ifRevision: 0 }
		)).toThrowError(WorkspaceRevisionConflictError);

		const decoded = new URLSearchParams(serializeWorkspaceSearch(committed.state));
		expect(decoded.toString()).not.toContain('change-deadbeef');
	});
});
