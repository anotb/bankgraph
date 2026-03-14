<script lang="ts">
	import MetricCard from '$lib/components/data/MetricCard.svelte';
	import EmptyState from '$lib/components/data/EmptyState.svelte';
	import ExportButton from '$lib/components/data/ExportButton.svelte';
	import TimeSeriesChart from '$lib/components/charts/TimeSeriesChart.svelte';
	import HorizontalBarChart from '$lib/components/charts/HorizontalBarChart.svelte';
	import DonutChart from '$lib/components/charts/DonutChart.svelte';
	import { formatCurrency, formatPercent, formatDate, formatNumber } from '$lib/utils/formatters.js';
	import { getMode } from '$lib/stores/mode.svelte.js';

	let { data } = $props();
	let meta = $derived(data.meta);
	let mode = $derived(getMode());

	// Segment filter state
	type SegmentFilter = 'All' | 'Community' | 'Regional' | 'Large';
	const SEGMENT_FILTERS: SegmentFilter[] = ['All', 'Community', 'Regional', 'Large'];
	let selectedSegment: SegmentFilter = $state('All');

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

	/** Metrics for the currently selected segment filter */
	let activeSegmentData = $derived.by((): SegmentData | null => {
		if (selectedSegment === 'All') return data.allSegment;
		if (selectedSegment === 'Community') return data.communitySegment;
		if (selectedSegment === 'Regional') return data.regionalSegment;
		if (selectedSegment === 'Large') return data.largeSegment;
		return data.allSegment;
	});
	let activeMetrics = $derived(latestMetrics(activeSegmentData));

	/** Stats row for the selected segment (for bank count, assets, deposits) */
	let activeSegmentStats = $derived.by(() => {
		if (selectedSegment === 'All') return allBanksStats;
		const seg = data.segmentStats.find((s) => s.segment === selectedSegment);
		if (!seg) return null;
		return {
			bank_count: seg.bank_count,
			total_assets: seg.total_assets,
			total_deposits: seg.total_deposits,
			avg_assets: seg.avg_assets
		};
	});

	let latestQuarter = $derived(
		data.allSegment?.data?.[0]?.repdte ?? meta?.latest_quarter ?? null
	);

	function getVal(metrics: Record<string, number> | null, key: string): number | null {
		if (!metrics) return null;
		return metrics[key] ?? null;
	}

	/** Compare a segment metric against the All Banks baseline. Returns 'above' | 'below' | 'equal' */
	function trendVsAll(segMetrics: Record<string, number> | null, key: string): 'above' | 'below' | 'equal' {
		const segVal = getVal(segMetrics, key);
		const allVal = getVal(allMetrics, key);
		if (segVal == null || allVal == null) return 'equal';
		if (segVal > allVal) return 'above';
		if (segVal < allVal) return 'below';
		return 'equal';
	}

	/** CSS class for trend coloring */
	function trendColor(direction: 'above' | 'below' | 'equal'): string {
		if (direction === 'above') return 'text-[--positive]';
		if (direction === 'below') return 'text-[--negative]';
		return 'text-[--text-primary]';
	}

	// Build time series from allSegment data (reversed to chronological order)
	let industrySeries = $derived.by(() => {
		if (!data.allSegment?.data || data.allSegment.data.length < 2) return null;
		const quarters = [...data.allSegment.data].reverse();

		return {
			roa: quarters.map((q) => ({ date: q.repdte, value: q.metrics?.median_roa ?? null })),
			roe: quarters.map((q) => ({ date: q.repdte, value: q.metrics?.median_roe ?? null })),
			nim: quarters.map((q) => ({ date: q.repdte, value: q.metrics?.median_nim ?? null })),
			total_assets: quarters.map((q) => ({ date: q.repdte, value: q.metrics?.total_assets ?? null })),
			total_deposits: quarters.map((q) => ({ date: q.repdte, value: q.metrics?.total_deposits ?? null })),
			bank_count: quarters.map((q) => ({ date: q.repdte, value: q.metrics?.bank_count ?? null }))
		};
	});

	// Build segment ROA comparison series
	let segmentRoaSeries = $derived.by(() => {
		const segments: Array<{ label: string; data: SegmentData | null }> = [
			{ label: 'Community', data: data.communitySegment },
			{ label: 'Regional', data: data.regionalSegment },
			{ label: 'Large', data: data.largeSegment }
		];

		const series: Array<{ key: string; label: string; data: Array<{ date: string; value: number | null }> }> = [];

		for (const seg of segments) {
			if (!seg.data?.data || seg.data.data.length < 2) continue;
			const quarters = [...seg.data.data].reverse();
			series.push({
				key: seg.label.toLowerCase() + '_roa',
				label: `${seg.label} ROA`,
				data: quarters.map((q) => ({ date: q.repdte, value: q.metrics?.median_roa ?? null }))
			});
		}

		return series.length >= 2 ? series : null;
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

	// Donut data: asset tiers by total assets (shows concentration)
	let tierAssetDonutData = $derived(
		data.assetTiers.map((t) => ({
			label: TIER_LABELS[t.asset_tier] ?? `Tier ${t.asset_tier}`,
			value: t.total_assets
		}))
	);

	// Horizontal bar data for top states
	let stateBarData = $derived(
		data.topStates.map((s) => ({
			label: s.state,
			value: s.bank_count
		}))
	);

	// Donut data for regulators
	let regulatorDonutData = $derived(
		data.regulators.map((r) => ({
			label: r.regulator,
			value: r.bank_count
		}))
	);

	// Totals for asset tier percentage calculations
	let tierTotalBanks = $derived(data.assetTiers.reduce((s, t) => s + t.bank_count, 0));
	let tierTotalAssets = $derived(data.assetTiers.reduce((s, t) => s + t.total_assets, 0));

	// Distribution summary stats
	let assetConcentrationSummary = $derived.by(() => {
		if (data.assetTiers.length === 0 || tierTotalAssets === 0) return null;
		const top = data.assetTiers.find((t) => t.asset_tier === 7);
		if (!top) return null;
		const pct = ((top.total_assets / tierTotalAssets) * 100).toFixed(1);
		return `>$250B holds ${pct}% of all assets`;
	});

	let topStateSummary = $derived.by(() => {
		if (data.topStates.length === 0) return null;
		const top = data.topStates[0];
		return `${top.state} leads with ${formatNumber(top.bank_count)} banks`;
	});

	let regulatorSummary = $derived.by(() => {
		if (data.regulators.length === 0) return null;
		const totalBanks = data.regulators.reduce((s, r) => s + r.bank_count, 0);
		// Find FDIC
		const fdic = data.regulators.find((r) => r.regulator === 'FDIC');
		if (!fdic || totalBanks === 0) return null;
		const pct = ((fdic.bank_count / totalBanks) * 100).toFixed(0);
		return `FDIC regulates ${pct}% of banks`;
	});

	// Format fail_date (YYYYMMDD) for display
	function formatFailDate(v: string | null): string {
		if (!v) return '\u2014';
		// YYYYMMDD format
		if (/^\d{8}$/.test(v)) {
			const y = v.slice(0, 4);
			const m = parseInt(v.slice(4, 6), 10);
			const d = parseInt(v.slice(6, 8), 10);
			const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
			return `${months[m - 1]} ${d}, ${y}`;
		}
		return formatDate(v);
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
	<div class="flex items-start justify-between gap-3">
		<div>
			<h1 class="text-2xl font-semibold text-[--text-primary]">Industry Overview</h1>
			{#if latestQuarter}
				<p class="text-[13px] text-[--text-tertiary]">Latest data: {formatDate(latestQuarter)}</p>
			{/if}
		</div>
		<ExportButton baseUrl="/api/v1/industry" filename="industry_all" />
	</div>

	<!-- Top stats cards -->
	{#if meta || allBanksStats}
		<section>
			<div class="flex items-center justify-between mb-3">
				<div class="flex items-center gap-2">
					<div class="w-0.5 h-4 bg-[--accent] rounded-full"></div>
					<h2 class="text-[15px] font-semibold text-[--text-primary]">Industry Snapshot</h2>
				</div>
				<!-- Segment filter pills -->
				<div class="flex items-center gap-1">
					{#each SEGMENT_FILTERS as seg (seg)}
						<button
							class="px-2.5 py-1 text-[11px] font-medium rounded-full transition-colors
								{selectedSegment === seg
									? 'bg-[--accent] text-white'
									: 'bg-[--surface-2] text-[--text-secondary] hover:bg-[--surface-3]'}"
							onclick={() => { selectedSegment = seg; }}
						>
							{seg}
						</button>
					{/each}
				</div>
			</div>
			<div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-px bg-[--border-muted] rounded-md overflow-hidden" style="box-shadow: var(--shadow-sm)">
				<MetricCard
					compact
					label="{selectedSegment === 'All' ? 'Total' : selectedSegment} Banks"
					value={formatNumber(
						selectedSegment === 'All'
							? (meta?.bank_count ?? allBanksStats?.bank_count ?? null)
							: (activeSegmentStats?.bank_count ?? null)
					)}
				/>
				<MetricCard
					compact
					label="{selectedSegment === 'All' ? 'Active' : selectedSegment} Banks"
					value={formatNumber(
						selectedSegment === 'All'
							? (meta?.active_count ?? allBanksStats?.bank_count ?? null)
							: (activeSegmentStats?.bank_count ?? null)
					)}
				/>
				<MetricCard
					compact
					label="Total Assets"
					value={formatCurrency(activeMetrics ? getVal(activeMetrics, 'total_assets') : (activeSegmentStats?.total_assets ?? null))}
					sublabel={selectedSegment === 'All' ? 'Industry-wide' : selectedSegment}
				/>
				{#if activeMetrics}
					<MetricCard
						compact
						label="Median ROA"
						value={formatPercent(getVal(activeMetrics, 'median_roa'))}
						sublabel={selectedSegment === 'All' ? 'All banks' : selectedSegment}
					/>
				{:else}
					<MetricCard
						compact
						label="Total Deposits"
						value={formatCurrency(activeSegmentStats?.total_deposits ?? null)}
						sublabel={selectedSegment === 'All' ? 'Industry-wide' : selectedSegment}
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
							<tr class="bg-[--surface-2]/50 {selectedSegment === 'All' ? 'ring-1 ring-inset ring-[--accent]' : ''}">
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
							{@const isSelected = selectedSegment === seg.segment}
							<tr class="transition-colors {isSelected ? 'bg-[--accent-muted] ring-1 ring-inset ring-[--accent]' : 'hover:bg-[--accent-muted]'}">
								<td class="px-3 py-2 font-medium text-[--text-primary] sticky left-0 z-[5] {isSelected ? 'bg-[--accent-muted]' : 'bg-[--surface-1]'}">
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
									{@const roaTrend = trendVsAll(metrics, 'median_roa')}
									{@const roeTrend = trendVsAll(metrics, 'median_roe')}
									{@const nimTrend = trendVsAll(metrics, 'median_nim')}
									<td class="px-3 py-2 text-right {trendColor(roaTrend)}" data-mono>
										{#if roaTrend === 'above'}<span aria-label="Above industry median">&#9650; </span>{:else if roaTrend === 'below'}<span aria-label="Below industry median">&#9660; </span>{/if}{formatPercent(getVal(metrics, 'median_roa'))}
									</td>
									<td class="px-3 py-2 text-right {trendColor(roeTrend)}" data-mono>
										{#if roeTrend === 'above'}<span aria-label="Above industry median">&#9650; </span>{:else if roeTrend === 'below'}<span aria-label="Below industry median">&#9660; </span>{/if}{formatPercent(getVal(metrics, 'median_roe'))}
									</td>
									<td class="px-3 py-2 text-right {trendColor(nimTrend)}" data-mono>
										{#if nimTrend === 'above'}<span aria-label="Above industry median">&#9650; </span>{:else if nimTrend === 'below'}<span aria-label="Below industry median">&#9660; </span>{/if}{formatPercent(getVal(metrics, 'median_nim'))}
									</td>
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
				<!-- Asset tier distribution (donut by total assets shows concentration) -->
				{#if tierAssetDonutData.length > 0}
					<div class="borderless-card p-3">
						<h3 class="text-[13px] font-semibold text-[--text-primary] mb-2">Asset Concentration</h3>
						<DonutChart data={tierAssetDonutData} height="220px" valueFormatter={formatCurrency} innerLabel="Assets" />
						{#if assetConcentrationSummary}
							<p class="mt-2 text-[11px] text-[--text-tertiary] text-center">{assetConcentrationSummary}</p>
						{/if}
					</div>
				{/if}

				<!-- Geographic distribution (bar chart works best for ranked list) -->
				{#if stateBarData.length > 0}
					<div class="borderless-card p-3">
						<h3 class="text-[13px] font-semibold text-[--text-primary] mb-2">Top States by Bank Count</h3>
						<HorizontalBarChart data={stateBarData} height="220px" />
						{#if topStateSummary}
							<p class="mt-2 text-[11px] text-[--text-tertiary] text-center">{topStateSummary}</p>
						{/if}
					</div>
				{/if}

				<!-- Regulator distribution (donut for categorical split) -->
				{#if regulatorDonutData.length > 0}
					<div class="borderless-card p-3">
						<h3 class="text-[13px] font-semibold text-[--text-primary] mb-2">Primary Regulator</h3>
						<DonutChart data={regulatorDonutData} height="220px" innerLabel="Banks" />
						{#if regulatorSummary}
							<p class="mt-2 text-[11px] text-[--text-tertiary] text-center">{regulatorSummary}</p>
						{/if}
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
						showMovingAverage={mode === 'power'}
					/>
				</div>
				<div class="borderless-card p-3">
					<h3 class="text-[13px] font-semibold text-[--text-primary] mb-2">Total Assets & Deposits</h3>
					<TimeSeriesChart
						series={[
							{ key: 'total_assets', label: 'Total Assets', data: industrySeries.total_assets },
							{ key: 'total_deposits', label: 'Total Deposits', data: industrySeries.total_deposits }
						]}
						yAxisFormat="currency"
						showMovingAverage={mode === 'power'}
					/>
				</div>
				<div class="borderless-card p-3">
					<h3 class="text-[13px] font-semibold text-[--text-primary] mb-2">Bank Count</h3>
					<TimeSeriesChart
						series={[
							{ key: 'bank_count', label: 'Banks', data: industrySeries.bank_count }
						]}
						yAxisFormat="number"
						showMovingAverage={mode === 'power'}
					/>
				</div>
				{#if segmentRoaSeries}
					<div class="borderless-card p-3">
						<h3 class="text-[13px] font-semibold text-[--text-primary] mb-2">ROA by Segment</h3>
						<TimeSeriesChart
							series={segmentRoaSeries}
							yAxisFormat="percent"
							showMovingAverage={mode === 'power'}
						/>
					</div>
				{/if}
			</div>
		{:else}
			<EmptyState
				icon="chart"
				title="Trend data will appear here after the analytics pipeline runs."
				message="ROA, ROE, and NIM trends across quarters"
			/>
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
