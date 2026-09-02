<script lang="ts">
	import LayoutPreview from '$lib/atlas/board/LayoutPreview.svelte';
	import SystemSurface from '$lib/atlas/system/SystemSurface.svelte';
	import { BOARD_TEMPLATES } from '$lib/atlas/templates';
	import { count, usdThousands, pct } from '$lib/atlas/format';

	let { data } = $props();

	const questions = [
		{ q: 'Which banks grew deposits while noncurrent loans rose?', k: 'screen' },
		{ q: 'JPMorgan Chase Bank against the twelve largest banks', k: 'compare', href: '/bank/628' },
		{ q: 'How did banks look in the eight quarters before failing, 2007–2012?', k: 'history', href: '/b?template=failure_analogues' },
		{ q: 'Banks headquartered in Texas, under $1B in assets', k: 'place', href: '/b?template=geography&states=TX&asset_max=1000000' },
		{ q: 'Who funds loans with borrowed money instead of deposits?', k: 'funding', href: '/b?template=funding' },
		{ q: 'What does bank credit say about the wider economy?', k: 'economy', href: '/economy' }
	];
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
			<div class="ask-foot"><a href="/banks">All institutions</a><a href="/system">Banking system</a><a href="/economy">Economy</a><a href="/b">Blank board</a></div>
		</div>

		<SystemSurface {data} />

		<div class="plate econ">
			<div class="ph"><h3>The economy</h3><span class="dim">latest reading</span><a class="more" href="/economy">Explore</a></div>
			<div class="env">
				{#each data.macro as s}
					<div class="env-row"><span class="n">{s.title.replace(', All Commercial Banks', '').replace(', Monthly Average', '').replace(' Effective Rate', '').replace('Civilian ', '').replace(', 12-Month Change', ' (12-month)')}</span><span class="mono">{s.units.startsWith('Millions') ? usdThousands(s.value * 1000) : s.units.includes('Percent') ? pct(s.value) : s.value.toFixed(2)}</span><span class="mono dim">{s.observationDate.slice(0, 7)}</span></div>
				{/each}
			</div>
		</div>
	</section>

	<section class="row layouts">
		<div class="ph wide"><h3>Start from a layout</h3><span class="dim">each adds live views over the banks, cohort, measures, and period you choose</span></div>
		{#each BOARD_TEMPLATES as t}
			<a class="tmpl" href="/b?template={t.id}">
				<LayoutPreview template={t} height={44} />
				<b>{t.name}</b><span>{t.description}</span>
			</a>
		{/each}
		<a class="tmpl" href="/b"><div class="th blank"><div class="r"><i></i></div></div><b>Blank board</b><span>Choose banks, measures, and time, then add views.</span></a>
	</section>
</div>

<style>
	.page { padding: 14px 20px 8px; display: grid; grid-template-columns: minmax(0, 1fr); gap: 14px; }
	.row { display: grid; grid-template-columns: repeat(12, minmax(0, 1fr)); gap: 12px; }
	.row.top { grid-template-columns: repeat(12, minmax(0, 1fr)); grid-template-areas: "ask ask ask sys sys sys sys sys sys sys sys sys" "geo geo geo geo geo st st st ec ec ec ec"; }
	.ask { grid-area: ask; }
	.row.top :global(.plate.system) { grid-area: sys; }
	.row.top :global(.plate.geo) { grid-area: geo; }
	.row.top :global(.plate.states) { grid-area: st; }
	.econ { grid-area: ec; }
	.plate { min-width: 0; }
	h1 { font-size: 18px; font-weight: 650; margin: 0; letter-spacing: -0.01em; }
	.ask-head { display: flex; flex-direction: column; gap: 2px; margin-bottom: 12px; }
	.search { width: 100%; height: 34px; display: flex; align-items: center; gap: 9px; color: var(--ink-3); cursor: text; text-align: left; font-size: 13px; }
	.search svg { width: 15px; fill: none; stroke: currentColor; stroke-width: 1.8; flex: none; }
	.starts { list-style: none; margin: 10px 0 0; padding: 0; display: grid; }
	.starts li a { display: block; padding: 8px 0; border-top: 1px solid var(--rule-2); color: var(--ink); text-decoration: none; font-size: 13px; line-height: 1.4; }
	.starts li a:hover { color: var(--accent); }
	.ask-foot { display: flex; gap: 14px; margin-top: 12px; padding-top: 10px; border-top: 1px solid var(--rule-2); font-size: 12px; flex-wrap: wrap; }
	.ask-foot a { color: var(--ink-2); text-decoration: none; font-weight: 500; }
	.ask-foot a:hover { color: var(--ink); }
	.ph { display: flex; align-items: baseline; gap: 10px; margin-bottom: 8px; flex-wrap: wrap; }
	.ph h3 { font-size: 13px; font-weight: 600; margin: 0; }
	.ph.wide { grid-column: 1 / -1; margin-bottom: 0; }
	.ph .more { margin-left: auto; font-size: 12px; color: var(--accent); text-decoration: none; font-weight: 500; }
	.env { display: grid; }
	.env-row { display: grid; grid-template-columns: 1fr auto auto; gap: 12px; align-items: baseline; padding: 7px 0; border-bottom: 1px solid var(--rule-2); font-size: 12.5px; }
	.env-row .mono { font-size: 12.5px; font-weight: 500; }
	.env-row .mono.dim { font-weight: 400; font-size: 11px; }
	.layouts { grid-template-columns: repeat(8, minmax(0, 1fr)); gap: 12px; padding-bottom: 8px; }
	.tmpl { display: block; padding: 10px; border-radius: 4px; background: var(--surface); color: var(--ink); text-decoration: none; min-width: 0; transition: box-shadow 140ms ease-out; }
	.tmpl:hover { box-shadow: 0 0 0 2px var(--accent); }
	.tmpl b { display: block; font-weight: 600; font-size: 12.5px; margin-top: 8px; }
	.tmpl span { display: block; color: var(--ink-2); font-size: 11.5px; line-height: 1.4; margin-top: 2px; }
	.th { height: 44px; display: grid; gap: 3px; }
	.th .r { display: flex; gap: 3px; min-height: 0; }
	.th i { display: block; background: var(--surface-3); border-radius: 2px; flex: 1; }
	.th.blank i { background: transparent; border: 1px dashed var(--rule); }
	@media (min-width: 1500px) { .starts { grid-template-columns: 1fr 1fr; column-gap: 20px; } }
	@media (max-width: 1366px) { .layouts { grid-template-columns: repeat(4, minmax(0, 1fr)); } }
	@media (max-width: 1024px) {
		.row.top { grid-template-columns: repeat(6, minmax(0, 1fr)); grid-template-areas: "ask ask ask ask ask ask" "sys sys sys sys sys sys" "geo geo geo geo geo geo" "st st st ec ec ec"; }
	}
	@media (max-width: 640px) {
		.page { padding: 10px 12px 8px; gap: 10px; }
		.row { gap: 10px; }
		.row.top { grid-template-columns: minmax(0, 1fr); grid-template-areas: "ask" "sys" "geo" "st" "ec"; }
		.layouts { grid-template-columns: 1fr 1fr; }
	}
	@media (max-width: 380px) { .layouts { grid-template-columns: 1fr; } }
</style>