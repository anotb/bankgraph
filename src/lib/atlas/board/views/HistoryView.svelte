<script lang="ts">
	import { Board } from '../board.svelte';
	import type { ResearchBoardBlock } from '$lib/workspace/types';
	import LineChart from '$lib/atlas/charts/LineChart.svelte';
	import { effective, cohortBand } from './util';
	import { metricSeries, formatMetric, researchMetricDefinition, metricValue, previousQuarter } from '$lib/atlas/engine/metrics';
	import { quarterLabel, shortBankName, tinyBankName, seriesColor } from '$lib/atlas/format';
	import { viewport } from '$lib/atlas/viewport.svelte';

	let { block, span, tall = false }: { block: ResearchBoardBlock; span: number; tall?: boolean } = $props();
	const board = Board.use();
	let e = $derived(effective(board, block));
	let scale = $derived(block.kind === 'history' ? block.binding.scale : 'value');
	let multiples = $derived(!viewport.narrow && board.overrides[block.id]?.presentation === 'multiples' && e.metrics.length > 1);
	let metric = $derived(e.metrics.includes(board.activeMetric) ? board.activeMetric : e.metrics[0]);
	let hover = $state<number | null>(null);
	let labels = $derived(e.quarters.map((q, i) => (i === 0 || i === e.quarters.length - 1 || i % (e.quarters.length > 24 ? 8 : 4) === 0 ? quarterLabel(q) : '')));
	let asOfIndex = $derived(e.quarters.indexOf(e.asOf));
	let cmpIndex = $derived(e.quarters.indexOf(e.compareWith));
	let hasBand = $derived(board.data.cohort.length >= 5 && scale !== 'index');
	let historyLength = $derived(board.quarters.length);

	function series(m: typeof e.metrics[number]) {
		return e.certs.map((cert, i) => {
			let values = metricSeries(m, board.data.rows[cert], e.quarters, board.data.institutions[cert]);
			if (scale === 'index') { const base = values.find((v) => v != null) ?? null; values = values.map((v) => (v == null || base == null || base === 0 ? null : (v / base) * 100)); }
			const emphasized = board.hoverCert === cert || (board.hoverCert == null && board.state.activeBank === cert);
			return { id: String(cert), label: e.certs.length > 1 ? tinyBankName(board.data.institutions[cert]?.name ?? String(cert)) : '', values, color: seriesColor(i), muted: board.hoverCert != null && board.hoverCert !== cert, width: emphasized ? 2.25 : 1.5 };
		});
	}
	function band(m: typeof e.metrics[number]) { if (!hasBand) return null; const b = cohortBand(board, m, e.quarters); return b ? { lo: b.lo, hi: b.hi } : null; }
	function medianSeries(m: typeof e.metrics[number]) { if (!hasBand) return null; const b = cohortBand(board, m, e.quarters); return b ? { id: 'median', label: 'peer median', values: b.median, color: 'var(--ink-3)', dash: '3 3', width: 1.25, context: true } : null; }
	let hoverQuarter = $derived(hover != null ? e.quarters[hover] : null);
	let readQuarter = $derived(hoverQuarter ?? e.asOf);
	function setLength(n: number) { board.setHistory(previousQuarter(board.asOf, n - 1), board.asOf); }
	let primary = $derived.by(() => { const med = medianSeries(metric); return med ? [...series(metric), med] : series(metric); });
</script>

{#if !e.certs.length}
	<div class="empty">Add a bank to draw its history.</div>
{:else}
	<div class="ctl">
		{#if !multiples}
			<div class="chips" role="tablist" aria-label="Measure">
				{#each e.metrics as m}<button type="button" role="tab" class="chip" aria-selected={m === metric} onclick={() => board.setActiveMetric(m)}>{researchMetricDefinition(m).shortLabel}</button>{/each}
			</div>
		{/if}
		<div class="right">
			<div class="seg" aria-label="History"><button type="button" aria-pressed={historyLength === 8} onclick={() => setLength(8)}>8Q</button><button type="button" aria-pressed={historyLength === 20} onclick={() => setLength(20)}>5Y</button><button type="button" aria-pressed={historyLength === 40} onclick={() => setLength(40)}>10Y</button></div>
			{#if e.metrics.length > 1 && !viewport.narrow}<div class="seg" aria-label="Presentation"><button type="button" aria-pressed={!multiples} onclick={() => board.setOverride(block.id, { presentation: 'primary' })}>One measure</button><button type="button" aria-pressed={multiples} onclick={() => board.setOverride(block.id, { presentation: 'multiples' })}>All measures</button></div>{/if}
		</div>
	</div>

	{#if multiples}
		<div class="sm" style="grid-template-columns: repeat({span >= 9 ? Math.min(3, e.metrics.length) : 2}, minmax(0, 1fr))">
			{#each e.metrics as m}
				{@const med = medianSeries(m)}
				<div class="cell" class:on={m === metric}>
					<button type="button" class="ct" onclick={() => board.setActiveMetric(m)}><span>{researchMetricDefinition(m).label}</span><span class="mono">{formatMetric(m, metricValue(m, board.data.rows[e.certs[0]], readQuarter, board.data.institutions[e.certs[0]]))}</span></button>
					<LineChart series={med ? [...series(m), med] : series(m)} {labels} band={band(m)} marker={asOfIndex} marker2={cmpIndex >= 0 ? cmpIndex : null} format={(v) => (scale === 'index' ? v.toFixed(0) : formatMetric(m, v, { compact: true }))} height={tall ? (span >= 9 ? 210 : 180) : span >= 9 ? 132 : 118} direct={false} bind:hover onselect={(i, shift) => { const q = e.quarters[i]; if (!q) return; if (shift) board.setComparison('custom', q); else board.setAsOf(q); }} />
				</div>
			{/each}
		</div>
	{:else}
		<LineChart series={primary} {labels} band={band(metric)} marker={asOfIndex} marker2={cmpIndex >= 0 ? cmpIndex : null} format={(v) => (scale === 'index' ? v.toFixed(0) : formatMetric(metric, v, { compact: true }))} height={tall ? (span >= 8 ? 480 : 450) : span >= 8 ? 230 : 210} direct={true} bind:hover onselect={(i, shift) => { const q = e.quarters[i]; if (!q) return; if (shift) board.setComparison('custom', q); else board.setAsOf(q); }} />
	{/if}

	<div class="readout">
		<span class:live={hoverQuarter}>{quarterLabel(readQuarter, 'long')}</span>
		{#each e.certs.slice(0, 5) as cert, i}<b style="color:{seriesColor(i)}">{e.certs.length > 1 ? tinyBankName(board.data.institutions[cert]?.name ?? String(cert)) + ' ' : ''}{formatMetric(metric, metricValue(metric, board.data.rows[cert], readQuarter, board.data.institutions[cert]))}</b>{/each}
		{#if hasBand}{@const b = cohortBand(board, metric, e.quarters)}{@const i = e.quarters.indexOf(readQuarter)}{#if b && i >= 0 && b.median[i] != null}<span>peer median {formatMetric(metric, b.median[i])} · middle half {formatMetric(metric, b.lo[i], { compact: true })} – {formatMetric(metric, b.hi[i], { compact: true })}</span>{/if}{/if}
		<span class="hint">{hoverQuarter ? 'click to set the period' : 'hover for a quarter'}</span>
	</div>
{/if}

<style>
	.ctl { display: flex; align-items: center; justify-content: space-between; gap: 10px; flex-wrap: wrap; margin-bottom: 8px; }
	.chips { display: flex; flex-wrap: wrap; gap: 6px; }
	.chips .chip { height: 24px; font-size: 11.5px; padding: 0 8px; }
	.right { display: flex; gap: 8px; flex-wrap: wrap; margin-left: auto; }
	.sm { display: grid; gap: 10px 20px; }
	.cell { min-width: 0; padding: 4px 6px 2px; border-radius: 4px; }
	.cell.on { background: var(--surface-2); }
	.ct { width: 100%; display: flex; justify-content: space-between; gap: 8px; border: 0; background: none; padding: 0 0 4px; font: inherit; font-size: 12.5px; font-weight: 600; color: var(--ink); cursor: pointer; text-align: left; }
	.ct .mono { color: var(--ink-2); font-weight: 500; font-size: 12px; }
	.readout .live { color: var(--accent); }
	.readout .hint { margin-left: auto; color: var(--ink-3); }
	@media (max-width: 640px) { .right .seg:last-child { display: none; } }
</style>
