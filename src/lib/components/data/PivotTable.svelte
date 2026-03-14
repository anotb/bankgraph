<script lang="ts">
	import { formatPercent, formatCurrency, formatNumber } from '$lib/utils/formatters.js';

	type ColumnDef = {
		key: string;
		label: string;
		format?: 'percent' | 'currency' | 'number';
	};

	let {
		data,
		columns,
		rowKey,
		rowLabel = '',
		transpose = false
	}: {
		data: Record<string, any>[];
		columns: ColumnDef[];
		rowKey: string;
		rowLabel?: string;
		transpose?: boolean;
	} = $props();

	let transposed = $state(false);
	let sortCol = $state('');
	let sortDir: 'asc' | 'desc' = $state('desc');

	// Sync external transpose prop into local state on mount
	$effect(() => {
		transposed = transpose;
	});

	// Default sortCol to rowKey
	$effect(() => {
		if (!sortCol) sortCol = rowKey;
	});

	function formatVal(col: ColumnDef, val: unknown): string {
		if (val === null || val === undefined) return '\u2014';
		const n = Number(val);
		if (Number.isNaN(n)) return String(val);
		if (col.format === 'percent') return formatPercent(n);
		if (col.format === 'currency') return formatCurrency(n);
		if (col.format === 'number') return formatNumber(n);
		return String(val);
	}

	function isNumericCol(col: ColumnDef): boolean {
		return col.format === 'percent' || col.format === 'currency' || col.format === 'number';
	}

	// Min/max per numeric column
	let minMax = $derived.by(() => {
		const result: Record<string, { min: number; max: number }> = {};
		for (const col of columns) {
			if (!isNumericCol(col)) continue;
			const values = data
				.map((d) => d[col.key])
				.filter((v): v is number => v !== null && v !== undefined && typeof v === 'number');
			if (values.length >= 2) {
				result[col.key] = { min: Math.min(...values), max: Math.max(...values) };
			}
		}
		return result;
	});

	// Sort data
	let sortedData = $derived.by(() => {
		const sorted = [...data];
		sorted.sort((a, b) => {
			const aVal = a[sortCol];
			const bVal = b[sortCol];
			if (aVal == null && bVal == null) return 0;
			if (aVal == null) return 1;
			if (bVal == null) return -1;
			if (aVal < bVal) return sortDir === 'asc' ? -1 : 1;
			if (aVal > bVal) return sortDir === 'asc' ? 1 : -1;
			return 0;
		});
		return sorted;
	});

	function handleSort(col: string): void {
		if (sortCol === col) {
			sortDir = sortDir === 'asc' ? 'desc' : 'asc';
		} else {
			sortCol = col;
			sortDir = 'desc';
		}
	}

	function cellClass(val: unknown, key: string): string {
		if (val === null || val === undefined) return 'text-[--text-disabled]';
		const mm = minMax[key];
		if (!mm || mm.min === mm.max) return 'text-[--text-secondary]';
		const n = Number(val);
		if (Number.isNaN(n)) return 'text-[--text-secondary]';
		if (n === mm.max) return 'text-[--positive] font-semibold';
		if (n === mm.min) return 'text-[--negative]';
		return 'text-[--text-secondary]';
	}

	function sortIndicator(col: string): string {
		if (sortCol !== col) return '';
		return sortDir === 'asc' ? ' \u25B2' : ' \u25BC';
	}

	let effectiveRowLabel = $derived(rowLabel || rowKey);
</script>

<div>
	<!-- Toolbar -->
	<div class="flex items-center justify-between mb-1.5">
		<span class="text-[11px] text-[--text-tertiary] data-mono">
			{sortedData.length} rows &times; {columns.length} columns
		</span>
		<button
			type="button"
			onclick={() => (transposed = !transposed)}
			class="px-2 py-0.5 text-[11px] rounded border border-[--border-muted] text-[--text-secondary] hover:text-[--text-primary] hover:border-[--border] hover:bg-[--surface-2] transition-colors"
			title="Swap rows and columns"
		>
			&#8635; Transpose
		</button>
	</div>

	<!-- Table container -->
	<div
		class="pivot-wrap rounded-[5px] border border-[--border-muted] overflow-x-auto"
		style="box-shadow: var(--shadow-sm)"
	>
		{#if !transposed}
			<!-- Normal: rows = data rows, columns = column defs -->
			<table class="w-full text-[12px] border-collapse">
				<thead>
					<tr class="bg-[--surface-2] border-b border-[--border-muted]">
						<th
							class="pivot-sticky-col px-2 py-1.5 text-left text-[10px] font-semibold text-[--text-tertiary] uppercase tracking-wider cursor-pointer select-none bg-[--surface-2] z-20"
							onclick={() => handleSort(rowKey)}
						>
							<span class="inline-flex items-center gap-0.5">
								{effectiveRowLabel}{sortIndicator(rowKey)}
							</span>
						</th>
						{#each columns as col}
							<th
								class="px-2 py-1.5 text-right text-[10px] font-semibold uppercase tracking-wider cursor-pointer select-none whitespace-nowrap
									{sortCol === col.key ? 'text-[--accent]' : 'text-[--text-tertiary]'}"
								onclick={() => handleSort(col.key)}
							>
								{col.label}{sortIndicator(col.key)}
							</th>
						{/each}
					</tr>
				</thead>
				<tbody class="bg-[--surface-1]">
					{#each sortedData as row, i}
						<tr
							class="pivot-row"
							style:background-color={i % 2 === 1 ? 'var(--surface-stripe)' : undefined}
						>
							<td
								class="pivot-sticky-col px-2 py-0.5 font-medium text-[--text-primary] data-mono whitespace-nowrap"
								style:background-color={i % 2 === 1 ? 'var(--surface-stripe)' : 'var(--surface-1)'}
							>
								{row[rowKey] ?? '\u2014'}
							</td>
							{#each columns as col}
								{@const val = row[col.key]}
								<td class="px-2 py-0.5 text-right data-mono whitespace-nowrap {cellClass(val, col.key)}">
									{formatVal(col, val)}
								</td>
							{/each}
						</tr>
					{/each}
				</tbody>
			</table>
		{:else}
			<!-- Transposed: rows = column defs, columns = data rows -->
			<table class="w-full text-[12px] border-collapse">
				<thead>
					<tr class="bg-[--surface-2] border-b border-[--border-muted]">
						<th
							class="pivot-sticky-col px-2 py-1.5 text-left text-[10px] font-semibold text-[--text-tertiary] uppercase tracking-wider bg-[--surface-2] z-20"
						>
							Metric
						</th>
						{#each sortedData as row}
							<th
								class="px-2 py-1.5 text-right text-[10px] font-semibold text-[--text-tertiary] data-mono whitespace-nowrap"
							>
								{row[rowKey] ?? '\u2014'}
							</th>
						{/each}
					</tr>
				</thead>
				<tbody class="bg-[--surface-1]">
					{#each columns as col, i}
						<tr
							class="pivot-row"
							style:background-color={i % 2 === 1 ? 'var(--surface-stripe)' : undefined}
						>
							<td
								class="pivot-sticky-col px-2 py-0.5 font-medium text-[--text-primary] whitespace-nowrap"
								style:background-color={i % 2 === 1 ? 'var(--surface-stripe)' : 'var(--surface-1)'}
							>
								{col.label}
							</td>
							{#each sortedData as row}
								{@const val = row[col.key]}
								<td class="px-2 py-0.5 text-right data-mono whitespace-nowrap {cellClass(val, col.key)}">
									{formatVal(col, val)}
								</td>
							{/each}
						</tr>
					{/each}
				</tbody>
			</table>
		{/if}
	</div>
</div>

<style>
	.pivot-wrap {
		max-height: 70vh;
		overflow-y: auto;
	}

	.pivot-sticky-col {
		position: sticky;
		left: 0;
		z-index: 10;
	}

	/* Sticky header row */
	thead th {
		position: sticky;
		top: 0;
		z-index: 15;
	}

	/* Corner cell: sticky both axes */
	thead .pivot-sticky-col {
		z-index: 25;
	}

	.pivot-row {
		height: 24px;
	}

	.pivot-row:hover {
		background-color: var(--accent-muted) !important;
	}

	.pivot-row:hover .pivot-sticky-col {
		background-color: var(--accent-muted) !important;
	}
</style>
