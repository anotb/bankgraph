import { describe, expect, it } from 'vitest';
import { deriveCohortTransition } from '$lib/analytics/cohort-transition';
import type { AnalysisResultRef } from './analysis-result-repository';
import {
	deserializeWorkspaceSearchParams,
	migrateWorkspaceState,
	serializeWorkspaceSearch,
	trySerializeWorkspaceSearch,
	WorkspaceShareBudgetError
} from './codec';
import { applyWorkspaceCommand, createDefaultWorkspaceState, workspaceCommands } from './state';
import type {
	CohortChangeAnalysisResult,
	ResearchBoardBlock
} from './types';

const contentHash = `sha256:${'c'.repeat(64)}`;
const queryHash = `sha256:${'d'.repeat(64)}`;

function ref(): AnalysisResultRef {
	return {
		version: 1,
		contentHash,
		kind: 'cohort_change',
		resultId: 'portable-result-ref',
		release: {
			sourceMode: 'live', sourceAsOf: '20260630', release: '20260630', releaseGeneration: 'gen-1'
		},
		scope: {
			membershipBasis: 'current_workspace_members', analyzedCount: 1,
			definitionHash: 'definition', cohortHash: 'cohort', excludedCount: 0
		},
		query: {
			kind: 'cohort_change',
			spec: { from: '20260331', to: '20260630', metrics: ['asset'], groupBy: 'none' },
			queryHash
		}
	};
}

function materializedResult(): CohortChangeAnalysisResult {
	return {
		id: 'MATERIALIZED-ONLY-RESULT',
		kind: 'cohort_change',
		basedOnRevision: 0,
		publishedRevision: 1,
		title: 'MATERIALIZED_RAW_MARKER',
		spec: { from: '20260331', to: '20260630', metrics: ['asset'], groupBy: 'none' },
		population: {
			membershipBasis: 'current_workspace_members', analyzedCount: 1,
			definitionHash: 'definition', cohortHash: 'cohort',
			peerRecipe: createDefaultWorkspaceState().peerRecipe, excludedCount: 0
		},
		lineage: {
			sourceMode: 'live', sourceAsOf: '20260630', retrievedAt: null,
			release: '20260630', releaseGeneration: 'gen-1'
		},
		transition: deriveCohortTransition({
			openingPeriod: '20260331',
			closingPeriod: '20260630',
			metrics: ['asset'],
			entities: [{
				id: 1,
				name: 'MATERIALIZED_BANK_NAME',
				rows: [
					{ period: '20260331', values: { asset: 100 } },
					{ period: '20260630', values: { asset: 125 } }
				]
			}]
		})
	};
}

function blocks(): ResearchBoardBlock[] {
	return [
		{
			id: 'history-1', title: 'History', kind: 'history', span: 'full',
			binding: {
				certs: [1, 2], metrics: ['asset', 'roa'], from: '20250331', to: '20260630',
				chartKind: 'area', scale: 'index'
			},
			anchorConfig: {
				bankSource: 'workspace', metricSource: 'fixed', periodSource: 'workspace', metrics: ['roa']
			}
		},
		{
			id: 'table-1', title: 'Current exact values', kind: 'exact_table', span: 'quarter',
			binding: { certs: [1, 2], metrics: ['asset'], from: null, to: null, followCurrent: true }
		},
		{
			id: 'analysis-1', title: 'Cohort breadth', kind: 'analysis', span: 'three_quarter',
			binding: { resultRef: ref(), view: 'breadth' }
		},
		{
			id: 'workspace-view-1', title: 'Current peer distribution', kind: 'workspace_view', span: 'half',
			binding: { view: 'peer_distribution' },
			anchorConfig: { bankSource: 'workspace', metricSource: 'workspace', periodSource: 'workspace' }
		},
		{
			id: 'takeaway-1', title: 'Takeaway', kind: 'takeaway', span: 'full',
			text: 'The selected banks grew while cohort breadth stayed mixed.',
			referenceBlockIds: ['history-1', 'analysis-1']
		}
	];
}

describe('research-board share codec', () => {
	it('round-trips compact board specs and takeaways while omitting materialized results', () => {
		let state = createDefaultWorkspaceState();
		for (const block of blocks()) {
			state = applyWorkspaceCommand(state, workspaceCommands.upsertBoardBlock(block)).state;
		}
		state = applyWorkspaceCommand(state, workspaceCommands.focusBoardBlock('analysis-1')).state;
		state = applyWorkspaceCommand(state, workspaceCommands.setAnalysisResult(materializedResult())).state;

		const encoded = serializeWorkspaceSearch(state);
		const payload = new URLSearchParams(encoded).get('ws') ?? '';
		expect(encoded).toContain('wv=4');
		expect(payload).not.toContain('MATERIALIZED_RAW_MARKER');
		expect(payload).not.toContain('MATERIALIZED_BANK_NAME');
		expect(payload).not.toContain('MATERIALIZED-ONLY-RESULT');

		const decoded = deserializeWorkspaceSearchParams(encoded);
		expect(decoded.board).toEqual(state.board);
		expect(decoded.analysisResult).toBeNull();
		expect(decoded.board.blocks.find((block) => block.kind === 'analysis'))
			.toMatchObject({ binding: { resultRef: { contentHash, resultId: 'portable-result-ref' }, view: 'breadth' } });
		expect(decoded.board.blocks.find((block) => block.kind === 'workspace_view'))
			.toMatchObject({ span: 'half', binding: { view: 'peer_distribution' } });
	});

	it('migrates schema 2 state with an empty board', () => {
		const { board: _board, ...legacy } = createDefaultWorkspaceState();
		const migrated = migrateWorkspaceState({ ...legacy, version: 2 });
		expect(migrated).toMatchObject({
			migrated: true,
			state: { version: 4, board: { focusedBlockId: null, blocks: [] } }
		});
		});

	it('continues to decode compact schema 2 links with an empty board', () => {
		const current = applyWorkspaceCommand(
			createDefaultWorkspaceState(),
			workspaceCommands.setQuestion('Legacy compact link')
		).state;
		const params = new URLSearchParams(serializeWorkspaceSearch(current));
		const payload = JSON.parse(params.get('ws') ?? '[]') as unknown[];
		params.set('wv', '2');
		params.set('ws', JSON.stringify(payload.slice(0, 18)));
		const decoded = deserializeWorkspaceSearchParams(params);
		expect(decoded).toMatchObject({
			version: 4,
			question: 'Legacy compact link',
			board: { focusedBlockId: null, blocks: [] }
		});
	});

	it('continues to decode compact schema 3 board links without durable anchor configuration', () => {
		let state = createDefaultWorkspaceState();
		for (const block of blocks().map((block) => {
			if (block.kind !== 'history' && block.kind !== 'exact_table' && block.kind !== 'workspace_view') return block;
			const { anchorConfig: _anchorConfig, ...legacy } = block;
			return legacy as ResearchBoardBlock;
		})) {
			state = applyWorkspaceCommand(state, workspaceCommands.upsertBoardBlock(block)).state;
		}
		const params = new URLSearchParams(serializeWorkspaceSearch(state));
		const payload = JSON.parse(params.get('ws') ?? 'null') as unknown[];
		const board = payload[18] as unknown[];
		const compactBlocks = board[1] as unknown[][];
		for (const block of compactBlocks) {
			if (block[0] === 'h' || block[0] === 't' || block[0] === 'w') block.pop();
		}
		params.set('wv', '3');
		params.set('ws', JSON.stringify(payload));

		const decoded = deserializeWorkspaceSearchParams(params);
		expect(decoded.version).toBe(4);
		expect(decoded.board.blocks).toEqual(state.board.blocks);
	});

	it('reports the existing clear URL budget error for a large bounded takeaway', () => {
		const state = applyWorkspaceCommand(
			createDefaultWorkspaceState(),
			workspaceCommands.upsertBoardBlock({
				id: 'takeaway-large', title: 'Large takeaway', kind: 'takeaway', span: 'full',
				text: 'é'.repeat(4_000), referenceBlockIds: []
			})
		).state;
		const result = trySerializeWorkspaceSearch(state);
		expect(result.ok).toBe(false);
		if (result.ok) throw new Error('expected share budget failure');
		expect(result.error).toBeInstanceOf(WorkspaceShareBudgetError);
		expect(result.error.message).toMatch(/safe limit is 6144/);
		expect(result.metadata.encodedLength).toBeGreaterThan(result.metadata.maxEncodedLength);
	});
});
