<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import SearchBar from '$lib/components/data/SearchBar.svelte';
	import DataTable from '$lib/components/data/DataTable.svelte';
	import Pagination from '$lib/components/data/Pagination.svelte';
	import { formatCurrency } from '$lib/utils/formatters.js';
	import type { Column } from '$lib/components/data/DataTable.svelte';

	let { data } = $props();

	// Asset tier buckets (values in thousands, matching FDIC reporting)
	const assetBuckets = [
		{ label: 'All sizes', min: '', max: '' },
		{ label: '< $100M', min: '', max: '100000' },
		{ label: '$100M – $300M', min: '100000', max: '300000' },
		{ label: '$300M – $1B', min: '300000', max: '1000000' },
		{ label: '$1B – $10B', min: '1000000', max: '10000000' },
		{ label: '$10B – $50B', min: '10000000', max: '50000000' },
		{ label: '$50B – $250B', min: '50000000', max: '250000000' },
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
			key: 'total_deposits',
			label: 'Total Deposits',
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
		total_deposits: 'deposits'
	};

	// Reverse mapping: API sort param -> column key
	const reverseSortMap: Record<string, string> = {
		name: 'name',
		assets: 'total_assets',
		deposits: 'total_deposits'
	};

	let currentSort = $derived(reverseSortMap[data.params.sort] || 'total_assets');
	let currentOrder = $derived((data.params.order || 'desc') as 'asc' | 'desc');

	// Find which asset bucket is selected
	let selectedBucketIndex = $derived(() => {
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
</script>

<svelte:head>
	<title>Banks | Bank Data Explorer</title>
</svelte:head>

<div class="space-y-4">
	<div class="flex items-center justify-between">
		<h1 class="text-2xl font-bold text-gray-900">Banks</h1>
	</div>

	<!-- Search -->
	<div class="max-w-md">
		<SearchBar
			value={data.params.q}
			placeholder="Search by name..."
			onsearch={handleSearch}
		/>
	</div>

	<!-- Filters -->
	<div class="flex flex-wrap items-center gap-3">
		<select
			value={data.params.state}
			onchange={handleStateChange}
			class="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
		>
			<option value="">All states</option>
			{#each states.slice(1) as st}
				<option value={st}>{st}</option>
			{/each}
		</select>

		<select
			value={selectedBucketIndex()}
			onchange={handleAssetBucketChange}
			class="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
		>
			{#each assetBuckets as bucket, i}
				<option value={i}>{bucket.label}</option>
			{/each}
		</select>

		<select
			value={data.params.active}
			onchange={handleActiveToggle}
			class="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
		>
			<option value="1">Active only</option>
			<option value="0">Inactive only</option>
			<option value="">All</option>
		</select>
	</div>

	<!-- Results -->
	{#if data.banks.length === 0}
		<div class="rounded-lg border border-gray-200 bg-white py-12 text-center">
			<p class="text-gray-500">No banks found matching your criteria.</p>
		</div>
	{:else}
		<DataTable
			{columns}
			data={data.banks}
			{currentSort}
			{currentOrder}
			onsort={handleSort}
			onrowclick={handleRowClick}
		/>
	{/if}

	<Pagination
		page={data.page}
		limit={data.limit}
		total={data.total}
		onpage={handlePage}
	/>
</div>
