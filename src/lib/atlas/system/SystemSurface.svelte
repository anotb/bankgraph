<script lang="ts">
	/**
	 * The banking system as one operating surface: a measure explorer across size groups,
	 * a comparative table, breadth and movers for the latest quarter, and geography.
	 * Used by the front page and by /system.
	 */
	import LineChart from '$lib/atlas/charts/LineChart.svelte';
	import TileMap from '$lib/atlas/charts/TileMap.svelte';
	import { US_STATES } from '$lib/atlas/states';
	import { quarterLabel, usdThousands, pct, signed, count, shortBankName, changeLabel } from '$lib/atlas/format';
	import type { IndustryPoint, RadarMetric, Signal } from '../../../routes/+page.server';

	interface SystemData {
		period: { current: string; prior: string } | null;
		signals: Signal[];
		radar: { population: { matchedInstitutions: number }; metrics: RadarMetric[] } | null;
		series: Record<string, IndustryPoint[]>;
		states: Array<{ state: string; count: number }>;
	}
	let { data, full = false }: { data: SystemData; full?: boolean } = $props();

	type Segment = 'all' | 'community' | 'regional' | 'large';
	const SEGMENT_LABEL: Record<Segment, string> = { all: 'All filers', community: 'Under $1B', regional: '$1B – $50B', large: '$50B and above' };
	const SEGMENTS: Segment[] = ['all', 'community', 'regional', 'large'];
	const SEG_COLOR: Record<Segment, string> = { all: 'var(--ink)', community: 'var(--s3)', regional: 'var(--s1)', large: 'var(--s2)' };
	const MEASURES = [
		{ key: 'total_assets', label: 'Total assets', unit: 'usd' as const, lowerIsBetter: false },
		{ key: 'total_deposits', label: 'Total deposits', unit: 'usd' as const, lowerIsBetter: false },
		{ key: 'median_roa', label: 'Return on assets, median bank', unit: 'pct' as const, lowerIsBetter: false },
		{ key: 'median_nim', label: 'Net interest margin, median bank', unit: 'pct' as const, lowerIsBetter: false },
		{ key: 'median_npl', label: 'Noncurrent loans, median bank', unit: 'pct' as const, lowerIsBetter: true },
		{ key: 'bank_count', label: 'Institutions filing', unit: 'count' as const, lowerIsBetter: false }
	];

	let segment = $state<Segment>('all');
	let measure = $state('median_roa');
	let mdef = $derived(MEASURES.find((x) => x.key === measure) ?? MEASURES[2]);
	let series = $derived((data.series[segment] ?? []) as IndustryPoint[]);
	let quarters = $derived(((data.series.all ?? []) as IndustryPoint[]).map((p) => p.repdte));
	let latest = $derived(quarters.at(-1) ?? data.period?.current ?? null);
	let quarter = $state<string | null>(null);
	let asOf = $derived(quarter ?? latest);
	let asOfIndex = $derived(Math.max(0, quarters.indexOf(asOf ?? '')));
	let prior = $derived(series.find((p) => p.repdte === priorQ(asOf)) ?? null);
	let isLatest = $derived(asOf === latest && segment === 'all');
	let hover = $state<number | null>(null);

	function m(p: IndustryPoint | null | undefined, key: string): number | null { const v = p?.metrics?.[key]; return v == null ? null : v; }
	function rowFor(key: string, seg: Segment, q: string | null): number | null { return m(((data.series[seg] ?? []) as IndustryPoint[]).find((x) => x.repdte === q), key); }
	function seriesFor(seg: Segment): (number | null)[] { const s = (data.series[seg] ?? []) as IndustryPoint[]; return quarters.map((q) => m(s.find((x) => x.repdte === q), measure)); }
	function priorQ(q: string | null): string | null { const i = quarters.indexOf(q ?? ''); return i > 0 ? quarters[i - 1] : null; }
	function yearAgoQ(q: string | null): string | null { const i = quarters.indexOf(q ?? ''); return i >= 4 ? quarters[i - 4] : null; }
	function fmtMeasure(key: string, v: number | null | undefined, compact = false) { const d = MEASURES.find((x) => x.key === key); if (v == null) return '—'; return d?.unit === 'usd' ? usdThousands(v, compact ? 1 : undefined) : d?.unit === 'pct' ? pct(v) : count(v); }
	function fmtDirection(d: 'up' | 'down' | 'flat' | 'none', lowerIsBetter = false) { if (d === 'none' || d === 'flat') return 'flat'; return (d === 'up') !== lowerIsBetter ? 'up' : 'down'; }
	let explorerLabels = $derived(quarters.map((q, i) => (i === 0 || i === quarters.length - 1 || i % 8 === 0 ? quarterLabel(q) : '')));

	let radarMetric = $state<'total_assets' | 'total_deposits' | 'net_loans'>('total_assets');
	let radar = $derived(data.radar?.metrics.find((x) => x.id === radarMetric) ?? null);
	let stateValues = $derived(Object.fromEntries(data.states.map((s) => [s.state, s.count])) as Record<string, number>);
	let topStates = $derived([...data.states].filter((s) => US_STATES[s.state]).sort((a, b) => b.count - a.count).slice(0, full ? 12 : 8));
	let geoSignal = $derived(data.signals.find((s) => s.id === 'geography-asset-movement') ?? null);
	let hoveredState = $state<string | null>(null);
</script>

<div class="plate system" class:full>
	<div class="sys-head">
		<h2>{quarterLabel(asOf, 'long')} <span class="dim">vs {prior ? quarterLabel(prior.repdte, 'long') : '—'}</span></h2>
		<div class="controls">
			<select class="in" value={asOf} onchange={(e) => (quarter = (e.currentTarget as HTMLSelectElement).value)} aria-label="Reporting period">
				{#each [...quarters].reverse() as q}<option value={q} selected={q === asOf}>{quarterLabel(q, 'long')}</option>{/each}
			</select>
			<a class="btn" href="/b?template=system{asOf ? `&asOf=${asOf}` : ''}">Open as a board</a>
		</div>
	</div>
	<div class="explorer">
		<div class="chart">
			<div class="ch"><b>{mdef.label}</b><span class="dim">ten years · four size groups · click a point to set the period</span></div>
			<LineChart series={SEGMENTS.map((seg) => ({ id: seg, label: SEGMENT_LABEL[seg], values: seriesFor(seg), color: SEG_COLOR[seg], width: seg === segment ? 2.25 : 1.25, muted: seg !== segment && seg !== 'all' }))} labels={explorerLabels} marker={asOfIndex} format={(v) => (mdef.unit === 'usd' ? usdThousands(v, 1) : mdef.unit === 'pct' ? `${v.toFixed(2)}%` : count(v))} height={full ? 280 : 228} direct={false} bind:hover onselect={(i) => (quarter = quarters[i] ?? null)} />
			<div class="readout">
				{#if hover != null && quarters[hover]}<span class="live">{quarterLabel(quarters[hover])}</span>{#each SEGMENTS as seg}<b style="color:{SEG_COLOR[seg]}">{SEGMENT_LABEL[seg]} {fmtMeasure(measure, rowFor(measure, seg, quarters[hover]), true)}</b>{/each}{:else}<span>{quarterLabel(asOf)}</span>{#each SEGMENTS as seg}<b style="color:{SEG_COLOR[seg]}">{SEGMENT_LABEL[seg]} {fmtMeasure(measure, rowFor(measure, seg, asOf), true)}</b>{/each}{/if}
			</div>
		</div>
		<div class="scroll systable">
			<table class="atlas">
				<thead><tr><th>Measure</th>{#each SEGMENTS as seg}<th class:on={segment === seg}><button type="button" class="hb" onclick={() => (segment = seg)}>{SEGMENT_LABEL[seg]}</button></th>{/each}<th>QoQ</th><th>YoY</th></tr></thead>
				<tbody>
					{#each MEASURES as mm}
						{@const cur = rowFor(mm.key, segment, asOf)}
						{@const qoq = changeLabel(cur, rowFor(mm.key, segment, priorQ(asOf)), mm.unit === 'usd' ? 'usd_thousands' : mm.unit === 'pct' ? 'percent' : 'count')}
						{@const yoy = changeLabel(cur, rowFor(mm.key, segment, yearAgoQ(asOf)), mm.unit === 'usd' ? 'usd_thousands' : mm.unit === 'pct' ? 'percent' : 'count')}
						<tr class:focus={measure === mm.key} onclick={() => (measure = mm.key)}>
							<td class="n">{mm.label}</td>
							{#each SEGMENTS as seg}<td class:sorted={segment === seg}>{fmtMeasure(mm.key, rowFor(mm.key, seg, asOf))}</td>{/each}
							<td class={fmtDirection(qoq.direction, mm.lowerIsBetter)}>{qoq.text}</td>
							<td class={fmtDirection(yoy.direction, mm.lowerIsBetter)}>{yoy.text}</td>
						</tr>
					{/each}
				</tbody>
			</table>
			<div class="dim small">Change columns follow the highlighted size group · select a row to draw it</div>
		</div>
	</div>
	{#if isLatest && data.radar && radar}
		<div class="radar">
			<div class="breadth-wrap">
				<div class="lbl"><span>Breadth of the move in</span><div class="seg sm" role="group">{#each data.radar.metrics as x}<button type="button" aria-pressed={radarMetric === x.id} onclick={() => (radarMetric = x.id as typeof radarMetric)}>{x.label.toLowerCase()}</button>{/each}</div></div>
				<div class="breadth" style="--down:{radar.breadth.decreasingShare}fr;--up:{radar.breadth.increasingShare}fr"><i class="d"></i><i class="u"></i></div>
				<div class="breadth-l"><span><b class="down">{count(radar.breadth.decreasing)}</b> decreased</span><span>median bank {signed(radar.breadth.medianPercentChange, 2)}%</span><span><b class="up">{count(radar.breadth.increasing)}</b> increased</span></div>
				<div class="dim small">{count(data.radar.population.matchedInstitutions)} institutions filed both quarters</div>
			</div>
			<div class="scroll"><table class="atlas movers">
				<thead><tr><th>Largest increases</th><th></th><th>Largest decreases</th><th></th></tr></thead>
				<tbody>
					{#each radar.contributors.increases.slice(0, full ? 8 : 4) as inc, i}
						{@const dec = radar.contributors.decreases[i]}
						<tr>
							<td class="n"><a href="/bank/{inc.cert}">{shortBankName(inc.name)}</a></td><td class="up">{usdThousands(inc.change)}</td>
							{#if dec}<td class="n"><a href="/bank/{dec.cert}">{shortBankName(dec.name)}</a></td><td class="down">−{usdThousands(Math.abs(dec.change))}</td>{:else}<td></td><td></td>{/if}
						</tr>
					{/each}
				</tbody>
			</table></div>
		</div>
	{:else}
		<div class="dim small" style="margin-top:10px">Breadth and largest movers are computed for the latest quarter across all filers. <a href="/b?template=system&asOf={asOf}">Open {quarterLabel(asOf, 'long')} as a board</a> to compute them for this selection.</div>
	{/if}
</div>

<div class="plate geo">
	<div class="ph"><h3>Where banks are headquartered</h3><span class="dim">click a state to start a cohort</span></div>
	<TileMap values={stateValues} format={(v) => String(Math.round(v))} onhover={(s) => (hoveredState = s)} onselect={(st) => { location.href = `/b?template=geography&states=${st}`; }} />
	<div class="readout">{#if hoveredState}<span>{US_STATES[hoveredState] ?? hoveredState}</span><b>{count(stateValues[hoveredState] ?? 0)} active institutions</b>{/if}</div>
</div>
<div class="plate states">
	<div class="ph"><h3>Most institutions</h3></div>
	<table class="atlas">
		<tbody>
			{#each topStates as s}
				<tr><td class="n"><a href="/b?template=geography&states={s.state}">{US_STATES[s.state]}</a></td><td><span class="bar" style="width:{Math.round((s.count / topStates[0].count) * 64)}px"></span>{count(s.count)}</td></tr>
			{/each}
		</tbody>
	</table>
	{#if geoSignal}<p class="note">{geoSignal.title} moved {signed(geoSignal.change.percent, 1)}% against {signed(geoSignal.comparison?.value ?? null, 1)}% for the system last quarter.</p>{/if}
</div>

<style>
	.plate { min-width: 0; }
	.sys-head { display: flex; align-items: center; gap: 14px; flex-wrap: wrap; margin-bottom: 10px; }
	.sys-head h2 { font-size: 15px; font-weight: 650; margin: 0; letter-spacing: -0.01em; }
	.controls { display: flex; align-items: center; gap: 8px; margin-left: auto; flex-wrap: wrap; }
	.explorer { display: grid; grid-template-columns: minmax(0, 7fr) minmax(0, 5fr); gap: 12px 20px; align-items: start; }
	.chart { min-width: 0; }
	.ch { display: flex; gap: 10px; align-items: baseline; flex-wrap: wrap; margin-bottom: 4px; }
	.ch b { font-weight: 600; font-size: 13px; }
	.systable { max-height: none; }
	table.atlas th.on, table.atlas td.sorted { color: var(--ink); background: var(--surface-2); }
	table.atlas tr { cursor: pointer; }
	.hb { border: 0; background: none; font: inherit; color: inherit; cursor: pointer; padding: 0; }
	.hb:hover { color: var(--ink); }
	.readout .live { color: var(--accent); }
	.flat { color: var(--ink-3); }
	.radar { display: grid; grid-template-columns: 1fr 1fr; gap: 12px 24px; margin-top: 14px; align-items: start; }
	.breadth-wrap { min-width: 0; }
	.lbl { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; font-size: 12px; color: var(--ink-2); font-weight: 500; }
	.seg.sm > button { height: 20px; font-size: 11.5px; padding: 0 7px; }
	.breadth { display: grid; grid-template-columns: var(--down) var(--up); height: 12px; gap: 2px; margin: 10px 0 6px; border-radius: 2px; overflow: hidden; }
	.breadth i { display: block; height: 100%; }
	.breadth i.d { background: var(--adverse); } .breadth i.u { background: var(--favorable); }
	.breadth-l { display: flex; justify-content: space-between; font-size: 12px; color: var(--ink-2); gap: 8px; }
	.breadth-l b { font-family: var(--font-mono); font-weight: 500; }
	.small { font-size: 11.5px; margin-top: 6px; }
	.movers td.n { white-space: normal; }
	.movers tr { cursor: default; }
	table.atlas td.n a { color: var(--ink); text-decoration: none; }
	table.atlas td.n a:hover { color: var(--accent); }
	.ph { display: flex; align-items: baseline; gap: 10px; margin-bottom: 8px; flex-wrap: wrap; }
	.ph h3 { font-size: 13px; font-weight: 600; margin: 0; }
	.note { margin: 10px 0 0; font-size: 12px; color: var(--ink-2); line-height: 1.45; }
	table.atlas td .bar { display: inline-block; height: 8px; background: var(--ink-3); vertical-align: middle; margin-right: 8px; border-radius: 1px; }
	.states tr { cursor: default; }
	@media (max-width: 1500px) { .explorer { grid-template-columns: 1fr; } }
	@media (max-width: 640px) {
		.radar { grid-template-columns: 1fr; }
		.controls { margin-left: 0; width: 100%; }
		.controls .btn { margin-left: auto; }
	}
</style>
