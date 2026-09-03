<script lang="ts">
	import { browser } from '$app/environment';
	import { untrack } from 'svelte';
	import LineChart from '$lib/atlas/charts/LineChart.svelte';
	import { viewport } from '$lib/atlas/viewport.svelte';
	import type { MacroSeriesMeta } from './+page.server';
	import { EconomyWebMcp } from '$lib/components/webmcp';
	import type { MacroRouteData } from '$lib/webmcp';

	let { data } = $props();

	interface Obs { date: string; value: number }
	type Unit = 'pct' | 'pp' | 'usd_m';
	interface Def { id: string; label: string; short?: string; unit: Unit; color: string }
	interface Group { id: string; title: string; note: string; series: Def[]; zero?: boolean; allowYoY?: boolean }

	// Direct-agency series already in the catalog; nothing here is synthesized.
	const GROUPS: Group[] = [
		{ id: 'rates', title: 'Rates and the yield curve', note: 'Federal Reserve H.15 and Treasury par yields', series: [
			{ id: 'FRB_FEDFUNDS', label: 'Fed funds', unit: 'pct', color: 'var(--ink)' },
			{ id: 'UST2Y', label: '2-year Treasury', short: '2Y', unit: 'pct', color: 'var(--s1)' },
			{ id: 'UST10Y', label: '10-year Treasury', short: '10Y', unit: 'pct', color: 'var(--s2)' }
		] },
		{ id: 'curve', title: '10-year minus 2-year spread', note: 'Below zero, the curve is inverted', zero: true, series: [
			{ id: 'UST10Y2Y', label: '10Y − 2Y', unit: 'pp', color: 'var(--s4)' }
		] },
		{ id: 'credit', title: 'Bank credit and deposits', note: 'Federal Reserve H.8, all commercial banks, weekly', allowYoY: true, series: [
			{ id: 'FRB_H8_BANK_CREDIT', label: 'Bank credit', unit: 'usd_m', color: 'var(--ink)' },
			{ id: 'FRB_H8_LOANS_LEASES', label: 'Loans and leases', short: 'Loans', unit: 'usd_m', color: 'var(--s1)' },
			{ id: 'FRB_H8_DEPOSITS', label: 'Deposits', unit: 'usd_m', color: 'var(--s2)' }
		] },
		{ id: 'context', title: 'Inflation and labor', note: 'Bureau of Labor Statistics, monthly', series: [
			{ id: 'BLS_CPI_YOY', label: 'CPI inflation, 12-month', short: 'CPI', unit: 'pct', color: 'var(--s5)' },
			{ id: 'BLS_UNRATE', label: 'Unemployment rate', unit: 'pct', color: 'var(--s1)' }
		] },
		{ id: 'lending', title: 'Lending by type', note: 'Federal Reserve H.8, all commercial banks, weekly', allowYoY: true, series: [
			{ id: 'FRB_H8_REAL_ESTATE', label: 'Real estate', unit: 'usd_m', color: 'var(--s1)' },
			{ id: 'FRB_H8_CI_LOANS', label: 'Commercial and industrial', short: 'C&I', unit: 'usd_m', color: 'var(--s2)' },
			{ id: 'FRB_H8_CRE', label: 'Commercial real estate', short: 'CRE', unit: 'usd_m', color: 'var(--s3)' },
			{ id: 'FRB_H8_CONSUMER', label: 'Consumer', unit: 'usd_m', color: 'var(--s4)' }
		] }
	];
	// NBER business-cycle peaks and troughs, plus dated banking events, as overlays.
	const RECESSIONS = [{ from: '1990-07-01', to: '1991-03-31', label: 'recession' }, { from: '2001-03-01', to: '2001-11-30', label: 'recession' }, { from: '2007-12-01', to: '2009-06-30', label: 'recession' }, { from: '2020-02-01', to: '2020-04-30', label: 'pandemic' }];
	const EVENTS = [{ date: '2008-09-15', label: 'Lehman' }, { date: '2010-07-21', label: 'Dodd-Frank' }, { date: '2023-03-10', label: 'SVB, Signature' }];

	const RANGES = [{ id: '1y', label: '1Y', years: 1 }, { id: '5y', label: '5Y', years: 5 }, { id: '10y', label: '10Y', years: 10 }, { id: '20y', label: '20Y', years: 20 }, { id: 'max', label: 'Since 1990', years: 37 }];
	let rangeId = $state('10y');
	let range = $derived(RANGES.find((r) => r.id === rangeId) ?? RANGES[2]);
	let showEvents = $state(true);
	let mode = $state<'level' | 'yoy'>('level');
	let hover = $state<number | null>(null);
	let focusGroup = $state<string>('rates');

	const today = new Date();
	const iso = (d: Date) => d.toISOString().slice(0, 10);
	let to = $derived(iso(today));
	let from = $derived.by(() => { const d = new Date(today); d.setFullYear(d.getFullYear() - range.years); return iso(d); });
	let fetchFrom = $derived.by(() => { const d = new Date(from); d.setFullYear(d.getFullYear() - 1); return iso(d); });

	// Common grid so hover, range, and overlays stay synchronized across every chart.
	let step = $derived<'week' | 'month' | 'quarter'>(range.years <= 1 ? 'week' : range.years <= 10 ? 'month' : 'quarter');
	let grid = $derived.by(() => {
		const out: string[] = [];
		const end = new Date(to);
		if (step === 'week') { const d = new Date(end); while (iso(d) >= from) { out.unshift(iso(d)); d.setDate(d.getDate() - 7); } return out; }
		let y = end.getUTCFullYear(), mo = end.getUTCMonth();
		while (true) { const d = new Date(Date.UTC(y, mo + 1, 0)); if (iso(d) < from) break; out.unshift(iso(d)); mo -= step === 'month' ? 1 : 3; if (mo < 0) { mo += 12; y -= 1; } }
		return out;
	});
	let labels = $derived(grid.map((d, i) => { const n = grid.length; const every = n > 100 ? 12 : n > 40 ? 12 : n > 20 ? 6 : 4; if (i === 0 || i === n - 1 || i % every === 0) return step === 'week' ? d.slice(0, 7) : range.years > 5 ? d.slice(0, 4) : d.slice(0, 7); return ''; }));

	let raw = $state<Record<string, Obs[]>>({});
	let loading = $state<Record<string, boolean>>({});
	let truncated = $state<Record<string, boolean>>({});
	const catalogById = $derived(Object.fromEntries(data.catalog.map((s: MacroSeriesMeta) => [s.series_id, s])) as Record<string, MacroSeriesMeta>);

	$effect(() => {
		if (!browser) return;
		const f = fetchFrom, t = to;
		const controller = new AbortController();
		const ids = GROUPS.flatMap((g) => g.series.map((s) => s.id));
		untrack(() => {
			for (const id of ids) {
				const key = `${id}:${f}`;
				if (raw[key]) continue;
				loading = { ...loading, [id]: true };
				// The endpoint bounds each request to a ten-year window and 5,000 rows, so long windows are fetched in ten-year pieces.
				const chunks: Array<[string, string]> = [];
				let start = new Date(f);
				while (iso(start) < t) { const end = new Date(start); end.setFullYear(end.getFullYear() + 10); end.setDate(end.getDate() - 1); const e = iso(end) < t ? iso(end) : t; chunks.push([iso(start), e]); start = new Date(end); start.setDate(start.getDate() + 1); }
				Promise.all(chunks.map(([a, b]) => fetch(`/api/v1/macro/${id}?from=${a}&to=${b}&limit=5000`, { signal: controller.signal }).then(async (r) => (r.ok ? ((await r.json()) as { data: Obs[] }).data : []))))
					.then((parts) => { raw = { ...raw, [key]: parts.flat() }; truncated = { ...truncated, [id]: parts.some((p) => p.length >= 5000) }; })
					.catch(() => {})
					.finally(() => { loading = { ...loading, [id]: false }; });
			}
		});
		return () => controller.abort();
	});

	/** Last observation at or before each grid date (as-of alignment). Null before the first observation. */
	function asOfLookup(obs: Obs[]): (d: string) => number | null {
		let j = 0;
		return (d: string) => { while (j < obs.length && obs[j].date <= d) j++; return j > 0 && obs[j - 1].date >= shiftYears(d, -1) ? obs[j - 1].value : null; };
	}
	function shiftYears(d: string, n: number) { const x = new Date(d); x.setFullYear(x.getFullYear() + n); return iso(x); }
	function valuesFor(def: Def): (number | null)[] {
		const obs = raw[`${def.id}:${fetchFrom}`]; if (!obs) return grid.map(() => null);
		const at = asOfLookup(obs);
		const level = grid.map((d) => { const v = at(d); return v == null ? null : def.unit === 'usd_m' ? v / 1e6 : v; });
		if (mode !== 'yoy' || def.unit !== 'usd_m') return level;
		const at2 = asOfLookup(obs);
		return grid.map((d, i) => { const cur = level[i]; const prev = at2(shiftYears(d, -1)); return cur == null || prev == null || prev === 0 ? null : ((cur * 1e6) / prev - 1) * 100; });
	}
	function latest(def: Def) { const obs = raw[`${def.id}:${fetchFrom}`]; return obs?.length ? obs[obs.length - 1] : null; }
	function valueAt(def: Def, date: string) { const obs = raw[`${def.id}:${fetchFrom}`]; if (!obs) return null; let v: Obs | null = null; for (const o of obs) { if (o.date <= date) v = o; else break; } return v; }
	function fmt(def: Def, v: number | null | undefined, yoy = false): string {
		if (v == null) return '—';
		if (yoy) return `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(1)}%`;
		if (def.unit === 'usd_m') return `$${(v / 1e6).toFixed(2)}T`;
		return `${v.toFixed(2)}${def.unit === 'pp' ? ' pp' : '%'}`;
	}
	function fmtAxis(g: Group, v: number) { if (mode === 'yoy' && g.allowYoY) return `${v.toFixed(0)}%`; if (g.series[0].unit === 'usd_m') return `$${v.toFixed(1)}T`; return `${v.toFixed(1)}${g.series[0].unit === 'pp' ? '' : '%'}`; }
	function idx(date: string) { const i = grid.findIndex((d) => d >= date); return i < 0 ? grid.length - 1 : i; }
	let overlays = $derived.by(() => {
		if (!showEvents) return [];
		const out: Array<{ from: number; to: number; label?: string }> = [];
		for (const r of RECESSIONS) if (r.to >= from && r.from <= to) out.push({ from: idx(r.from), to: idx(r.to), label: r.label });
		for (const ev of EVENTS) if (ev.date >= from && ev.date <= to) out.push({ from: idx(ev.date), to: idx(ev.date), label: ev.label });
		return out;
	});
	let hoverDate = $derived(hover != null ? grid[hover] : null);
	function chg(def: Def, cur: number | null | undefined, prev: number | null | undefined) { if (cur == null || prev == null) return { text: '—', cls: 'flat' }; const d = cur - prev; if (def.unit === 'usd_m') { const p = prev ? (d / prev) * 100 : 0; return { text: `${p >= 0 ? '+' : '−'}${Math.abs(p).toFixed(1)}%`, cls: p > 0 ? 'up' : p < 0 ? 'down' : 'flat' }; } return { text: `${d >= 0 ? '+' : '−'}${Math.abs(d).toFixed(2)} pp`, cls: d > 0 ? 'up' : d < 0 ? 'down' : 'flat' }; }
	let visibleGroups = $derived(viewport.narrow ? GROUPS.filter((g) => g.id === focusGroup) : GROUPS);
	function boardHref(g: Group) { return `/b?add=economy&series=${g.series.map((s) => s.id).join(',')}`; }
	let economy = $derived({
		series: Object.fromEntries(data.catalog.map((meta: MacroSeriesMeta) => {
			const observations = raw[`${meta.series_id}:${fetchFrom}`];
			return [meta.series_id, observations ? {
				...meta,
				frequency: meta.cadence,
				query: { from: fetchFrom, to, limit: 5_000, default_window_years: 10 as const },
				data: observations
			} : null];
		})),
		correlations: [],
		view: { range: range.label, from, to, mode, eventsVisible: showEvents, focusedGroup: focusGroup }
	} satisfies MacroRouteData);
</script>

<EconomyWebMcp {economy} />

<svelte:head><title>Economy · Bankgraph</title><meta name="description" content="Follow interest rates, the yield curve, bank credit, deposits, lending, inflation, and employment across the same period." /></svelte:head>

<div class="page">
	<header class="head">
		<div><h1>Economy</h1><p class="sub">Follow the forces around bank balance sheets: interest rates, credit, deposits, inflation, and employment.</p></div>
		<div class="controls">
			<div class="seg" role="group" aria-label="Window">{#each RANGES as r}<button type="button" aria-pressed={rangeId === r.id} onclick={() => (rangeId = r.id)}>{r.label}</button>{/each}</div>
			<div class="seg" role="group" aria-label="Bank series"><button type="button" aria-pressed={mode === 'level'} onclick={() => (mode = 'level')}>Levels</button><button type="button" aria-pressed={mode === 'yoy'} onclick={() => (mode = 'yoy')}>Year-over-year</button></div>
			<button type="button" class="chip" aria-pressed={showEvents} onclick={() => (showEvents = !showEvents)}>Recessions and events</button>
		</div>
	</header>

	{#if viewport.narrow}
		<div class="chips" role="tablist" aria-label="Section">{#each GROUPS as g}<button type="button" role="tab" class="chip" aria-selected={focusGroup === g.id} onclick={() => (focusGroup = g.id)}>{g.title}</button>{/each}</div>
	{/if}

	<div class="grid">
		{#each visibleGroups as g}
			{@const yoy = mode === 'yoy' && Boolean(g.allowYoY)}
			<section class="plate" class:wide={g.id === 'rates' || g.id === 'credit'} class:short={g.id === 'curve' || g.id === 'context'} class:full={g.id === 'lending'}>
				<div class="ph"><h2>{g.title}{#if yoy}<span class="dim">, year-over-year change</span>{/if}</h2><span class="dim">{g.note}</span><a class="btn sm" href={boardHref(g)}>Add to a board</a></div>
				<LineChart series={g.series.map((s) => ({ id: s.id, label: s.short ?? s.label, values: valuesFor(s), color: s.color, width: 1.6 }))} {labels} events={overlays} format={(v) => fmtAxis(g, v)} height={g.id === 'curve' ? 150 : g.id === 'context' ? 200 : viewport.narrow ? 220 : 240} direct={!viewport.narrow && g.id !== 'curve' && g.id !== 'context'} zero={Boolean(g.zero) || yoy} bind:hover />
				<div class="scroll">
					<table class="atlas readings">
						<thead><tr><th>Series</th><th>{hoverDate ?? 'Latest'}</th><th>1Y earlier</th><th>Change</th><th>Start of window</th><th>Observed</th></tr></thead>
						<tbody>
							{#each g.series as s}
								{@const cur = hoverDate ? valueAt(s, hoverDate) : latest(s)}
								{@const prev = cur ? valueAt(s, shiftYears(cur.date, -1)) : null}
								{@const start = valueAt(s, from)}
								{@const c = chg(s, cur?.value, prev?.value)}
								<tr>
									<td class="n"><i class="dot" style="background:{s.color}"></i>{s.label}<span class="code">{s.id}</span></td>
									<td class="v">{loading[s.id] && !cur ? '…' : fmt(s, cur?.value)}</td>
									<td class="dim">{fmt(s, prev?.value)}</td>
									<td class={c.cls}>{c.text}</td>
									<td class="dim">{fmt(s, start?.value)}</td>
									<td class="dim mono">{cur?.date ?? catalogById[s.id]?.observed_through ?? '—'}</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
				{#if g.series.some((s) => truncated[s.id])}<div class="dim small">Daily series are bounded at 5,000 observations per request; the earliest part of this window may be thinner.</div>{/if}
			</section>
		{/each}
	</div>

</div>

<style>
	.page { padding: 14px 20px 20px; display: grid; gap: 12px; }
	.head { display: flex; align-items: flex-end; justify-content: space-between; gap: 16px; flex-wrap: wrap; }
	h1 { font-size: 18px; font-weight: 650; margin: 0 0 2px; letter-spacing: -0.01em; }
	.sub { margin: 0; color: var(--ink-2); font-size: 13px; max-width: 64ch; line-height: 1.45; }
	.controls { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
	.chips { display: flex; gap: 6px; flex-wrap: wrap; }
	.grid { display: grid; grid-template-columns: repeat(12, minmax(0, 1fr)); gap: 12px; }
	.plate { grid-column: span 6; min-width: 0; }
	.plate.wide { grid-column: span 8; }
	.plate.short { grid-column: span 4; }
	.plate.full { grid-column: span 12; }
	.plate.short .readings th:nth-child(5), .plate.short .readings td:nth-child(5) { display: none; }
	.ph { display: flex; align-items: baseline; gap: 10px; margin-bottom: 8px; flex-wrap: wrap; }
	.ph h2 { font-size: 13.5px; font-weight: 600; margin: 0; }
	.ph .btn { margin-left: auto; }
	.readings { margin-top: 8px; }
	.readings td.n { white-space: nowrap; }
	.dot { width: 8px; height: 8px; border-radius: 50%; display: inline-block; margin-right: 7px; vertical-align: middle; }
	.code { font-family: var(--font-mono); font-size: 10.5px; color: var(--ink-4); margin-left: 8px; }
	td.v { font-weight: 600; }
	.flat { color: var(--ink-3); }
	.small { font-size: 11.5px; margin-top: 6px; }
	@media (max-width: 1200px) { .plate, .plate.wide, .plate.short, .plate.full { grid-column: span 12; } .plate.short .readings th:nth-child(5), .plate.short .readings td:nth-child(5) { display: table-cell; } }
	@media (max-width: 640px) { .page { padding: 10px 12px 16px; gap: 10px; } .grid { grid-template-columns: minmax(0, 1fr); gap: 10px; } .plate, .plate.wide, .plate.short, .plate.full { grid-column: span 1; } .ph .btn { margin-left: 0; } .readings th:nth-child(5), .readings td:nth-child(5) { display: none; } }
</style>
