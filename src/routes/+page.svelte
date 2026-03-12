<script lang="ts">
	import { goto } from '$app/navigation';
	import SearchBar from '$lib/components/data/SearchBar.svelte';
	import MetricCard from '$lib/components/data/MetricCard.svelte';
	import { formatNumber, formatDate, formatPercent, formatCurrency } from '$lib/utils/formatters.js';

	let { data } = $props();

	function handleSearch(query: string) {
		if (query) {
			goto(`/banks?q=${encodeURIComponent(query)}`);
		}
	}

	function handleSelect(cert: number) {
		goto(`/banks/${cert}`);
	}
</script>

<svelte:head>
	<title>Bank Data Explorer</title>
	<meta name="description" content="Explore financial data for every FDIC-insured bank in America." />
	<meta property="og:title" content="Bank Data Explorer" />
	<meta property="og:description" content="Explore financial data for every FDIC-insured bank in America." />
</svelte:head>

<!-- Compact header -->
<div class="py-5">
	<h1 class="text-2xl font-semibold tracking-tight text-[--text-primary]">
		Bank Data Explorer
	</h1>
	<p class="mt-1 text-[14px] text-[--text-secondary]">
		Financial data for every FDIC-insured bank in America.
	</p>
</div>

<!-- Search - command bar style -->
<div class="mb-6 -mx-4 px-4 py-3 bg-[--surface-2]" style="box-shadow: inset 0 1px 0 var(--border-muted), inset 0 -1px 0 var(--border-muted)">
	<div class="max-w-2xl">
		<SearchBar
			placeholder="Search by name, city, or state..."
			onsearch={handleSearch}
			autocomplete={true}
			onselect={handleSelect}
		/>
	</div>
</div>

<!-- Overview stats -->
<div class="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
	<MetricCard
		label="Total Banks"
		value={data.meta.bank_count ? formatNumber(data.meta.bank_count) : '...'}
		sublabel="All FDIC-insured"
		borderless={true}
	/>
	<MetricCard
		label="Active Banks"
		value={data.meta.active_count ? formatNumber(data.meta.active_count) : '...'}
		sublabel="Currently operating"
		borderless={true}
	/>
	<MetricCard
		label="Latest Data"
		value={data.meta.latest_quarter ? formatDate(data.meta.latest_quarter) : '...'}
		sublabel="Most recent quarter"
		borderless={true}
	/>
</div>

<!-- Industry metrics (only show if we have agg data) -->
{#if data.industryMetrics.median_roa !== null || data.industryMetrics.total_assets !== null}
	<section class="mt-5">
		<div class="flex items-center gap-2 mb-3">
			<div class="w-0.5 h-4 bg-[--accent] rounded-full"></div>
			<h2 class="text-[15px] font-semibold text-[--text-primary]">Industry Health</h2>
			<span class="text-[11px] text-[--text-tertiary] ml-1">all FDIC-insured banks</span>
		</div>
		<div class="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
			{#if data.industryMetrics.total_assets !== null}
				<MetricCard
					label="Total Assets"
					value={formatCurrency(data.industryMetrics.total_assets)}
					sublabel="Industry-wide"
					borderless={true}
				/>
			{/if}
			{#if data.industryMetrics.median_roa !== null}
				<MetricCard
					label="Median ROA"
					value={formatPercent(data.industryMetrics.median_roa)}
					sublabel="Return on Assets"
					borderless={true}
				/>
			{/if}
			{#if data.industryMetrics.median_roe !== null}
				<MetricCard
					label="Median ROE"
					value={formatPercent(data.industryMetrics.median_roe)}
					sublabel="Return on Equity"
					borderless={true}
				/>
			{/if}
			{#if data.industryMetrics.median_nim !== null}
				<MetricCard
					label="Median NIM"
					value={formatPercent(data.industryMetrics.median_nim)}
					sublabel="Net Interest Margin"
					borderless={true}
				/>
			{/if}
		</div>
	</section>
{/if}

<!-- Anomalies + Failures side by side -->
{#if data.recentAnomalies.length > 0 || data.failureSummary.total_failures > 0}
	<div class="mt-5 grid grid-cols-1 md:grid-cols-2 gap-4">
		<!-- Recent Anomalies -->
		{#if data.recentAnomalies.length > 0}
			<section>
				<div class="flex items-center gap-2 mb-3">
					<div class="w-0.5 h-4 bg-[--negative] rounded-full"></div>
					<h2 class="text-[15px] font-semibold text-[--text-primary]">Recent Anomalies</h2>
				</div>
				<div class="rounded-md bg-[--surface-1] divide-y divide-[--surface-2]" style="box-shadow: var(--shadow-sm)">
					{#each data.recentAnomalies as anomaly}
						<a href="/banks/{anomaly.cert}/risk" class="flex items-center justify-between px-3 py-2.5 hover:bg-[--accent-muted] transition-colors">
							<div class="flex items-center gap-2 min-w-0">
								<span class="inline-flex shrink-0 items-center rounded-sm px-1.5 py-0.5 text-[10px] font-medium tracking-wide uppercase
									{anomaly.severity === 'critical' ? 'bg-[--negative-muted] text-[--negative]' : 'bg-[--warning-muted] text-[--warning]'}">
									{anomaly.severity}
								</span>
								<span class="text-[13px] font-medium text-[--text-primary] truncate">{anomaly.name ?? `CERT ${anomaly.cert}`}</span>
							</div>
							<span class="text-[12px] text-[--text-tertiary] shrink-0 ml-2 data-mono">{anomaly.metric}</span>
						</a>
					{/each}
				</div>
			</section>
		{/if}

		<!-- Bank Failures -->
		{#if data.failureSummary.total_failures > 0}
			<section>
				<div class="flex items-center gap-2 mb-3">
					<div class="w-0.5 h-4 bg-[--warning] rounded-full"></div>
					<h2 class="text-[15px] font-semibold text-[--text-primary]">Bank Failures</h2>
					<span class="text-[11px] text-[--text-tertiary]">{formatNumber(data.failureSummary.total_failures)} total</span>
				</div>
				<div class="rounded-md bg-[--surface-1] divide-y divide-[--surface-2]" style="box-shadow: var(--shadow-sm)">
					{#each data.failureSummary.recent_failures as failure}
						<div class="flex items-center justify-between px-3 py-2.5">
							<span class="text-[13px] font-medium text-[--text-primary] truncate">{failure.name ?? 'Unknown'}</span>
							<div class="flex items-center gap-2 shrink-0 ml-2">
								{#if failure.state}
									<span class="text-[12px] text-[--text-tertiary]">{failure.state}</span>
								{/if}
								<span class="text-[12px] text-[--text-tertiary] data-mono">{formatDate(failure.fail_date)}</span>
							</div>
						</div>
					{/each}
				</div>
				<a href="/industry" class="inline-flex items-center gap-1 mt-2 text-[13px] font-medium text-[--accent] hover:text-[--accent-hover]">
					View industry overview &rarr;
				</a>
			</section>
		{/if}
	</div>
{/if}

<!-- Browse link - proper button -->
<div class="mt-6 text-center">
	<a
		href="/banks"
		class="inline-flex items-center gap-1.5 px-5 py-2 text-[13px] font-medium text-white bg-[--accent] hover:bg-[--accent-hover] rounded-md transition-colors duration-150"
		style="box-shadow: var(--shadow-xs)"
	>
		Browse all banks
		<span aria-hidden="true">&rarr;</span>
	</a>
</div>

<!-- Attribution & Disclaimer -->
<div class="mt-10 space-y-1 border-t border-[--border] pt-6 text-center text-[11px] text-[--text-tertiary]">
	<p>Data from FDIC BankFind, Federal Reserve, FFIEC.</p>
	<p>Not financial advice. Data provided as-is for educational purposes.</p>
</div>
