<script lang="ts">
	import { Board } from '../board.svelte';
	import type { ResearchBoardBlock, FailurePatternAnalysisResult } from '$lib/workspace/types';
	import type { FailurePatternsResponse } from '$lib/server/analytics/failure-patterns';
	import LineChart from '$lib/atlas/charts/LineChart.svelte';
	import Sparkline from '$lib/atlas/charts/Sparkline.svelte';
	import { resolveAnalysis } from './analysis';
	import { quarterLabel, shortBankName, seriesColor, count } from '$lib/atlas/format';
	import { viewport } from '$lib/atlas/viewport.svelte';

	let { block, span, tall = false }: { block: ResearchBoardBlock & { kind: 'analysis' }; span: number; tall?: boolean } = $props();
	const board = Board.use();
	let result = $state<FailurePatternsResponse | null>(null);
	let missing = $state(false);
	$effect(() => {
		const ref = block.binding.resultRef;
		resolveAnalysis(ref, board.state.analysisResult).then((r) => { if (r?.kind === 'failure_pattern') result = (r as FailurePatternAnalysisResult).result; else missing = true; });
	});
	let view = $derived(block.binding.view);
	let feature = $state<string | null>(null);
	let features = $derived(result?.eventStudy.series ?? []);
	let showAll = $state(false);
	/** Order by how far the failed median travelled over the window, in units of the reference scale: the measures that separate most come first. */
	let ranked = $derived([...features].map((s) => { const first = s.points.find((p) => p.median != null)?.median ?? null; const last = [...s.points].reverse().find((p) => p.median != null)?.median ?? null; const scale = s.points.reduce((a, p) => a + (p.referenceScale || 0), 0) / Math.max(1, s.points.length); return { s, move: first != null && last != null && scale ? Math.abs(last - first) / scale : 0 }; }).sort((a, b) => b.move - a.move));
	let shownFeatures = $derived(viewport.narrow ? ranked.filter((r) => r.s.metric === (feature ?? ranked[0]?.s.metric)).map((r) => r.s) : showAll ? ranked.map((r) => r.s) : ranked.slice(0, 5).map((r) => r.s));
	let F = $derived(feature ?? 'noncurrent_loan_ratio');
	/** One hover index shared by every small multiple, so the crosshair and its values line up across measures. */
	let hover = $state<number | null>(null);
	let relQ = $derived(result ? (result.eventStudy.series[0]?.points.map((p) => p.relativeQuarter) ?? []) : []);
	let labels = $derived(relQ.map((q) => `t−${Math.abs(q)}`));
	let five = $derived(!viewport.narrow && !showAll && span >= 9 && !viewport.tablet);
	/** Five narrow columns cannot fit eight tick labels; keep the ends and one midpoint. */
	let smLabels = $derived(five ? labels.map((l, i) => (i === 0 || i === labels.length - 1 || (i % 3 === 0 && i < labels.length - 2) ? l : '')) : labels);
	let analogues = $derived(result?.currentAnalogues.data ?? []);
	let shown = $derived(analogues.filter((a) => !board.state.excludedCerts.includes(a.cert)));
	const KEY = ['noncurrent_loan_ratio', 'total_risk_based_capital_ratio', 'roa', 'net_charge_off_ratio'];
	function latestObs(a: (typeof analogues)[number], metric: string) { const fc = a.featureContributions.find((f) => f.metric === metric); return fc?.observations.at(-1)?.bankValue ?? null; }
	function path(a: (typeof analogues)[number], metric: string) { return a.featureContributions.find((f) => f.metric === metric)?.observations.map((o) => o.bankValue) ?? []; }
	let drivers = $derived.by(() => {
		if (!analogues.length) return [];
		const acc = new Map<string, { label: string; share: number }>();
		for (const a of analogues) for (const f of a.featureContributions) { const g = acc.get(f.metric) ?? { label: f.label, share: 0 }; g.share += f.squaredDistanceShare / analogues.length; acc.set(f.metric, g); }
		return [...acc.entries()].sort((a, b) => b[1].share - a[1].share);
	});
	const fmtPct = (v: number) => `${v.toFixed(1)}%`;
	let cols = $derived(span >= 9 ? 4 : span >= 6 ? 2 : 1);
	let topThree = $derived(shown.slice(0, 3));
</script>

{#if missing}
	<div class="empty">This analysis isn't stored in this browser. Run it again from Add view.</div>
{:else if !result}
	<div class="empty">Loading the analysis…</div>
{:else if view === 'event_study' || view === 'small_multiples' || view === 'timeline'}
	<div class="chart-view">
	<div class="plot">
	<div class="ctl">
		{#if viewport.narrow}
			<select class="in" value={feature ?? ranked[0]?.s.metric} onchange={(e) => (feature = e.currentTarget.value)}>{#each ranked as r}<option value={r.s.metric}>{r.s.label}</option>{/each}</select>
		{:else}
			<span class="dim">{showAll ? 'All measures' : 'The five that moved most'}, ordered by movement in the failed cohort</span>
			<button type="button" class="btn sm" onclick={() => (showAll = !showAll)}>{showAll ? 'Show the five that matter' : `Show all ${features.length}`}</button>
		{/if}
	</div>
	<div class="sm" style="grid-template-columns: repeat({viewport.narrow ? 1 : five ? 5 : showAll ? cols : Math.min(cols, 3)}, minmax(0, 1fr))">
		{#each shownFeatures as s}
			{@const med = s.points.map((p) => p.median)}
			<div class="cell">
				<h4><span>{s.label}</span>{#if hover != null && med[hover] != null}<span class="mono live" title="Failed-cohort median at {labels[hover]}; middle half in brackets">{fmtPct(med[hover]!)} <small>[{s.points[hover].q25 != null ? fmtPct(s.points[hover].q25!) : '—'} – {s.points[hover].q75 != null ? fmtPct(s.points[hover].q75!) : '—'}]</small></span>{:else}<span class="mono">{med[0] != null ? fmtPct(med[0]) : '—'} → {med.at(-1) != null ? fmtPct(med.at(-1)!) : '—'}</span>{/if}</h4>
				<LineChart series={[{ id: s.metric, label: '', values: med, color: ['noncurrent_loan_ratio', 'net_charge_off_ratio'].includes(s.metric) ? 'var(--adverse)' : 'var(--ink)', width: 1.75 }]} labels={smLabels} band={{ lo: s.points.map((p) => p.q25), hi: s.points.map((p) => p.q75) }} format={fmtPct} height={viewport.narrow ? 220 : tall ? (showAll ? 160 : 390) : showAll ? 110 : span < 6 ? 120 : 160} direct={false} zero={s.metric === 'roa'} bind:hover />
				
			</div>
		{/each}
	</div>
	</div>
	<div class="readout">{#if hover != null}<span class="live">{labels[hover]}</span><span>{Math.abs(relQ[hover] ?? 0)} quarter{Math.abs(relQ[hover] ?? 0) === 1 ? '' : 's'} before the last filing · each header shows the failed median and its middle half at this point</span>{:else}<span>Median of {count(result.historicalCohort.withExactQuarterHistory)} institutions that failed {result.request.startYear}–{result.request.endYear} · band: middle half · t−1: last filing before failure</span>{/if}</div>
	</div>
{:else if view === 'analogue_table' || view === 'analogues' || view === 'matched_banks'}
	<div class="table-view">
	<div class="scroll">
		<table class="atlas">
			<thead><tr><th></th><th>Institution</th><th></th><th>HQ</th><th title="Coverage-adjusted distance from the failed cohort's path; lower is closer">Distance</th>{#each KEY as k}<th>{features.find((f) => f.metric === k)?.label.replace(' ratio', '').replace('Total risk-based capital', 'Total capital').replace('Return on assets', 'ROA') ?? k}</th>{/each}<th title="Noncurrent loan ratio over the bank's last eight quarters, with the change in percentage points">Noncurrent, 8Q</th></tr></thead>
			<tbody>
				{#each shown as a}
					{@const sel = board.selectedCerts.indexOf(a.cert)}
					{@const p = path(a, 'noncurrent_loan_ratio')}
					{@const first = p.find((v) => v != null)}
					{@const last = [...p].reverse().find((v) => v != null)}
					<tr class:focus={board.state.activeBank === a.cert} onclick={() => { if (sel >= 0) board.setActiveBank(a.cert); }} onmouseenter={() => (board.hoverCert = a.cert)} onmouseleave={() => (board.hoverCert = null)} style={sel >= 0 ? 'cursor:pointer' : ''}>
						<td class="rank">{a.rank}</td>
						<td class="n">{#if sel >= 0}<i class="dot" style="background:{seriesColor(sel)}"></i>{/if}<a href="/bank/{a.cert}" onclick={(ev) => ev.stopPropagation()}>{shortBankName(a.name)}</a><span class="sub">{a.cert}</span></td>
						<td class="act">{#if sel >= 0}<span class="on">On board</span>{:else}<button type="button" class="btn sm" onclick={(ev) => { ev.stopPropagation(); board.addCert(a.cert); }}>Add</button>{/if}</td><td class="mono">{a.state}</td><td title="{a.coverage.observedCells} of {a.coverage.expectedCells} cells observed">{a.coverageAdjustedDistance.toFixed(2)}</td>
						{#each KEY as k}{@const v = latestObs(a, k)}<td class={k === 'noncurrent_loan_ratio' && v != null && v > 3 ? 'down' : ''}>{v != null ? fmtPct(v) : '—'}</td>{/each}
						<td style="width:112px" class="trend" title={first != null && last != null ? `Noncurrent loans ${fmtPct(first)} → ${fmtPct(last)} over the bank's last ${p.length} quarters` : undefined}><Sparkline values={p} height={16} color="var(--adverse)" /><span class="delta">{first != null && last != null ? `${last - first >= 0 ? '+' : '−'}${Math.abs(last - first).toFixed(1)}` : ''}</span></td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
	<div class="readout"><span>Ranked by distance from the failed cohort's eight-quarter path across eleven reported ratios{board.state.excludedCerts.length ? ` · ${board.state.excludedCerts.length} excluded` : ''}</span></div>
	</div>
{:else if view === 'event_trajectories'}
	{@const fs = features.find((s) => s.metric === F)}
	<div class="chart-view">
	<div class="hd"><select class="in" value={F} onchange={(e) => (feature = e.currentTarget.value)}>{#each features as s}<option value={s.metric}>{s.label}</option>{/each}</select></div>
	{#if fs}
		<div class="plot"><LineChart series={[{ id: 'median', label: 'failed median', values: fs.points.map((p) => p.median), color: 'var(--ink-3)', width: 1.25 }, ...topThree.map((a, i) => ({ id: String(a.cert), label: shortBankName(a.name).split(' ')[0], values: path(a, F), color: seriesColor(Math.max(0, board.selectedCerts.indexOf(a.cert)) || i) }))]} {labels} band={{ lo: fs.points.map((p) => p.q25), hi: fs.points.map((p) => p.q75) }} format={fmtPct} height={tall ? 480 : span >= 8 ? 220 : 200} zero={F === 'roa'} bind:hover /></div>
		<div class="readout">
			{#if hover != null}
				<span class="live">{labels[hover]}</span><b>failed median {fs.points[hover]?.median != null ? fmtPct(fs.points[hover].median!) : '—'}</b>
				{#each topThree as a, i}{@const v = path(a, F)[hover]}<b style="color:{seriesColor(Math.max(0, board.selectedCerts.indexOf(a.cert)) || i)}">{shortBankName(a.name).split(' ').slice(0, 2).join(' ')} {v != null ? fmtPct(v) : '—'}</b>{/each}
			{:else}
				<span>Analogues end at {quarterLabel(result.currentAnalogues.asOf)}; the failed cohort at its last filing</span>
			{/if}
		</div>
	{/if}
	</div>
{:else if view === 'distribution' || view === 'summary' || view === 'breadth'}
	<div class="table-view">
	<div class="scroll"><table class="atlas drivers">
		<thead><tr><th>Measure</th><th title="Failed-cohort median, t−8 to t−1">t−8 → t−1</th><th title="Mean share of standardized distance">Share</th></tr></thead>
		<tbody>
			{#each drivers as [metric, d]}
				{@const s = features.find((f) => f.metric === metric)}
				<tr><td class="n">{d.label}</td><td>{s ? `${fmtPct(s.points[0].median ?? 0)} → ${fmtPct(s.points.at(-1)?.median ?? 0)}` : '—'}</td><td><span class="bar" style="width:{Math.round((d.share / Math.max(0.01, drivers[0]?.[1].share ?? 1)) * 64)}px"></span>{Math.round(d.share * 100)}%</td></tr>
			{/each}
		</tbody>
	</table></div>
	<div class="readout"><span>Mean share of standardized distance across the {analogues.length} closest analogues</span></div>
	</div>
{:else}
	<div class="scroll">
		<table class="atlas">
			<thead><tr><th>Measure</th>{#each labels as l}<th>{l}</th>{/each}</tr></thead>
			<tbody>{#each features as s}<tr><td class="n">{s.label}</td>{#each s.points as p}<td>{p.median != null ? fmtPct(p.median) : '—'}</td>{/each}</tr>{/each}</tbody>
		</table>
	</div>
	
{/if}

<style>
	.chart-view { min-height: 0; height: 100%; display: flex; flex-direction: column; }
	.chart-view > .plot { min-height: 0; flex: 1; overflow: auto; }
	.table-view { min-height: 0; height: 100%; display: flex; flex-direction: column; }
	.table-view > .scroll { min-height: 0; max-height: none; flex: 1; }
	.chart-view > .readout, .table-view > .readout { flex: none; flex-wrap: nowrap; align-items: center; min-height: 26px; padding-top: 7px; margin-top: 0; border-top: 1px solid var(--rule-2); overflow-x: auto; white-space: nowrap; scrollbar-width: thin; }
	.sm { display: grid; gap: 10px 18px; }
	.cell { min-width: 0; }
	.cell h4 { margin: 0 0 4px; font-size: 12.5px; font-weight: 600; display: flex; justify-content: space-between; gap: 8px; min-width: 0; }
	.cell h4 > span:first-child { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0; }
	.cell h4 .mono { white-space: nowrap; flex: none; }
	.cell h4 .live { color: var(--accent); }
	.cell h4 .live small { color: var(--ink-3); font-size: 10.5px; font-weight: 400; }
	.readout .live { color: var(--accent); }
	.cell h4 .mono { color: var(--ink-2); font-weight: 500; font-size: 12px; }
	table.atlas .rank { color: var(--ink-3); width: 24px; }
	.dot { width: 8px; height: 8px; border-radius: 50%; display: inline-block; margin-right: 6px; }
	td.n a { color: var(--ink); text-decoration: none; }
	td.n a:hover { color: var(--accent); }
	td.act { text-align: left; width: 64px; padding-left: 0; }
	td.act .on { color: var(--ink-3); font-size: 11.5px; font-family: var(--font-sans); }
	.hd { display: flex; gap: 10px; align-items: center; margin-bottom: 8px; }
	.ctl { display: flex; justify-content: space-between; align-items: center; gap: 10px; margin-bottom: 8px; flex-wrap: wrap; }
	.dim { color: var(--ink-3); font-size: 12px; }
	.hd select { height: 26px; font-size: 12px; }
	td.trend { white-space: nowrap; }
	td.trend :global(svg) { vertical-align: middle; }
	.delta { margin-left: 6px; font-size: 11px; color: var(--ink-3); }
	.drivers td.n { white-space: normal; line-height: 1.25; padding-top: 4px; padding-bottom: 4px; }
	.bar { display: inline-block; height: 8px; background: var(--ink-3); vertical-align: middle; margin-right: 8px; border-radius: 1px; }
	@media (max-width: 640px) { .sm { grid-template-columns: 1fr !important; } }
</style>
