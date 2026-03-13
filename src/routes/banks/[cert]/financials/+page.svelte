<script lang="ts">
	import TimeSeriesChart from '$lib/components/charts/TimeSeriesChart.svelte';
	import EmptyState from '$lib/components/data/EmptyState.svelte';
	import ExportButton from '$lib/components/data/ExportButton.svelte';
	import DateRangePicker from '$lib/components/data/DateRangePicker.svelte';
	import FieldPicker from '$lib/components/data/FieldPicker.svelte';
	import PivotTable from '$lib/components/data/PivotTable.svelte';
	import { getFieldLabel } from '$lib/utils/field-meta.js';
	import { getMode } from '$lib/stores/mode.svelte.js';
	import type { Financial } from '$lib/types';

	let { data } = $props();
	let financials = $derived(data.financials);
	let cert = $derived(data.bank.cert);
	let mode = $derived(getMode());

	// Available date range from server data
	let availableRange = $derived.by(() => {
		if (financials.length === 0) return undefined;
		return {
			earliest: financials[0].repdte,
			latest: financials[financials.length - 1].repdte
		};
	});

	// Date range value (from/to as YYYYMMDD)
	let dateRange = $state({ from: '', to: '' });

	// Initialize the range once data is available (default to 10Y)
	let initialized = false;
	$effect(() => {
		if (!initialized && availableRange) {
			initialized = true;
			const latest = availableRange.latest;
			const latestYear = parseInt(latest.slice(0, 4), 10);
			const from = `${latestYear - 10}${latest.slice(4)}`;
			dateRange = {
				from: from < availableRange.earliest ? availableRange.earliest : from,
				to: latest
			};
		}
	});

	let filtered = $derived.by(() => {
		if (!dateRange.from || !dateRange.to) return financials;
		return financials.filter((f) => f.repdte >= dateRange.from && f.repdte <= dateRange.to);
	});

	// Export URL with date range params
	let exportBaseUrl = $derived.by(() => {
		let url = `/api/v1/banks/${cert}/financials`;
		const params: string[] = [];
		if (dateRange.from) params.push(`from=${dateRange.from}`);
		if (dateRange.to) params.push(`to=${dateRange.to}`);
		if (params.length > 0) url += '?' + params.join('&');
		return url;
	});

	// Custom fields for FieldPicker + custom chart
	let customFields = $state<string[]>(['roa', 'roe', 'nimy']);

	function buildSeries(
		key: string,
		label: string,
		color: string | undefined,
		field: keyof Financial
	): {
		key: string;
		label: string;
		color?: string;
		data: Array<{ date: string; value: number | null }>;
	} {
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

	// Custom chart series from FieldPicker selections
	let customSeries = $derived(
		customFields.map((field) =>
			buildSeries(
				field,
				getFieldLabel(field).replace(/\s*\(.*\)/, ''),
				undefined,
				field as keyof Financial
			)
		)
	);
</script>

<div class="space-y-5 pt-3">
	{#if financials.length === 0}
		<EmptyState
			icon="chart"
			title="No financial data available"
			message="Run the backfill pipeline to populate quarterly financials for this institution."
		/>
	{:else}
		<!-- Controls row: DateRangePicker + ExportButton + FieldPicker -->
		<div class="flex items-center gap-3 flex-wrap">
			<DateRangePicker bind:value={dateRange} {availableRange} />
			<span class="text-[11px] text-[--text-tertiary] data-mono">
				{filtered.length} quarters
			</span>
			<div class="ml-auto flex items-center gap-2">
				<FieldPicker bind:selected={customFields} />
				<ExportButton baseUrl={exportBaseUrl} filename="bank_{cert}_financials" />
			</div>
		</div>

		<!-- Charts grid -->
		<div class="grid grid-cols-1 lg:grid-cols-2 gap-2">
			<!-- Key Ratios -->
			<section class="rounded-md bg-[--surface-1] p-3" style="box-shadow: var(--shadow-sm)">
				<div class="flex items-center gap-2 mb-2">
					<div class="w-0.5 h-4 bg-[--accent] rounded-full"></div>
					<h3 class="text-[13px] font-semibold text-[--text-primary]">Key Ratios</h3>
				</div>
				<TimeSeriesChart series={keyRatiosSeries} yAxisFormat="percent" />
			</section>

			<!-- Balance Sheet -->
			<section class="rounded-md bg-[--surface-1] p-3" style="box-shadow: var(--shadow-sm)">
				<div class="flex items-center gap-2 mb-2">
					<div class="w-0.5 h-4 bg-[--accent] rounded-full"></div>
					<h3 class="text-[13px] font-semibold text-[--text-primary]">Balance Sheet</h3>
				</div>
				<TimeSeriesChart series={balanceSheetSeries} yAxisFormat="currency" />
			</section>

			<!-- Asset Quality -->
			<section class="rounded-md bg-[--surface-1] p-3" style="box-shadow: var(--shadow-sm)">
				<div class="flex items-center gap-2 mb-2">
					<div class="w-0.5 h-4 bg-[--accent] rounded-full"></div>
					<h3 class="text-[13px] font-semibold text-[--text-primary]">Asset Quality</h3>
				</div>
				<TimeSeriesChart series={assetQualitySeries} yAxisFormat="percent" />
			</section>

			<!-- Capital Adequacy -->
			<section class="rounded-md bg-[--surface-1] p-3" style="box-shadow: var(--shadow-sm)">
				<div class="flex items-center gap-2 mb-2">
					<div class="w-0.5 h-4 bg-[--accent] rounded-full"></div>
					<h3 class="text-[13px] font-semibold text-[--text-primary]">Capital Adequacy</h3>
				</div>
				<TimeSeriesChart series={capitalSeries} yAxisFormat="percent" />
			</section>
		</div>

		<!-- Custom chart from FieldPicker -->
		{#if customFields.length > 0}
			<section>
				<div class="flex items-center gap-2 mb-2">
					<div class="w-0.5 h-4 bg-[--accent] rounded-full"></div>
					<h3 class="text-[13px] font-semibold text-[--text-primary]">Custom Chart</h3>
				</div>
				<div
					class="rounded-md bg-[--surface-1] p-3"
					style="box-shadow: var(--shadow-sm)"
				>
					<TimeSeriesChart series={customSeries} yAxisFormat="number" />
				</div>
			</section>
		{/if}

		<!-- Pivot Table (power mode only) -->
		{#if mode === 'power'}
			<section>
				<div class="flex items-center gap-2 mb-3">
					<div class="w-0.5 h-4 bg-[--accent] rounded-full"></div>
					<h3 class="text-[13px] font-semibold text-[--text-primary]">Pivot Table</h3>
				</div>
				<PivotTable
					data={filtered}
					metrics={customFields.length > 0
						? customFields
						: ['roa', 'roe', 'nimy', 'rbcrwaj', 'nclnlsr', 'eeffr']}
				/>
			</section>
		{/if}
	{/if}
</div>
