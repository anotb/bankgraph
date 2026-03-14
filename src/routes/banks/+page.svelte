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
	import { STATE_NAMES, STATES_SORTED } from '$lib/utils/states.js';
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

	// Multi-state selection
	let selectedStates: string[] = $derived(
		data.params.state ? data.params.state.split(',').filter(Boolean) : []
	);
	let stateDropdownOpen = $state(false);
	let stateSearch = $state('');
	let stateDropdownRef: HTMLDivElement | undefined = $state();
	let stateSearchRef: HTMLInputElement | undefined = $state();

	let filteredStates = $derived(
		stateSearch
			? STATES_SORTED.filter(
					(st) =>
						st.toLowerCase().includes(stateSearch.toLowerCase()) ||
						STATE_NAMES[st].toLowerCase().includes(stateSearch.toLowerCase())
				)
			: STATES_SORTED
	);

	let stateLabel = $derived.by(() => {
		if (selectedStates.length === 0) return 'All states';
		if (selectedStates.length <= 2) return selectedStates.join(', ');
		return `${selectedStates.length} states`;
	});

	function toggleState(st: string) {
		let next: string[];
		if (selectedStates.includes(st)) {
			next = selectedStates.filter((s) => s !== st);
		} else {
			next = [...selectedStates, st];
		}
		updateParams({ state: next.join(',') });
	}

	function removeState(st: string) {
		const next = selectedStates.filter((s) => s !== st);
		updateParams({ state: next.join(',') });
	}

	function clearStates() {
		updateParams({ state: '' });
		stateDropdownOpen = false;
	}

	function handleClickOutside(e: MouseEvent) {
		if (stateDropdownRef && !stateDropdownRef.contains(e.target as Node)) {
			stateDropdownOpen = false;
			stateSearch = '';
		}
	}

	function toggleStateDropdown() {
		stateDropdownOpen = !stateDropdownOpen;
		stateSearch = '';
		if (stateDropdownOpen) {
			setTimeout(() => stateSearchRef?.focus(), 0);
		}
	}

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
		stateDropdownOpen = false;
		stateSearch = '';
		goto('/banks', { keepFocus: true, noScroll: true });
	}
</script>

<svelte:head>
	<title>Banks | Bank Data Explorer</title>
	<meta name="description" content="Browse, search, and filter every FDIC-insured bank by state, asset size, and status." />
	<meta property="og:title" content="Banks | Bank Data Explorer" />
	<meta property="og:description" content="Browse, search, and filter every FDIC-insured bank by state, asset size, and status." />
</svelte:head>

<svelte:document onclick={handleClickOutside} />

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
			onselect={({ cert }) => goto('/banks/' + cert)}
		/>
	</div>

	<!-- Filters -->
	<div class="flex flex-wrap items-center gap-2">
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div class="relative" bind:this={stateDropdownRef} onkeydown={(e) => { if (e.key === 'Escape') { stateDropdownOpen = false; stateSearch = ''; } }}>
			<button
				type="button"
				onclick={toggleStateDropdown}
				class="rounded-[5px] border bg-[--surface-1] pl-3 pr-8 py-2.5 sm:py-1.5
					text-[13px] font-medium text-[--text-secondary]
					focus:border-[--accent] focus:ring-2 focus:ring-[--accent]/20 focus:outline-none
					transition-all duration-150 cursor-pointer inline-flex items-center gap-1.5
					{selectedStates.length > 0 ? 'border-[--accent]' : 'border-[--border-muted]'}"
				style="box-shadow: var(--shadow-xs)"
			>
				{stateLabel}
				<svg class="w-3.5 h-3.5 ml-1 opacity-50 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
				</svg>
			</button>

			{#if stateDropdownOpen}
				<div
					class="absolute z-50 mt-1 w-64 rounded-[5px] border border-[--border-muted] bg-[--surface-1] overflow-hidden"
					style="box-shadow: var(--shadow-md, 0 4px 6px -1px rgb(0 0 0 / 0.1))"
				>
					<div class="p-1.5 border-b border-[--border-muted]">
						<input
							bind:this={stateSearchRef}
							bind:value={stateSearch}
							type="text"
							placeholder="Search states..."
							class="w-full rounded-[3px] border border-[--border-muted] bg-[--surface-0] px-2 py-1
								text-[13px] text-[--text-primary] placeholder:text-[--text-tertiary]
								focus:border-[--accent] focus:ring-1 focus:ring-[--accent]/20 focus:outline-none"
						/>
					</div>

					{#if selectedStates.length > 0}
						<div class="flex items-center justify-between px-2.5 py-1.5 border-b border-[--border-muted] bg-[--surface-0]">
							<span class="text-[11px] text-[--text-tertiary]">{selectedStates.length} selected</span>
							<button
								type="button"
								onclick={clearStates}
								class="text-[11px] text-[--accent] hover:underline cursor-pointer"
							>
								Clear
							</button>
						</div>
					{/if}

					<div class="max-h-56 overflow-y-auto overscroll-contain">
						{#each filteredStates as st}
							<label
								class="flex items-center gap-2 px-2.5 py-1.5 cursor-pointer hover:bg-[--surface-2] transition-colors text-[13px]
									{selectedStates.includes(st) ? 'text-[--text-primary] font-medium' : 'text-[--text-secondary]'}"
							>
								<input
									type="checkbox"
									checked={selectedStates.includes(st)}
									onchange={() => toggleState(st)}
									class="rounded-[3px] border-[--border-muted] text-[--accent] focus:ring-[--accent]/20
										w-3.5 h-3.5 cursor-pointer"
								/>
								{STATE_NAMES[st]}
								<span class="text-[--text-tertiary] text-[11px]">{st}</span>
							</label>
						{:else}
							<div class="px-2.5 py-3 text-center text-[12px] text-[--text-tertiary]">
								No matching states
							</div>
						{/each}
					</div>
				</div>
			{/if}
		</div>

		{#if selectedStates.length > 0}
			{#each selectedStates as st}
				<button
					type="button"
					onclick={() => removeState(st)}
					class="inline-flex items-center gap-1 rounded-[4px] bg-[--accent]/10 text-[--accent] px-2 py-0.5
						text-[12px] font-medium hover:bg-[--accent]/20 transition-colors cursor-pointer"
				>
					{st}
					<svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
					</svg>
				</button>
			{/each}
		{/if}

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
			totalRows={data.total}
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
