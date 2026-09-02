<script lang="ts">
	import { Board } from '../board.svelte';
	import type { ResearchBoardBlock } from '$lib/workspace/types';
	import Strip from '$lib/atlas/charts/Strip.svelte';
	import { effective, cohortValues, percentileOf } from './util';
	import { metricValue, formatMetric, metricChange, researchMetricDefinition } from '$lib/atlas/engine/metrics';
	import { quarterLabel, shortBankName, tinyBankName, seriesColor, count } from '$lib/atlas/format';

	let { block, span }: { block: ResearchBoardBlock; span: number } = $props();
	const board = Board.use();
	let e = $derived(effective(board, block));
	let focusCert = $derived(board.state.activeBank && e.certs.includes(board.state.activeBank) ? board.state.activeBank : e.certs[0]);
	let metric = $derived(e.metrics.includes(board.activeMetric) ? board.activeMetric : e.metrics[0]);
	function q(sorted: number[], p: number) { if (!sorted.length) return null; const i = (sorted.length - 1) * p, l = Math.floor(i), h = Math.ceil(i); return sorted[l] + (sorted[h] - sorted[l]) * (i - l); }
	let rows = $derived(e.metrics.map((m) => {
		const def = researchMetricDefinition(m);
		const vals = cohortValues(board, m, e.asOf).map((c) => c.value).sort((a, b) => a - b);
		const cur = focusCert != null ? metricValue(m, board.data.rows[focusCert], e.asOf, board.data.institutions[focusCert]) : null;
		const prior = focusCert != null ? metricValue(m, board.data.rows[focusCert], e.compareWith, board.data.institutions[focusCert]) : null;
		const higher = def.direction !== 'lower';
		const pct = cur != null && vals.length >= 5 ? percentileOf(vals, cur, higher) : null;
		const rank = cur != null && vals.length >= 5 ? [...vals, cur].sort((a, b) => (higher ? b - a : a - b)).indexOf(cur) + 1 : null;
		return { m, def, cur, med: q(vals, 0.5), p25: q(vals, 0.25), p75: q(vals, 0.75), pct, rank, n: vals.length, move: metricChange(m, cur, prior) };
	}));
	let focusRow = $derived(rows.find((r) => r.m === metric));
	/** Half-width plates drop the middle-half column; the expanded strip above still shows it for the selected measure. */
	let compact = $derived(span < 8);
	let pts = $derived(cohortValues(board, metric, e.asOf));
	let focusPoints = $derived(e.certs.map((cert, i) => ({ cert, i, value: metricValue(metric, board.data.rows[cert], e.asOf, board.data.institutions[cert]) })).filter((f) => f.value != null).map((f) => ({ cert: f.cert, value: f.value as number, label: tinyBankName(board.data.institutions[f.cert]?.name ?? String(f.cert)), color: seriesColor(f.i), showLabel: board.state.activeBank === f.cert || board.hoverCert === f.cert })));
	const cls = (ch: { favorable: boolean | null }) => (ch.favorable === true ? 'up' : ch.favorable === false ? 'down' : 'flat');
</script>

{#if board.data.cohort.length < 5}
	<div class="empty">{board.data.pending ? 'Loading the cohort…' : 'Define a cohort of five or more to see where the banks sit.'}</div>
{:else}
	<div class="focus-strip">
		<div class="fh"><b>{focusRow?.def.label}</b><span class="dim">{#if focusCert != null}{shortBankName(board.data.institutions[focusCert]?.name ?? String(focusCert))} among {/if}{count(pts.length)} {focusCert != null ? 'peers' : 'institutions'}{#if focusRow?.p25 != null} · middle half {formatMetric(metric, focusRow.p25, { compact: true })} – {formatMetric(metric, focusRow.p75, { compact: true })}{/if} · {quarterLabel(e.asOf)}{focusRow?.def.direction !== 'neutral' ? ` · ${focusRow?.def.direction === 'higher' ? 'higher' : 'lower'} is better` : ''}</span></div>
		<Strip points={pts.map((p) => ({ cert: p.cert, value: p.value, label: shortBankName(board.data.institutions[p.cert]?.name ?? String(p.cert)) }))} focus={focusPoints} format={(v) => formatMetric(metric, v, { compact: true })} height={span >= 8 ? 72 : 64} onselect={(cert) => board.addCert(cert)} />
	</div>
	<div class="scroll">
		<table class="atlas matrix">
			<thead>
				{#if focusCert != null}<tr><th>Measure</th><th>Bank</th><th>Peer median</th>{#if !compact}<th>Middle half</th>{/if}<th>Percentile</th>{#if !compact}<th>Rank</th>{/if}<th>vs {quarterLabel(e.compareWith)}</th></tr>
				{:else}<tr><th>Measure</th><th>Median</th><th>Middle half</th><th>Institutions</th></tr>{/if}
			</thead>
			<tbody>
				{#each rows as r}
					<tr class:focus={r.m === metric} onclick={() => board.setActiveMetric(r.m)}>
						<td class="n"><b>{r.def.label}</b></td>
						{#if focusCert != null}
							<td class="v">{formatMetric(r.m, r.cur)}</td>
							<td class="dim">{formatMetric(r.m, r.med)}</td>
							{#if !compact}<td class="dim">{formatMetric(r.m, r.p25, { compact: true })} – {formatMetric(r.m, r.p75, { compact: true })}</td>{/if}
							<td>{#if r.pct != null}<span class="pbar" style="--p:{r.pct}%"><i></i></span><span class:hi={r.pct >= 75} class:lo={r.pct <= 25}>P{r.pct}</span>{#if compact && r.rank != null}<span class="chg">{r.rank} of {r.n + 1}</span>{/if}{:else}—{/if}</td>
							{#if !compact}<td class="dim">{r.rank != null ? `${r.rank} of ${r.n + 1}` : '—'}</td>{/if}
							<td class={cls(r.move)}>{r.move.text}</td>
						{:else}
							<td class="v">{formatMetric(r.m, r.med)}</td>
							<td class="dim">{formatMetric(r.m, r.p25, { compact: true })} – {formatMetric(r.m, r.p75, { compact: true })}</td>
							<td class="dim mono">{count(r.n)}</td>
						{/if}
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
{/if}

<style>
	.focus-strip { background: var(--surface-2); border-radius: 4px; padding: 8px 10px 4px; margin-bottom: 10px; }
	.fh { display: flex; gap: 10px; align-items: baseline; flex-wrap: wrap; font-size: 12.5px; margin-bottom: 14px; }
	.fh b { font-weight: 600; }
	.dim { color: var(--ink-3); font-size: 12px; }
	.matrix td.n b { font-weight: 600; }
	td.v { font-weight: 600; }
	.flat { color: var(--ink-3); }
	.pbar { display: inline-block; width: 40px; height: 6px; background: var(--surface-3); border-radius: 3px; vertical-align: middle; margin-right: 8px; position: relative; }
	.pbar i { position: absolute; left: 0; top: 0; bottom: 0; width: var(--p); background: var(--ink-3); border-radius: 3px; }
	tr.focus .pbar i { background: var(--accent); }
	.hi { color: var(--favorable); } .lo { color: var(--adverse); }
	tr { cursor: pointer; }
</style>
