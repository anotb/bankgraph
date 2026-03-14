<script lang="ts">
	import { goto } from '$app/navigation';
	import SearchBar from '$lib/components/data/SearchBar.svelte';
	import MetricCard from '$lib/components/data/MetricCard.svelte';
	import Sparkline from '$lib/components/data/Sparkline.svelte';
	import TimeSeriesChart from '$lib/components/charts/TimeSeriesChart.svelte';
	import { formatNumber, formatDate, formatPercent, formatCurrency } from '$lib/utils/formatters.js';
	import { getFieldLabel } from '$lib/utils/field-meta.js';
	import { getStateName } from '$lib/utils/states.js';

	let { data } = $props();

	function handleSearch(query: string) {
		if (query) {
			goto(`/banks?q=${encodeURIComponent(query)}`);
		}
	}

	function handleSelect({ cert }: import('$lib/types').Institution) {
		goto(`/banks/${cert}`);
	}

	// Build time series from industryTrends (reversed to chronological order)
	let trendSeries = $derived.by(() => {
		if (!data.industryTrends || data.industryTrends.length < 2) return null;
		const quarters = [...data.industryTrends].reverse();

		return {
			roa: quarters.map((q) => ({ date: q.repdte, value: q.metrics?.median_roa ?? null })),
			roe: quarters.map((q) => ({ date: q.repdte, value: q.metrics?.median_roe ?? null })),
			nim: quarters.map((q) => ({ date: q.repdte, value: q.metrics?.median_nim ?? null }))
		};
	});
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

<!-- Industry Snapshot (merged metrics) -->
<section class="mb-5">
	<div class="flex items-center gap-2 mb-3">
		<div class="w-0.5 h-4 bg-[--accent] rounded-full"></div>
		<h2 class="text-[15px] font-semibold text-[--text-primary]">Industry Snapshot</h2>
		{#if data.meta.latest_quarter}
			<span class="text-[11px] text-[--text-tertiary] ml-1">as of {formatDate(data.meta.latest_quarter)}</span>
		{/if}
	</div>
	<div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-px bg-[--border-muted] rounded-md overflow-hidden" style="box-shadow: var(--shadow-sm)">
		<MetricCard
			compact
			label="Active Banks"
			value={data.meta.active_count ? formatNumber(data.meta.active_count) : '...'}
			sublabel="FDIC-insured"
			trend={data.deltas.bank_count}
			trendLabel="QoQ change"
		/>
		<MetricCard
			compact
			label="Total Assets"
			value={data.industryMetrics.total_assets !== null ? formatCurrency(data.industryMetrics.total_assets) : (data.meta.total_assets ? formatCurrency(data.meta.total_assets) : '...')}
			sublabel="Industry-wide"
			trend={data.deltas.total_assets}
			trendLabel="QoQ change"
		/>
		<MetricCard
			compact
			label="Total Deposits"
			value={data.industryMetrics.total_deposits !== null ? formatCurrency(data.industryMetrics.total_deposits) : (data.meta.total_deposits ? formatCurrency(data.meta.total_deposits) : '...')}
			sublabel="Industry-wide"
			trend={data.deltas.total_deposits}
			trendLabel="QoQ change"
		/>
		{#if data.industryMetrics.median_roa !== null}
			<MetricCard
				compact
				label="Median ROA"
				value={formatPercent(data.industryMetrics.median_roa)}
				sublabel="Return on Assets"
				trend={data.deltas.median_roa}
				trendLabel="QoQ change"
			/>
		{/if}
		{#if data.industryMetrics.median_roe !== null}
			<MetricCard
				compact
				label="Median ROE"
				value={formatPercent(data.industryMetrics.median_roe)}
				sublabel="Return on Equity"
				trend={data.deltas.median_roe}
				trendLabel="QoQ change"
			/>
		{/if}
		{#if data.industryMetrics.median_nim !== null}
			<MetricCard
				compact
				label="Median NIM"
				value={formatPercent(data.industryMetrics.median_nim)}
				sublabel="Net Interest Margin"
				trend={data.deltas.median_nim}
				trendLabel="QoQ change"
			/>
		{/if}
		<MetricCard
			compact
			label="Latest Data"
			value={data.meta.latest_quarter ? formatDate(data.meta.latest_quarter) : '...'}
			sublabel="Most recent quarter"
		/>
	</div>
	<a href="/industry" class="inline-flex items-center gap-1 mt-2 text-[13px] font-medium text-[--accent] hover:text-[--accent-hover]">
		Full industry breakdown &rarr;
	</a>
</section>

<!-- Industry Trend Charts -->
{#if trendSeries}
	<section class="mb-5">
		<div class="flex items-center gap-2 mb-3">
			<div class="w-0.5 h-4 bg-[--accent] rounded-full"></div>
			<h2 class="text-[15px] font-semibold text-[--text-primary]">Industry Trends</h2>
		</div>
		<div class="grid grid-cols-1 lg:grid-cols-2 gap-2">
			<div class="borderless-card p-3">
				<h3 class="text-[13px] font-semibold text-[--text-primary] mb-2">ROA & NIM</h3>
				<TimeSeriesChart
					series={[
						{ key: 'roa', label: 'Median ROA', data: trendSeries.roa },
						{ key: 'nim', label: 'Median NIM', data: trendSeries.nim }
					]}
					yAxisFormat="percent"
					height="200px"
				/>
			</div>
			<div class="borderless-card p-3">
				<h3 class="text-[13px] font-semibold text-[--text-primary] mb-2">ROE</h3>
				<TimeSeriesChart
					series={[
						{ key: 'roe', label: 'Median ROE', data: trendSeries.roe }
					]}
					yAxisFormat="percent"
					height="200px"
				/>
			</div>
		</div>
	</section>
{/if}

<!-- Banks by State -->
{#if data.stateDistribution.length > 0}
	{@const maxCount = data.stateDistribution[0].bank_count}
	<section class="mb-5">
		<div class="flex items-center gap-2 mb-3">
			<div class="w-0.5 h-4 bg-[--accent] rounded-full"></div>
			<h2 class="text-[15px] font-semibold text-[--text-primary]">Banks by State</h2>
		</div>
		<div class="grid grid-cols-8 sm:grid-cols-10 md:grid-cols-13 gap-1">
			{#each data.stateDistribution as s}
				{@const opacity = Math.max(15, Math.min(90, (s.bank_count / maxCount) * 90))}
				<a href="/banks?state={s.state}"
					class="rounded px-1.5 py-1 text-center text-[11px] font-medium transition-colors hover:ring-1 hover:ring-[--accent]"
					style="background-color: color-mix(in srgb, var(--accent) {opacity}%, var(--surface-2))"
					title="{getStateName(s.state)} ({s.state}): {s.bank_count} banks">
					<span class="block text-[10px] font-bold">{s.state}</span>
					<span class="block text-[9px] opacity-70">{s.bank_count}</span>
				</a>
			{/each}
		</div>
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
						<a href="/banks/{anomaly.cert}/risk" class="block px-3 py-2.5 hover:bg-[--accent-muted] transition-colors">
							<div class="flex items-center justify-between">
								<div class="flex items-center gap-2 min-w-0">
									<span class="inline-flex shrink-0 items-center rounded-sm px-1.5 py-0.5 text-[10px] font-medium tracking-wide uppercase
										{anomaly.severity === 'critical' ? 'bg-[--negative-muted] text-[--negative]' : 'bg-[--warning-muted] text-[--warning]'}">
										{anomaly.severity}
									</span>
									<span class="text-[13px] font-medium text-[--text-primary] truncate">{anomaly.name ?? `CERT ${anomaly.cert}`}</span>
								</div>
								<span class="text-[12px] font-medium text-[--text-secondary] shrink-0 ml-2">{getFieldLabel(anomaly.metric)}</span>
							</div>
							{#if anomaly.description || anomaly.value !== null}
								<div class="mt-1 pl-7 text-[11px] text-[--text-tertiary] leading-snug">
									{#if anomaly.value !== null}
										<span class="data-mono font-medium text-[--text-secondary]">{formatPercent(anomaly.value)}</span>
									{/if}
									{#if anomaly.description}
										<span>{anomaly.value !== null ? ' · ' : ''}{anomaly.description}</span>
									{/if}
								</div>
							{/if}
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
				<div class="grid grid-cols-2 gap-1.5 mb-2">
					{#if data.failureSummary.recent_failures[0]?.fail_date}
						<MetricCard
							label="Most Recent"
							value={formatDate(data.failureSummary.recent_failures[0].fail_date)}
							sublabel="Latest failure"
							borderless={true}
						/>
					{/if}
					<MetricCard
						label="Last 5 Years"
						value={formatNumber(data.failureSummary.recent_5yr_count)}
						sublabel="failures recorded"
						borderless={true}
					/>
				</div>
				<div class="rounded-md bg-[--surface-1] divide-y divide-[--surface-2]" style="box-shadow: var(--shadow-sm)">
					{#each data.failureSummary.recent_failures as failure}
						<a href={failure.cert ? `/banks/${failure.cert}` : '/industry/failures'} class="flex items-center justify-between px-3 py-2.5 hover:bg-[--accent-muted] transition-colors">
							<span class="text-[13px] font-medium text-[--text-primary] truncate">{failure.name ?? 'Unknown'}</span>
							<div class="flex items-center gap-2 shrink-0 ml-2">
								{#if failure.state}
									<span class="text-[12px] text-[--text-tertiary]">{failure.state}</span>
								{/if}
								<span class="text-[12px] font-medium text-[--text-secondary] data-mono">{formatDate(failure.fail_date)}</span>
							</div>
						</a>
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

