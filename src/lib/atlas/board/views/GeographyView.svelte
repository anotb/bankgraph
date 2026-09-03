<script lang="ts">
	import { Board } from '../board.svelte';
	import type { ResearchBoardBlock } from '$lib/workspace/types';
	import TileMap from '$lib/atlas/charts/TileMap.svelte';
	import { effective } from './util';
	import { metricValue, formatMetric, researchMetricDefinition } from '$lib/atlas/engine/metrics';
	import { US_STATES } from '$lib/atlas/states';
	import { quarterLabel, count, usdThousands } from '$lib/atlas/format';

	let { block, span }: { block: ResearchBoardBlock; span: number } = $props();
	const board = Board.use();
	let e = $derived(effective(board, block));
	let mode = $derived(board.overrides[block.id]?.geographyMode ?? 'count');
	let metric = $derived((e.metrics.includes(board.activeMetric) ? board.activeMetric : e.metrics[0]) ?? board.activeMetric);
	let hovered = $state<string | null>(null);
	let byState = $derived.by(() => {
		const map: Record<string, { count: number; assets: number; values: number[] }> = {};
		for (const cert of board.data.cohort) {
			const inst = board.data.institutions[cert]; const st = inst?.state; if (!st) continue;
			const g = (map[st] ??= { count: 0, assets: 0, values: [] });
			g.count += 1; g.assets += inst?.total_assets ?? 0;
			const v = metricValue(metric, board.data.rows[cert], e.asOf, inst); if (v != null) g.values.push(v);
		}
		return map;
	});
	function median(v: number[]) { if (!v.length) return null; const s = [...v].sort((a, b) => a - b); const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; }
	let values = $derived(Object.fromEntries(Object.entries(byState).map(([st, g]) => [st, mode === 'count' ? g.count : mode === 'assets' ? g.assets : median(g.values)])) as Record<string, number | null>);
	let selectedStates = $derived(e.certs.map((c) => board.data.institutions[c]?.state).filter((s): s is string => Boolean(s)));
	let top = $derived(Object.entries(byState).sort((a, b) => b[1].count - a[1].count).slice(0, span >= 8 ? 8 : 5));
	function fmt(v: number) { return mode === 'count' ? String(Math.round(v)) : mode === 'assets' ? usdThousands(v, 0) : formatMetric(metric, v, { compact: true }); }
	function toggleState(st: string, shift: boolean) {
		const r = board.state.peerRecipe;
		const states = shift || r.states.includes(st) ? (r.states.includes(st) ? r.states.filter((x) => x !== st) : [...r.states, st]) : [st];
		board.setPeerRecipe({ ...r, basis: 'custom', states });
	}
</script>

{#if !board.data.cohort.length}
	<div class="empty">{board.data.pending ? 'Loading the cohort…' : 'Define a cohort to map it.'}</div>
{:else}
	<div class="chart-view">
	<div class="hd"><div class="seg"><button type="button" aria-pressed={mode === 'count'} onclick={() => board.setOverride(block.id, { geographyMode: 'count' })}>Institutions</button><button type="button" aria-pressed={mode === 'assets'} onclick={() => board.setOverride(block.id, { geographyMode: 'assets' })}>Assets</button><button type="button" aria-pressed={mode === 'median'} onclick={() => board.setOverride(block.id, { geographyMode: 'median' })}>Median {researchMetricDefinition(metric).shortLabel}</button></div><span class="dim">Click a state to narrow the cohort · shift-click to add</span></div>
	<div class="plot">
	<div class="row" style="grid-template-columns: {span >= 8 ? '3fr 2fr' : '1fr'}">
		<TileMap {values} focus={[]} selected={selectedStates} format={fmt} gamma={mode === 'assets' ? 0.35 : 0.6} onhover={(s) => (hovered = s)} onselect={toggleState} fit />
		{#if span >= 8}
			<table class="atlas">
				<thead><tr><th>State</th><th>Banks</th><th>Assets</th><th>Median {researchMetricDefinition(metric).shortLabel}</th></tr></thead>
				<tbody>{#each top as [st, g]}<tr class:focus={hovered === st} onclick={() => toggleState(st, false)} style="cursor:pointer"><td class="n">{US_STATES[st] ?? st}</td><td>{g.count}</td><td>{usdThousands(g.assets)}</td><td>{formatMetric(metric, median(g.values))}</td></tr>{/each}</tbody>
			</table>
		{/if}
	</div>
	</div>
	<div class="readout">{#if hovered && byState[hovered]}<span>{US_STATES[hovered]}</span><b>{byState[hovered].count} institutions</b><b>{usdThousands(byState[hovered].assets)}</b><b>median {formatMetric(metric, median(byState[hovered].values))}</b>{:else}<span>Headquarters state, not branch deposits</span>{/if}</div>
	</div>
{/if}

<style>
	.chart-view { min-height: 0; height: 100%; display: flex; flex-direction: column; }
	.plot { min-height: 0; flex: 1; overflow: auto; }
	.chart-view > .readout { flex: none; flex-wrap: nowrap; align-items: center; min-height: 26px; padding-top: 7px; margin-top: 0; border-top: 1px solid var(--rule-2); overflow-x: auto; white-space: nowrap; scrollbar-width: thin; }
	.hd { display: flex; gap: 12px; align-items: center; margin-bottom: 8px; flex-wrap: wrap; }
	.dim { color: var(--ink-3); font-size: 12px; }
	.row { display: grid; gap: 20px; align-items: start; height: 100%; min-height: 0; }
	@media (max-width: 640px) { .row { grid-template-columns: 1fr !important; } }
</style>
