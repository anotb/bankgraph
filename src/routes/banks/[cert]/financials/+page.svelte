<script lang="ts">
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import TimeSeriesChart from '$lib/components/charts/TimeSeriesChart.svelte';
	import EmptyState from '$lib/components/data/EmptyState.svelte';
	import ExportButton from '$lib/components/data/ExportButton.svelte';
	import DateRangePicker from '$lib/components/data/DateRangePicker.svelte';
	import FieldPicker from '$lib/components/data/FieldPicker.svelte';
	import PivotTable from '$lib/components/data/PivotTable.svelte';
	import {
		getFieldLabel,
		fieldDefs,
		categoryLabels,
		categoryOrder,
		type FieldCategory
	} from '$lib/utils/field-meta.js';
	import { getMode } from '$lib/stores/mode.svelte.js';
	import type { Financial } from '$lib/types';

	let { data } = $props();
	let financials = $derived(data.financials);
	let cert = $derived(data.bank.cert);
	let mode = $derived(getMode());

	// Default fields: the same fields the 4 hardcoded charts used to show
	const DEFAULT_FIELDS = [
		'roa', 'roe', 'nimy',           // Key Ratios
		'asset', 'dep', 'eq',           // Balance Sheet
		'nclnlsr', 'lnatresr',          // Asset Quality
		'rbcrwaj', 'rbc1rwaj', 'rbc1aaj' // Capital Adequacy
	];

	// Read initial selection from URL params, falling back to defaults
	function getInitialFields(): string[] {
		const param = $page.url.searchParams.get('fields');
		if (!param) return [...DEFAULT_FIELDS];
		const fields = param.split(',').filter((f) => f in fieldDefs);
		return fields.length > 0 ? fields : [...DEFAULT_FIELDS];
	}

	let selectedFields = $state<string[]>(getInitialFields());

	// Persist selection to URL params when it changes
	function handleFieldsChange(fields: string[]): void {
		const params = new URLSearchParams($page.url.searchParams);
		const isDefault =
			fields.length === DEFAULT_FIELDS.length &&
			DEFAULT_FIELDS.every((f) => fields.includes(f));

		if (isDefault) {
			params.delete('fields');
		} else {
			params.set('fields', fields.join(','));
		}

		const search = params.toString();
		const newUrl = search ? `?${search}` : $page.url.pathname;
		goto(newUrl, { keepFocus: true, noScroll: true, replaceState: true });
	}

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

	// View toggle: 'chart' or 'table' (power mode only)
	let view = $state<'chart' | 'table'>('chart');

	// Map category to y-axis format
	function categoryFormat(cat: FieldCategory): 'currency' | 'percent' | 'number' {
		switch (cat) {
			case 'balance_sheet':
			case 'income':
				return 'currency';
			case 'ratios':
			case 'capital':
			case 'asset_quality':
				return 'percent';
			default:
				// liquidity, general: mixed types, use plain number
				return 'number';
		}
	}

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

	// Group selected fields by category for charting
	type ChartGroup = {
		category: FieldCategory;
		label: string;
		format: 'currency' | 'percent' | 'number';
		series: Array<{
			key: string;
			label: string;
			color?: string;
			data: Array<{ date: string; value: number | null }>;
		}>;
	};

	let chartGroups = $derived.by((): ChartGroup[] => {
		// Group selected fields by their category
		const byCategory = new Map<FieldCategory, string[]>();
		for (const field of selectedFields) {
			const def = fieldDefs[field];
			if (!def) continue;
			const existing = byCategory.get(def.category) ?? [];
			existing.push(field);
			byCategory.set(def.category, existing);
		}

		// Build chart groups in category display order
		const groups: ChartGroup[] = [];
		for (const cat of categoryOrder) {
			const fields = byCategory.get(cat);
			if (!fields || fields.length === 0) continue;
			groups.push({
				category: cat,
				label: categoryLabels[cat],
				format: categoryFormat(cat),
				series: fields.map((field) =>
					buildSeries(
						field,
						getFieldLabel(field).replace(/\s*\(.*\)/, ''),
						undefined,
						field as keyof Financial
					)
				)
			});
		}
		return groups;
	});
</script>

<div class="space-y-5 pt-3">
	{#if financials.length === 0}
		<EmptyState
			icon="chart"
			title="No financial data available"
			message="Run the backfill pipeline to populate quarterly financials for this institution."
		/>
	{:else}
		<!-- Controls row: DateRangePicker + view toggle + FieldPicker + ExportButton -->
		<div class="flex items-center gap-3 flex-wrap">
			<DateRangePicker bind:value={dateRange} {availableRange} />
			<span class="text-[11px] text-[--text-tertiary] data-mono">
				{filtered.length} quarters
			</span>
			<div class="ml-auto flex items-center gap-2">
				{#if mode === 'power'}
					<!-- Chart / Table toggle -->
					<div class="inline-flex rounded border border-[--border-muted] overflow-hidden">
						<button
							type="button"
							class="px-2 py-1 text-[11px] font-medium transition-colors
								{view === 'chart'
									? 'bg-[--accent] text-white'
									: 'bg-[--surface-2] text-[--text-secondary] hover:text-[--text-primary]'}"
							onclick={() => (view = 'chart')}
						>
							Chart
						</button>
						<button
							type="button"
							class="px-2 py-1 text-[11px] font-medium transition-colors border-l border-[--border-muted]
								{view === 'table'
									? 'bg-[--accent] text-white'
									: 'bg-[--surface-2] text-[--text-secondary] hover:text-[--text-primary]'}"
							onclick={() => (view = 'table')}
						>
							Table
						</button>
					</div>
				{/if}
				<FieldPicker
					bind:selected={selectedFields}
					onchange={handleFieldsChange}
					maxSelections={12}
				/>
				<ExportButton baseUrl={exportBaseUrl} filename="bank_{cert}_financials" />
			</div>
		</div>

		{#if mode === 'power' && view === 'table'}
			<!-- Pivot Table view (power mode, table toggle) -->
			<PivotTable
				data={filtered}
				metrics={selectedFields.length > 0
					? selectedFields
					: DEFAULT_FIELDS}
			/>
		{:else}
			<!-- Charts grid, driven by FieldPicker selection -->
			{#if chartGroups.length === 0}
				<div class="text-center py-12">
					<p class="text-[13px] text-[--text-tertiary]">
						No metrics selected. Use the Fields picker to choose metrics to chart.
					</p>
				</div>
			{:else}
				<div class="grid grid-cols-1 lg:grid-cols-2 gap-2">
					{#each chartGroups as group (group.category)}
						<section class="rounded-md bg-[--surface-1] p-3" style="box-shadow: var(--shadow-sm)">
							<div class="flex items-center gap-2 mb-2">
								<div class="w-0.5 h-4 bg-[--accent] rounded-full"></div>
								<h3 class="text-[13px] font-semibold text-[--text-primary]">{group.label}</h3>
							</div>
							<TimeSeriesChart series={group.series} yAxisFormat={group.format} />
						</section>
					{/each}
				</div>
			{/if}
		{/if}
	{/if}
</div>
