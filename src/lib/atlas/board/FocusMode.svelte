<script lang="ts">
	import { Board } from './board.svelte';
	import BlockContent from './BlockContent.svelte';
	import TableView from './views/TableView.svelte';
	import { inferRole } from './layout';
	import { RESEARCH_METRICS } from '$lib/research-metrics';
	import { effective } from './views/util';

	const board = Board.use();
	let block = $derived(board.blocks.find((b) => b.id === board.focusedBlockId) ?? null);
	let tab = $state<'view' | 'values' | 'method'>('view');
	let e = $derived(block ? effective(board, block) : null);
	function close() { board.focus(null); }
</script>

{#if block}
	<div class="scrim" role="presentation" onclick={close}></div>
	<div class="focus" role="dialog" aria-modal="true" aria-label="{block.title} in focus">
		<header>
			<h2>{block.title}</h2>
			<div class="seg"><button type="button" aria-pressed={tab === 'view'} onclick={() => (tab = 'view')}>View</button><button type="button" aria-pressed={tab === 'values'} onclick={() => (tab = 'values')}>Values</button><button type="button" aria-pressed={tab === 'method'} onclick={() => (tab = 'method')}>Method</button></div>
			<button type="button" class="btn" onclick={close}>Close</button>
		</header>
		<div class="body">
			{#if tab === 'view'}
				<BlockContent {block} role={inferRole(block)} span={12} />
			{:else if tab === 'values'}
				{#if block.kind === 'history' || block.kind === 'exact_table' || (block.kind === 'workspace_view' && ['comparison_matrix', 'metric_history'].includes(block.binding.view))}
					<TableView block={{ id: `${block.id}-values`, kind: 'exact_table', title: block.title, span: 'full', binding: { certs: e?.certs ?? [], metrics: e?.metrics ?? [], from: e?.certs.length === 1 ? e.from : null, to: e?.certs.length === 1 ? e.to : null, followCurrent: (e?.certs.length ?? 0) !== 1 } }} />
				{:else}
					<BlockContent {block} role={inferRole(block)} span={12} />
				{/if}
			{:else}
				<div class="method">
					{#each e?.metrics ?? [] as m}
						{@const def = RESEARCH_METRICS.find((x) => x.id === m)}
						{#if def}
							<div class="def">
								<h3>{def.label} <span class="mono">{def.source}</span></h3>
								<p>{def.description}</p>
								<p class="meta">Unit: {def.displayUnit} · change measured in {def.change.replace('_', ' ')} · {def.aggregation === 'additive' ? 'sums across institutions' : 'distribution only; never summed'} · {def.direction === 'neutral' ? 'no better direction' : `${def.direction} is better`}</p>
							</div>
						{/if}
					{/each}
					<div class="def">
						<h3>Source and period</h3>
						<p>FDIC BankFind Suite: Institutions and quarterly Financials. Money in FDIC USD thousands; ratios as reported in percent. As of {e?.asOf}, compared with {e?.compareWith}.{#if board.data.cohort.length} Cohort of {board.data.cohort.length} institutions from the deterministic screen; members are recomputed from the rule on each release.{/if}</p>
					</div>
				</div>
			{/if}
		</div>
	</div>
{/if}
<svelte:window onkeydown={(ev) => block && ev.key === 'Escape' && close()} />

<style>
	.scrim { position: fixed; inset: 0; background: rgb(17 24 39 / .45); z-index: 60; animation: fade 160ms ease-out; }
	.focus { position: fixed; z-index: 61; left: 50%; top: 4vh; transform: translateX(-50%); width: min(1280px, calc(100vw - 32px)); max-height: 92vh; overflow: auto; background: var(--surface); border-radius: 8px; box-shadow: var(--shadow-lg); animation: grow 180ms ease-out; }
	header { display: flex; align-items: center; gap: 16px; padding: 12px 18px; border-bottom: 1px solid var(--rule); position: sticky; top: 0; background: var(--surface); z-index: 2; }
	header h2 { font-size: 15px; font-weight: 600; margin: 0; flex: 1; }
	.body { padding: 16px 18px 22px; }
	.method { display: grid; gap: 16px; max-width: 820px; }
	.def h3 { font-size: 13px; font-weight: 600; margin: 0 0 4px; display: flex; gap: 10px; align-items: baseline; }
	.def h3 .mono { font-size: 11.5px; color: var(--ink-3); font-weight: 400; }
	.def p { margin: 0 0 4px; font-size: 13px; color: var(--ink-2); line-height: 1.5; }
	.meta { color: var(--ink-3) !important; font-size: 12px !important; }
	@keyframes fade { from { opacity: 0; } }
	@keyframes grow { from { opacity: 0; transform: translateX(-50%) scale(.98); } }
	@media (max-width: 640px) { .focus { top: 0; width: 100vw; max-height: 100vh; border-radius: 0; } header { flex-wrap: wrap; gap: 8px; } }
</style>