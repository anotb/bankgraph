<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import { browser } from '$app/environment';
	import { replaceState } from '$app/navigation';
	import { createWorkspaceStore } from '$lib/workspace/workspace.svelte';
	import { deserializeWorkspaceSearchParams } from '$lib/workspace/codec';
	import { createDefaultWorkspaceState, workspaceCommands } from '$lib/workspace/state';
	import { createWebMcpToolHost } from '$lib/webmcp';
	import { WorkspaceWebMcp } from '$lib/components/webmcp';
	import { BoardData } from '$lib/atlas/engine/board-data.svelte';
	import { createBoardDependencies } from '$lib/atlas/engine/dependencies';
	import { Board } from './board.svelte';
	import { agentPresence } from '$lib/atlas/agent.svelte';
	import BoardView from './BoardView.svelte';
	import { templateById } from '$lib/atlas/templates';

	export interface Launch { fresh?: boolean; template?: string | null; question?: string | null; states?: string[]; certs?: number[]; asOf?: string | null; assetMin?: number | null; assetMax?: number | null; share?: boolean; add?: string | null; series?: string[] }
	interface Props {
		launch: Launch;
		/** Persisted boards share the browser draft; shells (a bank page) start fresh each visit. */
		persist?: boolean;
		release: string | null;
		releaseGeneration: string | null;
		pageLoadedAt: string;
		boardPath?: string;
		cleanUrl?: string | null;
	}
	let { launch, persist = true, release, releaseGeneration, pageLoadedAt, boardPath = '/b', cleanUrl = null }: Props = $props();

	function initialOptions() {
		if (!browser) return { storage: null, persist: false } as const;
		const params = new URLSearchParams(location.search);
		if (params.has('ws')) {
			try { return { initialState: deserializeWorkspaceSearchParams(params), persist } as const; } catch { /* fall through */ }
		}
		if (!persist) return { initialState: createDefaultWorkspaceState(), storage: null, persist: false } as const;
		return { persist: true } as const;
	}

	const store = createWorkspaceStore(initialOptions());
	const boardData = new BoardData();
	const initialPersist = untrack(() => persist);
	const initialBoardPath = untrack(() => boardPath);
	const board = Board.provide(new Board(store, boardData, initialPersist ? 'atlas.layout.v1' : `atlas.layout.shell`));
	const host = browser ? createWebMcpToolHost({ document }) : null;
	const SCOPE = 'bankgraph-workspace';
	const dependencies = createBoardDependencies({
		store, data: boardData, boardPath: initialBoardPath, board,
		context: () => ({ sourceAsOf: boardData.latestQuarter ?? release, retrievedAt: pageLoadedAt, pageLoadedAt, release, releaseGeneration })
	});
	let mounted = $state(false);
	const TIERS: Record<number, [number | null, number | null]> = { 1: [null, 100_000], 2: [100_000, 300_000], 3: [300_000, 1_000_000], 4: [1_000_000, 10_000_000], 5: [10_000_000, 50_000_000], 6: [50_000_000, 250_000_000], 7: [250_000_000, null] };

	onMount(() => {
		agentPresence.attach(host, SCOPE);
		if (!persist) board.overrides = {};
		const l = launch;
		if (!l.share) {
			if (l.fresh) board.resetResearchBoard();
			const template = templateById(l.template);
			const certs = l.certs ?? [];
			const explicitCohort = Boolean(l.states?.length || l.assetMin != null || l.assetMax != null);
			if (template) board.prepareTemplate(template, { banks: certs.length > 0, question: Boolean(l.question) });
			const cmds = [];
			if (l.question) cmds.push(workspaceCommands.setQuestion(l.question));
			if (certs.length) { cmds.push(workspaceCommands.setSelectedCerts(certs)); cmds.push(workspaceCommands.setActiveBank(certs[0])); }
			if (l.asOf) cmds.push(workspaceCommands.setAsOfQuarter(l.asOf));
			if (explicitCohort) {
				const s = store.state;
				cmds.push(workspaceCommands.setPeerRecipe({ ...s.peerRecipe, basis: 'custom', name: l.states?.length ? `Banks in ${l.states.join(', ')}` : 'Filtered institutions', states: l.states ?? [], assetRange: { min: l.assetMin ?? s.peerRecipe.assetRange.min, max: l.assetMax ?? s.peerRecipe.assetRange.max }, maximumPeers: 200 }));
			}
			if (cmds.length) store.executeBatch(cmds);
			if (template) {
				board.applyTemplate(template, 'replace');
				if (!certs.length) void board.selectCuratedMatches(template);
			}
			if (l.add === 'economy') {
				const id = `econ-${Date.now().toString(36)}`;
				board.upsertBlock({ id, kind: 'workspace_view', title: 'The economy alongside', span: 'full', binding: { view: 'economic_context' } }, { role: 'context' });
				if (l.series?.length) board.setOverride(id, { series: l.series });
			}
			if (certs.length) {
				void boardData.ensureInstitutions(certs).then(async () => {
					const inst = boardData.institutions[certs[0]];
					if (!inst) return;
					const r = store.state.peerRecipe;
					const untouched = r.basis === 'screen' && !r.states.length && !r.metricConditions.length && r.assetRange.min == null && r.assetRange.max == null;
					const band = inst.asset_tier ? TIERS[inst.asset_tier] : null;
					if (untouched && band) {
						store.execute(workspaceCommands.setPeerRecipe({ ...r, basis: 'asset-range', name: 'Same asset group', active: 'active', assetRange: { min: band[0], max: band[1] }, maximumPeers: 100 }));
						if (template?.id === 'one_bank' && certs.length === 1) {
							const peers = await boardData.nearestSizePeers(certs[0], 8);
							const current = store.state.selectedCerts;
							// Do not overwrite a person or agent that edited the selection while peers loaded.
							if (current.length === 1 && current[0] === certs[0] && peers.length > 1) {
								board.setSelectedCerts(peers);
								board.setActiveBank(certs[0]);
							}
						}
					}
					if (!store.state.question && template?.id === 'one_bank') store.execute(workspaceCommands.setQuestion(`How does ${inst.name.replace(/,?\s+National Association$/i, '')} compare with other U.S. banks in the same asset group?`));
				});
			}
			if (cleanUrl && (l.fresh || l.template || l.question || certs.length || l.states?.length || l.add)) setTimeout(() => replaceState(cleanUrl, {}), 0);
		}
		mounted = true;
		return () => agentPresence.detach();
	});
</script>

{#if mounted}
	<WorkspaceWebMcp {dependencies} page="workspace" scope={SCOPE} host={host ?? undefined} />
	<BoardView />
{:else}
	<div class="loading" aria-busy="true"><div class="q"></div><div class="a"></div></div>
{/if}

<style>
	.loading { padding: 24px 20px; }
	.loading .q { height: 30px; width: 60%; background: var(--paper-3); margin-bottom: 14px; }
	.loading .a { height: 52px; border-top: 1px solid var(--rule); border-bottom: 1px solid var(--rule); }
</style>
