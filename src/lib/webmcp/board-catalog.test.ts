import { describe, expect, it, vi } from 'vitest';
import {
	applyWorkspaceCommand,
	applyWorkspaceCommands,
	createDefaultWorkspaceState,
	workspaceCommands,
	type WorkspaceCommand,
	type WorkspaceCommandOptions,
	type WorkspaceState,
} from '$lib/workspace';
import {
	createResearchBoardWebMcpToolCatalog,
	type ResearchBoardWebMcpDependencies,
} from './board-catalog';
import { MAX_WEBMCP_EXTENDED_ENVELOPE_CHARS } from './envelope';
import { validateToolDefinition } from './schema';

function harness(extra: Partial<Omit<ResearchBoardWebMcpDependencies, 'workspace'>> = {}) {
	let state: WorkspaceState = createDefaultWorkspaceState();
	const workspace = {
		get state() { return state; },
		execute(command: WorkspaceCommand, options?: WorkspaceCommandOptions) {
			const result = applyWorkspaceCommand(state, command, options);
			state = result.state;
			return result;
		},
		executeBatch(commands: readonly WorkspaceCommand[], options?: WorkspaceCommandOptions) {
			const result = applyWorkspaceCommands(state, commands, options);
			state = result.state;
			return result;
		},
	};
	const prepareBoardHistory = vi.fn(async () => undefined);
	const prepareBoardTable = vi.fn(async () => undefined);
	const tools = createResearchBoardWebMcpToolCatalog({ workspace, prepareBoardHistory, prepareBoardTable, ...extra });
	return { workspace, tools, prepareBoardHistory, prepareBoardTable };
}

const signal = new AbortController().signal;
const context = (toolName: string) => ({ signal, scope: 'test', toolName });

describe('research board WebMCP catalog', () => {
	it('registers the compact semantic surface with safe annotations and revisions', () => {
		const { tools } = harness();
		expect(Object.values(tools).flatMap((tool) =>
			validateToolDefinition(tool).map((issue) => `${tool.name}: ${issue}`)
		)).toEqual([]);
		expect(Object.keys(tools)).toEqual(expect.arrayContaining([
			'bankgraph.read_research_board',
			'bankgraph.read_board_block',
			'bankgraph.list_board_templates',
			'bankgraph.apply_board_template',
			'bankgraph.add_workspace_view',
			'bankgraph.plot_metric_history',
			'bankgraph.publish_exact_table',
			'bankgraph.publish_result_view',
			'bankgraph.upsert_takeaway',
			'bankgraph.update_board_block',
			'bankgraph.arrange_research_board',
			'bankgraph.configure_board_view',
			'bankgraph.remove_board_blocks',
			'bankgraph.focus_board_block',
		]));
		expect(tools['bankgraph.read_research_board'].annotations.readOnlyHint).toBe(true);
		expect(tools['bankgraph.list_board_templates'].annotations.readOnlyHint).toBe(true);
		expect(tools['bankgraph.read_research_board'].maxResultChars).toBe(MAX_WEBMCP_EXTENDED_ENVELOPE_CHARS);
		expect(tools['bankgraph.read_board_block'].maxResultChars).toBe(MAX_WEBMCP_EXTENDED_ENVELOPE_CHARS);
		expect(tools['bankgraph.list_board_templates'].maxResultChars).toBe(MAX_WEBMCP_EXTENDED_ENVELOPE_CHARS);
		expect(tools['bankgraph.upsert_takeaway'].annotations).toMatchObject({ readOnlyHint: false, untrustedContentHint: true });
		for (const tool of Object.values(tools).filter((item) => item.annotations.readOnlyHint === false)) {
			if (!['bankgraph.set_appearance', 'bankgraph.configure_board_view'].includes(tool.name)) {
				expect(tool.inputSchema.required).toContain('ifRevision');
			}
		}
		for (const name of [
			'bankgraph.add_workspace_view',
			'bankgraph.plot_metric_history',
			'bankgraph.publish_exact_table',
			'bankgraph.publish_result_view',
			'bankgraph.upsert_takeaway',
			'bankgraph.update_board_block',
		]) {
			const schema = tools[name].inputSchema.properties.span as { enum?: readonly string[]; description?: string };
			expect(schema.enum).toEqual(['quarter', 'half', 'three_quarter', 'full']);
			expect(schema.description).toContain('12-column');
		}
		expect((tools['bankgraph.add_workspace_view'].inputSchema.properties.view as { enum?: readonly string[] }).enum)
			.toEqual([
				'comparison_matrix', 'metric_history', 'peer_distribution', 'change_attribution',
				'metric_relationship', 'headquarters_geography', 'economic_context', 'bank_context',
			]);
		const edit = tools['bankgraph.configure_board_view'];
		expect(edit.title).toBe('Edit a board view');
		expect(edit.inputSchema.required).toEqual(['blockId']);
		expect(edit.inputSchema.properties).toMatchObject({
			historyFrom: expect.any(Object),
			historyTo: expect.any(Object),
			chartKind: { enum: ['line', 'area'] },
			scale: { enum: ['value', 'index'] },
			sortMetric: expect.any(Object),
			sortBasis: { enum: ['level', 'change'] },
			sortDirection: { enum: ['asc', 'desc'] },
		});
	});

	it('lists and applies the same curated templates through shared workspace state', async () => {
		const { workspace, tools, prepareBoardHistory } = harness();
		workspace.executeBatch([
			workspaceCommands.setSelectedCerts([1, 2]),
			workspaceCommands.setChartHistory({ from: '20250331', to: '20260331' }),
			workspaceCommands.setCharts([{
				id: 'linked-analysis', title: 'Linked analysis', kind: 'line', metrics: ['asset', 'dep'],
				certs: [1, 2], scale: 'value', stacked: false, visible: true,
			}]),
		]);
		const list = await tools['bankgraph.list_board_templates'].controller({}, context('bankgraph.list_board_templates'));
		expect(list.data).toMatchObject({
			workspaceRevision: workspace.state.revision,
			context: { selectedBanks: 2, selectedMetrics: ['asset', 'dep'], from: '20250331', to: '20260331' },
		});
		expect((list.data as { templates: unknown[] }).templates).toHaveLength(6);

		// Atlas hosts supply the real seven-template adapter. The fallback remains
		// covered by its legacy module; this catalog accepts only current Atlas IDs.
		expect((tools['bankgraph.apply_board_template'].inputSchema.properties.templateId as unknown as { enum: string[] }).enum)
			.toContain('one_bank');
		expect((tools['bankgraph.apply_board_template'].inputSchema.properties.templateId as unknown as { enum: string[] }).enum)
			.not.toContain('bank_comparison');
		expect(prepareBoardHistory).not.toHaveBeenCalled();
	});

	it('edits and sorts an existing view with one partial idempotent request', async () => {
		const configureBoardView = vi.fn(() => ({ changed: true }));
		const { workspace, tools } = harness({
			configureBoardView,
			getBoardPresentation: () => ({
				presentationRevision: 3,
				theme: 'dark',
				timeAxis: 'auto',
				pinnedTimebar: false,
				pendingViewCount: 0,
				overrides: {},
				strips: [],
			}),
		});
		workspace.execute(workspaceCommands.upsertBoardBlock({
			id: 'exact-values',
			title: 'Exact values',
			kind: 'exact_table',
			span: 'full',
			binding: { certs: [1, 2], metrics: ['asset', 'nclnlsr'], from: null, to: null, followCurrent: true },
		}));

		const result = await tools['bankgraph.configure_board_view'].controller({
			blockId: 'exact-values',
			title: 'Credit quality, worst first',
			sortMetric: 'nclnlsr',
			sortBasis: 'level',
			sortDirection: 'desc',
			width: 'full',
		}, context('bankgraph.configure_board_view'));

		expect(configureBoardView).toHaveBeenCalledWith('exact-values', {
			title: 'Credit quality, worst first',
			width: 'full',
			sortMetric: 'nclnlsr',
			sortBasis: 'level',
			sortDirection: 'desc',
		});
		expect(result).toMatchObject({ data: { changed: true, blockIds: ['exact-values'] } });
	});

	it('adds and replaces a live workspace view without persisting snapshot rows', async () => {
		const { workspace, tools } = harness();
		const add = tools['bankgraph.add_workspace_view'];
		const input = {
			blockId: 'live-context', title: 'Current economic context', view: 'economic_context',
			span: 'quarter', focus: true, ifRevision: 0,
		};
		const first = await add.controller(input, context('bankgraph.add_workspace_view'));
		expect(first.data).toMatchObject({ changed: true, revision: 1, focusedBlockId: 'live-context' });
		expect(workspace.state.board.blocks).toEqual([{
			id: 'live-context', title: 'Current economic context', kind: 'workspace_view',
			span: 'quarter', binding: { view: 'economic_context' },
		}]);

		const replay = await add.controller(input, context('bankgraph.add_workspace_view'));
		expect(replay.data).toMatchObject({ changed: false, revision: 1, idempotentReplay: true });
		await add.controller({
			...input, title: 'Current bank context', view: 'bank_context', span: 'three_quarter', ifRevision: 1,
		}, context('bankgraph.add_workspace_view'));
		expect(workspace.state.board.blocks[0]).toEqual({
			id: 'live-context', title: 'Current bank context', kind: 'workspace_view',
			span: 'three_quarter', binding: { view: 'bank_context' },
		});
		expect(() => add.controller(
			{ ...input, view: 'snapshot_rows', ifRevision: 2 },
			context('bankgraph.add_workspace_view'),
		)).toThrow(/view must be one of/);
	});

	it('publishes exact source-bound views, supports an exact stale replay, and rejects divergence', async () => {
		const { workspace, tools, prepareBoardTable } = harness();
		const input = {
			blockId: 'peer-table', title: 'Peer balance sheet', certs: [1, 2], metrics: ['asset', 'dep'],
			followCurrent: false, from: '20250331', to: '20260331', span: 'full', focus: true, ifRevision: 0,
		};
		const first = await tools['bankgraph.publish_exact_table'].controller(input, context('bankgraph.publish_exact_table'));
		expect(prepareBoardTable).toHaveBeenCalledOnce();
		expect(workspace.state.board).toMatchObject({ focusedBlockId: 'peer-table', blocks: [{ id: 'peer-table', kind: 'exact_table' }] });
		expect(first.data).toMatchObject({ changed: true, revision: 1, renderStatus: 'visible' });

		const replay = await tools['bankgraph.publish_exact_table'].controller(input, context('bankgraph.publish_exact_table'));
		expect(replay.data).toMatchObject({ changed: false, revision: 1, idempotentReplay: true });
		await expect(tools['bankgraph.publish_exact_table'].controller(
			{ ...input, title: 'Changed title' }, context('bankgraph.publish_exact_table'),
		)).rejects.toMatchObject({ code: 'stale_revision' });
	});

	it('reflects human edits in the next board read and pages view data without rerunning analysis', async () => {
		const readBoardBlockData = vi.fn(async (block: { id: string }, request: { pageSize: number }) => ({
			section: 'series',
			items: [{ cert: 1, quarter: '20260331', value: 123 }],
			total: 1,
			offset: 0,
			pageSize: request.pageSize,
			nextCursor: null,
			metadata: { unit: 'usd_thousands' },
		}));
		const { workspace, tools } = harness({ readBoardBlockData });
		await tools['bankgraph.plot_metric_history'].controller({
			blockId: 'history', title: 'Deposit history', certs: [1], metrics: ['dep'],
			from: '20250331', to: '20260331', chartKind: 'line', scale: 'value', span: 'half', focus: true, ifRevision: 0,
		}, context('bankgraph.plot_metric_history'));
		workspace.execute(workspaceCommands.upsertBoardBlock({
			...workspace.state.board.blocks[0], title: 'Deposit path', span: 'full',
		}));
		const read = await tools['bankgraph.read_research_board'].controller({}, context('bankgraph.read_research_board'));
		expect(read.data).toMatchObject({ workspaceRevision: 2, focusedBlockId: 'history' });
		expect((read.data as { blocks: Array<{ title: string; span: string }> }).blocks[0]).toMatchObject({ title: 'Deposit path', span: 'full' });
		expect(readBoardBlockData).not.toHaveBeenCalled();

		const withData = await tools['bankgraph.read_research_board'].controller(
			{ includeData: 'all', pageSize: 3 },
			context('bankgraph.read_research_board'),
		);
		expect(readBoardBlockData).toHaveBeenCalledOnce();
		expect(withData.data).toMatchObject({
			viewData: [{
				blockId: 'history',
				title: 'Deposit path',
				kind: 'history',
				section: 'series',
				numerical: { items: [{ cert: 1, quarter: '20260331', value: 123 }], pageSize: 3 },
			}],
		});
	});
});
