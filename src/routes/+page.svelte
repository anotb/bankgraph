<script lang="ts">
	import LayoutPreview from '$lib/atlas/board/LayoutPreview.svelte';
	import SystemSurface from '$lib/atlas/system/SystemSurface.svelte';
	import { BOARD_TEMPLATES } from '$lib/atlas/templates';
	import { count, usdThousands, pct } from '$lib/atlas/format';

	let { data } = $props();

	const questions = [
		{ q: 'Which large banks saw noncurrent loans rise fastest over the past year?', k: 'screen', href: '/b?template=credit_stress' },
		{ q: 'How does JPMorgan compare with other U.S. banks over $250B in assets?', k: 'compare', href: '/bank/628' },
		{ q: 'What did failing banks have in common before 2008—and which active banks look most similar today?', k: 'history', href: '/b?template=failure_analogues' },
		{ q: 'Where are the 200 largest U.S. banks headquartered, and how does credit quality vary by state?', k: 'place', href: '/b?template=geography' },
		{ q: 'Which $50B–$250B banks run the highest loan-to-deposit ratios, and how much do they borrow?', k: 'funding', href: '/b?template=funding' },
		{ q: 'What do rates, jobs, inflation, deposits, and bank credit say about the economy now?', k: 'economy', href: '/economy' }
	];
	const economyGroups = [
		{ label: 'Rates', ids: ['FRB_FEDFUNDS', 'UST10Y'] },
		{ label: 'Prices and jobs', ids: ['BLS_CPI_YOY', 'BLS_UNRATE'] },
		{ label: 'Bank balance sheets', ids: ['FRB_H8_BANK_CREDIT', 'FRB_H8_DEPOSITS'] }
	];
	function reading(id: string) { return data.macro.find((s: { seriesId: string }) => s.seriesId === id); }
	function readingLabel(id: string) {
		return ({ FRB_FEDFUNDS: 'Federal funds', UST10Y: '10-year Treasury', BLS_CPI_YOY: 'CPI inflation', BLS_UNRATE: 'Unemployment', FRB_H8_BANK_CREDIT: 'Bank credit', FRB_H8_DEPOSITS: 'Deposits' } as Record<string, string>)[id] ?? id;
	}
	function readingValue(s: { units: string; value: number }) { return s.units.startsWith('Millions') ? usdThousands(s.value * 1000) : s.units.includes('Percent') ? pct(s.value) : s.value.toFixed(2); }
</script>
<svelte:head><title>Bankgraph · U.S. banks and the banking system</title><meta name="description" content="Every FDIC-insured bank, peer groups you define, the banking system over decades, and the economy alongside. Build a research board by hand or with an agent." /></svelte:head>

<div class="page">
	<section class="row top">
		<div class="plate ask">
			<div class="ask-head">
				<h1>U.S. banking</h1>
				<span class="dim">{count(data.activeCount)} active institutions · filings since 1992</span>
			</div>
			<button type="button" class="in search" onclick={() => window.dispatchEvent(new CustomEvent('atlas:search'))}><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5"></circle><path d="m16 16 4 4"></path></svg>A bank, a place, a measure, or a question</button>
			<ul class="starts">
				{#each questions as item}<li><a href={item.href ?? `/b?q=${encodeURIComponent(item.q)}`}>{item.q}</a></li>{/each}
			</ul>
			<a class="agent-start" href="/b?fresh=1"><span><b>Build a board with ChatGPT</b><small>Ask a question. Your agent can screen the data, choose the banks, and arrange the analysis here.</small></span><span aria-hidden="true">→</span></a>
			<div class="ask-foot"><a href="/banks">All institutions</a><a href="/economy">Economy</a><a href="/b?fresh=1">Blank board</a></div>
		</div>

		<SystemSurface {data} />

		<div class="plate econ">
			<div class="ph"><h3>The economy</h3><span class="dim">rates, prices, jobs, and bank balance sheets</span><a class="more" href="/economy">Full history</a></div>
			<div class="env-groups">
				{#each economyGroups as group}
					<section class="env-group">
						<h4>{group.label}</h4>
						{#each group.ids as id}
							{@const s = reading(id)}
							{#if s}<div class="env-row"><span>{readingLabel(id)}<small>{s.observationDate.slice(0, 7)}</small></span><b class="mono">{readingValue(s)}</b></div>{/if}
						{/each}
					</section>
				{/each}
			</div>
		</div>

		<section class="layouts">
			<div class="ph wide"><h3>Start from a layout</h3><span class="dim">live views you can reshape by hand or with an agent</span></div>
			{#each BOARD_TEMPLATES as t}
				<a class="tmpl" href="/b?template={t.id}">
					<LayoutPreview template={t} height={36} />
					<b>{t.name}</b><span>{t.description}</span>
				</a>
			{/each}
			<a class="tmpl" href="/b?fresh=1"><div class="th blank"><div class="r"><i></i></div></div><b>Blank board</b><span>Choose banks, measures, and time, then add views.</span></a>
		</section>
	</section>
</div>

<style>
	.page { padding: 14px 20px 8px; display: grid; grid-template-columns: minmax(0, 1fr); gap: 14px; }
	.row { display: grid; grid-template-columns: repeat(12, minmax(0, 1fr)); gap: 12px; }
	.row.top { grid-template-columns: repeat(12, minmax(0, 1fr)); grid-template-areas: "ask ask ask sys sys sys sys sys sys sys sys sys" "geo geo geo geo geo ec ec ec ec ec ec ec" "geo geo geo geo geo lay lay lay lay lay lay lay"; align-items: start; }
	.ask { grid-area: ask; display: flex; flex-direction: column; min-height: 0; }
	.row.top :global(.plate.system) { grid-area: sys; }
	.row.top :global(.plate.geo) { grid-area: geo; }
	.econ { grid-area: ec; }
	.layouts { grid-area: lay; }
	.plate { min-width: 0; }
	h1 { font-size: 18px; font-weight: 650; margin: 0; letter-spacing: -0.01em; }
	.ask-head { display: flex; flex-direction: column; gap: 2px; margin-bottom: 12px; }
	.search { width: 100%; height: 34px; display: flex; align-items: center; gap: 9px; color: var(--ink-3); cursor: text; text-align: left; font-size: 13px; }
	.search svg { width: 15px; fill: none; stroke: currentColor; stroke-width: 1.8; flex: none; }
	.starts { list-style: none; margin: 10px 0 0; padding: 0; display: grid; min-height: 0; overflow: auto; align-content: start; }
	.starts li a { display: block; padding: 7px 0; border-top: 1px solid var(--rule-2); color: var(--ink); text-decoration: none; font-size: 13px; line-height: 1.4; }
	.starts li a:hover { color: var(--accent); }
	.agent-start { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-top: 10px; padding: 7px 10px; border-radius: 4px; background: var(--accent-wash); color: var(--ink); text-decoration: none; }
	.agent-start:hover { box-shadow: inset 0 0 0 1px var(--accent); }
	.agent-start b, .agent-start small { display: block; }
	.agent-start b { font-size: 12.5px; font-weight: 600; }
	.agent-start small { margin-top: 2px; color: var(--ink-2); font-size: 11.5px; line-height: 1.35; }
	.agent-start > span:last-child { flex: none; color: var(--accent); font-size: 16px; }
	.ask-foot { display: flex; gap: 14px; margin-top: 10px; padding-top: 8px; border-top: 1px solid var(--rule-2); font-size: 12px; flex-wrap: wrap; }
	.ask-foot a { color: var(--ink-2); text-decoration: none; font-weight: 500; }
	.ask-foot a:hover { color: var(--ink); }
	.ph { display: flex; align-items: baseline; gap: 10px; margin-bottom: 8px; flex-wrap: wrap; }
	.ph h3 { font-size: 13px; font-weight: 600; margin: 0; }
	.ph.wide { grid-column: 1 / -1; margin-bottom: 0; }
	.ph .more { margin-left: auto; font-size: 12px; color: var(--accent); text-decoration: none; font-weight: 500; }
	.env-groups { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 0; }
	.env-group { min-width: 0; padding: 2px 14px 0; border-left: 1px solid var(--rule-2); }
	.env-group:first-child { border-left: 0; padding-left: 0; }
	.env-group:last-child { padding-right: 0; }
	.env-group h4 { margin: 0 0 7px; color: var(--ink-3); font-size: 11.5px; font-weight: 600; }
	.env-row { display: flex; justify-content: space-between; gap: 10px; align-items: baseline; padding: 7px 0; border-top: 1px solid var(--rule-2); font-size: 12.5px; }
	.env-row span { min-width: 0; }
	.env-row small { display: block; color: var(--ink-3); font-family: var(--font-mono); font-size: 10.5px; margin-top: 2px; }
	.env-row b { flex: none; font-size: 12.5px; font-weight: 600; }
	.layouts { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; min-width: 0; align-content: start; }
	.tmpl { display: block; padding: 10px; border-radius: 4px; background: var(--surface); color: var(--ink); text-decoration: none; min-width: 0; transition: box-shadow 140ms ease-out; }
	.tmpl:hover { box-shadow: 0 0 0 2px var(--accent); }
	.tmpl b { display: block; font-weight: 600; font-size: 12.5px; margin-top: 8px; }
	.tmpl span { display: -webkit-box; color: var(--ink-2); font-size: 11.5px; line-height: 1.4; margin-top: 2px; overflow: hidden; -webkit-box-orient: vertical; -webkit-line-clamp: 2; line-clamp: 2; }
	.th { height: 36px; display: grid; gap: 3px; }
	.th .r { display: flex; gap: 3px; min-height: 0; }
	.th i { display: block; background: var(--surface-3); border-radius: 2px; flex: 1; }
	.th.blank i { background: transparent; border: 1px dashed var(--rule); }
	@media (min-width: 1181px) {
		.row.top { grid-template-rows: 510px 177px 321px; }
		.ask, .row.top :global(.plate.system), .row.top :global(.plate.geo), .econ, .layouts { height: 100%; min-height: 0; }
		.row.top :global(.plate.system), .layouts { overflow: auto; }
		.layouts { grid-template-rows: auto repeat(2, minmax(0, 1fr)); align-content: stretch; }
		.tmpl { height: 100%; }
	}
	@media (min-width: 1500px) { .starts { grid-template-columns: 1fr 1fr; column-gap: 20px; } }
	@media (max-width: 1180px) {
		.row.top { grid-template-columns: repeat(6, minmax(0, 1fr)); grid-template-areas: "ask ask ask ask ask ask" "sys sys sys sys sys sys" "geo geo geo geo geo geo" "ec ec ec ec ec ec" "lay lay lay lay lay lay"; }
		.layouts { grid-template-columns: repeat(4, minmax(0, 1fr)); }
	}
	@media (max-width: 640px) {
		.page { padding: 10px 12px 8px; gap: 10px; }
		.row { gap: 10px; }
		.row.top { grid-template-columns: minmax(0, 1fr); grid-template-areas: "ask" "sys" "geo" "ec" "lay"; }
		.env-groups { grid-template-columns: 1fr; }
		.env-group, .env-group:first-child, .env-group:last-child { border-left: 0; border-top: 1px solid var(--rule-2); padding: 10px 0 0; }
		.env-group:first-child { border-top: 0; padding-top: 2px; }
		.layouts { grid-template-columns: 1fr 1fr; }
	}
	@media (max-width: 380px) { .layouts { grid-template-columns: 1fr; } }
</style>
