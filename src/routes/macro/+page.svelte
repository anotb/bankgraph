<script lang="ts">
	import TimeSeriesChart from '$lib/components/charts/TimeSeriesChart.svelte';
	import EmptyState from '$lib/components/data/EmptyState.svelte';
	import DateRangePicker from '$lib/components/data/DateRangePicker.svelte';
	import InsightCard from '$lib/components/data/InsightCard.svelte';
	import SearchBar from '$lib/components/data/SearchBar.svelte';
	import { getMode } from '$lib/stores/mode.svelte.js';
	import type { MacroResponse, MacroDataPoint, CorrelationResult, Institution, Financial } from '$lib/types';

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
			correlation: null,
			metric: 'FEDFUNDS vs NIM'
		},
		{
			title: 'Unemployment vs Non-Performing Loans',
			description: 'Rising unemployment historically leads to increased loan delinquencies, with effects lagging 1-2 quarters.',
			correlation: null,
			metric: 'UNRATE vs NPL'
		},
		{
			title: 'Yield Curve Spread vs Bank Profitability',
			description: 'A steeper yield curve (positive 10Y-2Y spread) benefits bank ROA through maturity transformation.',
			correlation: null,
			metric: 'T10Y2Y vs ROA'
		},
		{
			title: '10Y Treasury vs Net Interest Margin',
			description: 'Long-term rates influence loan pricing. Higher 10Y yields generally support wider margins for banks with fixed-rate assets.',
			correlation: null,
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

	// --- Bank Overlay ---
	let selectedBank = $state<Institution | null>(null);
	let bankFinancials = $state<Financial[]>([]);
	let bankLoading = $state(false);
	let bankError = $state<string | null>(null);

	function handleBankSelect(bank: Institution) {
		selectedBank = bank;
		fetchBankFinancials(bank.cert);
	}

	function clearBank() {
		selectedBank = null;
		bankFinancials = [];
		bankError = null;
	}

	async function fetchBankFinancials(cert: number) {
		bankLoading = true;
		bankError = null;
		bankFinancials = [];
		try {
			const res = await fetch(`/api/v1/banks/${cert}/financials?fields=nimy,nclnlsr,roa&limit=200`);
			if (!res.ok) {
				bankError = 'Failed to load financial data';
				return;
			}
			const json = (await res.json()) as { data?: Financial[] };
			bankFinancials = json.data ?? [];
		} catch {
			bankError = 'Failed to load financial data';
		} finally {
			bankLoading = false;
		}
	}

	/** Convert bank financials to chart data for a given field */
	function bankMetricToChartData(
		field: keyof Financial
	): Array<{ date: string; value: number | null }> {
		return bankFinancials
			.filter((f) => {
				const d = f.repdte;
				if (!dateRange.from || !dateRange.to) return true;
				return d >= dateRange.from && d <= dateRange.to;
			})
			.map((f) => ({
				date: f.repdte,
				value: f[field] as number | null
			}));
	}

	/** Overlay chart configs: FRED series + bank metric on dual y-axes */
	interface OverlayConfig {
		title: string;
		fredKey: string;
		fredLabel: string;
		fredFormat: 'percent' | 'number';
		bankField: keyof Financial;
		bankLabel: string;
		bankFormat: 'percent' | 'number';
		bankColor: string;
		description: string;
	}

	const OVERLAY_CONFIGS: OverlayConfig[] = [
		{
			title: 'Fed Funds Rate vs Net Interest Margin',
			fredKey: 'FEDFUNDS',
			fredLabel: 'Fed Funds Rate',
			fredFormat: 'percent',
			bankField: 'nimy',
			bankLabel: 'NIM',
			bankFormat: 'percent',
			bankColor: '#e67e22',
			description: 'Rate hikes tend to widen NIM as loan repricing outpaces deposit costs.'
		},
		{
			title: 'Unemployment Rate vs Non-Performing Loans',
			fredKey: 'UNRATE',
			fredLabel: 'Unemployment Rate',
			fredFormat: 'percent',
			bankField: 'nclnlsr',
			bankLabel: 'NPL Ratio',
			bankFormat: 'percent',
			bankColor: '#e74c3c',
			description: 'Job losses drive loan defaults, typically with a 1-2 quarter lag.'
		},
		{
			title: 'GDP Growth vs Return on Assets',
			fredKey: 'GDP',
			fredLabel: 'GDP (billions)',
			fredFormat: 'number',
			bankField: 'roa',
			bankLabel: 'ROA',
			bankFormat: 'percent',
			bankColor: '#2ecc71',
			description: 'Economic expansion lifts bank earnings through higher loan demand and lower defaults.'
		}
	];

	/** Build the dual-axis series array for a given overlay config */
	function buildOverlaySeries(config: OverlayConfig) {
		const fredData = series[config.fredKey];
		if (!fredData || !fredData.data.length) return null;

		const bankData = bankMetricToChartData(config.bankField);
		if (bankData.length === 0) return null;

		const fredSeries = buildSeries(fredData, config.fredKey.toLowerCase(), config.fredLabel);
		if (!fredSeries) return null;

		return [
			fredSeries,
			{
				key: `bank_${String(config.bankField)}`,
				label: `${selectedBank!.name} ${config.bankLabel}`,
				color: config.bankColor,
				data: bankData,
				yAxisIndex: 1
			}
		];
	}
</script>

<svelte:head>
	<title>Macro | Bank Data Explorer</title>
	<meta name="description" content="Federal Reserve economic data, interest rates, treasury yields, and banking sector indicators." />
	<meta property="og:title" content="Macro | Bank Data Explorer" />
	<meta property="og:description" content="Federal Reserve economic data, interest rates, treasury yields, and banking sector indicators." />
</svelte:head>

<div class={isPower ? 'space-y-3' : 'space-y-5'}>
	<!-- Header -->
	<div class="flex items-center justify-between gap-4 flex-wrap">
		<div>
			<h1 class="text-2xl font-semibold text-[--text-primary]">Macro Environment</h1>
			<p class="text-[13px] text-[--text-tertiary]">Federal Reserve economic data and banking sector indicators</p>
		</div>
		<!-- Bank Overlay Search -->
		<div class="flex items-center gap-2 shrink-0">
			{#if selectedBank}
				<div class="flex items-center gap-1.5 rounded-md border border-[--border-muted] bg-[--surface-1] px-2.5 py-1 text-[12px]" style="box-shadow: var(--shadow-xs)">
					<span class="text-[--text-secondary]">Overlay:</span>
					<span class="font-medium text-[--text-primary]">{selectedBank.name}</span>
					<button
						type="button"
						onclick={clearBank}
						aria-label="Remove bank overlay"
						class="ml-1 text-[--text-disabled] hover:text-[--text-secondary] transition-colors"
					>
						<svg class="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
						</svg>
					</button>
				</div>
			{:else}
				<div class="w-56">
					<SearchBar
						compact
						autocomplete
						placeholder="Overlay a bank..."
						onsearch={() => {}}
						onselect={handleBankSelect}
					/>
				</div>
			{/if}
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

		<!-- Bank vs Macro Overlay -->
		{#if selectedBank}
			<section>
				<div class="flex items-center gap-2 mb-1">
					<div class="w-0.5 h-4 bg-[--accent] rounded-full"></div>
					<h2 class="text-[15px] font-semibold text-[--text-primary]">Bank vs Macro</h2>
					<span class="text-[12px] text-[--text-tertiary]">{selectedBank.name}</span>
				</div>
				<p class="text-[12px] text-[--text-tertiary] mb-3 ml-2.5">
					Bank metrics (right axis) overlaid on macro indicators (left axis). Quarterly bank data may be sparser than daily/monthly FRED series.
				</p>

				{#if bankLoading}
					<div class="flex items-center justify-center py-8 text-[13px] text-[--text-tertiary]">
						Loading financial data...
					</div>
				{:else if bankError}
					<div class="flex items-center justify-center py-8 text-[13px] text-[--text-tertiary]">
						{bankError}
					</div>
				{:else if bankFinancials.length === 0}
					<div class="flex items-center justify-center py-8 text-[13px] text-[--text-tertiary]">
						No financial data available for this bank.
					</div>
				{:else}
					<div class="grid grid-cols-1 lg:grid-cols-2 gap-2">
						{#each OVERLAY_CONFIGS as config}
							{@const overlaySeries = buildOverlaySeries(config)}
							{#if overlaySeries}
								<div class="rounded-md bg-[--surface-1] p-3" style="box-shadow: var(--shadow-sm)">
									<h3 class="text-[13px] font-semibold text-[--text-primary] mb-0.5">{config.title}</h3>
									<p class="text-[11px] text-[--text-tertiary] mb-2">{config.description}</p>
									<TimeSeriesChart
										series={overlaySeries}
										yAxisFormat={config.fredFormat}
										dualAxis={{ format: config.bankFormat }}
										height="280px"
										markAreas={recessionBands}
									/>
								</div>
							{/if}
						{/each}
					</div>
				{/if}
			</section>
		{/if}

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
						<span class="font-semibold">General relationships only.</span> These are general economic relationships, not computed from your data. Sync FRED data to see actual correlations.
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
