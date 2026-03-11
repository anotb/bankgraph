<script lang="ts">
	import { goto } from '$app/navigation';
	import SearchBar from '$lib/components/data/SearchBar.svelte';
	import MetricCard from '$lib/components/data/MetricCard.svelte';
	import { formatNumber, formatDate } from '$lib/utils/formatters.js';

	let { data } = $props();

	function handleSearch(query: string) {
		if (query) {
			goto(`/banks?q=${encodeURIComponent(query)}`);
		}
	}
</script>

<svelte:head>
	<title>Bank Data Explorer</title>
	<meta
		name="description"
		content="Explore financial data for every FDIC-insured bank in America."
	/>
</svelte:head>

<!-- Hero -->
<div class="py-12 text-center">
	<h1 class="text-4xl font-bold tracking-tight text-gray-900 sm:text-5xl">
		Bank Data Explorer
	</h1>
	<p class="mx-auto mt-4 max-w-xl text-lg text-gray-500">
		Explore financial data for every FDIC-insured bank in America.
	</p>
</div>

<!-- Quick stats -->
<div class="grid grid-cols-1 gap-4 sm:grid-cols-3">
	<MetricCard
		label="Total Banks"
		value={data.meta.bank_count ? formatNumber(data.meta.bank_count) : '...'}
		sublabel="All FDIC-insured institutions"
	/>
	<MetricCard
		label="Active Banks"
		value={data.meta.active_count ? formatNumber(data.meta.active_count) : '...'}
		sublabel="Currently operating"
	/>
	<MetricCard
		label="Latest Data"
		value={data.meta.latest_quarter ? formatDate(data.meta.latest_quarter) : '...'}
		sublabel="Most recent reporting quarter"
	/>
</div>

<!-- Search -->
<div class="mx-auto mt-10 max-w-lg">
	<p class="mb-2 text-center text-sm font-medium text-gray-600">Find a bank</p>
	<SearchBar
		placeholder="Search by name, city, or state..."
		onsearch={handleSearch}
	/>
</div>

<!-- Browse link -->
<div class="mt-6 text-center">
	<a
		href="/banks"
		class="inline-flex items-center gap-1 text-sm font-medium text-blue-600 hover:text-blue-800"
	>
		Browse all banks
		<span aria-hidden="true">&rarr;</span>
	</a>
</div>

<!-- Attribution & Disclaimer -->
<div class="mt-16 space-y-3 border-t border-gray-200 pt-8 text-center text-xs text-gray-400">
	<p>Data from FDIC BankFind, Federal Reserve, FFIEC.</p>
	<p>Not financial advice. Data provided as-is for educational purposes.</p>
</div>
