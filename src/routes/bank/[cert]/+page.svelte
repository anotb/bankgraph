<script lang="ts">
	import BoardHost from '$lib/atlas/board/BoardHost.svelte';
	import { usdThousands, pct, quarterLabel, shortBankName, count } from '$lib/atlas/format';
	let { data } = $props();
	let inst = $derived(data.institution);
	let name = $derived(shortBankName(inst.name));
	let description = $derived(`${inst.name} (FDIC ${inst.cert}), ${inst.city}, ${inst.state}: ${usdThousands(inst.total_assets)} in assets, ${usdThousands(inst.total_deposits)} in deposits, ROA ${pct(inst.latest_roa)}, as of ${quarterLabel(inst.latest_repdte, 'long')}. Balance sheet, earnings, credit, capital, peers, and what moved last quarter.`);
	const TIER: Record<number, string> = { 1: 'under $100M', 2: '$100M – $300M', 3: '$300M – $1B', 4: '$1B – $10B', 5: '$10B – $50B', 6: '$50B – $250B', 7: 'over $250B' };
</script>

<svelte:head>
	<title>{name} · {inst.city}, {inst.state} · Bankgraph</title>
	<meta name="description" content={description} />
	<link rel="canonical" href="https://bankgraph.app/bank/{inst.cert}" />
</svelte:head>

<div class="arrive">
	<div class="who">
		<a class="crumb" href="/banks">Institutions</a>
		<span class="sep">/</span>
		<span class="ident">
			<b>{name}</b>{#if name !== inst.name}<span class="legal">{inst.name}</span>{/if}
			{#if !inst.active}<span class="inactive">Inactive</span>{/if}
		</span>
	</div>
	<div class="facts">
		<span>{inst.city}, {inst.state}</span>
		<span>FDIC <span class="mono">{inst.cert}</span></span>
		{#if inst.regulator}<span>{inst.regulator}</span>{/if}
		{#if inst.holding_company}<span>{inst.holding_company}</span>{/if}
		{#if inst.asset_tier}<span>Asset group {TIER[inst.asset_tier]}</span>{/if}
		<span>{count(inst.num_branches)} offices · {count(inst.num_employees)} employees</span>
		<span>Filed {quarterLabel(inst.latest_repdte, 'long')}</span>
		<a class="btn sm" href="/b?template=one_bank&certs={inst.cert}">Open as your board</a>
	</div>
</div>

{#key data.cert}
	<BoardHost launch={{ template: 'one_bank', certs: [data.cert] }} persist={false} release={data.release} releaseGeneration={data.releaseGeneration} pageLoadedAt={data.pageLoadedAt} boardPath="/bank/{data.cert}" />
{/key}

<style>
	.arrive { padding: 12px 20px 0; display: grid; gap: 4px; flex: none; }
	.who { display: flex; align-items: baseline; gap: 8px; font-size: 12.5px; flex-wrap: wrap; }
	.crumb { color: var(--ink-3); text-decoration: none; }
	.crumb:hover { color: var(--ink); }
	.sep { color: var(--ink-4); }
	.ident b { font-weight: 600; color: var(--ink); }
	.legal { color: var(--ink-3); margin-left: 8px; }
	.inactive { color: var(--caution); font-weight: 500; margin-left: 8px; }
	.facts { display: flex; flex-wrap: wrap; gap: 4px 0; align-items: center; font-size: 12.5px; color: var(--ink-2); }
	.facts > span::after { content: '·'; margin: 0 8px; color: var(--ink-4); }
	.facts .btn { margin-left: auto; }
	@media (max-width: 860px) { .arrive { padding: 10px 12px 0; } .facts .btn { margin-left: 0; margin-top: 4px; } }
</style>
