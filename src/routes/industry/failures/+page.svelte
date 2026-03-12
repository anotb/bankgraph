<script lang="ts">
	import DataTable from '$lib/components/data/DataTable.svelte';
	import { formatCurrency } from '$lib/utils/formatters.js';
	import type { Column } from '$lib/components/data/DataTable.svelte';

	let { data } = $props();

	let maxCount = $derived(Math.max(...data.yearlyData.map((d: { count: number }) => d.count), 1));

	/** Format a date string (may be MM/DD/YYYY, YYYY-MM-DD, or YYYYMMDD) for display */
	function formatFailDate(v: string | null): string {
		if (!v) return '\u2014';
		// Try to parse as a date and format to locale string
		const d = new Date(v);
		if (!isNaN(d.getTime())) {
			return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
		}
		return v;
	}

	/** Format cost in millions */
	function formatCostMillions(v: number | null): string {
		if (v == null) return '\u2014';
		return `$${(v / 1000).toFixed(0)}M`;
	}

	const columns: Column[] = [
		{ key: 'name', label: 'Bank Name', sortable: true },
		{ key: 'state', label: 'State' },
		{ key: 'fail_date', label: 'Failure Date', sortable: true, format: (v: string | null) => formatFailDate(v) },
		{ key: 'acquiring_institution', label: 'Acquirer' },
		{ key: 'total_assets', label: 'Assets', align: 'right', format: (v: number | null) => formatCurrency(v) },
		{ key: 'cost', label: 'Cost', align: 'right', format: (v: number | null) => formatCostMillions(v) }
	];

	let sortKey = $state('fail_date');
	let sortOrder: 'asc' | 'desc' = $state('desc');

	let sortedFailures = $derived.by(() => {
		const sorted = [...data.failures];
		sorted.sort((a: Record<string, any>, b: Record<string, any>) => {
			const aVal = a[sortKey];
			const bVal = b[sortKey];
			if (aVal == null && bVal == null) return 0;
			if (aVal == null) return 1;
			if (bVal == null) return -1;
			if (aVal < bVal) return sortOrder === 'asc' ? -1 : 1;
			if (aVal > bVal) return sortOrder === 'asc' ? 1 : -1;
			return 0;
		});
		return sorted;
	});

	function handleSort(key: string) {
		if (sortKey === key) {
			sortOrder = sortOrder === 'asc' ? 'desc' : 'asc';
		} else {
			sortKey = key;
			sortOrder = 'desc';
		}
	}
</script>

<svelte:head>
	<title>Bank Failures | Bank Data Explorer</title>
</svelte:head>

<div class="space-y-5">
	<a href="/industry" class="inline-flex items-center gap-1 text-[13px] text-[--text-tertiary] hover:text-[--text-primary] transition-colors">
		&larr; Industry Overview
	</a>

	<div>
		<h1 class="text-2xl font-semibold text-[--text-primary]">Bank Failures</h1>
		<p class="text-[13px] text-[--text-tertiary]">{data.failures.length} failed institutions since records began</p>
	</div>

	<!-- Failures by year chart -->
	{#if data.yearlyData.length > 0}
		<section>
			<div class="flex items-center gap-2 mb-3">
				<div class="w-0.5 h-4 bg-[--warning] rounded-full"></div>
				<h2 class="text-[15px] font-semibold text-[--text-primary]">Failures by Year</h2>
			</div>
			<div class="rounded-[5px] border border-[--border-muted] bg-[--surface-1] p-3" style="box-shadow: var(--shadow-sm)">
				<div class="flex items-end gap-px h-32">
					{#each data.yearlyData as d}
						<div class="flex-1 flex flex-col items-center gap-0.5 group" title="{d.year}: {d.count} failures">
							<span class="text-[9px] text-[--text-tertiary] opacity-0 group-hover:opacity-100 transition-opacity tabular-nums">{d.count}</span>
							<div
								class="w-full bg-[--warning] rounded-t-sm hover:bg-[--negative] transition-colors"
								style="height: {(d.count / maxCount) * 100}%"
							></div>
							<span class="text-[8px] text-[--text-disabled] tabular-nums">{d.year.slice(2)}</span>
						</div>
					{/each}
				</div>
			</div>
		</section>
	{/if}

	<!-- Failures table -->
	<DataTable
		{columns}
		data={sortedFailures}
		currentSort={sortKey}
		currentOrder={sortOrder}
		onsort={handleSort}
	/>
</div>
