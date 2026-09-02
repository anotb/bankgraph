<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { US_STATES } from '$lib/atlas/states';
	import { usdThousands, pct, count, quarterLabel, shortBankName } from '$lib/atlas/format';

	let { data } = $props();
	let q = $state('');
	$effect(() => { q = data.q; });

	function nav(patch: Record<string, string | null>) {
		const p = new URLSearchParams(page.url.searchParams);
		for (const [k, v] of Object.entries(patch)) { if (v == null || v === '') p.delete(k); else p.set(k, v); }
		if (!('page' in patch)) p.delete('page');
		goto(`/banks?${p}`, { keepFocus: true, noScroll: true });
	}
	function sortBy(key: string) { nav({ sort: key, order: data.sort === key && data.order === 'desc' ? 'asc' : 'desc' }); }
	function arrow(key: string) { return data.sort === key ? (data.order === 'desc' ? ' ↓' : ' ↑') : ''; }
	let pages = $derived(Math.max(1, Math.ceil(data.total / data.limit)));
	const BANDS = [
		{ label: 'Any size', min: '', max: '' }, { label: 'Under $1B', min: '', max: '1000000' }, { label: '$1B – $10B', min: '1000000', max: '10000000' },
		{ label: '$10B – $50B', min: '10000000', max: '50000000' }, { label: '$50B – $250B', min: '50000000', max: '250000000' }, { label: '$250B+', min: '250000000', max: '' }
	];
	let cohortHref = $derived.by(() => {
		const p = new URLSearchParams({ template: 'geography' });
		if (data.state) p.set('states', data.state);
		if (data.assetMin) p.set('asset_min', data.assetMin);
		if (data.assetMax) p.set('asset_max', data.assetMax);
		return `/b?${p}`;
	});
	let searchTimer: ReturnType<typeof setTimeout> | undefined;
	function onSearch(value: string) { q = value; clearTimeout(searchTimer); searchTimer = setTimeout(() => nav({ q: value }), 250); }
</script>

<svelte:head><title>Institutions · Bankgraph</title><meta name="description" content="Every FDIC-insured institution with its latest reported assets, deposits, earnings, credit quality, and capital. Filter by state and size, then open a bank or start a cohort." /></svelte:head>

<div class="page">
	<header class="head">
		<div>
			<h1>Institutions</h1>
			<p class="sub"><b class="mono">{count(data.total)}</b> {data.active === 'active' ? 'active' : data.active === 'inactive' ? 'inactive' : ''}{data.state ? ` in ${US_STATES[data.state] ?? data.state}` : ''} · filings through {quarterLabel(data.asOf, 'long')}</p>
		</div>
		<a class="btn pri" href={cohortHref}>Use as a cohort</a>
	</header>

	<div class="plate filters">
		<input class="in q" placeholder="Name or city" value={q} oninput={(e) => onSearch(e.currentTarget.value)} aria-label="Search institutions" />
		<select class="in" value={data.state} onchange={(e) => nav({ state: e.currentTarget.value })} aria-label="Headquarters state">
			<option value="">All states</option>
			{#each Object.entries(US_STATES).sort((a, b) => a[1].localeCompare(b[1])) as [code, name]}<option value={code}>{name}</option>{/each}
		</select>
		<div class="seg" role="group" aria-label="Asset size">
			{#each BANDS as b}<button type="button" aria-pressed={(data.assetMin ?? '') === b.min && (data.assetMax ?? '') === b.max} onclick={() => nav({ asset_min: b.min || null, asset_max: b.max || null })}>{b.label}</button>{/each}
		</div>
		<div class="seg" role="group" aria-label="Status">
			<button type="button" aria-pressed={data.active === 'active'} onclick={() => nav({ active: 'active' })}>Active</button>
			<button type="button" aria-pressed={data.active === 'any'} onclick={() => nav({ active: 'any' })}>All</button>
			<button type="button" aria-pressed={data.active === 'inactive'} onclick={() => nav({ active: 'inactive' })}>Inactive</button>
		</div>
	</div>

	<div class="plate tbl">
		<div class="scroll">
			<table class="atlas">
				<thead>
					<tr>
						<th><button type="button" class:on={data.sort === 'name'} onclick={() => sortBy('name')}>Institution{arrow('name')}</button></th>
						<th>Headquarters</th>
						<th><button type="button" class:on={data.sort === 'assets'} onclick={() => sortBy('assets')}>Assets{arrow('assets')}</button></th>
						<th><button type="button" class:on={data.sort === 'deposits'} onclick={() => sortBy('deposits')}>Deposits{arrow('deposits')}</button></th>
						<th><button type="button" class:on={data.sort === 'roa'} onclick={() => sortBy('roa')}>ROA{arrow('roa')}</button></th>
						<th><button type="button" class:on={data.sort === 'nim'} onclick={() => sortBy('nim')}>NIM{arrow('nim')}</button></th>
						<th><button type="button" class:on={data.sort === 'noncurrentLoanRatio'} onclick={() => sortBy('noncurrentLoanRatio')}>Noncurrent{arrow('noncurrentLoanRatio')}</button></th>
						<th><button type="button" class:on={data.sort === 'tier1Ratio'} onclick={() => sortBy('tier1Ratio')}>Tier 1{arrow('tier1Ratio')}</button></th>
						<th><button type="button" class:on={data.sort === 'domesticOffices'} onclick={() => sortBy('domesticOffices')}>Offices{arrow('domesticOffices')}</button></th>
					</tr>
				</thead>
				<tbody>
					{#each data.rows as r (r.cert)}
						<tr>
							<td class="n"><a href="/bank/{r.cert}">{shortBankName(r.name)}</a>{#if !r.active}<span class="inactive">inactive</span>{/if}</td>
							<td class="n hq">{r.city ? `${r.city}, ` : ''}{r.state}</td>
							<td class:sorted={data.sort === 'assets'}>{usdThousands(r.total_assets)}</td><td class:sorted={data.sort === 'deposits'}>{usdThousands(r.total_deposits)}</td>
							<td class:sorted={data.sort === 'roa'}>{pct(r.latest_roa)}</td><td class:sorted={data.sort === 'nim'}>{pct(r.latest_nim)}</td>
							<td class:sorted={data.sort === 'noncurrentLoanRatio'} class={r.latest_npl_ratio != null && r.latest_npl_ratio >= 2 ? 'down' : ''}>{pct(r.latest_npl_ratio)}</td>
							<td class:sorted={data.sort === 'tier1Ratio'}>{pct(r.latest_tier1_ratio)}</td><td class:sorted={data.sort === 'domesticOffices'}>{count(r.num_branches)}</td>
						</tr>
					{/each}
					{#if !data.rows.length}<tr><td colspan="9" class="n dim">No institutions match.</td></tr>{/if}
				</tbody>
			</table>
		</div>
		<div class="pager">
			<span class="dim mono">{count((data.page - 1) * data.limit + 1)}–{count(Math.min(data.page * data.limit, data.total))} of {count(data.total)}</span>
			<div class="pg">
				<button type="button" class="btn sm" disabled={data.page <= 1} onclick={() => nav({ page: String(data.page - 1) })}>Previous</button>
				<span class="mono dim">{data.page} / {count(pages)}</span>
				<button type="button" class="btn sm" disabled={data.page >= pages} onclick={() => nav({ page: String(data.page + 1) })}>Next</button>
			</div>
		</div>
	</div>
</div>

<style>
	.page { padding: 14px 20px 40px; display: grid; grid-template-columns: minmax(0, 1fr); gap: 12px; }
	.head { display: flex; justify-content: space-between; align-items: flex-end; gap: 20px; }
	h1 { font-size: 18px; font-weight: 650; margin: 0 0 2px; letter-spacing: -0.01em; }
	.sub { margin: 0; color: var(--ink-2); font-size: 12.5px; }
	.sub b { font-weight: 600; color: var(--ink); }
	.filters { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; padding: 10px 12px; }
	.filters .q { width: 240px; }
	.tbl { padding: 4px 14px 10px; }
	.tbl .scroll { max-height: calc(100vh - 260px); }
	table.atlas th button { border: 0; background: none; font: inherit; color: inherit; cursor: pointer; padding: 0; }
	table.atlas th button:hover, table.atlas th button.on { color: var(--ink); }
	table.atlas td.sorted { color: var(--ink); font-weight: 500; background: var(--surface-2); }
	td.n a { color: var(--ink); text-decoration: none; font-weight: 500; }
	td.n a:hover { color: var(--accent); }
	td.hq { color: var(--ink-2); }
	.inactive { color: var(--caution); font-size: 11px; margin-left: 8px; }
	.pager { display: flex; justify-content: space-between; align-items: center; gap: 12px; padding-top: 10px; font-size: 12px; }
	.pg { display: flex; align-items: center; gap: 10px; }
	@media (max-width: 860px) { .page { padding: 10px 12px 40px; } .head { flex-direction: column; align-items: flex-start; } .filters .q { width: 100%; } .filters .in { width: 100%; } }
</style>
