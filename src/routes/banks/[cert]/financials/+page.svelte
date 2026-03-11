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
		color: string | undefined,
		field: keyof Financial
	): { key: string; label: string; color?: string; data: Array<{ date: string; value: number | null }> } {
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

	// Chart configurations (colors removed, let chart component use design system palette)
	let keyRatiosSeries = $derived([
		buildSeries('roa', 'ROA', undefined, 'roa'),
		buildSeries('roe', 'ROE', undefined, 'roe'),
		buildSeries('nim', 'NIM', undefined, 'nimy')
	]);

	let balanceSheetSeries = $derived([
		buildSeries('assets', 'Total Assets', undefined, 'asset'),
		buildSeries('deposits', 'Total Deposits', undefined, 'dep'),
		buildSeries('equity', 'Equity Capital', undefined, 'eq')
	]);

	let assetQualitySeries = $derived([
		buildSeries('npl', 'NPL Ratio', undefined, 'nclnlsr'),
		buildSeries('reserve', 'Reserve Coverage', undefined, 'lnatresr')
	]);

	let capitalSeries = $derived([
		buildSeries('total_rbc', 'Total RBC', undefined, 'rbcrwaj'),
		buildSeries('tier1_rbc', 'Tier 1 RBC', undefined, 'rbc1rwaj'),
		buildSeries('leverage', 'Leverage Ratio', undefined, 'rbc1aaj')
	]);
</script>

<div class="space-y-5 pt-3">
	{#if financials.length === 0}
		<div class="rounded border border-[--border] bg-[--surface-1] py-24 text-center">
			<p class="text-[--text-tertiary] text-[15px]">No financial data available</p>
		</div>
	{:else}
		<!-- Date range selector -->
		<div class="flex items-center gap-2">
			<span class="text-[13px] text-[--text-tertiary]">Period:</span>
			<div class="flex gap-1">
				{#each rangeButtons as range}
					<button
						class="px-3 py-1 text-[13px] rounded font-medium transition-colors
							{selectedRange === range
								? 'bg-[--accent] text-white'
								: 'bg-[--surface-2] text-[--text-secondary] hover:bg-[--surface-3]'}"
						onclick={() => (selectedRange = range)}
					>
						{range}
					</button>
				{/each}
			</div>
			<span class="text-[11px] text-[--text-tertiary] ml-2 tabular-nums">
				{filtered.length} quarters
			</span>
		</div>

		<!-- Charts grid -->
		<div class="grid grid-cols-1 lg:grid-cols-2 gap-2">
			<!-- Key Ratios -->
			<section class="rounded border border-[--border] bg-[--surface-1] p-3">
				<h3 class="text-[13px] font-semibold text-[--text-primary] mb-2">Key Ratios</h3>
				<TimeSeriesChart series={keyRatiosSeries} yAxisFormat="percent" />
			</section>

			<!-- Balance Sheet -->
			<section class="rounded border border-[--border] bg-[--surface-1] p-3">
				<h3 class="text-[13px] font-semibold text-[--text-primary] mb-2">Balance Sheet</h3>
				<TimeSeriesChart series={balanceSheetSeries} yAxisFormat="currency" />
			</section>

			<!-- Asset Quality -->
			<section class="rounded border border-[--border] bg-[--surface-1] p-3">
				<h3 class="text-[13px] font-semibold text-[--text-primary] mb-2">Asset Quality</h3>
				<TimeSeriesChart series={assetQualitySeries} yAxisFormat="percent" />
			</section>

			<!-- Capital Adequacy -->
			<section class="rounded border border-[--border] bg-[--surface-1] p-3">
				<h3 class="text-[13px] font-semibold text-[--text-primary] mb-2">Capital Adequacy</h3>
				<TimeSeriesChart series={capitalSeries} yAxisFormat="percent" />
			</section>
		</div>
	{/if}
</div>
