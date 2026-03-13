<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import TimeSeriesChart from '$lib/components/charts/TimeSeriesChart.svelte';
	import ExportButton from '$lib/components/data/ExportButton.svelte';
	import { formatPercent, formatCurrency, formatNumber } from '$lib/utils/formatters.js';
	import type { CompareResponse, Financial, Institution } from '$lib/types';

	// ── Bank search state (matches SearchBar autocomplete pattern) ──
	let searchQuery = $state('');
	let searchResults = $state<Institution[]>([]);
	let selectedBanks = $state<Institution[]>([]);
	let searching = $state(false);
	let showDropdown = $state(false);
	let highlightedIndex = $state(-1);
	let fetchTimer: ReturnType<typeof setTimeout> | undefined;
	let lastQuery = $state('');

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

	let selectedMetrics = $derived(
		availableMetrics.filter((m) => selectedMetricKeys.has(m.key))
	);

	// ── Date range ──
	type DateRange = '5Y' | '10Y' | '20Y' | 'All';
	let selectedRange: DateRange = $state('10Y');
	const rangeButtons: DateRange[] = ['5Y', '10Y', '20Y', 'All'];

	// ── Compare data ──
	let compareData = $state<CompareResponse | null>(null);
	let loading = $state(false);
	let error = $state<string | null>(null);

	// ── URL state: read certs from query params on mount ──
	let initializedFromUrl = false;

	$effect(() => {
		if (initializedFromUrl) return;
		initializedFromUrl = true;
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
		const banks: Institution[] = [];
		for (const cert of certs.slice(0, 10)) {
			try {
				const res = await fetch(`/api/v1/banks/${cert}`);
				if (res.ok) {
					const json = (await res.json()) as Institution & { latest_financials?: unknown };
					if (json.cert) banks.push(json);
				}
			} catch {
				// Skip banks that fail to load
			}
		}
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

	// ── Autocomplete search (matches SearchBar pattern: $effect-driven, keyboard nav) ──
	$effect(() => {
		const q = searchQuery.trim();

		if (q.length < 2) {
			searchResults = [];
			showDropdown = false;
			searching = false;
			lastQuery = '';
			return;
		}

		clearTimeout(fetchTimer);
		searching = true;
		showDropdown = true;
		fetchTimer = setTimeout(async () => {
			try {
				const res = await fetch(
					`/api/v1/banks?q=${encodeURIComponent(q)}&limit=8&active=1`
				);
				if (!res.ok) {
					searching = false;
					return;
				}
				const json = (await res.json()) as { data?: Institution[] };
				const selectedCerts = new Set(selectedBanks.map((b) => b.cert));
				searchResults = (json.data ?? []).filter((b) => !selectedCerts.has(b.cert));
				highlightedIndex = -1;
				lastQuery = q;
				showDropdown = true;
			} catch {
				// Silently ignore
			} finally {
				searching = false;
			}
		}, 300);
	});

	function handleSearchInput(e: Event): void {
		searchQuery = (e.target as HTMLInputElement).value;
	}

	function handleSearchKeydown(e: KeyboardEvent): void {
		if (showDropdown && searchResults.length > 0) {
			if (e.key === 'ArrowDown') {
				e.preventDefault();
				highlightedIndex = (highlightedIndex + 1) % searchResults.length;
				return;
			}
			if (e.key === 'ArrowUp') {
				e.preventDefault();
				highlightedIndex =
					highlightedIndex <= 0 ? searchResults.length - 1 : highlightedIndex - 1;
				return;
			}
			if (e.key === 'Enter' && highlightedIndex >= 0) {
				e.preventDefault();
				addBank(searchResults[highlightedIndex]);
				return;
			}
			if (e.key === 'Escape') {
				e.preventDefault();
				showDropdown = false;
				return;
			}
		}
	}

	function addBank(bank: Institution): void {
		if (selectedBanks.length >= 10) return;
		if (selectedBanks.some((b) => b.cert === bank.cert)) return;
		selectedBanks = [...selectedBanks, bank];
		searchQuery = '';
		searchResults = [];
		showDropdown = false;
		highlightedIndex = -1;
	}

	function removeBank(cert: number): void {
		selectedBanks = selectedBanks.filter((b) => b.cert !== cert);
	}

	function handleSearchBlur(): void {
		setTimeout(() => {
			showDropdown = false;
		}, 200);
	}

	function handleSearchFocus(): void {
		if (searchResults.length > 0 || lastQuery.length >= 2) {
			showDropdown = true;
		}
	}

	function handleSearchClear(): void {
		searchQuery = '';
		searchResults = [];
		showDropdown = false;
		searching = false;
		lastQuery = '';
		highlightedIndex = -1;
	}

	// ── Popular comparisons ──
	const popularComparisons = [
		{ label: 'JPMorgan vs Bank of America', certs: [628, 3510] },
		{ label: 'Wells Fargo vs Citibank', certs: [3511, 7213] },
		{ label: 'Top 4 Banks', certs: [628, 3510, 3511, 7213] }
	];

	async function loadPopularComparison(certs: number[]): Promise<void> {
		selectedBanks = [];
		await loadBanksFromCerts(certs);
	}

	// ── Fetch comparison data when banks or metrics change ──
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

		fetch(`/api/v1/compare?certs=${certs.join(',')}&metrics=${metrics.join(',')}`)
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

	// ── Filter data by date range ──
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

	// ── Banks with no financials data ──
	let banksWithNoData = $derived.by(() => {
		if (!compareData) return [];
		return selectedBanks.filter((bank) => {
			const rows = compareData!.data[bank.cert];
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
				const rows = compareData!.data[bank.cert];
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
			const rowsA = compareData!.data[certA];
			const rowsB = compareData!.data[certB];
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
</script>

<svelte:head>
	<title>Compare | Bank Data Explorer</title>
	<meta name="description" content="Compare financial metrics across multiple FDIC-insured banks side by side." />
	<meta property="og:title" content="Compare | Bank Data Explorer" />
	<meta property="og:description" content="Compare financial metrics across multiple FDIC-insured banks side by side." />
</svelte:head>

<div class="space-y-5">
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

		<!-- Search input (autocomplete with keyboard nav, loading state, dropdown) -->
		<div class="relative max-w-md">
			<div class="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
				<svg
					class="h-4 w-4 text-[--text-disabled]"
					fill="none"
					stroke="currentColor"
					viewBox="0 0 24 24"
				>
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="2"
						d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
					/>
				</svg>
			</div>
			<input
				type="text"
				value={searchQuery}
				oninput={handleSearchInput}
				onkeydown={handleSearchKeydown}
				onblur={handleSearchBlur}
				onfocus={handleSearchFocus}
				placeholder="Search banks by name or cert..."
				disabled={selectedBanks.length >= 10}
				class="block w-full rounded-[5px] border border-[--border-muted] bg-[--surface-1] py-2 pr-9 pl-9
					text-[14px] text-[--text-primary] placeholder:text-[--text-disabled]
					focus:border-[--accent] focus:ring-2 focus:ring-[--accent]/20 focus:outline-none
					transition-all duration-150 disabled:opacity-50"
				style="box-shadow: var(--shadow-xs)"
			/>
			{#if searchQuery}
				<button
					type="button"
					onclick={handleSearchClear}
					aria-label="Clear search"
					class="absolute inset-y-0 right-0 flex items-center pr-3 text-[--text-disabled] hover:text-[--text-secondary]"
				>
					{#if searching}
						<div
							class="h-4 w-4 animate-spin rounded-full border-2 border-[--border] border-t-[--accent]"
						></div>
					{:else}
						<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M6 18L18 6M6 6l12 12"
							/>
						</svg>
					{/if}
				</button>
			{:else if searching}
				<div class="absolute inset-y-0 right-0 flex items-center pr-3">
					<div
						class="h-4 w-4 animate-spin rounded-full border-2 border-[--border] border-t-[--accent]"
					></div>
				</div>
			{/if}

			<!-- Autocomplete dropdown -->
			{#if showDropdown}
				<div
					class="absolute z-50 mt-1 w-full overflow-hidden rounded-md border border-[--border-muted] bg-[--surface-1] max-h-[320px] overflow-y-auto"
					style="box-shadow: var(--shadow-md)"
					role="listbox"
				>
					{#if searching && searchResults.length === 0}
						<div class="px-3 py-2.5 text-[13px] text-[--text-tertiary]">Searching...</div>
					{:else if !searching && searchResults.length === 0 && lastQuery.length >= 2}
						<div class="px-3 py-2.5 text-[13px] text-[--text-tertiary]">No results</div>
					{:else}
						{#each searchResults as bank, i (bank.cert)}
							<button
								type="button"
								role="option"
								aria-selected={i === highlightedIndex}
								class="flex w-full items-center justify-between px-3 py-2 text-left cursor-pointer transition-colors
									{i === highlightedIndex
									? 'bg-[--accent-muted]'
									: 'hover:bg-[--accent-muted]'}"
								onmousedown={() => addBank(bank)}
							>
								<span class="font-medium text-[--text-primary] text-[13px] truncate">
									{bank.name}
								</span>
								<span class="ml-2 shrink-0 text-[12px] text-[--text-tertiary] data-mono">
									{bank.city ?? ''}{bank.city && bank.state ? ', ' : ''}{bank.state ??
										''}
									{#if bank.total_assets}
										<span class="text-[--text-disabled] ml-1"
											>({formatCurrency(bank.total_assets)})</span
										>
									{/if}
								</span>
							</button>
						{/each}
					{/if}
				</div>
			{/if}
		</div>

		<!-- Selected bank chips -->
		{#if selectedBanks.length > 0}
			<div class="flex flex-wrap gap-1.5 mt-2">
				{#each selectedBanks as bank (bank.cert)}
					<span
						class="inline-flex items-center gap-1 rounded-full bg-[--accent-muted] text-[--accent-text] px-2.5 py-1 text-[12px] font-medium"
					>
						<a href="/banks/{bank.cert}" class="hover:underline" title={bank.name}>
							{bank.name.length > 25 ? bank.name.slice(0, 25) + '...' : bank.name}
						</a>
						<button
							type="button"
							class="ml-0.5 hover:text-[--negative] transition-colors"
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

	<!-- Empty / Loading / Error / Results -->
	{#if selectedBanks.length < 2}
		<div
			class="rounded-md bg-[--surface-1] py-12 px-6 text-center"
			style="box-shadow: var(--shadow-sm)"
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
									class="px-3 py-1.5 text-[12px] rounded-full border border-[--border-muted] bg-[--surface-2] text-[--text-secondary]
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
							class="rounded-md bg-[--surface-1] p-3"
							style="box-shadow: var(--shadow-sm)"
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
					class="rounded-md bg-[--surface-1] overflow-x-auto max-h-[500px] overflow-y-auto"
					style="box-shadow: var(--shadow-sm)"
				>
					<table class="w-full text-[13px]">
						<thead class="sticky top-0 z-10">
							<tr class="bg-[--surface-3]">
								<th
									class="text-left px-3 py-2 text-[11px] font-medium text-[--text-tertiary] uppercase tracking-wider sticky left-0 bg-[--surface-3] z-20"
								>
									Metric
								</th>
								{#each selectedBanks as bank (bank.cert)}
									<th
										class="text-right px-3 py-2 text-[11px] font-medium uppercase tracking-wider whitespace-nowrap"
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
										class="px-3 py-2 font-medium text-[--text-primary] sticky left-0 bg-[--surface-1] z-[5]"
									>
										{row.metric.label}
									</td>
									{#each selectedBanks as bank (bank.cert)}
										{@const val = row.values.get(bank.cert) ?? null}
										<td
											class="px-3 py-2 text-right whitespace-nowrap data-mono {cellBg(bank.cert, row.best, row.worst)}
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
