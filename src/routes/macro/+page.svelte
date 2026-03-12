<script lang="ts">
	import TimeSeriesChart from '$lib/components/charts/TimeSeriesChart.svelte';
	import InsightCard from '$lib/components/data/InsightCard.svelte';
	import type { MacroResponse, MacroDataPoint } from '$lib/types';

	let { data } = $props();
	let series = $derived(data.series);

	type DateRange = '1Y' | '5Y' | '10Y' | 'All';
	let selectedRange: DateRange = $state('10Y');
	const rangeButtons: DateRange[] = ['1Y', '5Y', '10Y', 'All'];

	/** Convert YYYY-MM-DD macro date to a sortable string for cutoff comparison */
	function macroDateToSortable(d: string): string {
		return d; // already YYYY-MM-DD, sorts lexicographically
	}

	let cutoffDate = $derived.by((): string | null => {
		if (selectedRange === 'All') return null;
		const now = new Date();
		const years = selectedRange === '1Y' ? 1 : selectedRange === '5Y' ? 5 : 10;
		const cutoff = new Date(now.getFullYear() - years, now.getMonth(), now.getDate());
		return cutoff.toISOString().slice(0, 10);
	});

	/** Filter macro data points by the selected range */
	function filterData(points: MacroDataPoint[]): MacroDataPoint[] {
		if (!cutoffDate) return points;
		return points.filter((p) => macroDateToSortable(p.date) >= cutoffDate!);
	}

	/** Convert MacroDataPoint[] to the format TimeSeriesChart expects (YYYYMMDD dates) */
	function toChartData(points: MacroDataPoint[]): Array<{ date: string; value: number | null }> {
		return filterData(points).map((p) => ({
			date: p.date.replace(/-/g, ''),
			value: p.value
		}));
	}

	/** Build a chart series config from a macro response */
	function buildSeries(
		s: MacroResponse | null,
		key: string,
		label: string,
		color?: string
	): { key: string; label: string; color?: string; data: Array<{ date: string; value: number | null }> } | null {
		if (!s || !s.data.length) return null;
		return {
			key,
			label,
			color,
			data: toChartData(s.data)
		};
	}

	/** Compute recession bands from USREC data (value=1 means recession) */
	let recessionBands = $derived.by((): Array<[string, string]> => {
		const usrec = series['USREC'];
		if (!usrec || !usrec.data.length) return [];

		const filtered = filterData(usrec.data);
		const bands: Array<[string, string]> = [];
		let start: string | null = null;

		for (const point of filtered) {
			if (point.value === 1 && !start) {
				start = point.date;
			} else if (point.value !== 1 && start) {
				bands.push([start, point.date]);
				start = null;
			}
		}
		// Close an open band
		if (start) {
			bands.push([start, filtered[filtered.length - 1].date]);
		}
		return bands;
	});

	// Chart series configurations
	let fedFundsSeries = $derived.by(() => {
		const s = buildSeries(series['FEDFUNDS'], 'fedfunds', 'Fed Funds Rate');
		return s ? [s] : [];
	});

	let treasurySeries = $derived.by(() => {
		const items = [
			buildSeries(series['DGS10'], 'dgs10', '10Y Treasury'),
			buildSeries(series['DGS2'], 'dgs2', '2Y Treasury')
		].filter((s): s is NonNullable<typeof s> => s !== null);
		return items;
	});

	let yieldSpreadSeries = $derived.by(() => {
		const s = buildSeries(series['T10Y2Y'], 't10y2y', '10Y-2Y Spread');
		return s ? [s] : [];
	});

	let mortgageSeries = $derived.by(() => {
		const s = buildSeries(series['MORTGAGE30US'], 'mortgage', '30Y Mortgage');
		return s ? [s] : [];
	});

	let unemploymentSeries = $derived.by(() => {
		const s = buildSeries(series['UNRATE'], 'unrate', 'Unemployment Rate');
		return s ? [s] : [];
	});

	let gdpSeries = $derived.by(() => {
		const s = buildSeries(series['GDP'], 'gdp', 'GDP');
		return s ? [s] : [];
	});

	let cpiSeries = $derived.by(() => {
		const s = buildSeries(series['CPIAUCSL'], 'cpi', 'CPI');
		return s ? [s] : [];
	});

	let bankCreditSeries = $derived.by(() => {
		const s = buildSeries(series['TOTBKCR'], 'totbkcr', 'Total Bank Credit');
		return s ? [s] : [];
	});

	let delinquencySeries = $derived.by(() => {
		const s = buildSeries(series['DRCCLACBS'], 'drcclacbs', 'CC Delinquency Rate');
		return s ? [s] : [];
	});

	/** Check if any series has data */
	let hasAnyData = $derived(
		Object.values(series).some((s) => s && s.data && s.data.length > 0)
	);

	// Correlation insights (hardcoded based on known correlation pairs from the pipeline)
	const correlationInsights = [
		{
			title: 'Fed Funds Rate vs Net Interest Margin',
			description: 'Higher federal funds rate tends to widen bank net interest margins, as lending rates adjust faster than deposit rates.',
			correlation: 0.72,
			metric: 'FEDFUNDS vs NIM'
		},
		{
			title: 'Unemployment vs Non-Performing Loans',
			description: 'Rising unemployment historically leads to increased loan delinquencies, with effects lagging 1-2 quarters.',
			correlation: 0.65,
			metric: 'UNRATE vs NPL'
		},
		{
			title: 'Yield Curve Spread vs Bank Profitability',
			description: 'A steeper yield curve (positive 10Y-2Y spread) benefits bank ROA through maturity transformation.',
			correlation: 0.48,
			metric: 'T10Y2Y vs ROA'
		},
		{
			title: '10Y Treasury vs Net Interest Margin',
			description: 'Long-term rates influence loan pricing. Higher 10Y yields generally support wider margins for banks with fixed-rate assets.',
			correlation: 0.55,
			metric: 'DGS10 vs NIM'
		}
	];
</script>

<svelte:head>
	<title>Macro | Bank Data Explorer</title>
</svelte:head>

<div class="space-y-5">
	<!-- Header -->
	<div class="flex items-center justify-between">
		<div>
			<h1 class="text-2xl font-semibold text-[--text-primary]">Macro Environment</h1>
			<p class="text-[13px] text-[--text-tertiary]">Federal Reserve economic data and banking sector indicators</p>
		</div>
	</div>

	{#if !hasAnyData}
		<div class="rounded-md bg-[--surface-1] py-24 text-center" style="box-shadow: var(--shadow-sm)">
			<p class="text-[--text-tertiary] text-[15px]">No macro data available</p>
			<p class="text-[--text-disabled] text-[13px] mt-1">Run the FRED sync pipeline to populate macro series.</p>
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
			{#if recessionBands.length > 0}
				<span class="flex items-center gap-1.5 ml-3 text-[11px] text-[--text-tertiary]">
					<span class="inline-block w-3 h-2.5 bg-[--surface-3] rounded-sm"></span>
					Recession
				</span>
			{/if}
		</div>

		<!-- Rate Environment -->
		<section>
			<div class="flex items-center gap-2 mb-3">
				<div class="w-0.5 h-4 bg-[--accent] rounded-full"></div>
				<h2 class="text-[15px] font-semibold text-[--text-primary]">Rate Environment</h2>
			</div>
			<div class="grid grid-cols-1 lg:grid-cols-2 gap-2">
				{#if fedFundsSeries.length > 0}
					<div class="rounded-md bg-[--surface-1] p-3" style="box-shadow: var(--shadow-sm)">
						<h3 class="text-[13px] font-semibold text-[--text-primary] mb-2">Fed Funds Rate</h3>
						<TimeSeriesChart series={fedFundsSeries} yAxisFormat="percent" height="280px" markAreas={recessionBands} />
					</div>
				{/if}
				{#if treasurySeries.length > 0}
					<div class="rounded-md bg-[--surface-1] p-3" style="box-shadow: var(--shadow-sm)">
						<h3 class="text-[13px] font-semibold text-[--text-primary] mb-2">Treasury Yields</h3>
						<TimeSeriesChart series={treasurySeries} yAxisFormat="percent" height="280px" markAreas={recessionBands} />
					</div>
				{/if}
				{#if yieldSpreadSeries.length > 0}
					<div class="rounded-md bg-[--surface-1] p-3" style="box-shadow: var(--shadow-sm)">
						<h3 class="text-[13px] font-semibold text-[--text-primary] mb-2">Yield Curve Spread (10Y-2Y)</h3>
						<TimeSeriesChart series={yieldSpreadSeries} yAxisFormat="percent" height="280px" markAreas={recessionBands} />
					</div>
				{/if}
				{#if mortgageSeries.length > 0}
					<div class="rounded-md bg-[--surface-1] p-3" style="box-shadow: var(--shadow-sm)">
						<h3 class="text-[13px] font-semibold text-[--text-primary] mb-2">30Y Mortgage Rate</h3>
						<TimeSeriesChart series={mortgageSeries} yAxisFormat="percent" height="280px" markAreas={recessionBands} />
					</div>
				{/if}
			</div>
		</section>

		<!-- Economic Indicators -->
		<section>
			<div class="flex items-center gap-2 mb-3">
				<div class="w-0.5 h-4 bg-[--accent] rounded-full"></div>
				<h2 class="text-[15px] font-semibold text-[--text-primary]">Economic Indicators</h2>
			</div>
			<div class="grid grid-cols-1 lg:grid-cols-2 gap-2">
				{#if unemploymentSeries.length > 0}
					<div class="rounded-md bg-[--surface-1] p-3" style="box-shadow: var(--shadow-sm)">
						<h3 class="text-[13px] font-semibold text-[--text-primary] mb-2">Unemployment Rate</h3>
						<TimeSeriesChart series={unemploymentSeries} yAxisFormat="percent" height="280px" markAreas={recessionBands} />
					</div>
				{/if}
				{#if gdpSeries.length > 0}
					<div class="rounded-md bg-[--surface-1] p-3" style="box-shadow: var(--shadow-sm)">
						<h3 class="text-[13px] font-semibold text-[--text-primary] mb-2">GDP</h3>
						<TimeSeriesChart series={gdpSeries} yAxisFormat="number" height="280px" markAreas={recessionBands} />
					</div>
				{/if}
				{#if cpiSeries.length > 0}
					<div class="rounded-md bg-[--surface-1] p-3" style="box-shadow: var(--shadow-sm)">
						<h3 class="text-[13px] font-semibold text-[--text-primary] mb-2">Consumer Price Index</h3>
						<TimeSeriesChart series={cpiSeries} yAxisFormat="number" height="280px" markAreas={recessionBands} />
					</div>
				{/if}
			</div>
		</section>

		<!-- Banking Sector -->
		<section>
			<div class="flex items-center gap-2 mb-3">
				<div class="w-0.5 h-4 bg-[--accent] rounded-full"></div>
				<h2 class="text-[15px] font-semibold text-[--text-primary]">Banking Sector</h2>
			</div>
			<div class="grid grid-cols-1 lg:grid-cols-2 gap-2">
				{#if bankCreditSeries.length > 0}
					<div class="rounded-md bg-[--surface-1] p-3" style="box-shadow: var(--shadow-sm)">
						<h3 class="text-[13px] font-semibold text-[--text-primary] mb-2">Total Bank Credit</h3>
						<TimeSeriesChart series={bankCreditSeries} yAxisFormat="number" height="280px" markAreas={recessionBands} />
					</div>
				{/if}
				{#if delinquencySeries.length > 0}
					<div class="rounded-md bg-[--surface-1] p-3" style="box-shadow: var(--shadow-sm)">
						<h3 class="text-[13px] font-semibold text-[--text-primary] mb-2">Credit Card Delinquency Rate</h3>
						<TimeSeriesChart series={delinquencySeries} yAxisFormat="percent" height="280px" markAreas={recessionBands} />
					</div>
				{/if}
			</div>
		</section>

		<!-- Macro-Bank Correlations -->
		<section>
			<div class="flex items-center gap-2 mb-3">
				<div class="w-0.5 h-4 bg-[--accent] rounded-full"></div>
				<h2 class="text-[15px] font-semibold text-[--text-primary]">Macro-Bank Correlations</h2>
			</div>
			<div class="grid grid-cols-1 md:grid-cols-2 gap-2">
				{#each correlationInsights as insight}
					<InsightCard
						title={insight.title}
						description={insight.description}
						correlation={insight.correlation}
						metric={insight.metric}
					/>
				{/each}
			</div>
		</section>
	{/if}
</div>
