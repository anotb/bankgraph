<script lang="ts">
	import { Board } from '../board.svelte';
	import type { ResearchBoardBlock } from '$lib/workspace/types';
	import { effective, cohortValues, percentileOf } from './util';
	import { metricValue, formatMetric, metricChange, researchMetricDefinition, yearAgo } from '$lib/atlas/engine/metrics';
	import { quarterLabel, shortBankName, seriesColor } from '$lib/atlas/format';

	let { block }: { block: ResearchBoardBlock; span: number } = $props();
	const board = Board.use();
	let e = $derived(effective(board, block));
	let multi = $derived(e.certs.length > 1);
	let focusCert = $derived(board.state.activeBank && e.certs.includes(board.state.activeBank) ? board.state.activeBank : e.certs[0]);
	let inst = $derived((cert: number) => board.data.institutions[cert]);
	let val = $derived((cert: number, m: typeof e.metrics[number], q: string) => metricValue(m, board.data.rows[cert], q, inst(cert)));
	function median(v: number[]) { if (!v.length) return null; const s = [...v].sort((a, b) => a - b); const i = Math.floor(s.length / 2); return s.length % 2 ? s[i] : (s[i - 1] + s[i]) / 2; }
	function rankOf(values: number[], v: number, higherBetter: boolean) { const s = [...values].sort((a, b) => (higherBetter ? b - a : a - b)); return s.findIndex((x) => x === v) + 1; }
	let rows = $derived(e.metrics.map((m) => {
		const def = researchMetricDefinition(m);
		const cur = val(focusCert, m, e.asOf);
		const qoq = metricChange(m, cur, val(focusCert, m, e.compareWith));
		const yoy = metricChange(m, cur, val(focusCert, m, yearAgo(e.asOf)));
		const cohort = cohortValues(board, m, e.asOf).map((c) => c.value);
		const higherBetter = def.direction !== 'lower';
		const pct = cur != null && cohort.length >= 5 ? percentileOf(cohort, cur, higherBetter) : null;
		const rank = cur != null && cohort.length >= 5 ? rankOf([...cohort, cur], cur, higherBetter) : null;
		return { m, def, cur, qoq, yoy, med: median(cohort), n: cohort.length, pct, rank };
	}));
	const cls = (ch: { favorable: boolean | null }) => (ch.favorable === true ? 'up' : ch.favorable === false ? 'down' : 'flat');
</script>

{#if !e.certs.length}
	<div class="empty">Add a bank to see its position.</div>
{:else if !multi}
	<div class="scroll">
		<table class="atlas matrix">
			<thead><tr><th>Measure</th><th>{quarterLabel(e.asOf)}</th><th>vs {quarterLabel(e.compareWith)}</th><th>vs {quarterLabel(yearAgo(e.asOf))}</th><th>Peer median</th><th>Percentile</th><th>Rank</th></tr></thead>
			<tbody>
				{#each rows as r}
					<tr class:focus={board.activeMetric === r.m} onclick={() => board.setActiveMetric(r.m)} title={r.def.description}>
						<td class="n"><b>{r.def.label}</b>{#if r.def.direction !== 'neutral'}<span class="dir">{r.def.direction === 'higher' ? '↑ better' : '↓ better'}</span>{/if}</td>
						<td class="v">{formatMetric(r.m, r.cur)}</td>
						<td class={cls(r.qoq)}>{r.qoq.text}</td>
						<td class={cls(r.yoy)}>{r.yoy.text}</td>
						<td class="dim">{r.n >= 5 ? formatMetric(r.m, r.med) : '—'}</td>
						<td>{#if r.pct != null}<span class="pbar" style="--p:{r.pct}%"><i></i></span><span class="p" class:hi={r.pct >= 75} class:lo={r.pct <= 25}>P{r.pct}</span>{:else}—{/if}</td>
						<td class="dim">{r.rank != null ? `${r.rank} of ${r.n + 1}` : '—'}</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
	<div class="readout"><span>{shortBankName(inst(focusCert)?.name ?? String(focusCert))}{board.data.cohort.length >= 5 ? ` · peer median and rank within ${board.data.cohort.length} cohort members` : ''}</span></div>
{:else}
	<div class="scroll">
		<table class="atlas">
			<thead><tr><th>Institution</th>{#each e.metrics as m}<th class:on={board.activeMetric === m}><button type="button" class="hb" onclick={() => board.setActiveMetric(m)}>{researchMetricDefinition(m).shortLabel}</button></th>{/each}</tr></thead>
			<tbody>
				{#each e.certs as cert, ci}
					<tr class:focus={cert === focusCert} onclick={() => board.setActiveBank(cert)} onmouseenter={() => (board.hoverCert = cert)} onmouseleave={() => (board.hoverCert = null)}>
						<td class="n"><i class="dot" style="background:{seriesColor(ci)}"></i>{shortBankName(inst(cert)?.name ?? String(cert))}<span class="sub">{inst(cert)?.state ?? ''}</span></td>
						{#each e.metrics as m}
							{@const cur = val(cert, m, e.asOf)}
							{@const ch = metricChange(m, cur, val(cert, m, e.compareWith))}
							<td class:sorted={board.activeMetric === m}>{formatMetric(m, cur)}<span class="chg {cls(ch)}">{ch.text}</span></td>
						{/each}
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
	<div class="readout"><span>{quarterLabel(e.asOf)} with change vs {quarterLabel(e.compareWith)}</span></div>
{/if}

<style>
	.matrix td.n b { font-weight: 600; }
	.dir { color: var(--ink-3); font-size: 11px; margin-left: 8px; }
	td.v { font-weight: 600; color: var(--ink); }
	.flat { color: var(--ink-3); }
	.pbar { display: inline-block; width: 56px; height: 6px; background: var(--surface-3); border-radius: 3px; vertical-align: middle; margin-right: 8px; position: relative; }
	.pbar i { position: absolute; left: 0; top: 0; bottom: 0; width: var(--p); background: var(--ink-3); border-radius: 3px; }
	tr.focus .pbar i { background: var(--accent); }
	.p.hi { color: var(--favorable); } .p.lo { color: var(--adverse); }
	th.on, td.sorted { color: var(--ink); background: var(--surface-2); }
	.hb { border: 0; background: none; font: inherit; color: inherit; cursor: pointer; padding: 0; }
	.hb:hover { color: var(--ink); }
	.dot { width: 8px; height: 8px; border-radius: 50%; display: inline-block; margin-right: 6px; }
	tr { cursor: pointer; }
	@media (max-width: 640px) { .dir { display: none; } .pbar { width: 36px; } }
</style>
