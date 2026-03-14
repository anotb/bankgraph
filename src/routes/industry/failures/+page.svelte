<script lang="ts">
	import DataTable from '$lib/components/data/DataTable.svelte';
	import MetricCard from '$lib/components/data/MetricCard.svelte';
	import BarChart from '$lib/components/charts/BarChart.svelte';
	import { formatCurrency, formatNumber } from '$lib/utils/formatters.js';
	import { getMode } from '$lib/stores/mode.svelte.js';
	import type { Column } from '$lib/components/data/DataTable.svelte';

	let { data } = $props();
	let mode = $derived(getMode());

	let barChartData = $derived(
		data.yearlyData.map((d: { year: string; count: number }) => ({ label: d.year, value: d.count }))
	);

	/** Format a date string (may be MM/DD/YYYY, YYYY-MM-DD, or YYYYMMDD) for display */
	function formatFailDate(v: string | null): string {
		if (!v) return '\u2014';
		const d = new Date(v);
		if (!isNaN(d.getTime())) {
			return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
		}
		return v;
	}

	/** Format cost in millions (cost values are in thousands) */
	function formatCostMillions(v: number | null): string {
		if (v == null) return '\u2014';
		return `$${(v / 1000).toFixed(0)}M`;
	}

	/** Format cost summary values (in thousands) to human-readable */
	function formatCostSummary(v: number | null): string {
		if (v == null) return '\u2014';
		const dollars = v * 1000;
		const abs = Math.abs(dollars);
		if (abs >= 1e12) return `$${(abs / 1e12).toFixed(1)}T`;
		if (abs >= 1e9) return `$${(abs / 1e9).toFixed(1)}B`;
		if (abs >= 1e6) return `$${(abs / 1e6).toFixed(0)}M`;
		return `$${(abs / 1e3).toFixed(0)}K`;
	}

	let cost = $derived(data.costSummary);

	// Decade cost bar chart data
	let decadeBarData = $derived(
		cost.costByDecade
			.filter((d: { decade: string; cost: number; count: number }) => d.cost > 0)
			.map((d: { decade: string; cost: number; count: number }) => ({
				label: d.decade,
				value: Math.round(d.cost * 1000 / 1e9) // convert thousands to billions for display
			}))
	);

	const columns: Column[] = [
		{ key: 'name', label: 'Bank Name', sortable: true },
		{ key: 'state', label: 'State', sortable: true },
		{ key: 'fail_date', label: 'Failure Date', sortable: true, format: (v: string | null) => formatFailDate(v) },
		{ key: 'acquiring_institution', label: 'Acquirer' },
		{ key: 'total_assets', label: 'Assets', align: 'right', sortable: true, format: (v: number | null) => formatCurrency(v) },
		{ key: 'cost', label: 'Cost', align: 'right', sortable: true, format: (v: number | null) => formatCostMillions(v) }
	];

	let sortKey = $state('fail_date');
	let sortOrder: 'asc' | 'desc' = $state('desc');

	let sortedFailures = $derived.by(() => {
		const sorted = [...data.failures];
		sorted.sort((a: Record<string, any>, b: Record<string, any>) => {
			const aVal = a[sortKey];
			const bVal = b[sortKey];
			if (aVal == null && bVal == null) return 0;
			if (aVal == null) return 1;
			if (bVal == null) return -1;
			if (aVal < bVal) return sortOrder === 'asc' ? -1 : 1;
			if (aVal > bVal) return sortOrder === 'asc' ? 1 : -1;
			return 0;
		});
		return sorted;
	});

	function handleSort(key: string) {
		if (sortKey === key) {
			sortOrder = sortOrder === 'asc' ? 'desc' : 'asc';
		} else {
			sortKey = key;
			sortOrder = 'desc';
		}
	}
</script>

<svelte:head>
	<title>Bank Failures | Bank Data Explorer</title>
</svelte:head>

<div class="space-y-5">
	<a href="/industry" class="inline-flex items-center gap-1 text-[13px] text-[--text-tertiary] hover:text-[--text-primary] transition-colors">
		&larr; Industry Overview
	</a>

	<div>
		<h1 class="text-2xl font-semibold text-[--text-primary]">Bank Failures</h1>
		<p class="text-[13px] text-[--text-tertiary]">{formatNumber(data.failures.length)} failed institutions since records began</p>
	</div>

	<!-- Cost analysis summary -->
	{#if cost.failureCount > 0}
		<section>
			<div class="flex items-center gap-2 mb-3">
				<div class="w-0.5 h-4 bg-[--negative] rounded-full"></div>
				<h2 class="text-[15px] font-semibold text-[--text-primary]">Cost to FDIC</h2>
			</div>
			<div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-px bg-[--border-muted] rounded-md overflow-hidden" style="box-shadow: var(--shadow-sm)">
				<MetricCard
					compact
					label="Total Cost"
					value={formatCostSummary(cost.totalCost)}
					sublabel="{formatNumber(cost.failuresWithCost)} failures with cost data"
				/>
				<MetricCard
					compact
					label="Avg Cost per Failure"
					value={formatCostSummary(cost.avgCost)}
				/>
				<MetricCard
					compact
					label="Costliest Failure"
					value={cost.largestFailure ? formatCostSummary(cost.largestFailure.cost) : '\u2014'}
					sublabel={cost.largestFailure ? cost.largestFailure.name : undefined}
				/>
				<MetricCard
					compact
					label="Largest by Assets"
					value={cost.largestByAssets ? formatCurrency(cost.largestByAssets.total_assets) : '\u2014'}
					sublabel={cost.largestByAssets ? cost.largestByAssets.name : undefined}
				/>
			</div>
		</section>
	{/if}

	<!-- Charts row: failures by year + cost by decade -->
	<div class="grid grid-cols-1 lg:grid-cols-2 gap-3">
		<!-- Failures by year chart -->
		{#if barChartData.length > 0}
			<section>
				<div class="flex items-center gap-2 mb-3">
					<div class="w-0.5 h-4 bg-[--warning] rounded-full"></div>
					<h2 class="text-[15px] font-semibold text-[--text-primary]">Failures by Year</h2>
				</div>
				<div class="rounded-md bg-[--surface-1] p-3" style="box-shadow: var(--shadow-sm)">
					<BarChart data={barChartData} height="220px" color="var(--warning)" />
				</div>
			</section>
		{/if}

		<!-- Cost by decade chart -->
		{#if decadeBarData.length > 0}
			<section>
				<div class="flex items-center gap-2 mb-3">
					<div class="w-0.5 h-4 bg-[--negative] rounded-full"></div>
					<h2 class="text-[15px] font-semibold text-[--text-primary]">FDIC Cost by Decade</h2>
					<span class="text-[11px] text-[--text-tertiary]">(billions)</span>
				</div>
				<div class="rounded-md bg-[--surface-1] p-3" style="box-shadow: var(--shadow-sm)">
					<BarChart data={decadeBarData} height="220px" color="var(--negative)" />
				</div>
			</section>
		{/if}
	</div>

	<!-- Decade detail table -->
	{#if cost.costByDecade.length > 0}
		<section>
			<div class="flex items-center gap-2 mb-3">
				<div class="w-0.5 h-4 bg-[--warning] rounded-full"></div>
				<h2 class="text-[15px] font-semibold text-[--text-primary]">Failures by Decade</h2>
			</div>
			<div class="borderless-card overflow-x-auto">
				<table class="w-full text-[13px]">
					<thead>
						<tr class="bg-[--surface-3]">
							<th class="text-left px-3 py-2 text-[11px] font-medium text-[--text-tertiary] uppercase tracking-wider">Decade</th>
							<th class="text-right px-3 py-2 text-[11px] font-medium text-[--text-tertiary] uppercase tracking-wider">Failures</th>
							<th class="text-right px-3 py-2 text-[11px] font-medium text-[--text-tertiary] uppercase tracking-wider">Total Cost</th>
							<th class="text-right px-3 py-2 text-[11px] font-medium text-[--text-tertiary] uppercase tracking-wider">Avg Cost</th>
						</tr>
					</thead>
					<tbody class="divide-y divide-[--surface-2]">
						{#each cost.costByDecade as decade (decade.decade)}
							<tr class="hover:bg-[--accent-muted] transition-colors">
								<td class="px-3 py-2 font-medium text-[--text-primary]">{decade.decade}</td>
								<td class="px-3 py-2 text-right text-[--text-primary]" data-mono>{formatNumber(decade.count)}</td>
								<td class="px-3 py-2 text-right text-[--text-primary]" data-mono>{decade.cost > 0 ? formatCostSummary(decade.cost) : '\u2014'}</td>
								<td class="px-3 py-2 text-right text-[--text-secondary]" data-mono>{decade.cost > 0 && decade.count > 0 ? formatCostSummary(decade.cost / decade.count) : '\u2014'}</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		</section>
	{/if}

	<!-- Failures table -->
	<section>
		<div class="flex items-center gap-2 mb-3">
			<div class="w-0.5 h-4 bg-[--accent] rounded-full"></div>
			<h2 class="text-[15px] font-semibold text-[--text-primary]">All Failures</h2>
		</div>
		<DataTable
			{columns}
			data={sortedFailures}
			dense={mode === 'power'}
			currentSort={sortKey}
			currentOrder={sortOrder}
			onsort={handleSort}
		/>
	</section>
</div>
