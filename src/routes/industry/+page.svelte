<script lang="ts">
	import MetricCard from '$lib/components/data/MetricCard.svelte';
	import EmptyState from '$lib/components/data/EmptyState.svelte';
	import TimeSeriesChart from '$lib/components/charts/TimeSeriesChart.svelte';
	import HorizontalBarChart from '$lib/components/charts/HorizontalBarChart.svelte';
	import { formatCurrency, formatPercent, formatDate, formatNumber } from '$lib/utils/formatters.js';
	import { getMode } from '$lib/stores/mode.svelte.js';

	let { data } = $props();
	let meta = $derived(data.meta);
	let mode = $derived(getMode());

	interface SegmentQuarter {
		repdte: string;
		metrics: Record<string, number>;
	}

	interface SegmentData {
		segment: string;
		data: SegmentQuarter[];
	}

	/** Get the latest quarter's metrics for a segment */
	function latestMetrics(seg: SegmentData | null): Record<string, number> | null {
		if (!seg || !seg.data || seg.data.length === 0) return null;
		return seg.data[0].metrics;
	}

	let allMetrics = $derived(latestMetrics(data.allSegment));

	let latestQuarter = $derived(
		data.allSegment?.data?.[0]?.repdte ?? meta?.latest_quarter ?? null
	);

	function getVal(metrics: Record<string, number> | null, key: string): number | null {
		if (!metrics) return null;
		return metrics[key] ?? null;
	}

	// Build time series from allSegment data (reversed to chronological order)
	let industrySeries = $derived.by(() => {
		if (!data.allSegment?.data || data.allSegment.data.length < 2) return null;
		const quarters = [...data.allSegment.data].reverse();

		return {
			roa: quarters.map((q) => ({ date: q.repdte, value: q.metrics?.median_roa ?? null })),
			roe: quarters.map((q) => ({ date: q.repdte, value: q.metrics?.median_roe ?? null })),
			nim: quarters.map((q) => ({ date: q.repdte, value: q.metrics?.median_nim ?? null }))
		};
	});

	// Compute totals from segment stats for the "All Banks" row
	let allBanksStats = $derived.by(() => {
		if (!data.segmentStats || data.segmentStats.length === 0) return null;
		const totalBanks = data.segmentStats.reduce((s, r) => s + r.bank_count, 0);
		const totalAssets = data.segmentStats.reduce((s, r) => s + r.total_assets, 0);
		const totalDeposits = data.segmentStats.reduce((s, r) => s + r.total_deposits, 0);
		return {
			bank_count: totalBanks,
			total_assets: totalAssets,
			total_deposits: totalDeposits,
			avg_assets: totalBanks > 0 ? Math.round(totalAssets / totalBanks) : 0
		};
	});

	// Has agg_industry data for the segment table with analytics metrics?
	let hasAnalyticsData = $derived(
		data.allSegment?.data && data.allSegment.data.length > 0
	);

	// Asset tier label mapping
	const TIER_LABELS: Record<number, string> = {
		1: '<$100M',
		2: '$100-300M',
		3: '$300M-1B',
		4: '$1-10B',
		5: '$10-50B',
		6: '$50-250B',
		7: '>$250B'
	};

	// Horizontal bar data for asset tiers (by bank count)
	let tierBarData = $derived(
		data.assetTiers.map((t) => ({
			label: TIER_LABELS[t.asset_tier] ?? `Tier ${t.asset_tier}`,
			value: t.bank_count
		}))
	);

	// Horizontal bar data for top states
	let stateBarData = $derived(
		data.topStates.map((s) => ({
			label: s.state,
			value: s.bank_count
		}))
	);

	// Horizontal bar data for regulators
	let regulatorBarData = $derived(
		data.regulators.map((r) => ({
			label: r.regulator,
			value: r.bank_count
		}))
	);

	// Totals for asset tier percentage calculations
	let tierTotalBanks = $derived(data.assetTiers.reduce((s, t) => s + t.bank_count, 0));
	let tierTotalAssets = $derived(data.assetTiers.reduce((s, t) => s + t.total_assets, 0));

	// Format fail_date for display
	function formatFailDate(v: string | null): string {
		if (!v) return '\u2014';
		const d = new Date(v);
		if (!isNaN(d.getTime())) {
			return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
		}
		return v;
	}
</script>

<svelte:head>
	<title>Industry | Bank Data Explorer</title>
	<meta name="description" content="Industry-wide banking metrics, segment breakdowns, and trends across all FDIC-insured institutions." />
	<meta property="og:title" content="Industry | Bank Data Explorer" />
	<meta property="og:description" content="Industry-wide banking metrics, segment breakdowns, and trends across all FDIC-insured institutions." />
</svelte:head>

<div class="space-y-5">
	<!-- Header -->
	<div>
		<h1 class="text-2xl font-semibold text-[--text-primary]">Industry Overview</h1>
		{#if latestQuarter}
			<p class="text-[13px] text-[--text-tertiary]">Latest data: {formatDate(latestQuarter)}</p>
		{/if}
	</div>

	<!-- Top stats cards -->
	{#if meta || allBanksStats}
		<section>
			<div class="flex items-center gap-2 mb-3">
				<div class="w-0.5 h-4 bg-[--accent] rounded-full"></div>
				<h2 class="text-[15px] font-semibold text-[--text-primary]">Industry Snapshot</h2>
			</div>
			<div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-px bg-[--border-muted] rounded-md overflow-hidden" style="box-shadow: var(--shadow-sm)">
				<MetricCard
					compact
					label="Total Banks"
					value={formatNumber(meta?.bank_count ?? allBanksStats?.bank_count ?? null)}
				/>
				<MetricCard
					compact
					label="Active Banks"
					value={formatNumber(meta?.active_count ?? allBanksStats?.bank_count ?? null)}
				/>
				<MetricCard
					compact
					label="Total Assets"
					value={formatCurrency(allMetrics ? getVal(allMetrics, 'total_assets') : (allBanksStats?.total_assets ?? null))}
					sublabel="Industry-wide"
				/>
				{#if allMetrics}
					<MetricCard
						compact
						label="Median ROA"
						value={formatPercent(getVal(allMetrics, 'median_roa'))}
						sublabel="All banks"
					/>
				{:else}
					<MetricCard
						compact
						label="Total Deposits"
						value={formatCurrency(allBanksStats?.total_deposits ?? null)}
						sublabel="Industry-wide"
					/>
				{/if}
			</div>
		</section>
	{:else}
		<EmptyState
			icon="data"
			title="No industry metadata available"
			message="Run the aggregation pipeline to populate industry-wide statistics."
		/>
	{/if}

	<!-- Segment breakdown table (from institutions table) -->
	{#if data.segmentStats.length > 0}
		<section>
			<div class="flex items-center gap-2 mb-3">
				<div class="w-0.5 h-4 bg-[--accent] rounded-full"></div>
				<h2 class="text-[15px] font-semibold text-[--text-primary]">Segment Breakdown</h2>
			</div>

			<div class="borderless-card overflow-x-auto">
				<table class="w-full min-w-[500px] text-[13px]">
					<thead>
						<tr class="bg-[--surface-3]">
							<th class="text-left px-3 py-2 text-[11px] font-medium text-[--text-tertiary] uppercase tracking-wider sticky left-0 bg-[--surface-3] z-10">Segment</th>
							<th class="text-right px-3 py-2 text-[11px] font-medium text-[--text-tertiary] uppercase tracking-wider">Banks</th>
							<th class="text-right px-3 py-2 text-[11px] font-medium text-[--text-tertiary] uppercase tracking-wider">Total Assets</th>
							<th class="text-right px-3 py-2 text-[11px] font-medium text-[--text-tertiary] uppercase tracking-wider">Avg Assets</th>
							<th class="text-right px-3 py-2 text-[11px] font-medium text-[--text-tertiary] uppercase tracking-wider">Total Deposits</th>
							{#if hasAnalyticsData && mode !== 'accessible'}
								<th class="text-right px-3 py-2 text-[11px] font-medium text-[--text-tertiary] uppercase tracking-wider">Median ROA</th>
								<th class="text-right px-3 py-2 text-[11px] font-medium text-[--text-tertiary] uppercase tracking-wider">Median ROE</th>
								<th class="text-right px-3 py-2 text-[11px] font-medium text-[--text-tertiary] uppercase tracking-wider">Median NIM</th>
							{/if}
						</tr>
					</thead>
					<tbody class="divide-y divide-[--surface-2]">
						<!-- All Banks row -->
						{#if allBanksStats}
							<tr class="bg-[--surface-2]/50">
								<td class="px-3 py-2 font-semibold text-[--text-primary] sticky left-0 bg-[--surface-2]/50 z-[5]">All Banks</td>
								<td class="px-3 py-2 text-right text-[--text-primary]" data-mono>{formatNumber(allBanksStats.bank_count)}</td>
								<td class="px-3 py-2 text-right text-[--text-primary]" data-mono>{formatCurrency(allBanksStats.total_assets)}</td>
								<td class="px-3 py-2 text-right text-[--text-primary]" data-mono>{formatCurrency(allBanksStats.avg_assets)}</td>
								<td class="px-3 py-2 text-right text-[--text-primary]" data-mono>{formatCurrency(allBanksStats.total_deposits)}</td>
								{#if hasAnalyticsData && mode !== 'accessible'}
									{@const metrics = latestMetrics(data.allSegment)}
									<td class="px-3 py-2 text-right text-[--text-primary]" data-mono>{formatPercent(getVal(metrics, 'median_roa'))}</td>
									<td class="px-3 py-2 text-right text-[--text-primary]" data-mono>{formatPercent(getVal(metrics, 'median_roe'))}</td>
									<td class="px-3 py-2 text-right text-[--text-primary]" data-mono>{formatPercent(getVal(metrics, 'median_nim'))}</td>
								{/if}
							</tr>
						{/if}
						<!-- Segment rows -->
						{#each data.segmentStats as seg (seg.segment)}
							{@const aggSegment =
								seg.segment === 'Community' ? data.communitySegment
								: seg.segment === 'Regional' ? data.regionalSegment
								: seg.segment === 'Large' ? data.largeSegment
								: null}
							<tr class="hover:bg-[--accent-muted] transition-colors">
								<td class="px-3 py-2 font-medium text-[--text-primary] sticky left-0 bg-[--surface-1] z-[5]">
									{seg.segment}
									<span class="text-[11px] text-[--text-tertiary] ml-1">
										{#if seg.segment === 'Community'}(&lt;$1B){:else if seg.segment === 'Regional'}($1-50B){:else if seg.segment === 'Large'}(&gt;$50B){/if}
									</span>
								</td>
								<td class="px-3 py-2 text-right text-[--text-primary]" data-mono>{formatNumber(seg.bank_count)}</td>
								<td class="px-3 py-2 text-right text-[--text-primary]" data-mono>{formatCurrency(seg.total_assets)}</td>
								<td class="px-3 py-2 text-right text-[--text-primary]" data-mono>{formatCurrency(seg.avg_assets)}</td>
								<td class="px-3 py-2 text-right text-[--text-primary]" data-mono>{formatCurrency(seg.total_deposits)}</td>
								{#if hasAnalyticsData && mode !== 'accessible'}
									{@const metrics = latestMetrics(aggSegment)}
									<td class="px-3 py-2 text-right text-[--text-primary]" data-mono>{formatPercent(getVal(metrics, 'median_roa'))}</td>
									<td class="px-3 py-2 text-right text-[--text-primary]" data-mono>{formatPercent(getVal(metrics, 'median_roe'))}</td>
									<td class="px-3 py-2 text-right text-[--text-primary]" data-mono>{formatPercent(getVal(metrics, 'median_nim'))}</td>
								{/if}
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		</section>
	{/if}

	<!-- Distribution charts: Asset Tiers, States, Regulators -->
	{#if data.assetTiers.length > 0 || data.topStates.length > 0 || data.regulators.length > 0}
		<section>
			<div class="flex items-center gap-2 mb-3">
				<div class="w-0.5 h-4 bg-[--accent] rounded-full"></div>
				<h2 class="text-[15px] font-semibold text-[--text-primary]">Distributions</h2>
			</div>

			<div class="grid grid-cols-1 lg:grid-cols-3 gap-3">
				<!-- Asset tier distribution -->
				{#if tierBarData.length > 0}
					<div class="borderless-card p-3">
						<h3 class="text-[13px] font-semibold text-[--text-primary] mb-2">Banks by Asset Size</h3>
						<HorizontalBarChart data={tierBarData} height="220px" />
					</div>
				{/if}

				<!-- Geographic distribution -->
				{#if stateBarData.length > 0}
					<div class="borderless-card p-3">
						<h3 class="text-[13px] font-semibold text-[--text-primary] mb-2">Top States by Bank Count</h3>
						<HorizontalBarChart data={stateBarData} height="220px" />
					</div>
				{/if}

				<!-- Regulator distribution -->
				{#if regulatorBarData.length > 0}
					<div class="borderless-card p-3">
						<h3 class="text-[13px] font-semibold text-[--text-primary] mb-2">Primary Regulator</h3>
						<HorizontalBarChart data={regulatorBarData} height="220px" />
					</div>
				{/if}
			</div>
		</section>
	{/if}

	<!-- Asset tier detail table -->
	{#if data.assetTiers.length > 0}
		<section>
			<div class="flex items-center gap-2 mb-3">
				<div class="w-0.5 h-4 bg-[--accent] rounded-full"></div>
				<h2 class="text-[15px] font-semibold text-[--text-primary]">Asset Size Distribution</h2>
			</div>

			<div class="borderless-card overflow-x-auto">
				<table class="w-full min-w-[500px] text-[13px]">
					<thead>
						<tr class="bg-[--surface-3]">
							<th class="text-left px-3 py-2 text-[11px] font-medium text-[--text-tertiary] uppercase tracking-wider sticky left-0 bg-[--surface-3] z-10">Tier</th>
							<th class="text-right px-3 py-2 text-[11px] font-medium text-[--text-tertiary] uppercase tracking-wider">Banks</th>
							<th class="text-right px-3 py-2 text-[11px] font-medium text-[--text-tertiary] uppercase tracking-wider">% of Banks</th>
							<th class="text-right px-3 py-2 text-[11px] font-medium text-[--text-tertiary] uppercase tracking-wider">Total Assets</th>
							<th class="text-right px-3 py-2 text-[11px] font-medium text-[--text-tertiary] uppercase tracking-wider">% of Assets</th>
							<th class="text-right px-3 py-2 text-[11px] font-medium text-[--text-tertiary] uppercase tracking-wider">Avg Assets</th>
						</tr>
					</thead>
					<tbody class="divide-y divide-[--surface-2]">
						{#each data.assetTiers as tier (tier.asset_tier)}
							<tr class="hover:bg-[--accent-muted] transition-colors">
								<td class="px-3 py-2 font-medium text-[--text-primary] sticky left-0 bg-[--surface-1] z-[5]">{TIER_LABELS[tier.asset_tier] ?? `Tier ${tier.asset_tier}`}</td>
								<td class="px-3 py-2 text-right text-[--text-primary]" data-mono>{formatNumber(tier.bank_count)}</td>
								<td class="px-3 py-2 text-right text-[--text-tertiary]" data-mono>{tierTotalBanks > 0 ? ((tier.bank_count / tierTotalBanks) * 100).toFixed(1) : '0'}%</td>
								<td class="px-3 py-2 text-right text-[--text-primary]" data-mono>{formatCurrency(tier.total_assets)}</td>
								<td class="px-3 py-2 text-right text-[--text-tertiary]" data-mono>{tierTotalAssets > 0 ? ((tier.total_assets / tierTotalAssets) * 100).toFixed(1) : '0'}%</td>
								<td class="px-3 py-2 text-right text-[--text-primary]" data-mono>{formatCurrency(tier.avg_assets)}</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		</section>
	{/if}

	<!-- Industry Trends (conditional on agg_industry data) -->
	<section>
		<div class="flex items-center gap-2 mb-3">
			<div class="w-0.5 h-4 bg-[--accent] rounded-full"></div>
			<h2 class="text-[15px] font-semibold text-[--text-primary]">Industry Trends</h2>
		</div>

		{#if industrySeries}
			<div class="grid grid-cols-1 lg:grid-cols-2 gap-2">
				<div class="borderless-card p-3">
					<h3 class="text-[13px] font-semibold text-[--text-primary] mb-2">Key Ratios</h3>
					<TimeSeriesChart
						series={[
							{ key: 'roa', label: 'Median ROA', data: industrySeries.roa },
							{ key: 'roe', label: 'Median ROE', data: industrySeries.roe },
							{ key: 'nim', label: 'Median NIM', data: industrySeries.nim }
						]}
						yAxisFormat="percent"
					/>
				</div>
			</div>
		{:else}
			<div class="borderless-card py-8 text-center">
				<p class="text-[13px] text-[--text-tertiary]">Trend data will appear here after the analytics pipeline runs.</p>
				<p class="text-[11px] text-[--text-disabled] mt-1">ROA, ROE, and NIM trends across quarters</p>
			</div>
		{/if}
	</section>

	<!-- Bank Failures -->
	{#if data.failureCount > 0}
		<section>
			<div class="flex items-center gap-2 mb-3">
				<div class="w-0.5 h-4 bg-[--warning] rounded-full"></div>
				<h2 class="text-[15px] font-semibold text-[--text-primary]">Bank Failures</h2>
				<span class="text-[11px] text-[--text-tertiary]">{formatNumber(data.failureCount)} total</span>
			</div>

			{#if data.recentFailures.length > 0}
				<div class="borderless-card overflow-x-auto mb-3">
					<table class="w-full min-w-[500px] text-[13px]">
						<thead>
							<tr class="bg-[--surface-3]">
								<th class="text-left px-3 py-2 text-[11px] font-medium text-[--text-tertiary] uppercase tracking-wider sticky left-0 bg-[--surface-3] z-10">Bank</th>
								<th class="text-left px-3 py-2 text-[11px] font-medium text-[--text-tertiary] uppercase tracking-wider">Location</th>
								<th class="text-left px-3 py-2 text-[11px] font-medium text-[--text-tertiary] uppercase tracking-wider">Date</th>
								<th class="text-right px-3 py-2 text-[11px] font-medium text-[--text-tertiary] uppercase tracking-wider">Assets</th>
							</tr>
						</thead>
						<tbody class="divide-y divide-[--surface-2]">
							{#each data.recentFailures as f (f.cert)}
								<tr class="hover:bg-[--accent-muted] transition-colors">
									<td class="px-3 py-2 font-medium text-[--text-primary] sticky left-0 bg-[--surface-1] z-[5]">{f.name ?? '\u2014'}</td>
									<td class="px-3 py-2 text-[--text-secondary]">{f.city && f.state ? `${f.city}, ${f.state}` : (f.state ?? '\u2014')}</td>
									<td class="px-3 py-2 text-[--text-secondary]">{formatFailDate(f.fail_date)}</td>
									<td class="px-3 py-2 text-right text-[--text-primary]" data-mono>{formatCurrency(f.total_assets)}</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			{/if}

			<a href="/industry/failures" class="inline-flex items-center gap-1 text-[13px] font-medium text-[--accent] hover:text-[--accent-hover]">
				View all failures and analysis &rarr;
			</a>
		</section>
	{/if}
</div>
