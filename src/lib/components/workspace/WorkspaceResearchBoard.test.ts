import { fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';
import type { AnalysisResultRef } from '$lib/workspace/analysis-result-repository';
import type {
	ResearchAnalysisBlock,
	ResearchBoard,
	ResearchHistoryBlock,
	ResearchTakeawayBlock,
	ResearchWorkspaceViewBlock
} from '$lib/workspace';
import WorkspaceResearchBoard from './WorkspaceResearchBoard.svelte';

const history: ResearchHistoryBlock = {
	id: 'history-1',
	kind: 'history',
	title: 'Deposit history',
	span: 'quarter',
	binding: {
		certs: [3510, 26881],
		metrics: ['dep'],
		from: '20240331',
		to: '20251231',
		chartKind: 'line',
		scale: 'value'
	}
};

const takeaway: ResearchTakeawayBlock = {
	id: 'takeaway-1',
	kind: 'takeaway',
	title: 'What the history shows',
	span: 'full',
	text: 'Deposit growth stayed broad across the selected banks.',
	referenceBlockIds: ['history-1']
};

const workspaceView: ResearchWorkspaceViewBlock = {
	id: 'peer-view-1',
	kind: 'workspace_view',
	title: 'Where this bank sits',
	span: 'three_quarter',
	binding: { view: 'peer_distribution' }
};

const resultRef: AnalysisResultRef<'cohort_change'> = {
	version: 1,
	contentHash: `sha256:${'a'.repeat(64)}`,
	kind: 'cohort_change',
	resultId: 'analysis-1',
	release: {
		sourceMode: 'live',
		sourceAsOf: '20251231',
		release: '20251231',
		releaseGeneration: 'generation-42'
	},
	scope: {
		membershipBasis: 'current_workspace_members',
		analyzedCount: 2,
		definitionHash: 'definition-a1',
		cohortHash: 'cohort-a1',
		excludedCount: 0
	},
	query: {
		kind: 'cohort_change',
		spec: { from: '20250930', to: '20251231', metrics: ['dep'], groupBy: 'none' },
		queryHash: `sha256:${'b'.repeat(64)}`
	}
};

const analysis: ResearchAnalysisBlock = {
	id: 'analysis-1',
	kind: 'analysis',
	title: 'Cohort deposit change',
	span: 'full',
	binding: { resultRef, view: 'summary' }
};

const templates = [
	{
		id: 'asset-quality',
		title: 'Asset quality review',
		description: 'Trace credit quality through history, peers, and reported change.'
	},
	{
		id: 'funding',
		title: 'Funding and liquidity',
		description: 'Compare deposits, funding mix, and economic context.'
	}
];

function handlers() {
	return {
		onAddHistory: vi.fn(),
		onAddExactTable: vi.fn(),
		onAddPeerDistribution: vi.fn(),
		onAddChangeAttribution: vi.fn(),
		onAddMetricRelationship: vi.fn(),
		onAddHeadquartersGeography: vi.fn(),
		onAddEconomicContext: vi.fn(),
		onAddBankContext: vi.fn(),
		onAddTakeaway: vi.fn(),
		onApplyTemplate: vi.fn(),
		onAskChatGPT: vi.fn(),
		onUpdateTitle: vi.fn(),
		onUpdateTakeaway: vi.fn(),
		onSetSpan: vi.fn(),
		onMove: vi.fn(),
		onReorder: vi.fn(),
		onRemove: vi.fn(),
		onRestore: vi.fn(),
		onFocus: vi.fn(),
		onRebuildAnalysis: vi.fn(),
		onFocusBank: vi.fn(),
		onFocusMetric: vi.fn()
	};
}

function renderBoard(
	board: ResearchBoard,
	options: {
		depth?: 'guided' | 'pro';
		resolveAnalysis?: (block: ResearchAnalysisBlock) => null | undefined;
	} = {}
) {
	const callbacks = handlers();
	render(WorkspaceResearchBoard, {
		board,
		depth: options.depth ?? 'guided',
		currentCohortHash: 'cohort-a1',
		currentSelectedCerts: [3510, 26881],
		currentRevision: 12,
		templates,
		resolveAnalysis: options.resolveAnalysis ?? (() => null),
		...callbacks
	});
	return callbacks;
}

describe('WorkspaceResearchBoard', () => {
	it('makes the empty board a launcher for templates, every view, and ChatGPT', async () => {
		const callbacks = renderBoard({ focusedBlockId: null, blocks: [] });

		expect(screen.getByRole('heading', { name: 'Build the board around your question.' })).toBeTruthy();
		expect(screen.getByText('Start with a research path, add one linked view, or ask ChatGPT to shape the board with you.')).toBeTruthy();

		await fireEvent.click(screen.getByRole('button', { name: /Asset quality review/ }));
		expect(callbacks.onApplyTemplate).toHaveBeenCalledWith('asset-quality');

		for (const [name, callback] of [
			['History', callbacks.onAddHistory],
			['Exact table', callbacks.onAddExactTable],
			['Peer distribution', callbacks.onAddPeerDistribution],
			['Change attribution', callbacks.onAddChangeAttribution],
			['Metric relationship', callbacks.onAddMetricRelationship],
			['Headquarters geography', callbacks.onAddHeadquartersGeography],
			['Economic context', callbacks.onAddEconomicContext],
			['Bank context', callbacks.onAddBankContext],
			['Takeaway', callbacks.onAddTakeaway]
		] as const) {
			await fireEvent.click(screen.getByRole('button', { name }));
			expect(callback).toHaveBeenCalledOnce();
		}

		await fireEvent.click(screen.getByRole('button', { name: 'Build with ChatGPT' }));
		expect(callbacks.onAskChatGPT).toHaveBeenCalledOnce();
	});

	it('keeps the non-empty toolbar to Add view, Templates, and Build with ChatGPT', () => {
		renderBoard({ focusedBlockId: null, blocks: [history] });
		const toolbar = screen.getByLabelText('Research board actions');
		expect(within(toolbar).getByText('Add view')).toBeTruthy();
		expect(within(toolbar).getByText('Templates')).toBeTruthy();
		expect(within(toolbar).getByRole('button', { name: 'Build with ChatGPT' })).toBeTruthy();
		expect(screen.queryByText('More')).toBeNull();
	});

	it('edits, resizes across all four spans, and moves ordered blocks from the visible controls', async () => {
		const callbacks = renderBoard({ focusedBlockId: 'history-1', blocks: [history, takeaway] });
		const blocks = screen.getAllByRole('article');
		const historyBlock = within(blocks[0]);
		const title = historyBlock.getByRole('textbox', { name: 'Title for history view' });

		await fireEvent.input(title, { target: { value: 'Eight-quarter deposit history' } });
		await fireEvent.blur(title);
		const size = historyBlock.getByRole('combobox', { name: 'Size for Deposit history' });
		expect(within(size).getAllByRole('option').map((option) => option.textContent)).toEqual([
			'Quarter',
			'Half',
			'Three quarters',
			'Full'
		]);
		await fireEvent.change(size, { target: { value: 'three_quarter' } });
		const handle = historyBlock.getByRole('button', {
			name: 'Move Deposit history. Drag to rearrange, or use Alt plus the arrow keys.'
		});
		await fireEvent.keyDown(handle, { key: 'ArrowDown', altKey: true });
		await fireEvent.click(historyBlock.getByRole('button', { name: 'Move Deposit history later' }));

		expect(callbacks.onUpdateTitle).toHaveBeenCalledWith('history-1', 'Eight-quarter deposit history');
		expect(callbacks.onSetSpan).toHaveBeenCalledWith('history-1', 'three_quarter');
		expect(callbacks.onMove).toHaveBeenNthCalledWith(1, 'history-1', 'down');
		expect(callbacks.onMove).toHaveBeenNthCalledWith(2, 'history-1', 'down');
	});

	it('opens Inspect as local fixed-viewport state and Escape restores its trigger', async () => {
		const callbacks = renderBoard({ focusedBlockId: null, blocks: [history] });
		const inspect = screen.getByRole('button', { name: 'Inspect Deposit history' });
		inspect.focus();
		await fireEvent.click(inspect);

		const dialog = screen.getByRole('dialog', { name: 'History view: Deposit history' });
		expect(dialog.classList.contains('research-block--inspected')).toBe(true);
		expect(within(dialog).getByRole('button', { name: 'Back to board' })).toBeTruthy();
		expect(within(dialog).queryByRole('combobox', { name: 'Size for Deposit history' })).toBeNull();
		expect(callbacks.onFocus).toHaveBeenCalledWith('history-1');

		await fireEvent.keyDown(window, { key: 'Escape' });
		await waitFor(() => {
			expect(screen.queryByRole('dialog')).toBeNull();
			expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Inspect Deposit history' }));
		});
	});

	it('removes directly and offers Undo', async () => {
		const callbacks = renderBoard({ focusedBlockId: null, blocks: [history] });
		await fireEvent.click(screen.getByRole('button', { name: 'Remove Deposit history' }));
		expect(callbacks.onRemove).toHaveBeenCalledWith(history);
		expect(screen.getByRole('status').textContent).toContain('Deposit history removed.');
		await fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
		expect(callbacks.onRestore).toHaveBeenCalledWith(history, 0);
	});

	it('keeps takeaways plain text and makes their block references keyboard-focusable', async () => {
		const callbacks = renderBoard({ focusedBlockId: null, blocks: [history, takeaway] });
		const takeawayEditor = screen.getByRole('textbox', { name: 'Text for What the history shows' });

		await fireEvent.input(takeawayEditor, { target: { value: 'Revised plain-text takeaway.' } });
		await fireEvent.blur(takeawayEditor);
		expect(callbacks.onUpdateTakeaway).toHaveBeenCalledWith('takeaway-1', 'Revised plain-text takeaway.');

		await fireEvent.click(screen.getByRole('button', { name: 'Deposit history' }));
		expect(callbacks.onFocus).toHaveBeenCalledWith('history-1');
		expect(document.activeElement).toBe(screen.getByRole('textbox', { name: 'Title for history view' }));
	});

	it('reorders views by dragging the visible move handle', async () => {
		const callbacks = renderBoard({ focusedBlockId: null, blocks: [history, takeaway] });
		const blocks = screen.getAllByRole('article');
		const transfer = { effectAllowed: 'none', dropEffect: 'none', setData: vi.fn() };

		await fireEvent.dragStart(
			within(blocks[0]).getByRole('button', {
				name: 'Move Deposit history. Drag to rearrange, or use Alt plus the arrow keys.'
			}),
			{ dataTransfer: transfer }
		);
		await fireEvent.dragOver(blocks[1], { clientY: 1, dataTransfer: transfer });
		await fireEvent.drop(blocks[1], { clientY: 1, dataTransfer: transfer });

		expect(callbacks.onReorder).toHaveBeenCalledWith(['takeaway-1', 'history-1']);
	});

	it('labels and falls back cleanly for a live workspace view block', () => {
		renderBoard({ focusedBlockId: null, blocks: [workspaceView] });
		expect(screen.getByRole('article', { name: 'Peer distribution view: Where this bank sits' })).toBeTruthy();
		expect(screen.getByText('This linked workspace view is not available.')).toBeTruthy();
		expect(screen.getByRole('article').classList.contains('research-block--three-quarter')).toBe(true);
	});

	it('offers a rebuild action for a missing materialized analysis', async () => {
		const callbacks = renderBoard(
			{ focusedBlockId: 'analysis-1', blocks: [analysis] },
			{ depth: 'pro', resolveAnalysis: () => null }
		);

		expect(screen.getByText('Saved analysis is unavailable.')).toBeTruthy();
		expect(screen.queryByText(resultRef.contentHash, { exact: false })).toBeNull();
		await fireEvent.click(screen.getByRole('button', { name: 'Rebuild analysis' }));
		expect(callbacks.onRebuildAnalysis).toHaveBeenCalledWith(analysis);
	});

	it('announces a loading materialized analysis without exposing raw result arrays', () => {
		renderBoard({ focusedBlockId: null, blocks: [analysis] }, { resolveAnalysis: () => undefined });
		expect(screen.getByRole('status').textContent).toBe('Loading analysis…');
	});
});
