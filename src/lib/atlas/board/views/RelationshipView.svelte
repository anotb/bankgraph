<script lang="ts">
	import { Board } from '../board.svelte';
	import type { ResearchBoardBlock } from '$lib/workspace/types';
	import Scatter from '$lib/atlas/charts/Scatter.svelte';
	import { effective } from './util';
	import { RESEARCH_METRICS } from '$lib/research-metrics';
	import { metricValue, formatMetric, researchMetricDefinition, type ResearchMetric } from '$lib/atlas/engine/metrics';
	import { quarterLabel, shortBankName, tinyBankName, seriesColor, count } from '$lib/atlas/format';

	let { block, span, tall = false }: { block: ResearchBoardBlock; span: number; tall?: boolean } = $props();
	const board = Board.use();
	let e = $derived(effective(board, block));
	let X = $derived((board.overrides[block.id]?.xMetric as ResearchMetric | undefined) ?? (e.metrics.find((m) => m !== board.activeMetric) ?? e.metrics[1] ?? 'asset'));
	let Y = $derived((board.overrides[block.id]?.yMetric as ResearchMetric | undefined) ?? board.activeMetric);
	let universe = $derived([...new Set([...board.data.cohort, ...e.certs])]);
	let points = $derived(universe.map((cert) => { const x = metricValue(X, board.data.rows[cert], e.asOf, board.data.institutions[cert]); const y = metricValue(Y, board.data.rows[cert], e.asOf, board.data.institutions[cert]); const i = e.certs.indexOf(cert); return x != null && y != null ? { id: cert, x, y, label: i >= 0 ? tinyBankName(board.data.institutions[cert]?.name ?? String(cert)) : shortBankName(board.data.institutions[cert]?.name ?? String(cert)), focus: i >= 0, showLabel: i >= 0 && (board.state.activeBank === cert || board.hoverCert === cert), color: i >= 0 ? seriesColor(i) : undefined } : null; }).filter((p): p is NonNullable<typeof p> => p !== null));
	let hoverPoint = $derived(points.find((point) => point.id === board.hoverCert) ?? null);
	let r = $derived.by(() => {
		const n = points.length; if (n < 8) return null;
		const mx = points.reduce((a, p) => a + p.x, 0) / n, my = points.reduce((a, p) => a + p.y, 0) / n;
		let sxy = 0, sxx = 0, syy = 0;
		for (const p of points) { sxy += (p.x - mx) * (p.y - my); sxx += (p.x - mx) ** 2; syy += (p.y - my) ** 2; }
		return sxx && syy ? sxy / Math.sqrt(sxx * syy) : null;
	});
</script>

<div class="chart-view">
	<div class="hd">
		<label>x <select class="in" value={X} onchange={(ev) => board.setOverride(block.id, { xMetric: ev.currentTarget.value as ResearchMetric })}>{#each RESEARCH_METRICS as m}<option value={m.id}>{m.label}</option>{/each}</select></label>
		<label>y <select class="in" value={Y} onchange={(ev) => board.setOverride(block.id, { yMetric: ev.currentTarget.value as ResearchMetric })}>{#each RESEARCH_METRICS as m}<option value={m.id}>{m.label}</option>{/each}</select></label>
		<span class="dim">{count(points.length)} institutions · {quarterLabel(e.asOf)}</span>
	</div>
	<div class="plot">
		{#if points.length < 3}
			<div class="empty">{board.data.pending ? 'Loading the cohort…' : 'Define a cohort to plot a relationship.'}</div>
		{:else}
			<Scatter {points} fx={(v) => formatMetric(X, v, { compact: true })} fy={(v) => formatMetric(Y, v, { compact: true })} xLabel={researchMetricDefinition(X).shortLabel} yLabel={researchMetricDefinition(Y).shortLabel} height={tall ? 500 : span >= 8 ? 240 : 220} onselect={(id) => (e.certs.includes(id) ? board.setActiveBank(id) : board.addCert(id))} onhover={(id) => (board.hoverCert = id)} />
		{/if}
	</div>
	<div class="readout">
		{#if hoverPoint}
			<span class="live">{hoverPoint.label}</span><b>{researchMetricDefinition(X).shortLabel} {formatMetric(X, hoverPoint.x)}</b><b>{researchMetricDefinition(Y).shortLabel} {formatMetric(Y, hoverPoint.y)}</b><span>{quarterLabel(e.asOf)}</span>
		{:else}
			<span>r = {r != null ? r.toFixed(2) : '—'} across {count(points.length)} institutions · hover a bank for its values</span>
		{/if}
	</div>
</div>

<style>
	.hd { display: flex; gap: 12px; align-items: center; margin-bottom: 8px; font-size: 12px; color: var(--ink-2); flex-wrap: wrap; }
	.hd label { display: inline-flex; align-items: center; gap: 6px; font-weight: 500; }
	.hd select { height: 26px; font-size: 12px; }
	.dim { color: var(--ink-3); margin-left: auto; }
	.chart-view { min-height: 0; height: 100%; display: flex; flex-direction: column; }
	.plot { min-height: 0; flex: 1; overflow: auto; }
	.chart-view > .readout { flex: none; flex-wrap: nowrap; align-items: center; min-height: 26px; padding-top: 7px; margin-top: 0; border-top: 1px solid var(--rule-2); overflow-x: auto; white-space: nowrap; scrollbar-width: thin; }
	.readout .live { color: var(--accent); }
</style>
