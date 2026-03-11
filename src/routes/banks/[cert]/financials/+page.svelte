<script lang="ts">
	import TimeSeriesChart from '$lib/components/charts/TimeSeriesChart.svelte';
	import type { Financial } from '$lib/types';

	let { data } = $props();
	let financials = $derived(data.financials);

	type DateRange = '5Y' | '10Y' | '20Y' | 'All';
	let selectedRange: DateRange = $state('10Y');

	const rangeButtons: DateRange[] = ['5Y', '10Y', '20Y', 'All'];

	let cutoffDate = $derived.by(() => {
		if (selectedRange === 'All' || financials.length === 0) return null;
		const latest = financials[financials.length - 1].repdte;
		const latestYear = parseInt(latest.slice(0, 4), 10);
		const years = selectedRange === '5Y' ? 5 : selectedRange === '10Y' ? 10 : 20;
		const cutoffYear = latestYear - years;
		return `${cutoffYear}${latest.slice(4)}`;
	});

	let filtered = $derived.by(() => {
		if (!cutoffDate) return financials;
		return financials.filter((f) => f.repdte >= cutoffDate!);
	});

	function buildSeries(
		key: string,
		label: string,
		color: string,
		field: keyof Financial
	): { key: string; label: string; color: string; data: Array<{ date: string; value: number | null }> } {
		return {
			key,
			label,
			color,
			data: filtered.map((f) => ({
				date: f.repdte,
				value: f[field] as number | null
			}))
		};
	}

	// Chart configurations
	let keyRatiosSeries = $derived([
		buildSeries('roa', 'ROA', '#3b82f6', 'roa'),
		buildSeries('roe', 'ROE', '#22c55e', 'roe'),
		buildSeries('nim', 'NIM', '#f97316', 'nimy')
	]);

	let balanceSheetSeries = $derived([
		buildSeries('assets', 'Total Assets', '#6366f1', 'asset'),
		buildSeries('deposits', 'Total Deposits', '#14b8a6', 'dep'),
		buildSeries('equity', 'Equity Capital', '#f59e0b', 'eq')
	]);

	let assetQualitySeries = $derived([
		buildSeries('npl', 'NPL Ratio', '#ef4444', 'nclnlsr'),
		buildSeries('reserve', 'Reserve Coverage', '#22c55e', 'lnatresr')
	]);

	let capitalSeries = $derived([
		buildSeries('total_rbc', 'Total RBC', '#3b82f6', 'rbcrwaj'),
		buildSeries('tier1_rbc', 'Tier 1 RBC', '#a855f7', 'rbc1rwaj'),
		buildSeries('leverage', 'Leverage Ratio', '#06b6d4', 'rbc1aaj')
	]);
</script>

<div class="space-y-6 pt-4">
	{#if financials.length === 0}
		<div class="rounded-lg border border-gray-200 bg-white py-24 text-center">
			<p class="text-gray-500 text-lg">No financial data available</p>
		</div>
	{:else}
		<!-- Date range selector -->
		<div class="flex items-center gap-2">
			<span class="text-sm text-gray-500">Period:</span>
			<div class="flex gap-1">
				{#each rangeButtons as range}
					<button
						class="px-3 py-1 text-sm rounded-md font-medium transition-colors
							{selectedRange === range
								? 'bg-blue-600 text-white'
								: 'bg-gray-100 text-gray-600 hover:bg-gray-200'}"
						onclick={() => (selectedRange = range)}
					>
						{range}
					</button>
				{/each}
			</div>
			<span class="text-xs text-gray-400 ml-2">
				{filtered.length} quarters
			</span>
		</div>

		<!-- Charts grid -->
		<div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
			<!-- Key Ratios -->
			<section class="rounded-lg border border-gray-200 bg-white p-4">
				<h3 class="text-sm font-semibold text-gray-900 mb-2">Key Ratios</h3>
				<TimeSeriesChart series={keyRatiosSeries} yAxisFormat="percent" />
			</section>

			<!-- Balance Sheet -->
			<section class="rounded-lg border border-gray-200 bg-white p-4">
				<h3 class="text-sm font-semibold text-gray-900 mb-2">Balance Sheet</h3>
				<TimeSeriesChart series={balanceSheetSeries} yAxisFormat="currency" />
			</section>

			<!-- Asset Quality -->
			<section class="rounded-lg border border-gray-200 bg-white p-4">
				<h3 class="text-sm font-semibold text-gray-900 mb-2">Asset Quality</h3>
				<TimeSeriesChart series={assetQualitySeries} yAxisFormat="percent" />
			</section>

			<!-- Capital Adequacy -->
			<section class="rounded-lg border border-gray-200 bg-white p-4">
				<h3 class="text-sm font-semibold text-gray-900 mb-2">Capital Adequacy</h3>
				<TimeSeriesChart series={capitalSeries} yAxisFormat="percent" />
			</section>
		</div>
	{/if}
</div>
