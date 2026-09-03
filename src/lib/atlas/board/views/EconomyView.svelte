<script lang="ts">
	import { Board } from '../board.svelte';
	import type { ResearchBoardBlock } from '$lib/workspace/types';
	import LineChart from '$lib/atlas/charts/LineChart.svelte';
	import { effective } from './util';
	import { quarterLabel, pct } from '$lib/atlas/format';

	interface Obs { date: string; value: number }
	interface Series { id: string; title: string; units: string; data: Obs[] }
	let { block, span, tall = false }: { block: ResearchBoardBlock; span: number; tall?: boolean } = $props();
	const board = Board.use();
	let e = $derived(effective(board, block));
	const CHOICES = [
		{ id: 'UST10Y2Y', label: '10Y − 2Y spread' }, { id: 'BLS_UNRATE', label: 'Unemployment' }, { id: 'FRB_FEDFUNDS', label: 'Fed funds' },
		{ id: 'UST2Y', label: '2-year Treasury' }, { id: 'UST10Y', label: '10-year Treasury' }, { id: 'BLS_CPI_YOY', label: 'CPI inflation' },
		{ id: 'FRB_H8_BANK_CREDIT', label: 'Bank credit' }, { id: 'FRB_H8_LOANS_LEASES', label: 'Loans and leases' }, { id: 'FRB_H8_DEPOSITS', label: 'Deposits' },
		{ id: 'FRB_H8_REAL_ESTATE', label: 'Real estate loans' }, { id: 'FRB_H8_CI_LOANS', label: 'C&I loans' }, { id: 'FRB_H8_CRE', label: 'CRE loans' }, { id: 'FRB_H8_CONSUMER', label: 'Consumer loans' }
	];
	let picked = $derived.by(() => {
		const carried = (board.overrides[block.id]?.series ?? []).filter((id) => CHOICES.some((c) => c.id === id)).slice(0, 3);
		return carried.length ? carried : ['UST10Y2Y', 'BLS_UNRATE'];
	});
	function setPicked(next: string[]) { board.setOverride(block.id, { series: next.slice(0, 3) }); }
	let series = $state<Record<string, Series>>({});
	let hover = $state<number | null>(null);

	// Window follows the board's history, with a year of air on each side; event-time boards show 2006–2012 alongside.
	let range = $derived.by(() => {
		if (board.eventTime) return { from: '2006-01-01', to: '2012-12-31' };
		const f = e.quarters[0] ?? e.from, t = e.quarters.at(-1) ?? e.to;
		return { from: `${Number(f.slice(0, 4)) - 1}-01-01`, to: `${t.slice(0, 4)}-${t.slice(4, 6)}-${t.slice(6, 8)}` };
	});
	$effect(() => {
		const ids = picked, r = range;
		const controller = new AbortController();
		for (const id of ids) {
			fetch(`/api/v1/macro/${id}?from=${r.from}&to=${r.to}&limit=5000`, { signal: controller.signal }).then(async (res) => {
				if (!res.ok) return;
				const body = (await res.json()) as Series & { series_id: string };
				series = { ...series, [`${id}:${r.from}`]: { id, title: body.title, units: body.units, data: body.data } };
			}).catch(() => {});
		}
		return () => controller.abort();
	});
	// Quarterly average of each series on the board's quarter grid (or 2006–2012 in event time).
	let quarters = $derived(board.eventTime ? Array.from({ length: 28 }, (_, i) => `${2006 + Math.floor(i / 4)}${['0331', '0630', '0930', '1231'][i % 4]}`) : e.quarters);
	function quarterOf(date: string) { const y = date.slice(0, 4), m = Number(date.slice(5, 7)); return `${y}${['0331', '0630', '0930', '1231'][Math.ceil(m / 3) - 1]}`; }
	function aligned(id: string): (number | null)[] {
		const s = series[`${id}:${range.from}`]; if (!s) return quarters.map(() => null);
		const buckets = new Map<string, number[]>();
		for (const o of s.data) { const q = quarterOf(o.date); (buckets.get(q) ?? buckets.set(q, []).get(q)!).push(o.value); }
		return quarters.map((q) => { const v = buckets.get(q); if (!v?.length) return null; const avg = v.reduce((a, b) => a + b, 0) / v.length; return s.units.startsWith('Millions') ? avg / 1e6 : avg; });
	}
	let labels = $derived(quarters.map((q, i) => (i === 0 || i === quarters.length - 1 || (i % 4 === 0 && i < quarters.length - 2) ? quarterLabel(q) : '')));
	let asOfIndex = $derived(quarters.indexOf(e.asOf));
	let isPct = $derived(picked.every((id) => !id.startsWith('FRB_H8')));
	let events = $derived(board.eventTime ? [{ from: 7, to: 13, label: 'recession' }] : quarters.indexOf('20200331') >= 0 ? [{ from: quarters.indexOf('20200331'), to: Math.max(quarters.indexOf('20200331'), quarters.indexOf('20200630')), label: 'pandemic' }] : []);
</script>

<div class="chart-view">
<div class="hd">
	{#each picked as id, i}<span class="tag on" style="--c:{['var(--s1)', 'var(--ink)', 'var(--s2)'][i]}"><i></i>{CHOICES.find((c) => c.id === id)?.label ?? id}{#if picked.length > 1}<button type="button" class="x" onclick={() => setPicked(picked.filter((x) => x !== id))} aria-label="Remove series">×</button>{/if}</span>{/each}
	{#if picked.length < 3}
		<select class="in" value="" onchange={(e) => { const id = e.currentTarget.value; if (id) setPicked([...picked, id]); e.currentTarget.value = ''; }} aria-label="Add a series">
			<option value="">Add a series…</option>
			{#each CHOICES.filter((c) => !picked.includes(c.id)) as c}<option value={c.id}>{c.label}</option>{/each}
		</select>
	{/if}
</div>
<div class="plot"><LineChart series={picked.map((id, i) => ({ id, label: CHOICES.find((c) => c.id === id)?.label ?? id, values: aligned(id), color: ['var(--s1)', 'var(--ink)', 'var(--s2)'][i] }))} {labels} marker={asOfIndex >= 0 ? asOfIndex : null} format={(v) => (isPct ? pct(v, 1) : `$${v.toFixed(1)}T`)} height={tall ? 490 : span >= 8 ? 200 : 180} {events} zero={isPct} bind:hover /></div>
<div class="readout">
	{#if hover != null}<span>{quarterLabel(quarters[hover])}</span>{#each picked as id}<b>{CHOICES.find((c) => c.id === id)?.label} {isPct ? pct(aligned(id)[hover], 2) : `$${(aligned(id)[hover] ?? 0).toFixed(2)}T`}</b>{/each}{:else}<span>Quarterly averages · <a href="/economy">the economy in full</a></span>{/if}
</div>
</div>

<style>
	.chart-view { min-height: 0; height: 100%; display: flex; flex-direction: column; }
	.plot { min-height: 0; flex: 1; overflow: auto; }
	.chart-view > .readout { flex: none; flex-wrap: nowrap; align-items: center; min-height: 26px; padding-top: 7px; margin-top: 0; border-top: 1px solid var(--rule-2); overflow-x: auto; white-space: nowrap; scrollbar-width: thin; }
	.hd { display: flex; gap: 6px; flex-wrap: wrap; align-items: center; margin-bottom: 8px; }
	.tag { height: 24px; display: inline-flex; align-items: center; gap: 6px; border: 1px solid var(--rule); border-radius: 4px; background: var(--surface-2); color: var(--ink); font-size: 11.5px; font-weight: 500; padding: 0 0 0 8px; }
	.tag i { width: 8px; height: 8px; border-radius: 50%; background: var(--c); display: inline-block; }
	.tag .x { border: 0; border-left: 1px solid var(--rule); background: none; color: var(--ink-3); font: inherit; height: 100%; padding: 0 7px; cursor: pointer; }
	.tag .x:hover { color: var(--ink); }
	.hd .in { height: 24px; font-size: 11.5px; width: auto; }
</style>
