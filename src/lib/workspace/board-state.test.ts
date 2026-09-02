import { describe, expect, it } from 'vitest';
import type { AnalysisResultRef } from './analysis-result-repository';
import {
	applyWorkspaceCommand,
	createDefaultWorkspaceState,
	workspaceCommands
} from './state';
import type {
	ResearchAnalysisBlock,
	ResearchBoardBlock,
	ResearchHistoryBlock,
	ResearchTakeawayBlock,
	ResearchWorkspaceViewBlock
} from './types';
import {
	normalizeResearchBoard,
	normalizeResearchBoardBlock,
	WorkspaceValidationError
} from './validation';
import { createWorkspaceStore } from './workspace.svelte';

const hash = (character: string): `sha256:${string}` => `sha256:${character.repeat(64)}`;

function resultRef(): AnalysisResultRef {
	return {
		version: 1,
		contentHash: hash('a'),
		kind: 'cohort_change',
		resultId: 'cohort-change-1',
		release: {
			sourceMode: 'live',
			sourceAsOf: '20260630',
			release: '20260630',
			releaseGeneration: 'generation-1'
		},
		scope: {
			membershipBasis: 'current_workspace_members',
			analyzedCount: 500,
			definitionHash: 'definition-1',
			cohortHash: 'cohort-1',
			excludedCount: 2
		},
		query: {
			kind: 'cohort_change',
			spec: { from: '20260331', to: '20260630', metrics: ['asset'], groupBy: 'none' },
			queryHash: hash('b')
		}
	};
}

function history(overrides: Partial<ResearchHistoryBlock> = {}): ResearchHistoryBlock {
	return {
		id: 'history-1',
		title: 'Asset history',
		kind: 'history',
		span: 'full',
		binding: {
			certs: [1, 2],
			metrics: ['asset'],
			from: '20250331',
			to: '20260630',
			chartKind: 'line',
			scale: 'value'
		},
		...overrides
	};
}

function analysis(): ResearchAnalysisBlock {
	return {
		id: 'analysis-1',
		title: 'Cohort change',
		kind: 'analysis',
		span: 'half',
		binding: { resultRef: resultRef(), view: 'breadth' }
	};
}

function workspaceView(): ResearchWorkspaceViewBlock {
	return {
		id: 'workspace-view-1',
		title: 'Current comparison matrix',
		kind: 'workspace_view',
		span: 'three_quarter',
		binding: { view: 'comparison_matrix' }
	};
}

function takeaway(): ResearchTakeawayBlock {
	return {
		id: 'takeaway-1',
		title: 'Takeaway',
		kind: 'takeaway',
		span: 'full',
		text: 'Assets increased across the matched cohort.',
		referenceBlockIds: ['history-1', 'analysis-1']
	};
}

function addBlocks(blocks: ResearchBoardBlock[]) {
	let state = createDefaultWorkspaceState();
	for (const block of blocks) {
		state = applyWorkspaceCommand(state, workspaceCommands.upsertBoardBlock(block)).state;
	}
	return state;
}

describe('research-board validation', () => {
	it('accepts only semantic specs and content-addressed analysis references', () => {
		expect(normalizeResearchBoardBlock(history())).toEqual(history());
		expect(normalizeResearchBoardBlock(analysis())).toEqual(analysis());
		expect(normalizeResearchBoardBlock(workspaceView())).toEqual(workspaceView());
		for (const view of [
			'comparison_matrix', 'metric_history', 'peer_distribution', 'change_attribution',
			'metric_relationship', 'headquarters_geography', 'economic_context', 'bank_context',
		] as const) {
			expect(normalizeResearchBoardBlock({ ...workspaceView(), binding: { view } }))
				.toMatchObject({ binding: { view } });
		}
		for (const span of ['quarter', 'half', 'three_quarter', 'full'] as const) {
			expect(normalizeResearchBoardBlock({ ...workspaceView(), span })).toMatchObject({ span });
		}
		expect(() => normalizeResearchBoardBlock({
			...history(),
			binding: { ...history().binding, values: [100, 200] }
		})).toThrowError(/values is not allowed/);
		expect(() => normalizeResearchBoardBlock({
			...analysis(),
			binding: {
				...analysis().binding,
				resultRef: {
					...resultRef(),
					query: { ...resultRef().query, spec: { rows: [{ cert: 1, value: 100 }] } }
				}
			}
		})).toThrowError(/raw or executable material is not allowed/);
		expect(() => normalizeResearchBoardBlock({
			...analysis(),
			binding: {
				...analysis().binding,
				resultRef: { ...resultRef(), query: { ...resultRef().query, spec: { foo: 'bar' } } }
			}
		})).toThrowError(/foo is not allowed/);
		expect(() => normalizeResearchBoardBlock({
			...analysis(), binding: { ...analysis().binding, view: 'stacked_composition' }
		})).toThrowError(/must be one of/);
		expect(() => normalizeResearchBoardBlock({
			...workspaceView(), binding: { view: 'snapshot_rows' }
		})).toThrowError(/must be one of/);
		expect(() => normalizeResearchBoardBlock({
			...workspaceView(), span: 'third'
		})).toThrowError(/must be one of/);
	});

	it('rejects non-canonical metrics, HTML-like narrative, dangling references, and more than 24 blocks', () => {
		expect(() => normalizeResearchBoardBlock({
			...history(), binding: { ...history().binding, metrics: ['raw_field'] }
		})).toThrowError(/canonical research metric/);
		expect(() => normalizeResearchBoardBlock({
			...takeaway(), text: '<script>alert(1)</script>'
		})).toThrowError(/plain text/);
		expect(() => normalizeResearchBoard({
			focusedBlockId: null,
			blocks: [{ ...takeaway(), referenceBlockIds: ['missing'] }]
		})).toThrowError(/existing block/);
		expect(() => normalizeResearchBoard({
			focusedBlockId: null,
			blocks: Array.from({ length: 25 }, (_, index) => history({ id: `history-${index}` }))
		})).toThrowError(/at most 24 blocks/);
	});
});

describe('research-board reducer and store', () => {
	it('upserts by stable ID absolutely and is an exact no-op on replay', () => {
		const initial = createDefaultWorkspaceState();
		const inserted = applyWorkspaceCommand(initial, workspaceCommands.upsertBoardBlock(history()));
		expect(inserted).toMatchObject({ changed: true, revision: 1 });
		expect(inserted.state.board.blocks).toEqual([history()]);

		const replay = applyWorkspaceCommand(inserted.state, workspaceCommands.upsertBoardBlock(history()));
		expect(replay).toMatchObject({ changed: false, revision: 1 });
		const replacement = history({ title: 'Updated title', span: 'half' });
		const updated = applyWorkspaceCommand(replay.state, workspaceCommands.upsertBoardBlock(replacement));
		expect(updated.state.board.blocks).toEqual([replacement]);
		expect(updated.revision).toBe(2);
	});

	it('requires every ID exactly once for absolute reorder and no-ops on the current order', () => {
		const state = addBlocks([history(), analysis()]);
		const reordered = applyWorkspaceCommand(
			state,
			workspaceCommands.reorderBoardBlocks(['analysis-1', 'history-1'])
		);
		expect(reordered.state.board.blocks.map((block) => block.id)).toEqual(['analysis-1', 'history-1']);
		expect(applyWorkspaceCommand(
			reordered.state,
			workspaceCommands.reorderBoardBlocks(['analysis-1', 'history-1'])
		)).toMatchObject({ changed: false, revision: reordered.revision });
		expect(() => applyWorkspaceCommand(state, workspaceCommands.reorderBoardBlocks(['history-1'])))
			.toThrowError(WorkspaceValidationError);
		expect(() => applyWorkspaceCommand(state, workspaceCommands.reorderBoardBlocks(['history-1', 'history-1'])))
			.toThrowError(/exactly once/);
	});

	it('focuses only known blocks and removal clears focus and takeaway references', () => {
		let state = addBlocks([history(), analysis(), takeaway()]);
		state = applyWorkspaceCommand(state, workspaceCommands.focusBoardBlock('history-1')).state;
		expect(state.board.focusedBlockId).toBe('history-1');
		expect(applyWorkspaceCommand(state, workspaceCommands.focusBoardBlock('history-1')))
			.toMatchObject({ changed: false, revision: state.revision });
		expect(() => applyWorkspaceCommand(state, workspaceCommands.focusBoardBlock('missing')))
			.toThrowError(/existing block/);

		const removed = applyWorkspaceCommand(state, workspaceCommands.removeBoardBlock('history-1'));
		expect(removed.state.board.focusedBlockId).toBeNull();
		expect(removed.state.board.blocks.find((block) => block.kind === 'takeaway'))
			.toMatchObject({ referenceBlockIds: ['analysis-1'] });
		expect(applyWorkspaceCommand(removed.state, workspaceCommands.removeBoardBlock('history-1')))
			.toMatchObject({ changed: false, revision: removed.revision });
	});

	it('exposes the same absolute commands through the workspace store', () => {
		const store = createWorkspaceStore({ persist: false });
		expect(store.upsertBoardBlock(history())).toMatchObject({ changed: true, revision: 1 });
		expect(store.focusBoardBlock('history-1')).toMatchObject({ changed: true, revision: 2 });
		expect(store.reorderBoardBlocks(['history-1'])).toMatchObject({ changed: false, revision: 2 });
		expect(store.removeBoardBlock('history-1')).toMatchObject({ changed: true, revision: 3 });
		expect(store.state.board).toEqual({ focusedBlockId: null, blocks: [] });
	});
});
