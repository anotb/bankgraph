<script lang="ts">
	import { goto } from '$app/navigation';
	import SearchBar from '$lib/components/data/SearchBar.svelte';
	import MetricCard from '$lib/components/data/MetricCard.svelte';
	import Sparkline from '$lib/components/data/Sparkline.svelte';
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

	/** Navigation sections for the quick-nav cards */
	const navSections = [
		{ href: '/banks', label: 'Banks', description: 'Browse, search, and filter all FDIC-insured institutions', icon: 'bank' },
		{ href: '/industry', label: 'Industry', description: 'Aggregate metrics, segment breakdowns, and trends', icon: 'chart' },
		{ href: '/macro', label: 'Macro', description: 'Fed rates, treasury yields, and economic indicators', icon: 'globe' },
		{ href: '/compare', label: 'Compare', description: 'Side-by-side financial comparison of up to 10 banks', icon: 'scale' },
		{ href: '/glossary', label: 'Glossary', description: 'Definitions for financial metrics and ratios', icon: 'book' }
	];
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

<!-- Hero stats -->
<section>
	<div class="flex items-center gap-2 mb-3">
		<div class="w-0.5 h-4 bg-[--accent] rounded-full"></div>
		<h2 class="text-[15px] font-semibold text-[--text-primary]">Industry at a Glance</h2>
		{#if data.meta.latest_quarter}
			<span class="text-[11px] text-[--text-tertiary] ml-1">as of {formatDate(data.meta.latest_quarter)}</span>
		{/if}
	</div>
	<div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-1.5">
		<MetricCard
			label="Active Banks"
			value={data.meta.active_count ? formatNumber(data.meta.active_count) : '...'}
			sublabel="FDIC-insured"
			borderless={true}
		/>
		<MetricCard
			label="Total Assets"
			value={data.meta.total_assets ? formatCurrency(data.meta.total_assets) : '...'}
			sublabel="Industry-wide"
			borderless={true}
		/>
		<MetricCard
			label="Total Deposits"
			value={data.meta.total_deposits ? formatCurrency(data.meta.total_deposits) : '...'}
			sublabel="Industry-wide"
			borderless={true}
		/>
		{#if data.meta.bank_count > data.meta.active_count}
			<MetricCard
				label="Total Banks"
				value={formatNumber(data.meta.bank_count)}
				sublabel="Including inactive"
				borderless={true}
			/>
		{/if}
		<MetricCard
			label="Latest Data"
			value={data.meta.latest_quarter ? formatDate(data.meta.latest_quarter) : '...'}
			sublabel="Most recent quarter"
			borderless={true}
		/>
	</div>
</section>

<!-- Industry health metrics (only show if we have agg data) -->
{#if data.industryMetrics.median_roa !== null || data.industryMetrics.median_roe !== null || data.industryMetrics.median_nim !== null}
	<section class="mt-5">
		<div class="flex items-center gap-2 mb-3">
			<div class="w-0.5 h-4 bg-[--accent] rounded-full"></div>
			<h2 class="text-[15px] font-semibold text-[--text-primary]">Industry Health</h2>
			{#if data.industryMetrics.repdte}
				<span class="text-[11px] text-[--text-tertiary] ml-1">Q{Math.ceil(parseInt(data.industryMetrics.repdte.slice(4, 6)) / 3)} {data.industryMetrics.repdte.slice(0, 4)}</span>
			{/if}
		</div>
		<div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-1.5">
			{#if data.industryMetrics.total_assets !== null}
				<MetricCard
					label="Agg. Total Assets"
					value={formatCurrency(data.industryMetrics.total_assets)}
					sublabel="From quarterly filings"
					borderless={true}
				/>
			{/if}
			{#if data.industryMetrics.total_deposits !== null}
				<MetricCard
					label="Agg. Deposits"
					value={formatCurrency(data.industryMetrics.total_deposits)}
					sublabel="From quarterly filings"
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
		<a href="/industry" class="inline-flex items-center gap-1 mt-2 text-[13px] font-medium text-[--accent] hover:text-[--accent-hover]">
			Full industry breakdown &rarr;
		</a>
	</section>
{/if}

<!-- Two-column: Anomalies/Failures + Top Banks -->
<div class="mt-5 grid grid-cols-1 md:grid-cols-2 gap-4">
	<!-- Left column: Anomalies + Failures -->
	<div class="space-y-4">
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
				{#if data.failureSummary.recent_5yr_count > 0}
					<div class="rounded-md bg-[--surface-1] px-3 py-2.5 mb-2" style="box-shadow: var(--shadow-sm)">
						<div class="flex items-center justify-between">
							<span class="text-[13px] text-[--text-secondary]">Last 5 years</span>
							<span class="text-[15px] font-semibold text-[--warning] data-mono">{data.failureSummary.recent_5yr_count}</span>
						</div>
					</div>
				{/if}
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
				<a href="/industry/failures" class="inline-flex items-center gap-1 mt-2 text-[13px] font-medium text-[--accent] hover:text-[--accent-hover]">
					View all failures &rarr;
				</a>
			</section>
		{/if}
	</div>

	<!-- Right column: Top Banks by Assets -->
	{#if data.topBanks.length > 0}
		<section>
			<div class="flex items-center gap-2 mb-3">
				<div class="w-0.5 h-4 bg-[--accent] rounded-full"></div>
				<h2 class="text-[15px] font-semibold text-[--text-primary]">Largest Banks by Assets</h2>
			</div>
			<div class="rounded-md bg-[--surface-1] divide-y divide-[--surface-2]" style="box-shadow: var(--shadow-sm)">
				{#each data.topBanks as bank, i}
					<a href="/banks/{bank.cert}" class="flex items-center justify-between px-3 py-2.5 hover:bg-[--accent-muted] transition-colors group">
						<div class="flex items-center gap-2.5 min-w-0">
							<span class="text-[11px] font-semibold text-[--text-disabled] w-4 text-right shrink-0">{i + 1}</span>
							<div class="min-w-0">
								<span class="text-[13px] font-medium text-[--text-primary] group-hover:text-[--accent] transition-colors truncate block">{bank.name}</span>
								{#if bank.state}
									<span class="text-[11px] text-[--text-tertiary]">{bank.state}</span>
								{/if}
							</div>
						</div>
						<div class="flex items-center gap-3 shrink-0 ml-2">
							{#if bank.roa_trend?.length >= 2}
								<div class="hidden sm:block" title="ROA trend (8 quarters)">
									<Sparkline data={bank.roa_trend} width={56} height={18} showDot={true} />
								</div>
							{/if}
							<div class="text-right">
								<span class="text-[13px] font-medium text-[--text-primary] data-mono">{formatCurrency(bank.total_assets)}</span>
								{#if bank.total_deposits}
									<span class="block text-[11px] text-[--text-tertiary] data-mono">{formatCurrency(bank.total_deposits)} dep</span>
								{/if}
							</div>
						</div>
					</a>
				{/each}
			</div>
			<a href="/banks?sort=assets&order=desc" class="inline-flex items-center gap-1 mt-2 text-[13px] font-medium text-[--accent] hover:text-[--accent-hover]">
				View all banks &rarr;
			</a>
		</section>
	{/if}
</div>

<!-- Quick navigation -->
<section class="mt-6">
	<div class="flex items-center gap-2 mb-3">
		<div class="w-0.5 h-4 bg-[--accent] rounded-full"></div>
		<h2 class="text-[15px] font-semibold text-[--text-primary]">Explore</h2>
	</div>
	<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
		{#each navSections as section}
			<a
				href={section.href}
				class="group rounded-md bg-[--surface-1] px-4 py-3.5 hover:bg-[--accent-muted] transition-colors"
				style="box-shadow: var(--shadow-sm)"
			>
				<div class="flex items-start gap-3">
					<div class="shrink-0 mt-0.5 w-8 h-8 rounded-md bg-[--surface-3] flex items-center justify-center text-[--text-tertiary] group-hover:bg-[--accent] group-hover:text-white transition-colors">
						{#if section.icon === 'bank'}
							<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M3 21h18M3 10h18M5 6l7-3 7 3M4 10v11M20 10v11M8 14v3M12 14v3M16 14v3"/></svg>
						{:else if section.icon === 'chart'}
							<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M3 3v18h18M7 16l4-4 4 4 5-5"/></svg>
						{:else if section.icon === 'globe'}
							<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" stroke-width="1.5"/><path stroke-linecap="round" stroke-width="1.5" d="M2 12h20M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10A15.3 15.3 0 0112 2z"/></svg>
						{:else if section.icon === 'scale'}
							<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M3 6l3 1m0 0l-3 9a5 5 0 006 0M6 7l3 9M6 7l6-2m6 2l3-1m-3 1l-3 9a5 5 0 006 0M18 7l3 9m-3-9l-6-2m0-2v2m0 16V5m0 16H9m3 0h3"/></svg>
						{:else if section.icon === 'book'}
							<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25"/></svg>
						{/if}
					</div>
					<div class="min-w-0">
						<span class="text-[14px] font-semibold text-[--text-primary] group-hover:text-[--accent] transition-colors">{section.label}</span>
						<p class="text-[12px] text-[--text-tertiary] mt-0.5 leading-snug">{section.description}</p>
					</div>
				</div>
			</a>
		{/each}
	</div>
</section>

<!-- Attribution & Disclaimer -->
<div class="mt-10 space-y-1 border-t border-[--border] pt-6 text-center text-[11px] text-[--text-tertiary]">
	<p>Data from FDIC BankFind, Federal Reserve, FFIEC.</p>
	<p>Not financial advice. Data provided as-is for educational purposes.</p>
</div>
