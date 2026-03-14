<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import ExportButton from '$lib/components/data/ExportButton.svelte';
	import SearchBar from '$lib/components/data/SearchBar.svelte';
	import DataTable from '$lib/components/data/DataTable.svelte';
	import Sparkline from '$lib/components/data/Sparkline.svelte';
	import Pagination from '$lib/components/data/Pagination.svelte';
	import { formatCurrency, formatPercent } from '$lib/utils/formatters.js';
	import { getMode } from '$lib/stores/mode.svelte.js';
	import type { Column } from '$lib/components/data/DataTable.svelte';

	let mode = $derived(getMode());

	let { data } = $props();

	// Asset tier buckets (values in thousands, matching FDIC reporting)
	const assetBuckets = [
		{ label: 'All sizes', min: '', max: '' },
		{ label: '< $100M', min: '', max: '100000' },
		{ label: '$100M \u2013 $300M', min: '100000', max: '300000' },
		{ label: '$300M \u2013 $1B', min: '300000', max: '1000000' },
		{ label: '$1B \u2013 $10B', min: '1000000', max: '10000000' },
		{ label: '$10B \u2013 $50B', min: '10000000', max: '50000000' },
		{ label: '$50B \u2013 $250B', min: '50000000', max: '250000000' },
		{ label: '> $250B', min: '250000000', max: '' }
	];

	// US states for the dropdown
	const states = [
		'', 'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'DC', 'FL',
		'GA', 'GU', 'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA',
		'ME', 'MD', 'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV',
		'NH', 'NJ', 'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA',
		'PR', 'RI', 'SC', 'SD', 'TN', 'TX', 'UT', 'VT', 'VI', 'VA',
		'WA', 'WV', 'WI', 'WY'
	];

	const columns: Column[] = [
		{ key: 'name', label: 'Name', sortable: true },
		{ key: 'state', label: 'State' },
		{
			key: 'total_assets',
			label: 'Total Assets',
			sortable: true,
			align: 'right',
			format: (v: number | null) => formatCurrency(v)
		},
		{
			key: 'roa_trend',
			label: 'ROA Trend',
			align: 'right',
			tooltip: 'UBPR2170'
		},
		{
			key: 'latest_roe',
			label: 'ROE',
			sortable: true,
			align: 'right',
			powerOnly: true,
			tooltip: 'UBPR2180',
			format: (v: number | null) => formatPercent(v)
		},
		{
			key: 'latest_nim',
			label: 'NIM',
			sortable: true,
			align: 'right',
			powerOnly: true,
			tooltip: 'UBPRE591',
			format: (v: number | null) => formatPercent(v)
		},
		{
			key: 'latest_npl_ratio',
			label: 'NPL',
			sortable: true,
			align: 'right',
			powerOnly: true,
			tooltip: 'UBPR3506 - Noncurrent Loan Ratio',
			format: (v: number | null) => formatPercent(v)
		},
		{
			key: 'total_deposits',
			label: 'Total Deposits',
			sortable: true,
			align: 'right',
			format: (v: number | null) => formatCurrency(v)
		},
		{ key: 'regulator', label: 'Regulator' },
		{
			key: 'active',
			label: 'Status',
			format: (v: number) => (v === 1 ? 'Active' : 'Inactive')
		}
	];

	// Sort key mapping: column key -> API sort param
	const sortKeyMap: Record<string, string> = {
		name: 'name',
		total_assets: 'assets',
		total_deposits: 'deposits',
		latest_roe: 'roe',
		latest_nim: 'nim',
		latest_npl_ratio: 'npl',
		latest_tier1_ratio: 'tier1'
	};

	// Reverse mapping: API sort param -> column key
	const reverseSortMap: Record<string, string> = {
		name: 'name',
		assets: 'total_assets',
		deposits: 'total_deposits',
		roe: 'latest_roe',
		nim: 'latest_nim',
		npl: 'latest_npl_ratio',
		tier1: 'latest_tier1_ratio'
	};

	let currentSort = $derived(reverseSortMap[data.params.sort] || 'total_assets');
	let currentOrder = $derived((data.params.order || 'desc') as 'asc' | 'desc');

	// Find which asset bucket is selected
	let selectedBucketIndex = $derived.by(() => {
		const min = data.params.asset_min;
		const max = data.params.asset_max;
		const idx = assetBuckets.findIndex((b) => b.min === min && b.max === max);
		return idx >= 0 ? idx : 0;
	});

	function updateParams(updates: Record<string, string>) {
		const params = new URLSearchParams($page.url.searchParams);

		for (const [key, value] of Object.entries(updates)) {
			if (value) {
				params.set(key, value);
			} else {
				params.delete(key);
			}
		}

		// Reset to page 1 on filter changes (unless we're changing the page itself)
		if (!('page' in updates)) {
			params.delete('page');
		}

		goto(`?${params.toString()}`, { keepFocus: true, noScroll: true });
	}

	function handleSearch(query: string) {
		updateParams({ q: query });
	}

	function handleSort(columnKey: string) {
		const apiSort = sortKeyMap[columnKey];
		if (!apiSort) return;

		// Toggle order if same column, otherwise default desc
		let newOrder = 'desc';
		if (currentSort === columnKey) {
			newOrder = currentOrder === 'asc' ? 'desc' : 'asc';
		}

		updateParams({ sort: apiSort, order: newOrder });
	}

	function handlePage(newPage: number) {
		updateParams({ page: String(newPage) });
	}

	function handleRowClick(row: any) {
		goto(`/banks/${row.cert}`);
	}

	function handleStateChange(e: Event) {
		const target = e.target as HTMLSelectElement;
		updateParams({ state: target.value });
	}

	function handleAssetBucketChange(e: Event) {
		const target = e.target as HTMLSelectElement;
		const idx = parseInt(target.value, 10);
		const bucket = assetBuckets[idx];
		updateParams({ asset_min: bucket.min, asset_max: bucket.max });
	}

	function handleActiveToggle(e: Event) {
		const target = e.target as HTMLSelectElement;
		updateParams({ active: target.value });
	}

	let hasActiveFilters = $derived(
		data.params.q !== '' ||
		data.params.state !== '' ||
		data.params.asset_min !== '' ||
		data.params.asset_max !== '' ||
		data.params.active !== '1' ||
		data.params.sort !== 'assets' ||
		data.params.order !== 'desc'
	);

	function clearAllFilters() {
		goto('/banks', { keepFocus: true, noScroll: true });
	}
</script>

<svelte:head>
	<title>Banks | Bank Data Explorer</title>
	<meta name="description" content="Browse, search, and filter every FDIC-insured bank by state, asset size, and status." />
	<meta property="og:title" content="Banks | Bank Data Explorer" />
	<meta property="og:description" content="Browse, search, and filter every FDIC-insured bank by state, asset size, and status." />
</svelte:head>

<div class="space-y-3">
	<div class="flex items-center justify-between">
		<h1 class="text-2xl font-semibold text-[--text-primary]">Banks</h1>
		<ExportButton baseUrl="/api/v1/banks" filename="banks" />
	</div>

	<!-- Search -->
	<div class="max-w-md">
		<SearchBar
			value={data.params.q}
			placeholder="Search by name..."
			onsearch={handleSearch}
			autocomplete={true}
			onselect={(cert) => goto('/banks/' + cert)}
		/>
	</div>

	<!-- Filters -->
	<div class="flex flex-wrap items-center gap-2">
		<select
			value={data.params.state}
			onchange={handleStateChange}
			class="rounded-[5px] border border-[--border-muted] bg-[--surface-1] pl-3 pr-8 py-2.5 sm:py-1.5
				text-[13px] font-medium text-[--text-secondary]
				focus:border-[--accent] focus:ring-2 focus:ring-[--accent]/20 focus:outline-none
				transition-all duration-150 cursor-pointer"
			style="box-shadow: var(--shadow-xs)"
		>
			<option value="">All states</option>
			{#each states.slice(1) as st}
				<option value={st}>{st}</option>
			{/each}
		</select>

		<select
			value={selectedBucketIndex}
			onchange={handleAssetBucketChange}
			class="rounded-[5px] border border-[--border-muted] bg-[--surface-1] pl-3 pr-8 py-2.5 sm:py-1.5
				text-[13px] font-medium text-[--text-secondary]
				focus:border-[--accent] focus:ring-2 focus:ring-[--accent]/20 focus:outline-none
				transition-all duration-150 cursor-pointer"
			style="box-shadow: var(--shadow-xs)"
		>
			{#each assetBuckets as bucket, i}
				<option value={i}>{bucket.label}</option>
			{/each}
		</select>

		<select
			value={data.params.active}
			onchange={handleActiveToggle}
			class="rounded-[5px] border border-[--border-muted] bg-[--surface-1] pl-3 pr-8 py-2.5 sm:py-1.5
				text-[13px] font-medium text-[--text-secondary]
				focus:border-[--accent] focus:ring-2 focus:ring-[--accent]/20 focus:outline-none
				transition-all duration-150 cursor-pointer"
			style="box-shadow: var(--shadow-xs)"
		>
			<option value="1">Active only</option>
			<option value="0">Inactive only</option>
			<option value="">All</option>
		</select>

		<span class="text-[12px] text-[--text-tertiary] tabular-nums ml-1">
			{data.total.toLocaleString()} bank{data.total === 1 ? '' : 's'}
		</span>

		{#if hasActiveFilters}
			<button
				onclick={clearAllFilters}
				class="rounded-[5px] border border-[--border-muted] bg-[--surface-1] px-3 py-2.5 sm:py-1.5
					text-[12px] font-medium text-[--text-tertiary] hover:text-[--text-secondary]
					hover:border-[--accent] focus:outline-none focus:ring-2 focus:ring-[--accent]/20
					transition-all duration-150 cursor-pointer"
			>
				Clear all filters
			</button>
		{/if}
	</div>

	<!-- Results -->
	{#if data.banks.length === 0}
		<div class="rounded-[5px] border border-[--border-muted] bg-[--surface-1] py-12 text-center card-shadow">
			<p class="text-[--text-tertiary]">No banks found matching your criteria.</p>
		</div>
	{:else}
		{#snippet roaTrendCell(row: Record<string, any>)}
			<Sparkline data={data.sparklines?.[row.cert] ?? []} />
		{/snippet}

		<DataTable
			{columns}
			data={data.banks}
			dense={mode === 'power'}
			{currentSort}
			{currentOrder}
			onsort={handleSort}
			onrowclick={handleRowClick}
			customColumns={{ roa_trend: roaTrendCell }}
		/>
	{/if}

	<Pagination
		page={data.page}
		limit={data.limit}
		total={data.total}
		onpage={handlePage}
	/>
</div>
