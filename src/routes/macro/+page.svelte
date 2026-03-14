<script lang="ts">
	import TimeSeriesChart from '$lib/components/charts/TimeSeriesChart.svelte';
	import EmptyState from '$lib/components/data/EmptyState.svelte';
	import DateRangePicker from '$lib/components/data/DateRangePicker.svelte';
	import InsightCard from '$lib/components/data/InsightCard.svelte';
	import { getMode } from '$lib/stores/mode.svelte.js';
	import type { MacroResponse, MacroDataPoint, CorrelationResult } from '$lib/types';

	let { data } = $props();
	let mode = $derived(getMode());
	let isPower = $derived(mode === 'power');
	let series = $derived(data.series);
	let dbCorrelations = $derived(data.correlations ?? []);

	/** Convert YYYY-MM-DD to YYYYMMDD */
	function toYMD(d: string): string {
		return d.replace(/-/g, '');
	}

	// Compute available date range across all macro series (as YYYYMMDD)
	let availableRange = $derived.by(() => {
		let earliest = '';
		let latest = '';
		for (const s of Object.values(series)) {
			if (!s || !s.data || s.data.length === 0) continue;
			const first = toYMD(s.data[0].date);
			const last = toYMD(s.data[s.data.length - 1].date);
			if (!earliest || first < earliest) earliest = first;
			if (!latest || last > latest) latest = last;
		}
		if (!earliest || !latest) return undefined;
		return { earliest, latest };
	});

	// Date range state (YYYYMMDD from/to)
	let dateRange = $state<{ from: string; to: string }>({ from: '', to: '' });

	// Initialize date range to 10Y when data first arrives
	let dateRangeInitialized = false;
	$effect(() => {
		if (dateRangeInitialized || !availableRange) return;
		dateRangeInitialized = true;
		const latest = availableRange.latest;
		const latestYear = parseInt(latest.slice(0, 4), 10);
		const from = `${latestYear - 10}${latest.slice(4)}`;
		dateRange = {
			from: from < availableRange.earliest ? availableRange.earliest : from,
			to: latest
		};
	});

	/** Filter macro data points by the selected date range */
	function filterData(points: MacroDataPoint[]): MacroDataPoint[] {
		if (!dateRange.from || !dateRange.to) return points;
		return points.filter((p) => {
			const d = toYMD(p.date);
			return d >= dateRange.from && d <= dateRange.to;
		});
	}

	/** Convert MacroDataPoint[] to the format TimeSeriesChart expects (YYYYMMDD dates) */
	function toChartData(points: MacroDataPoint[]): Array<{ date: string; value: number | null }> {
		return filterData(points).map((p) => ({
			date: toYMD(p.date),
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

	/** Human-readable names for FRED series and bank metrics */
	const SERIES_LABELS: Record<string, string> = {
		FEDFUNDS: 'Fed Funds Rate',
		UNRATE: 'Unemployment',
		T10Y2Y: 'Yield Curve Spread',
		DGS10: '10Y Treasury',
		DGS2: '2Y Treasury',
		MORTGAGE30US: '30Y Mortgage',
		GDP: 'GDP',
		CPIAUCSL: 'CPI',
		TOTBKCR: 'Bank Credit',
		DRCCLACBS: 'CC Delinquency',
		median_nim: 'Net Interest Margin',
		median_npl: 'Non-Performing Loans',
		median_roa: 'Return on Assets',
		median_roe: 'Return on Equity'
	};

	/** Short descriptions for known correlation pairs */
	const PAIR_DESCRIPTIONS: Record<string, string> = {
		'FEDFUNDS:median_nim': 'Higher federal funds rate tends to widen bank net interest margins, as lending rates adjust faster than deposit rates.',
		'UNRATE:median_npl': 'Rising unemployment historically leads to increased loan delinquencies, with effects lagging 1-2 quarters.',
		'T10Y2Y:median_roa': 'A steeper yield curve (positive 10Y-2Y spread) benefits bank ROA through maturity transformation.',
		'DGS10:median_nim': 'Long-term rates influence loan pricing. Higher 10Y yields generally support wider margins for banks with fixed-rate assets.'
	};

	function labelFor(key: string): string {
		return SERIES_LABELS[key] ?? key;
	}

	function descriptionFor(metricA: string, metricB: string, corr: number): string {
		const known = PAIR_DESCRIPTIONS[`${metricA}:${metricB}`];
		if (known) return known;
		const dir = corr > 0 ? 'positive' : 'negative';
		return `${labelFor(metricA)} shows a ${dir} correlation with ${labelFor(metricB)}.`;
	}

	/** Map DB correlation rows to InsightCard-compatible objects */
	function mapCorrelation(row: CorrelationResult): CorrelationInsight {
		return {
			title: `${labelFor(row.metric_a)} vs ${labelFor(row.metric_b)}`,
			description: descriptionFor(row.metric_a, row.metric_b, row.correlation ?? 0),
			correlation: row.correlation,
			metric: `${row.metric_a} vs ${row.metric_b}`,
			lagQuarters: row.lag_quarters,
			periodStart: row.period_start
		};
	}

	interface CorrelationInsight {
		title: string;
		description: string;
		correlation: number | null;
		metric: string;
		lagQuarters?: number | null;
		periodStart?: string | null;
	}

	// Hardcoded fallback when the correlations pipeline hasn't run yet
	// (requires agg_industry data which may not be populated)
	const FALLBACK_INSIGHTS: CorrelationInsight[] = [
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

	/** Use DB correlations if available; pick the best lag per pair (highest |r|), else fallback */
	let correlationInsights = $derived.by(() => {
		if (dbCorrelations.length === 0) return FALLBACK_INSIGHTS;

		// For each (metric_a, metric_b) pair, pick the lag with the strongest |correlation|
		const bestByPair = new Map<string, CorrelationResult>();
		for (const row of dbCorrelations) {
			const key = `${row.metric_a}:${row.metric_b}`;
			const existing = bestByPair.get(key);
			if (!existing || Math.abs(row.correlation ?? 0) > Math.abs(existing.correlation ?? 0)) {
				bestByPair.set(key, row);
			}
		}

		// Sort by |correlation| descending
		const sorted = [...bestByPair.values()].sort(
			(a, b) => Math.abs(b.correlation ?? 0) - Math.abs(a.correlation ?? 0)
		);

		return sorted.map(mapCorrelation);
	});

	let usingFallback = $derived(dbCorrelations.length === 0);
</script>

<svelte:head>
	<title>Macro | Bank Data Explorer</title>
	<meta name="description" content="Federal Reserve economic data, interest rates, treasury yields, and banking sector indicators." />
	<meta property="og:title" content="Macro | Bank Data Explorer" />
	<meta property="og:description" content="Federal Reserve economic data, interest rates, treasury yields, and banking sector indicators." />
</svelte:head>

<div class={isPower ? 'space-y-3' : 'space-y-5'}>
	<!-- Header -->
	<div class="flex items-center justify-between">
		<div>
			<h1 class="text-2xl font-semibold text-[--text-primary]">Macro Environment</h1>
			<p class="text-[13px] text-[--text-tertiary]">Federal Reserve economic data and banking sector indicators</p>
		</div>
	</div>

	{#if !hasAnyData}
		<EmptyState
			icon="chart"
			title="No macro data available"
			message="Run the FRED sync pipeline to populate macro economic series."
		/>
	{:else}
		<!-- Date range selector -->
		<div class="flex items-center gap-2 flex-wrap">
			<DateRangePicker bind:value={dateRange} {availableRange} />
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
						<TimeSeriesChart series={fedFundsSeries} yAxisFormat="percent" height="280px" markAreas={recessionBands} showMovingAverage={isPower} />
					</div>
				{/if}
				{#if treasurySeries.length > 0}
					<div class="rounded-md bg-[--surface-1] p-3" style="box-shadow: var(--shadow-sm)">
						<h3 class="text-[13px] font-semibold text-[--text-primary] mb-2">Treasury Yields</h3>
						<TimeSeriesChart series={treasurySeries} yAxisFormat="percent" height="280px" markAreas={recessionBands} showMovingAverage={isPower} />
					</div>
				{/if}
				{#if yieldSpreadSeries.length > 0}
					<div class="rounded-md bg-[--surface-1] p-3" style="box-shadow: var(--shadow-sm)">
						<h3 class="text-[13px] font-semibold text-[--text-primary] mb-2">Yield Curve Spread (10Y-2Y)</h3>
						<TimeSeriesChart series={yieldSpreadSeries} yAxisFormat="percent" height="280px" markAreas={recessionBands} showMovingAverage={isPower} />
					</div>
				{/if}
				{#if mortgageSeries.length > 0}
					<div class="rounded-md bg-[--surface-1] p-3" style="box-shadow: var(--shadow-sm)">
						<h3 class="text-[13px] font-semibold text-[--text-primary] mb-2">30Y Mortgage Rate</h3>
						<TimeSeriesChart series={mortgageSeries} yAxisFormat="percent" height="280px" markAreas={recessionBands} showMovingAverage={isPower} />
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
						<TimeSeriesChart series={unemploymentSeries} yAxisFormat="percent" height="280px" markAreas={recessionBands} showMovingAverage={isPower} />
					</div>
				{/if}
				{#if gdpSeries.length > 0}
					<div class="rounded-md bg-[--surface-1] p-3" style="box-shadow: var(--shadow-sm)">
						<h3 class="text-[13px] font-semibold text-[--text-primary] mb-2">GDP</h3>
						<TimeSeriesChart series={gdpSeries} yAxisFormat="number" height="280px" markAreas={recessionBands} showMovingAverage={isPower} />
					</div>
				{/if}
				{#if cpiSeries.length > 0}
					<div class="rounded-md bg-[--surface-1] p-3" style="box-shadow: var(--shadow-sm)">
						<h3 class="text-[13px] font-semibold text-[--text-primary] mb-2">Consumer Price Index</h3>
						<TimeSeriesChart series={cpiSeries} yAxisFormat="number" height="280px" markAreas={recessionBands} showMovingAverage={isPower} />
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
						<TimeSeriesChart series={bankCreditSeries} yAxisFormat="number" height="280px" markAreas={recessionBands} showMovingAverage={isPower} />
					</div>
				{/if}
				{#if delinquencySeries.length > 0}
					<div class="rounded-md bg-[--surface-1] p-3" style="box-shadow: var(--shadow-sm)">
						<h3 class="text-[13px] font-semibold text-[--text-primary] mb-2">Credit Card Delinquency Rate</h3>
						<TimeSeriesChart series={delinquencySeries} yAxisFormat="percent" height="280px" markAreas={recessionBands} showMovingAverage={isPower} />
					</div>
				{/if}
			</div>
		</section>

		<!-- Macro-Bank Correlations -->
		<section>
			<div class="flex items-center gap-2 mb-1">
				<div class="w-0.5 h-4 bg-[--accent] rounded-full"></div>
				<h2 class="text-[15px] font-semibold text-[--text-primary]">Macro-Bank Correlations</h2>
			</div>
			<p class="text-[12px] text-[--text-tertiary] mb-3 ml-2.5">
				Pearson correlation between FRED macro indicators and industry-aggregate bank metrics over overlapping quarters.
			</p>
			{#if usingFallback}
				<div class="flex items-start gap-2.5 rounded-md bg-[--warning-muted] px-3 py-2.5 mb-3">
					<svg class="shrink-0 mt-0.5 text-[--warning]" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
						<circle cx="12" cy="12" r="10" />
						<line x1="12" y1="8" x2="12" y2="12" />
						<line x1="12" y1="16" x2="12.01" y2="16" />
					</svg>
					<p class="text-[12px] text-[--text-secondary] leading-snug">
						<span class="font-semibold">Estimated values.</span> These correlations are representative approximations, not computed from your data. Run the correlations pipeline to replace them with real calculations.
					</p>
				</div>
			{/if}
			<div class="grid grid-cols-1 md:grid-cols-2 gap-2">
				{#each correlationInsights as insight}
					<InsightCard
						title={insight.title}
						description={insight.description}
						correlation={insight.correlation}
						metric={insight.metric}
						lagQuarters={insight.lagQuarters ?? null}
						periodStart={insight.periodStart ?? null}
					/>
				{/each}
			</div>
		</section>
	{/if}
</div>
