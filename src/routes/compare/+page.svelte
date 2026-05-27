<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import TimeSeriesChart from '$lib/components/charts/TimeSeriesChart.svelte';
	import GroupedBarChart from '$lib/components/charts/GroupedBarChart.svelte';
	import ExportButton from '$lib/components/data/ExportButton.svelte';
	import DateRangePicker from '$lib/components/data/DateRangePicker.svelte';
	import FieldPicker from '$lib/components/data/FieldPicker.svelte';
	import SearchBar from '$lib/components/data/SearchBar.svelte';
	import { formatPercent, formatCurrency, formatNumber } from '$lib/utils/formatters.js';
	import { fieldDefs } from '$lib/utils/field-meta.js';
	import type { CompareResponse, Financial, Institution } from '$lib/types';
	import { getMode } from '$lib/stores/mode.svelte.js';

	let mode = $derived(getMode());
	let isPower = $derived(mode === 'power');

	let { data } = $props();

	// ── Bank selection state ──
	let selectedBanks = $state<Institution[]>(data.prefetchedBanks ?? []);

	// ── Metric selection ──
	type MetricOption = {
		key: string;
		label: string;
		format: 'percent' | 'currency' | 'number';
		field: keyof Financial;
	};

	const availableMetrics: MetricOption[] = [
		{ key: 'roa', label: 'ROA', format: 'percent', field: 'roa' },
		{ key: 'roe', label: 'ROE', format: 'percent', field: 'roe' },
		{ key: 'nimy', label: 'NIM', format: 'percent', field: 'nimy' },
		{ key: 'eeffr', label: 'Efficiency Ratio', format: 'percent', field: 'eeffr' },
		{ key: 'nclnlsr', label: 'NPL Ratio', format: 'percent', field: 'nclnlsr' },
		{ key: 'rbcrwaj', label: 'Capital Ratio', format: 'percent', field: 'rbcrwaj' },
		{ key: 'asset', label: 'Assets', format: 'currency', field: 'asset' },
		{ key: 'dep', label: 'Deposits', format: 'currency', field: 'dep' }
	];

	let selectedMetricKeys = $state<Set<string>>(new Set(['roa', 'roe', 'nimy']));

	function toggleMetric(key: string): void {
		const next = new Set(selectedMetricKeys);
		if (next.has(key)) {
			if (next.size > 1) next.delete(key);
		} else {
			next.add(key);
		}
		selectedMetricKeys = next;
	}

	// In power mode, FieldPicker may add keys not in the hardcoded list.
	// Build MetricOption on-the-fly from field-meta for those.
	const CURRENCY_CATEGORIES = new Set(['balance_sheet', 'income']);

	function fieldToMetric(key: string): MetricOption | null {
		// Check hardcoded list first
		const existing = availableMetrics.find((m) => m.key === key);
		if (existing) return existing;
		// Build from field-meta
		const def = fieldDefs[key];
		if (!def) return null;
		const format = CURRENCY_CATEGORIES.has(def.category) ? 'currency' : 'percent';
		return { key, label: def.label, format, field: key as keyof Financial };
	}

	// FieldPicker selected keys (power mode)
	let fieldPickerKeys = $state<string[]>([...selectedMetricKeys]);

	// Sync FieldPicker → selectedMetricKeys
	function handleFieldPickerChange(keys: string[]): void {
		selectedMetricKeys = new Set(keys);
	}

	// Keep fieldPickerKeys in sync when pills toggle (accessible mode)
	$effect(() => {
		fieldPickerKeys = [...selectedMetricKeys];
	});

	let selectedMetrics = $derived.by(() => {
		return [...selectedMetricKeys]
			.map(fieldToMetric)
			.filter((m): m is MetricOption => m !== null);
	});

	// ── Date range (uses DateRangePicker component for consistency) ──
	let dateRange = $state<{ from: string; to: string }>({ from: '', to: '' });

	// Compute availableRange from compare data (union of all banks' date ranges)
	let availableRange = $derived.by(() => {
		if (!compareData) return undefined;
		let earliest = '';
		let latest = '';
		for (const cert of Object.keys(compareData.data)) {
			const rows = compareData.data[cert as unknown as number];
			if (!rows || rows.length === 0) continue;
			const first = rows[0].repdte;
			const last = rows[rows.length - 1].repdte;
			if (!earliest || first < earliest) earliest = first;
			if (!latest || last > latest) latest = last;
		}
		if (!earliest || !latest) return undefined;
		return { earliest, latest };
	});

	// Initialize dateRange to 10Y when compareData first arrives
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

	// Reset dateRange initialization when compareData is cleared (banks changed)
	$effect(() => {
		if (!compareData) {
			dateRangeInitialized = false;
		}
	});

	// ── Compare data ──
	let compareData = $state<CompareResponse | null>(null);
	let loading = $state(false);
	let error = $state<string | null>(null);

	// ── URL state: read certs from query params on mount ──
	let initializedFromUrl = false;

	$effect(() => {
		if (initializedFromUrl) return;
		initializedFromUrl = true;
		// If banks were prefetched server-side, skip client fetch
		if (selectedBanks.length > 0) return;
		const certsParam = $page.url.searchParams.get('certs');
		if (certsParam) {
			const certNumbers = certsParam
				.split(',')
				.map((c) => parseInt(c.trim(), 10))
				.filter((c) => !isNaN(c) && c > 0);
			if (certNumbers.length > 0) {
				loadBanksFromCerts(certNumbers);
			}
		}
	});

	async function loadBanksFromCerts(certs: number[]): Promise<void> {
		// Fetch in parallel and preserve the requested cert order.
		const results = await Promise.all(
			certs.slice(0, 10).map(async (cert) => {
				try {
					const res = await fetch(`/api/v1/banks/${cert}`);
					if (!res.ok) return null;
					const json = (await res.json()) as Institution & { latest_financials?: unknown };
					return json.cert ? json : null;
				} catch {
					return null;
				}
			})
		);
		const banks = results.filter((b): b is Institution => b !== null);
		if (banks.length > 0) {
			selectedBanks = banks;
		}
	}

	// ── URL sync: update URL when selectedBanks changes ──
	$effect(() => {
		if (!initializedFromUrl) return;
		const certs = selectedBanks.map((b) => b.cert);
		const params = new URLSearchParams($page.url.searchParams);

		if (certs.length > 0) {
			params.set('certs', certs.join(','));
		} else {
			params.delete('certs');
		}

		const newSearch = params.toString() ? `?${params.toString()}` : '';
		const currentSearch = $page.url.search || '';
		if (newSearch !== currentSearch) {
			goto(`${$page.url.pathname}${newSearch}`, {
				replaceState: true,
				keepFocus: true,
				noScroll: true
			});
		}
	});

	let excludeCerts = $derived(selectedBanks.map((b) => b.cert));

	function handleAddBank(bank: Institution): void {
		if (selectedBanks.length >= 10) return;
		if (selectedBanks.some((b) => b.cert === bank.cert)) return;
		selectedBanks = [...selectedBanks, bank];
	}

	function removeBank(cert: number): void {
		selectedBanks = selectedBanks.filter((b) => b.cert !== cert);
	}

	// ── Popular comparisons (derived from top banks by assets) ──
	function shortName(name: string): string {
		// Trim common suffixes for shorter labels
		return name
			.replace(/,?\s*National Association$/i, '')
			.replace(/,?\s*N\.A\.$/i, '');
	}

	let popularComparisons = $derived.by(() => {
		const top = data.topBanks ?? [];
		if (top.length < 4) return [];

		const comparisons: Array<{ label: string; certs: number[] }> = [];

		// #1 vs #2
		comparisons.push({
			label: `${shortName(top[0].name)} vs ${shortName(top[1].name)}`,
			certs: [top[0].cert, top[1].cert]
		});

		// #3 vs #4
		comparisons.push({
			label: `${shortName(top[2].name)} vs ${shortName(top[3].name)}`,
			certs: [top[2].cert, top[3].cert]
		});

		// Top 4
		comparisons.push({
			label: 'Top 4 Banks',
			certs: top.slice(0, 4).map((b) => b.cert)
		});

		return comparisons;
	});

	async function loadPopularComparison(certs: number[]): Promise<void> {
		selectedBanks = [];
		await loadBanksFromCerts(certs);
	}

	// ── Fetch comparison data when banks or metrics change ──
	// Date range filtering is now client-side via DateRangePicker,
	// so no need to re-fetch when the range changes.
	// The API defaults to 20Y when no `from` is provided.
	$effect(() => {
		const certs = selectedBanks.map((b) => b.cert);
		const metrics = [...selectedMetricKeys];

		if (certs.length < 2) {
			compareData = null;
			return;
		}

		loading = true;
		error = null;
		let cancelled = false;

		const params = new URLSearchParams({
			certs: certs.join(','),
			metrics: metrics.join(',')
		});

		fetch(`/api/v1/compare?${params.toString()}`)
			.then(async (res) => {
				if (cancelled) return;
				if (!res.ok) {
					const body = (await res.json().catch(() => null)) as {
						error?: string;
					} | null;
					throw new Error(body?.error || `HTTP ${res.status}`);
				}
				return res.json() as Promise<CompareResponse>;
			})
			.then((data) => {
				if (cancelled || !data) return;
				compareData = data;
			})
			.catch((e) => {
				if (cancelled) return;
				error = e.message;
				compareData = null;
			})
			.finally(() => {
				if (!cancelled) loading = false;
			});

		return () => {
			cancelled = true;
		};
	});

	// ── Export URL ──
	let exportUrl = $derived.by(() => {
		if (selectedBanks.length < 2) return '';
		const certs = selectedBanks.map((b) => b.cert).join(',');
		const metrics = [...selectedMetricKeys].join(',');
		return `/api/v1/compare?certs=${certs}&metrics=${metrics}`;
	});

	/** Look up compare data by cert, filtered by dateRange (client-side) */
	function getCompareRows(cert: number): Financial[] {
		if (!compareData) return [];
		const rows =
			compareData.data[cert] ||
			compareData.data[String(cert) as unknown as number] ||
			[];
		if (!dateRange.from || !dateRange.to) return rows;
		return rows.filter((f) => f.repdte >= dateRange.from && f.repdte <= dateRange.to);
	}

	// ── Chart series ──
	function buildChartSeries(
		metric: MetricOption
	): Array<{
		key: string;
		label: string;
		data: Array<{ date: string; value: number | null }>;
	}> {
		if (!compareData) return [];

		return selectedBanks
			.filter((bank) => getCompareRows(bank.cert).length > 0)
			.map((bank) => {
				const rows = getCompareRows(bank.cert);
				return {
					key: `${bank.cert}-${metric.key}`,
					label: bank.name.length > 20 ? bank.name.slice(0, 20) + '...' : bank.name,
					data: rows.map((f) => ({
						date: f.repdte,
						value: f[metric.field] as number | null
					}))
				};
			});
	}

	// ── Banks with no financials data ──
	let banksWithNoData = $derived.by(() => {
		if (!compareData) return [];
		return selectedBanks.filter((bank) => {
			const rows = getCompareRows(bank.cert);
			return !rows || rows.length === 0;
		});
	});

	// ── Comparison table ──
	const lowerIsBetter = new Set(['eeffr', 'nclnlsr']);

	interface TableRow {
		metric: MetricOption;
		values: Map<number, number | null>;
		best: number | null;
		worst: number | null;
	}

	let tableRows = $derived.by((): TableRow[] => {
		if (!compareData) return [];

		return selectedMetrics.map((metric) => {
			const values = new Map<number, number | null>();

			for (const bank of selectedBanks) {
				const rows = getCompareRows(bank.cert);
				if (!rows || rows.length === 0) {
					values.set(bank.cert, null);
					continue;
				}
				const latest = rows[rows.length - 1];
				values.set(bank.cert, latest[metric.field] as number | null);
			}

			const numericValues = [...values.entries()]
				.filter(([, v]) => v !== null)
				.map(([cert, v]) => ({ cert, value: v as number }));

			let best: number | null = null;
			let worst: number | null = null;

			if (numericValues.length >= 2) {
				if (lowerIsBetter.has(metric.key)) {
					best = numericValues.reduce((a, b) => (a.value < b.value ? a : b)).cert;
					worst = numericValues.reduce((a, b) => (a.value > b.value ? a : b)).cert;
				} else {
					best = numericValues.reduce((a, b) => (a.value > b.value ? a : b)).cert;
					worst = numericValues.reduce((a, b) => (a.value < b.value ? a : b)).cert;
				}
			}

			return { metric, values, best, worst };
		});
	});

	// ── Delta row (exactly 2 banks) ──
	interface DeltaRow {
		metric: MetricOption;
		delta: number | null;
		firstIsBetter: boolean | null;
	}

	let deltaRows = $derived.by((): DeltaRow[] => {
		if (selectedBanks.length !== 2 || !compareData) return [];

		const [certA, certB] = [selectedBanks[0].cert, selectedBanks[1].cert];

		return selectedMetrics.map((metric) => {
			const rowsA = getCompareRows(certA);
			const rowsB = getCompareRows(certB);
			const valA = rowsA?.length
				? (rowsA[rowsA.length - 1][metric.field] as number | null)
				: null;
			const valB = rowsB?.length
				? (rowsB[rowsB.length - 1][metric.field] as number | null)
				: null;

			if (valA === null || valB === null) {
				return { metric, delta: null, firstIsBetter: null };
			}

			const delta = valA - valB;
			const isLower = lowerIsBetter.has(metric.key);
			const firstIsBetter = isLower ? delta < 0 : delta > 0;

			return { metric, delta, firstIsBetter };
		});
	});

	// ── Formatters ──
	function formatValue(
		value: number | null,
		format: 'percent' | 'currency' | 'number'
	): string {
		if (value === null) return '\u2014';
		switch (format) {
			case 'percent':
				return formatPercent(value);
			case 'currency':
				return formatCurrency(value);
			default:
				return formatNumber(value);
		}
	}

	function formatDelta(
		value: number | null,
		format: 'percent' | 'currency' | 'number'
	): string {
		if (value === null) return '\u2014';
		const sign = value > 0 ? '+' : '';
		switch (format) {
			case 'percent':
				return `${sign}${value.toFixed(2)}pp`;
			case 'currency':
				return `${sign}${formatCurrency(value)}`;
			default:
				return `${sign}${formatNumber(value)}`;
		}
	}

	function cellBg(
		cert: number,
		best: number | null,
		worst: number | null
	): string {
		if (cert === best) return 'bg-[--positive-muted]';
		if (cert === worst) return 'bg-[--negative-muted]';
		return '';
	}

	// Power mode: tighter table cell padding
	let tableCellPy = $derived(isPower ? 'py-1' : 'py-2');

	// ── Grouped bar chart data (latest quarter snapshot) ──

	/** Build series (one per bank) and categories (one per metric) for the grouped bar chart.
	 *  Metrics with very different scales (e.g. percent vs currency) are grouped separately. */
	type BarChartGroup = {
		formatType: 'percent' | 'currency' | 'number';
		label: string;
		series: Array<{ key: string; label: string }>;
		categories: Array<{ label: string; values: (number | null)[] }>;
	};

	let barChartGroups = $derived.by((): BarChartGroup[] => {
		if (!compareData || tableRows.length === 0) return [];

		const banksWithData = selectedBanks.filter(
			(b) => getCompareRows(b.cert).length > 0
		);
		if (banksWithData.length === 0) return [];

		const bankSeries = banksWithData.map((b) => ({
			key: String(b.cert),
			label: b.name.length > 20 ? b.name.slice(0, 20) + '...' : b.name
		}));

		// Group metrics by format type so scales make sense
		const byFormat = new Map<string, TableRow[]>();
		for (const row of tableRows) {
			const fmt = row.metric.format;
			if (!byFormat.has(fmt)) byFormat.set(fmt, []);
			byFormat.get(fmt)!.push(row);
		}

		const formatLabels: Record<string, string> = {
			percent: 'Ratios (%)',
			currency: 'Dollar Values',
			number: 'Counts'
		};

		const groups: BarChartGroup[] = [];
		for (const [fmt, rows] of byFormat) {
			const categories = rows.map((row) => ({
				label: row.metric.label,
				values: banksWithData.map((b) => row.values.get(b.cert) ?? null)
			}));
			groups.push({
				formatType: fmt as 'percent' | 'currency' | 'number',
				label: formatLabels[fmt] || fmt,
				series: bankSeries,
				categories
			});
		}

		return groups;
	});

	function barValueFormatter(format: 'percent' | 'currency' | 'number'): (v: number) => string {
		switch (format) {
			case 'percent':
				return formatPercent;
			case 'currency':
				return formatCurrency;
			default:
				return formatNumber;
		}
	}
</script>

<svelte:head>
	<title>Compare | Bank Data Explorer</title>
	<meta name="description" content="Compare financial metrics across multiple FDIC-insured banks side by side." />
	<meta property="og:title" content="Compare | Bank Data Explorer" />
	<meta property="og:description" content="Compare financial metrics across multiple FDIC-insured banks side by side." />
</svelte:head>

<div class="{isPower ? 'space-y-3' : 'space-y-5'}">
	<!-- Header -->
	<div class="flex items-center justify-between">
		<div>
			<h1 class="text-2xl font-semibold text-[--text-primary]">Bank Comparison</h1>
			<p class="text-[13px] text-[--text-tertiary]">
				Compare financial metrics across multiple banks
			</p>
		</div>
		{#if exportUrl}
			<ExportButton baseUrl={exportUrl} filename="comparison" />
		{/if}
	</div>

	<!-- Bank selector -->
	<section>
		<div class="flex items-center gap-2 mb-3">
			<div class="w-0.5 h-4 bg-[--accent] rounded-full"></div>
			<h2 class="text-[15px] font-semibold text-[--text-primary]">Select Banks</h2>
			<span class="text-[11px] text-[--text-tertiary]">({selectedBanks.length}/10)</span>
		</div>

		<div class="max-w-md">
			<SearchBar
				placeholder="Search banks by name or cert..."
				onsearch={() => {}}
				autocomplete={true}
				onselect={handleAddBank}
				disabled={selectedBanks.length >= 10}
				{excludeCerts}
			/>
		</div>

		<!-- Selected bank chips -->
		{#if selectedBanks.length > 0}
			<div class="flex flex-wrap gap-1.5 mt-2">
				{#each selectedBanks as bank (bank.cert)}
					<span
						class="inline-flex items-center gap-1.5 rounded-sm bg-[--accent-muted] text-[--accent-text] px-3 py-1.5 sm:px-2.5 sm:py-1 text-[12px] font-medium"
					>
						<a href="/banks/{bank.cert}" class="hover:underline" title={bank.name}>
							{bank.name.length > 25 ? bank.name.slice(0, 25) + '...' : bank.name}
						</a>
						<button
							type="button"
							class="ml-0.5 p-1 sm:p-0 hover:text-[--negative] transition-colors"
							onclick={() => removeBank(bank.cert)}
							aria-label="Remove {bank.name}"
						>
							<svg
								class="h-3.5 w-3.5"
								fill="none"
								stroke="currentColor"
								viewBox="0 0 24 24"
							>
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									stroke-width="2"
									d="M6 18L18 6M6 6l12 12"
								/>
							</svg>
						</button>
					</span>
				{/each}
				<button
					type="button"
					class="text-[12px] text-[--text-disabled] hover:text-[--negative] transition-colors px-1.5"
					onclick={() => (selectedBanks = [])}
				>
					Clear all
				</button>
			</div>
		{/if}
	</section>

	<!-- Metric selector -->
	<section>
		<div class="flex items-center justify-between mb-3">
			<div class="flex items-center gap-2">
				<div class="w-0.5 h-4 bg-[--accent] rounded-full"></div>
				<h2 class="text-[15px] font-semibold text-[--text-primary]">Metrics</h2>
			</div>
			{#if isPower}
				<FieldPicker
					bind:selected={fieldPickerKeys}
					onchange={handleFieldPickerChange}
					maxSelections={10}
				/>
			{/if}
		</div>
		<div class="flex flex-wrap gap-1.5">
			{#each availableMetrics as metric (metric.key)}
				<button
					class="{isPower ? 'px-2.5 py-0.5' : 'px-3.5 py-2 sm:px-3 sm:py-1'} text-[13px] rounded-sm font-medium transition-colors
						{selectedMetricKeys.has(metric.key)
						? 'bg-[--accent] text-white'
						: 'bg-[--surface-2] text-[--text-secondary] hover:bg-[--surface-3]'}"
					onclick={() => toggleMetric(metric.key)}
				>
					{metric.label}
				</button>
			{/each}
		</div>
	</section>

	<!-- Empty / Loading / Error / Results -->
	{#if selectedBanks.length < 2}
		<div
			class="{isPower ? 'rounded-none border border-[--border-muted]' : 'rounded-md'} bg-[--surface-1] {isPower ? 'py-8 px-4' : 'py-12 px-6'} text-center"
			style="{isPower ? '' : 'box-shadow: var(--shadow-sm)'}"
		>
			<div class="max-w-md mx-auto space-y-4">
				<div>
					<!-- Scale/balance icon -->
					<svg
						class="w-10 h-10 mx-auto text-[--text-disabled] mb-3"
						fill="none"
						stroke="currentColor"
						viewBox="0 0 24 24"
					>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="1.5"
							d="M3 6l3 1m0 0l-3 9a5.002 5.002 0 006.001 0M6 7l3 9M6 7l6-2m6 2l3-1m-3 1l-3 9a5.002 5.002 0 006.001 0M18 7l3 9m-3-9l-6-2m0-2v2m0 16V5m0 16H9m3 0h3"
						/>
					</svg>
					<p class="text-[--text-secondary] text-[15px] font-medium">
						Compare up to 10 banks side-by-side
					</p>
					<p class="text-[--text-tertiary] text-[13px] mt-1">
						{#if selectedBanks.length === 0}
							Start by searching for a bank above, or try a popular comparison
						{:else}
							Add one more bank to start comparing
						{/if}
					</p>
				</div>

				<!-- Popular comparisons -->
				{#if selectedBanks.length === 0}
					<div class="pt-2">
						<p
							class="text-[11px] text-[--text-disabled] uppercase tracking-wider font-medium mb-2"
						>
							Popular comparisons
						</p>
						<div class="flex flex-wrap justify-center gap-1.5">
							{#each popularComparisons as comp}
								<button
									type="button"
									class="{isPower ? 'px-2.5 py-0.5' : 'px-3.5 py-2.5 sm:px-3 sm:py-1.5'} text-[12px] rounded-sm border border-[--border-muted] bg-[--surface-2] text-[--text-secondary]
										hover:border-[--accent] hover:text-[--accent-text] transition-colors"
									onclick={() => loadPopularComparison(comp.certs)}
								>
									{comp.label}
								</button>
							{/each}
						</div>
					</div>
				{/if}
			</div>
		</div>
	{:else if loading}
		<div
			class="rounded-md bg-[--surface-1] py-16 text-center"
			style="box-shadow: var(--shadow-sm)"
		>
			<div
				class="inline-block h-6 w-6 animate-spin rounded-full border-2 border-[--border-muted] border-t-[--accent]"
			></div>
			<p class="text-[--text-tertiary] text-[13px] mt-2">Loading comparison data...</p>
		</div>
	{:else if error}
		<div
			class="rounded-md bg-[--negative-muted] py-8 text-center"
			style="box-shadow: var(--shadow-sm)"
		>
			<p class="text-[--negative] text-[14px]">Failed to load: {error}</p>
		</div>
	{:else if compareData}
		<!-- Date range selector (shared DateRangePicker component) -->
		<DateRangePicker bind:value={dateRange} {availableRange} />

		<!-- No-data notice for banks missing financials -->
		{#if banksWithNoData.length > 0}
			<div
				class="rounded-md bg-[--warning-muted] px-4 py-3 text-[13px] text-[--text-secondary]"
				style="box-shadow: var(--shadow-xs)"
			>
				<span class="font-medium text-[--warning]">Missing data:</span>
				{banksWithNoData.map((b) => b.name).join(', ')}
				{banksWithNoData.length === 1 ? ' has' : ' have'} no financial data available.
				{#if banksWithNoData.length === selectedBanks.length}
					No comparison can be shown.
				{:else}
					Showing comparison for banks with available data.
				{/if}
			</div>
		{/if}

		<!-- Charts -->
		<section>
			<div class="flex items-center gap-2 mb-3">
				<div class="w-0.5 h-4 bg-[--accent] rounded-full"></div>
				<h2 class="text-[15px] font-semibold text-[--text-primary]">Comparison Charts</h2>
			</div>
			<div class="grid grid-cols-1 lg:grid-cols-2 gap-2">
				{#each selectedMetrics as metric (metric.key)}
					{@const chartSeries = buildChartSeries(metric)}
					{#if chartSeries.length > 0}
						<div
							class="{isPower ? 'rounded-none border border-[--border-muted]' : 'rounded-md'} bg-[--surface-1] {isPower ? 'p-2' : 'p-3'}"
							style="{isPower ? '' : 'box-shadow: var(--shadow-sm)'}"
						>
							<h3 class="text-[13px] font-semibold text-[--text-primary] mb-2">
								{metric.label}
							</h3>
							<TimeSeriesChart
								series={chartSeries}
								yAxisFormat={metric.format}
								height="280px"
							/>
						</div>
					{/if}
				{/each}
			</div>
		</section>

		<!-- Grouped bar chart: latest quarter snapshot -->
		{#if barChartGroups.length > 0}
			<section>
				<div class="flex items-center gap-2 mb-3">
					<div class="w-0.5 h-4 bg-[--accent] rounded-full"></div>
					<h2 class="text-[15px] font-semibold text-[--text-primary]">Latest Quarter Snapshot</h2>
				</div>
				<div class="grid grid-cols-1 {barChartGroups.length > 1 ? 'lg:grid-cols-2' : ''} gap-2">
					{#each barChartGroups as group (group.formatType)}
						<div
							class="{isPower ? 'rounded-none border border-[--border-muted]' : 'rounded-md'} bg-[--surface-1] {isPower ? 'p-2' : 'p-3'}"
							style="{isPower ? '' : 'box-shadow: var(--shadow-sm)'}"
						>
							<h3 class="text-[13px] font-semibold text-[--text-primary] mb-2">
								{group.label}
							</h3>
							<GroupedBarChart
								series={group.series}
								categories={group.categories}
								height="{Math.max(200, group.categories.length * 60 + 80)}px"
								valueFormatter={barValueFormatter(group.formatType)}
							/>
						</div>
					{/each}
				</div>
			</section>
		{/if}

		<!-- At a Glance: best bank per metric -->
		{#if tableRows.length > 0 && selectedBanks.length >= 2}
			<section>
				<div class="flex items-center gap-2 mb-3">
					<div class="w-0.5 h-4 bg-[--accent] rounded-full"></div>
					<h2 class="text-[15px] font-semibold text-[--text-primary]">At a Glance</h2>
				</div>
				<div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2">
					{#each tableRows as row (row.metric.key)}
						{@const bestCert = row.best}
						{@const bestBank = bestCert !== null ? selectedBanks.find((b) => b.cert === bestCert) : null}
						{@const bestValue = bestCert !== null ? row.values.get(bestCert) ?? null : null}
						{#if bestBank}
							<div
								class="{isPower ? 'rounded-none border border-[--border-muted]' : 'rounded-md'} bg-[--surface-1] {isPower ? 'px-2.5 py-2' : 'px-3 py-2.5'}"
								style="{isPower ? '' : 'box-shadow: var(--shadow-xs)'}"
							>
								<p class="text-[11px] text-[--text-tertiary] font-medium uppercase tracking-wider">
									Best {row.metric.label}
								</p>
								<p class="text-[14px] font-semibold text-[--accent] mt-0.5 truncate" title={bestBank.name}>
									{bestBank.name}
								</p>
								<p class="text-[13px] text-[--text-secondary] data-mono">
									{formatValue(bestValue, row.metric.format)}
								</p>
							</div>
						{/if}
					{/each}
				</div>
			</section>
		{/if}

		<!-- Comparison table (sticky header, color-coded cells, delta row) -->
		{#if tableRows.length > 0}
			<section>
				<div class="flex items-center gap-2 mb-3">
					<div class="w-0.5 h-4 bg-[--accent] rounded-full"></div>
					<h2 class="text-[15px] font-semibold text-[--text-primary]">
						Latest Quarter Comparison
					</h2>
				</div>
				<div
					class="{isPower ? 'rounded-none border border-[--border-muted]' : 'rounded-md'} bg-[--surface-1] overflow-x-auto max-h-[500px] overflow-y-auto"
					style="{isPower ? '' : 'box-shadow: var(--shadow-sm)'}"
				>
					<table class="w-full" style="font-size: {isPower ? '12px' : '13px'}">
						<thead class="sticky top-0 z-10">
							<tr class="bg-[--surface-3]">
								<th
									class="text-left px-3 {tableCellPy} text-[11px] font-medium text-[--text-tertiary] uppercase tracking-wider sticky left-0 bg-[--surface-3] z-20"
								>
									Metric
								</th>
								{#each selectedBanks as bank (bank.cert)}
									<th
										class="text-right px-3 {tableCellPy} text-[11px] font-medium uppercase tracking-wider whitespace-nowrap"
									>
										<a
											href="/banks/{bank.cert}"
											class="text-[--text-tertiary] hover:text-[--accent] transition-colors"
											title={bank.name}
										>
											{bank.name.length > 18
												? bank.name.slice(0, 18) + '...'
												: bank.name}
										</a>
									</th>
								{/each}
							</tr>
						</thead>
						<tbody class="divide-y divide-[--surface-2]">
							{#each tableRows as row (row.metric.key)}
								<tr class="hover:bg-[--accent-muted]/30 transition-colors">
									<td
										class="px-3 {tableCellPy} font-medium text-[--text-primary] sticky left-0 bg-[--surface-1] z-[5]"
									>
										{row.metric.label}
									</td>
									{#each selectedBanks as bank (bank.cert)}
										{@const val = row.values.get(bank.cert) ?? null}
										<td
											class="px-3 {tableCellPy} text-right whitespace-nowrap data-mono {cellBg(bank.cert, row.best, row.worst)}
												{bank.cert === row.best
												? 'text-[--positive] font-semibold'
												: ''}
												{bank.cert === row.worst ? 'text-[--negative]' : ''}
												{bank.cert !== row.best && bank.cert !== row.worst
												? 'text-[--text-primary]'
												: ''}"
										>
											{formatValue(val, row.metric.format)}
										</td>
									{/each}
								</tr>
							{/each}

							<!-- Delta row for exactly 2 banks -->
							{#if deltaRows.length > 0}
								{#each deltaRows as dr, i (dr.metric.key)}
									{#if i === 0}
										<tr class="border-t-2 border-[--border]">
											<td
												class="px-3 pt-2.5 pb-0.5 text-[10px] font-medium text-[--text-disabled] uppercase tracking-wider sticky left-0 bg-[--surface-1] z-[5]"
												colspan={selectedBanks.length + 1}
											>
												Delta ({selectedBanks[0].name.length > 15 ? selectedBanks[0].name.slice(0, 15) + '...' : selectedBanks[0].name} minus {selectedBanks[1].name.length > 15 ? selectedBanks[1].name.slice(0, 15) + '...' : selectedBanks[1].name})
											</td>
										</tr>
									{/if}
									<tr class="bg-[--surface-2]/30 hover:bg-[--accent-muted]/30 transition-colors">
										<td class="px-3 py-1.5 text-[--text-tertiary] text-[12px] sticky left-0 bg-[--surface-2]/30 z-[5]">
											{dr.metric.label}
										</td>
										<td
											class="px-3 py-1.5 text-right whitespace-nowrap text-[12px] data-mono
												{dr.firstIsBetter === true ? 'text-[--positive] font-semibold' : ''}
												{dr.firstIsBetter === false ? 'text-[--negative]' : ''}
												{dr.firstIsBetter === null ? 'text-[--text-disabled]' : ''}"
											colspan={selectedBanks.length}
										>
											{formatDelta(dr.delta, dr.metric.format)}
										</td>
									</tr>
								{/each}
							{/if}
						</tbody>
					</table>
				</div>
			</section>
		{/if}
	{/if}
</div>
