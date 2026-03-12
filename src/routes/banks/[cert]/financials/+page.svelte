<script lang="ts">
	import TimeSeriesChart from '$lib/components/charts/TimeSeriesChart.svelte';
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

	let selectedRange = $state('10Y');

	let cutoffDate = $derived.by(() => {
		if (selectedRange === 'All' || financials.length === 0) return null;
		const latest = financials[financials.length - 1].repdte;
		const latestYear = parseInt(latest.slice(0, 4), 10);
		const rangeMap: Record<string, number> = { '4Q': 1, '8Q': 2, '5Y': 5, '10Y': 10, '20Y': 20 };
		const years = rangeMap[selectedRange] ?? 10;
		const cutoffYear = latestYear - years;
		return `${cutoffYear}${latest.slice(4)}`;
	});

	let filtered = $derived.by(() => {
		if (!cutoffDate) return financials;
		return financials.filter((f) => f.repdte >= cutoffDate!);
	});

	// Export URL with date range params
	let exportBaseUrl = $derived.by(() => {
		let url = `/api/v1/banks/${cert}/financials`;
		const params: string[] = [];
		if (cutoffDate) params.push(`from=${cutoffDate}`);
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
		<div class="rounded border border-[--border] bg-[--surface-1] py-24 text-center">
			<p class="text-[--text-tertiary] text-[15px]">No financial data available</p>
		</div>
	{:else}
		<!-- Controls row: DateRangePicker + ExportButton + FieldPicker -->
		<div class="flex items-center gap-3 flex-wrap">
			<DateRangePicker bind:selected={selectedRange} />
			<span class="text-[11px] text-[--text-tertiary] tabular-nums">
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

		<!-- Custom chart from FieldPicker -->
		{#if customFields.length > 0}
			<section>
				<div class="flex items-center gap-2 mb-2">
					<div class="w-0.5 h-4 bg-[--accent] rounded-full"></div>
					<h3 class="text-[13px] font-semibold text-[--text-primary]">Custom Chart</h3>
				</div>
				<div
					class="rounded-[5px] border border-[--border-muted] bg-[--surface-1] p-3"
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
