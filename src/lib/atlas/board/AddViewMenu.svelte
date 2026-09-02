<script lang="ts">
	import { Board } from './board.svelte';
	import type { ViewKind, ViewRole } from '$lib/atlas/templates';

	let { onclose }: { onclose: () => void } = $props();
	const board = Board.use();
	const VIEWS: Array<{ kind: ViewKind; label: string; hint: string; role: ViewRole; needs?: 'banks' | 'cohort' }> = [
		{ kind: 'statements', label: 'Position', hint: 'Value, change, peer median, percentile, rank', role: 'lead', needs: 'banks' },
		{ kind: 'history', label: 'History', hint: 'One measure over time against the cohort', role: 'lead', needs: 'banks' },
		{ kind: 'exact_table', label: 'Exact table', hint: 'Banks by measure, sortable', role: 'reference', needs: 'banks' },
		{ kind: 'distribution', label: 'Distribution', hint: 'Where each bank sits in the cohort', role: 'support', needs: 'cohort' },
		{ kind: 'attribution', label: 'What moved', hint: 'The components behind the change', role: 'lead', needs: 'banks' },
		{ kind: 'relationship', label: 'Relationship', hint: 'Two measures across the cohort', role: 'contrast', needs: 'cohort' },
		{ kind: 'geography', label: 'Geography', hint: 'The cohort by headquarters state', role: 'support', needs: 'cohort' },
		{ kind: 'economy', label: 'The economy', hint: 'Rates, unemployment, and bank credit', role: 'context' },
		{ kind: 'record', label: 'Institution record', hint: 'Identity, charter, ownership, scale', role: 'reference', needs: 'banks' }
	];
	async function runFailureAnalysis() { try { await board.runFailureAnalysis(); onclose(); } catch { /* the plate menu stays open so the person can retry */ } }
	function add(v: (typeof VIEWS)[number]) {
		const block = board.blockForTemplateView({ kind: v.kind, role: v.role }, `${v.kind}-${Date.now().toString(36)}`);
		if (block) {
			board.upsertBlock(block, { role: v.role });
			board.select(block.id);
			// Bring the new plate into view once it has composed into its strip.
			setTimeout(() => document.querySelector(`[data-block="${block.id}"]`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }), 60);
		}
		onclose();
	}
</script>

<div class="pop menu" role="menu">
	<div class="cap">Views</div>
	{#each VIEWS as v}
		<button type="button" role="menuitem" onclick={() => add(v)}>
			<b>{v.label}</b><span>{v.hint}</span>
		</button>
	{/each}
	<div class="cap" style="margin-top:8px">Analyses</div>
	<button type="button" role="menuitem" onclick={runFailureAnalysis} disabled={board.analysisRunning === 'failure'}><b>{board.analysisRunning === 'failure' ? 'Running…' : 'Failure analogues, 2007–2012'}</b><span>Failed banks aligned on their last filing, and active banks with similar paths</span></button>
</div>

<style>
	.menu { position: absolute; right: 0; top: calc(100% + 6px); width: 320px; text-align: left; display: grid; gap: 1px; max-height: 70vh; overflow: auto; padding: 6px; }
	.menu > button { display: grid; grid-template-columns: 1fr auto; gap: 0 10px; align-items: baseline; border: 0; background: none; text-align: left; padding: 6px 8px; cursor: pointer; color: var(--ink); font: inherit; border-radius: 4px; }
	.menu > button:hover { background: var(--surface-2); }
	.menu > button[disabled] { opacity: .5; cursor: default; }
	.menu > button b { font-weight: 600; font-size: 12.5px; }
	.menu > button span { font-size: 11.5px; color: var(--ink-3); text-align: right; }
	@media (max-width: 860px) { .menu { right: auto; left: 0; width: min(360px, calc(100vw - 28px)); } }
</style>
