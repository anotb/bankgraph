<script lang="ts">
	import MetricCard from '$lib/components/data/MetricCard.svelte';
	import EmptyState from '$lib/components/data/EmptyState.svelte';
	import TimeSeriesChart from '$lib/components/charts/TimeSeriesChart.svelte';
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
	let communityMetrics = $derived(latestMetrics(data.communitySegment));
	let regionalMetrics = $derived(latestMetrics(data.regionalSegment));
	let largeMetrics = $derived(latestMetrics(data.largeSegment));

	let latestQuarter = $derived(
		data.allSegment?.data?.[0]?.repdte ?? meta?.latest_quarter ?? null
	);

	interface SegmentRow {
		label: string;
		metrics: Record<string, number> | null;
	}

	let segments = $derived.by((): SegmentRow[] => {
		const all: SegmentRow[] = [
			{ label: 'All Banks', metrics: allMetrics },
			{ label: 'Community', metrics: communityMetrics },
			{ label: 'Regional', metrics: regionalMetrics },
			{ label: 'Large', metrics: largeMetrics }
		];
		if (mode === 'accessible') {
			// Show just All Banks row in accessible mode
			return [all[0]];
		}
		return all;
	});

	/** Columns for the segment table */
	type MetricCol = { key: string; label: string; fmt: (v: number | null) => string };

	let columns = $derived.by((): MetricCol[] => {
		const core: MetricCol[] = [
			{ key: 'bank_count', label: 'Banks', fmt: (v) => formatNumber(v) },
			{ key: 'total_assets', label: 'Total Assets', fmt: (v) => formatCurrency(v) },
			{ key: 'median_roa', label: 'Median ROA', fmt: (v) => formatPercent(v) },
			{ key: 'median_roe', label: 'Median ROE', fmt: (v) => formatPercent(v) },
			{ key: 'median_nim', label: 'Median NIM', fmt: (v) => formatPercent(v) }
		];
		if (mode === 'power') {
			return [
				...core,
				{ key: 'median_eeffr', label: 'Median Eff. Ratio', fmt: (v) => formatPercent(v) },
				{ key: 'median_nclnlsr', label: 'Median NPL', fmt: (v) => formatPercent(v) },
				{ key: 'median_rbcrwaj', label: 'Median Capital', fmt: (v) => formatPercent(v) }
			];
		}
		return core;
	});

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
</script>

<svelte:head>
	<title>Industry | Bank Data Explorer</title>
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
	{#if meta}
		<section>
			<div class="flex items-center gap-2 mb-3">
				<div class="w-0.5 h-4 bg-[--accent] rounded-full"></div>
				<h2 class="text-[15px] font-semibold text-[--text-primary]">Industry Snapshot</h2>
			</div>
			<div class="grid grid-cols-2 md:grid-cols-4 gap-px bg-[--border-muted] rounded-md overflow-hidden" style="box-shadow: var(--shadow-sm)">
				<MetricCard
					compact
					label="Total Banks"
					value={formatNumber(meta.bank_count)}
				/>
				<MetricCard
					compact
					label="Active Banks"
					value={formatNumber(meta.active_count)}
				/>
				{#if allMetrics}
					<MetricCard
						compact
						label="Total Assets"
						value={formatCurrency(getVal(allMetrics, 'total_assets'))}
						sublabel="Industry-wide"
					/>
					<MetricCard
						compact
						label="Median ROA"
						value={formatPercent(getVal(allMetrics, 'median_roa'))}
						sublabel="All banks"
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

	<!-- Segment breakdown table -->
	<section>
		<div class="flex items-center gap-2 mb-3">
			<div class="w-0.5 h-4 bg-[--accent] rounded-full"></div>
			<h2 class="text-[15px] font-semibold text-[--text-primary]">Segment Breakdown</h2>
		</div>

		{#if segments.some((s) => s.metrics !== null)}
			<div class="rounded-md bg-[--surface-1] overflow-x-auto" style="box-shadow: var(--shadow-sm)">
				<table class="w-full text-[13px]">
					<thead>
						<tr class="bg-[--surface-3]">
							<th class="text-left px-3 py-2 text-[11px] font-medium text-[--text-tertiary] uppercase tracking-wider">Segment</th>
							{#each columns as col (col.key)}
								<th class="text-right px-3 py-2 text-[11px] font-medium text-[--text-tertiary] uppercase tracking-wider">{col.label}</th>
							{/each}
						</tr>
					</thead>
					<tbody class="divide-y divide-[--surface-2]">
						{#each segments as seg (seg.label)}
							<tr class="hover:bg-[--accent-muted] transition-colors">
								<td class="px-3 py-2 font-medium text-[--text-primary]">{seg.label}</td>
								{#each columns as col (col.key)}
									<td class="px-3 py-2 text-right text-[--text-primary]" data-mono>
										{col.fmt(getVal(seg.metrics, col.key))}
									</td>
								{/each}
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{:else}
			<EmptyState
				icon="chart"
				title="No segment data available yet"
				message="Run the aggregation pipeline to populate industry segment breakdowns."
			/>
		{/if}
	</section>

	<!-- Industry Trends -->
	{#if industrySeries}
		<section>
			<div class="flex items-center gap-2 mb-3">
				<div class="w-0.5 h-4 bg-[--accent] rounded-full"></div>
				<h2 class="text-[15px] font-semibold text-[--text-primary]">Industry Trends</h2>
			</div>
			<div class="grid grid-cols-1 lg:grid-cols-2 gap-2">
				<div class="rounded-md bg-[--surface-1] p-3" style="box-shadow: var(--shadow-sm)">
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
		</section>
	{/if}

	<!-- Bank Failures link -->
	{#if data.failureCount > 0}
		<section>
			<div class="flex items-center gap-2 mb-3">
				<div class="w-0.5 h-4 bg-[--warning] rounded-full"></div>
				<h2 class="text-[15px] font-semibold text-[--text-primary]">Bank Failures</h2>
				<span class="text-[11px] text-[--text-tertiary]">{data.failureCount} total</span>
			</div>
			<a href="/industry/failures" class="inline-flex items-center gap-1 text-[13px] font-medium text-[--accent] hover:text-[--accent-hover]">
				View failure timeline and analysis &rarr;
			</a>
		</section>
	{/if}
</div>
