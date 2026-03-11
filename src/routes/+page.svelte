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

<!-- Compact header -->
<div class="py-6 text-center">
	<h1 class="text-2xl font-semibold tracking-tight text-[--text-primary]">
		Bank Data Explorer
	</h1>
	<p class="mx-auto mt-2 max-w-xl text-[15px] text-[--text-secondary]">
		Explore financial data for every FDIC-insured bank in America.
	</p>
</div>

<!-- Quick stats -->
<div class="grid grid-cols-1 gap-2 sm:grid-cols-3">
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
<div class="mx-auto mt-8 max-w-lg">
	<p class="mb-1.5 text-center text-[13px] font-medium text-[--text-tertiary]">Find a bank</p>
	<SearchBar
		placeholder="Search by name, city, or state..."
		onsearch={handleSearch}
	/>
</div>

<!-- Browse link -->
<div class="mt-5 text-center">
	<a
		href="/banks"
		class="inline-flex items-center gap-1 text-[13px] font-medium text-[--accent] hover:text-[--accent-hover]"
	>
		Browse all banks
		<span aria-hidden="true">&rarr;</span>
	</a>
</div>

<!-- Risk & Anomaly teaser -->
<div class="mt-8 rounded border border-[--border] bg-[--surface-1] p-4 text-center">
	<p class="text-[13px] font-medium text-[--text-primary]">Risk Analysis & Anomaly Detection</p>
	<p class="text-[13px] text-[--text-tertiary] mt-1">
		CAMELS-proxy risk scores and anomaly detection are now available on individual bank pages.
	</p>
	<a
		href="/banks"
		class="inline-flex items-center gap-1 mt-2 text-[13px] font-medium text-[--accent] hover:text-[--accent-hover]"
	>
		Find a bank to view risk analysis
		<span aria-hidden="true">&rarr;</span>
	</a>
</div>

<!-- Attribution & Disclaimer -->
<div class="mt-12 space-y-1 border-t border-[--border] pt-6 text-center text-[11px] text-[--text-tertiary]">
	<p>Data from FDIC BankFind, Federal Reserve, FFIEC.</p>
	<p>Not financial advice. Data provided as-is for educational purposes.</p>
</div>
