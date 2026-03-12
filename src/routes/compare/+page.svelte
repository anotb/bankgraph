<script lang="ts">
	import TimeSeriesChart from '$lib/components/charts/TimeSeriesChart.svelte';
	import { formatPercent, formatCurrency, formatNumber } from '$lib/utils/formatters.js';
	import type { CompareResponse, Financial, Institution } from '$lib/types';

	// Bank selection state
	let searchQuery = $state('');
	let searchResults = $state<Institution[]>([]);
	let selectedBanks = $state<Institution[]>([]);
	let searching = $state(false);
	let searchDebounce: ReturnType<typeof setTimeout> | undefined;
	let showDropdown = $state(false);

	// Metric selection
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

	let selectedMetrics = $derived(
		availableMetrics.filter((m) => selectedMetricKeys.has(m.key))
	);

	// Date range
	type DateRange = '5Y' | '10Y' | '20Y' | 'All';
	let selectedRange: DateRange = $state('10Y');
	const rangeButtons: DateRange[] = ['5Y', '10Y', '20Y', 'All'];

	// Compare data
	let compareData = $state<CompareResponse | null>(null);
	let loading = $state(false);
	let error = $state<string | null>(null);

	// Search for banks
	async function searchBanks(query: string): Promise<void> {
		if (!query.trim()) {
			searchResults = [];
			showDropdown = false;
			return;
		}
		searching = true;
		try {
			const res = await fetch(`/api/v1/banks?q=${encodeURIComponent(query)}&limit=10`);
			if (res.ok) {
				const json = await res.json() as { data?: Institution[] };
				const selectedCerts = new Set(selectedBanks.map((b) => b.cert));
				searchResults = (json.data || []).filter((b) => !selectedCerts.has(b.cert));
				showDropdown = searchResults.length > 0;
			}
		} catch {
			searchResults = [];
		} finally {
			searching = false;
		}
	}

	function handleSearchInput(e: Event): void {
		const target = e.target as HTMLInputElement;
		searchQuery = target.value;
		clearTimeout(searchDebounce);
		searchDebounce = setTimeout(() => searchBanks(searchQuery), 300);
	}

	function addBank(bank: Institution): void {
		if (selectedBanks.length >= 10) return;
		if (selectedBanks.some((b) => b.cert === bank.cert)) return;
		selectedBanks = [...selectedBanks, bank];
		searchQuery = '';
		searchResults = [];
		showDropdown = false;
	}

	function removeBank(cert: number): void {
		selectedBanks = selectedBanks.filter((b) => b.cert !== cert);
	}

	// Fetch comparison data when banks or metrics change
	$effect(() => {
		const certs = selectedBanks.map((b) => b.cert);
		const metrics = [...selectedMetricKeys];

		if (certs.length < 2) {
			compareData = null;
			return;
		}

		loading = true;
		error = null;

		fetch(`/api/v1/compare?certs=${certs.join(',')}&metrics=${metrics.join(',')}`)
			.then(async (res) => {
				if (!res.ok) {
					const body = await res.json().catch(() => null) as { error?: string } | null;
					throw new Error(body?.error || `HTTP ${res.status}`);
				}
				return res.json() as Promise<CompareResponse>;
			})
			.then((data) => {
				compareData = data;
			})
			.catch((e) => {
				error = e.message;
				compareData = null;
			})
			.finally(() => {
				loading = false;
			});
	});

	// Filter data by date range
	function getCutoffDate(): string | null {
		if (selectedRange === 'All') return null;
		const now = new Date();
		const years = selectedRange === '5Y' ? 5 : selectedRange === '10Y' ? 10 : 20;
		const cutoffYear = now.getFullYear() - years;
		const month = String(now.getMonth() + 1).padStart(2, '0');
		const day = String(now.getDate()).padStart(2, '0');
		return `${cutoffYear}${month}${day}`;
	}

	function filterFinancials(rows: Financial[]): Financial[] {
		const cutoff = getCutoffDate();
		if (!cutoff) return rows;
		return rows.filter((f) => f.repdte >= cutoff);
	}

	// Build chart series for a specific metric
	function buildChartSeries(metric: MetricOption): Array<{
		key: string;
		label: string;
		data: Array<{ date: string; value: number | null }>;
	}> {
		if (!compareData) return [];

		return selectedBanks
			.filter((bank) => compareData!.data[bank.cert])
			.map((bank) => {
				const rows = filterFinancials(compareData!.data[bank.cert]);
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

	// Build comparison table data
	interface TableRow {
		metric: MetricOption;
		values: Map<number, number | null>;
		best: number | null;
		worst: number | null;
	}

	let tableRows = $derived.by((): TableRow[] => {
		if (!compareData) return [];

		// Metrics where lower is better
		const lowerIsBetter = new Set(['eeffr', 'nclnlsr']);

		return selectedMetrics.map((metric) => {
			const values = new Map<number, number | null>();

			for (const bank of selectedBanks) {
				const rows = compareData!.data[bank.cert];
				if (!rows || rows.length === 0) {
					values.set(bank.cert, null);
					continue;
				}
				// Get latest quarter value
				const latest = rows[rows.length - 1];
				values.set(bank.cert, latest[metric.field] as number | null);
			}

			// Find best/worst
			const numericValues = [...values.entries()]
				.filter(([, v]) => v !== null)
				.map(([cert, v]) => ({ cert, value: v as number }));

			let best: number | null = null;
			let worst: number | null = null;

			if (numericValues.length > 0) {
				if (lowerIsBetter.has(metric.key)) {
					best = numericValues.reduce((a, b) => (a.value < b.value ? a : b)).cert;
					worst = numericValues.reduce((a, b) => (a.value > b.value ? a : b)).cert;
				} else {
					best = numericValues.reduce((a, b) => (a.value > b.value ? a : b)).cert;
					worst = numericValues.reduce((a, b) => (a.value < b.value ? a : b)).cert;
				}
				// Don't highlight if there's only one bank with data
				if (numericValues.length < 2) {
					best = null;
					worst = null;
				}
			}

			return { metric, values, best, worst };
		});
	});

	function formatValue(value: number | null, format: 'percent' | 'currency' | 'number'): string {
		if (value === null) return '\u2014';
		switch (format) {
			case 'percent': return formatPercent(value);
			case 'currency': return formatCurrency(value);
			default: return formatNumber(value);
		}
	}

	// Close dropdown on outside click
	function handleBlur(): void {
		// Delay to allow click on dropdown item
		setTimeout(() => {
			showDropdown = false;
		}, 200);
	}
</script>

<svelte:head>
	<title>Compare | Bank Data Explorer</title>
</svelte:head>

<div class="space-y-5">
	<!-- Header -->
	<div>
		<h1 class="text-2xl font-semibold text-[--text-primary]">Bank Comparison</h1>
		<p class="text-[13px] text-[--text-tertiary]">Compare financial metrics across multiple banks</p>
	</div>

	<!-- Bank selector -->
	<section>
		<div class="flex items-center gap-2 mb-3">
			<div class="w-0.5 h-4 bg-[--accent] rounded-full"></div>
			<h2 class="text-[15px] font-semibold text-[--text-primary]">Select Banks</h2>
			<span class="text-[11px] text-[--text-tertiary]">({selectedBanks.length}/10)</span>
		</div>

		<!-- Search input -->
		<div class="relative max-w-md">
			<div class="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
				<svg class="h-4 w-4 text-[--text-disabled]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
						d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
				</svg>
			</div>
			<input
				type="text"
				value={searchQuery}
				oninput={handleSearchInput}
				onblur={handleBlur}
				onfocus={() => { if (searchResults.length > 0) showDropdown = true; }}
				placeholder="Search banks by name..."
				disabled={selectedBanks.length >= 10}
				class="block w-full rounded-[5px] border border-[--border-muted] bg-[--surface-1] py-2 pr-9 pl-9
					text-[14px] text-[--text-primary] placeholder:text-[--text-disabled]
					focus:border-[--accent] focus:ring-2 focus:ring-[--accent]/20 focus:outline-none
					transition-colors disabled:opacity-50"
			/>
			{#if searching}
				<div class="absolute inset-y-0 right-0 flex items-center pr-3">
					<div class="h-4 w-4 animate-spin rounded-full border-2 border-[--border] border-t-[--accent]"></div>
				</div>
			{/if}

			<!-- Dropdown -->
			{#if showDropdown && searchResults.length > 0}
				<div class="absolute z-10 mt-1 w-full rounded-md bg-[--surface-1] max-h-64 overflow-y-auto" style="box-shadow: var(--shadow-md)">
					{#each searchResults as bank (bank.cert)}
						<button
							type="button"
							class="block w-full text-left px-3 py-2 text-[13px] hover:bg-[--accent-muted] transition-colors"
							onmousedown={(e) => { e.preventDefault(); addBank(bank); }}
						>
							<span class="font-medium text-[--text-primary]">{bank.name}</span>
							<span class="text-[--text-tertiary] ml-1">
								{bank.city ?? ''}{bank.city && bank.state ? ', ' : ''}{bank.state ?? ''}
							</span>
							{#if bank.total_assets}
								<span class="text-[--text-disabled] ml-1">({formatCurrency(bank.total_assets)})</span>
							{/if}
						</button>
					{/each}
				</div>
			{/if}
		</div>

		<!-- Selected bank chips -->
		{#if selectedBanks.length > 0}
			<div class="flex flex-wrap gap-1.5 mt-2">
				{#each selectedBanks as bank (bank.cert)}
					<span class="inline-flex items-center gap-1 rounded-full bg-[--accent-muted] text-[--accent-text] px-2.5 py-1 text-[12px] font-medium">
						{bank.name.length > 25 ? bank.name.slice(0, 25) + '...' : bank.name}
						<button
							type="button"
							class="ml-0.5 hover:text-[--negative] transition-colors"
							onclick={() => removeBank(bank.cert)}
							aria-label="Remove {bank.name}"
						>
							<svg class="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
							</svg>
						</button>
					</span>
				{/each}
			</div>
		{/if}
	</section>

	<!-- Metric selector -->
	<section>
		<div class="flex items-center gap-2 mb-3">
			<div class="w-0.5 h-4 bg-[--accent] rounded-full"></div>
			<h2 class="text-[15px] font-semibold text-[--text-primary]">Metrics</h2>
		</div>
		<div class="flex flex-wrap gap-1.5">
			{#each availableMetrics as metric (metric.key)}
				<button
					class="px-3 py-1 text-[13px] rounded-full font-medium transition-colors
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

	{#if selectedBanks.length < 2}
		<div class="rounded-md bg-[--surface-1] py-16 text-center" style="box-shadow: var(--shadow-sm)">
			<p class="text-[--text-tertiary] text-[15px]">Select at least 2 banks to compare</p>
			<p class="text-[--text-disabled] text-[13px] mt-1">Use the search above to find and add banks.</p>
		</div>
	{:else if loading}
		<div class="rounded-md bg-[--surface-1] py-16 text-center" style="box-shadow: var(--shadow-sm)">
			<div class="inline-block h-6 w-6 animate-spin rounded-full border-2 border-[--border-muted] border-t-[--accent]"></div>
			<p class="text-[--text-tertiary] text-[13px] mt-2">Loading comparison data...</p>
		</div>
	{:else if error}
		<div class="rounded-md bg-[--negative-muted] py-8 text-center" style="box-shadow: var(--shadow-sm)">
			<p class="text-[--negative] text-[14px]">Failed to load: {error}</p>
		</div>
	{:else if compareData}
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
		</div>

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
						<div class="rounded-md bg-[--surface-1] p-3" style="box-shadow: var(--shadow-sm)">
							<h3 class="text-[13px] font-semibold text-[--text-primary] mb-2">{metric.label}</h3>
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

		<!-- Comparison table -->
		{#if tableRows.length > 0}
			<section>
				<div class="flex items-center gap-2 mb-3">
					<div class="w-0.5 h-4 bg-[--accent] rounded-full"></div>
					<h2 class="text-[15px] font-semibold text-[--text-primary]">Latest Quarter Comparison</h2>
				</div>
				<div class="rounded-md bg-[--surface-1] overflow-x-auto" style="box-shadow: var(--shadow-sm)">
					<table class="w-full text-[13px]">
						<thead>
							<tr class="bg-[--surface-3]">
								<th class="text-left px-3 py-2 text-[11px] font-medium text-[--text-tertiary] uppercase tracking-wider sticky left-0 bg-[--surface-3]">Metric</th>
								{#each selectedBanks as bank (bank.cert)}
									<th class="text-right px-3 py-2 text-[11px] font-medium text-[--text-tertiary] uppercase tracking-wider whitespace-nowrap">
										{bank.name.length > 18 ? bank.name.slice(0, 18) + '...' : bank.name}
									</th>
								{/each}
							</tr>
						</thead>
						<tbody class="divide-y divide-[--surface-2]">
							{#each tableRows as row (row.metric.key)}
								<tr class="hover:bg-[--accent-muted] transition-colors">
									<td class="px-3 py-2 font-medium text-[--text-primary] sticky left-0 bg-[--surface-1]">{row.metric.label}</td>
									{#each selectedBanks as bank (bank.cert)}
										{@const val = row.values.get(bank.cert) ?? null}
										<td class="px-3 py-2 text-right whitespace-nowrap
											{bank.cert === row.best ? 'text-[--positive] font-semibold' : ''}
											{bank.cert === row.worst ? 'text-[--negative]' : ''}
											{bank.cert !== row.best && bank.cert !== row.worst ? 'text-[--text-primary]' : ''}" data-mono>
											{formatValue(val, row.metric.format)}
										</td>
									{/each}
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			</section>
		{/if}
	{/if}
</div>
