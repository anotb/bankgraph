<script lang="ts">
	import { getFieldLabel, getFieldMdrm, getFieldDef } from '$lib/utils/field-meta.js';
	import { formatPercent, formatCurrency, formatDate, formatNumber } from '$lib/utils/formatters.js';
	import { getMode } from '$lib/stores/mode.svelte.js';
	import type { Financial } from '$lib/types';

	let mode = $derived(getMode());

	let {
		data,
		metrics = ['roa', 'roe', 'nimy']
	}: {
		data: Financial[];
		metrics?: string[];
	} = $props();

	/** Safely access a dynamic field on a Financial record */
	function fieldVal(row: Financial, key: string): unknown {
		return (row as unknown as Record<string, unknown>)[key];
	}

	let transposed = $state(false);
	let sortCol = $state('repdte');
	let sortDir: 'asc' | 'desc' = $state('desc');

	// Fields reported in thousands (currency formatting)
	const CURRENCY_FIELDS = new Set([
		'asset', 'dep', 'eq', 'lnlsnet', 'lnre', 'lnci', 'lncon', 'sec',
		'netinc', 'intinc', 'eintexp', 'nim', 'nonii', 'nonix', 'elnatr', 'othbfhlb'
	]);

	// Fields where lower values are better (inverted highlighting)
	const LOWER_IS_BETTER = new Set([
		'nclnlsr', 'nco_ratio', 'eeffr', 'lnlsdepr', 'eintexp', 'nonix', 'elnatr'
	]);

	function formatVal(key: string, val: number | null): string {
		if (val === null || val === undefined) return '\u2014';
		if (CURRENCY_FIELDS.has(key)) return formatCurrency(val);
		if (key === 'numemp') return formatNumber(val);
		return formatPercent(val);
	}

	// Compute min/max for each metric column
	let minMax = $derived.by(() => {
		const result: Record<string, { min: number; max: number }> = {};
		for (const m of metrics) {
			const values = data
				.map((d) => fieldVal(d, m))
				.filter((v): v is number => v !== null && typeof v === 'number');
			if (values.length >= 2) {
				result[m] = { min: Math.min(...values), max: Math.max(...values) };
			}
		}
		return result;
	});

	// Sort data by current sort column/direction
	let sortedData = $derived.by(() => {
		const sorted = [...data];
		sorted.sort((a, b) => {
			const aVal = fieldVal(a, sortCol);
			const bVal = fieldVal(b, sortCol);
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
			sortDir = col === 'repdte' ? 'desc' : 'desc';
		}
	}

	/** Get highlight class for a cell value based on min/max and field semantics */
	function cellClass(val: number | null, m: string): string {
		if (val === null) return 'text-[--text-disabled]';
		const mm = minMax[m];
		if (!mm || mm.min === mm.max) return 'text-[--text-secondary]';

		const inverted = LOWER_IS_BETTER.has(m);
		if (val === mm.max) {
			return inverted
				? 'text-[--negative] font-medium'
				: 'text-[--positive] font-medium';
		}
		if (val === mm.min) {
			return inverted
				? 'text-[--positive] font-medium'
				: 'text-[--negative]';
		}
		return 'text-[--text-secondary]';
	}

	/** Short label: strip parenthetical suffixes like "(ROA)" */
	function shortLabel(field: string): string {
		return getFieldLabel(field).replace(/\s*\(.*\)/, '');
	}

	/** Sort indicator character */
	function sortIndicator(col: string): string {
		if (sortCol !== col) return '';
		return sortDir === 'asc' ? ' \u25B2' : ' \u25BC';
	}
</script>

<div>
	<!-- Toolbar -->
	<div class="flex items-center justify-between mb-1.5">
		<span class="text-[11px] text-[--text-tertiary] data-mono">
			{sortedData.length} quarters &times; {metrics.length} metrics
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
			<!-- Normal: rows = quarters, columns = metrics -->
			<table class="w-full text-[12px] border-collapse">
				<thead>
					<tr class="bg-[--surface-2] border-b border-[--border-muted]">
						<th
							class="pivot-sticky-col px-2 py-1.5 text-left text-[10px] font-semibold text-[--text-tertiary] uppercase tracking-wider cursor-pointer select-none bg-[--surface-2] z-20"
							onclick={() => handleSort('repdte')}
						>
							<span class="inline-flex items-center gap-0.5">
								Quarter{sortIndicator('repdte')}
							</span>
						</th>
						{#each metrics as m}
							<th
								class="px-2 py-1.5 text-right text-[10px] font-semibold uppercase tracking-wider cursor-pointer select-none whitespace-nowrap
									{sortCol === m ? 'text-[--accent]' : 'text-[--text-tertiary]'}"
								onclick={() => handleSort(m)}
								title={getFieldDef(m)?.description ?? ''}
							>
								{shortLabel(m)}{sortIndicator(m)}
								{#if mode === 'power' && getFieldMdrm(m)}
									<br /><span class="text-[9px] normal-case tracking-normal font-normal text-[--text-disabled]">{getFieldMdrm(m)}</span>
								{/if}
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
								class="pivot-sticky-col px-2 py-0.5 font-medium text-[--text-primary] tabular-nums whitespace-nowrap"
								style:background-color={i % 2 === 1 ? 'var(--surface-stripe)' : 'var(--surface-1)'}
							>
								{formatDate(row.repdte)}
							</td>
							{#each metrics as m}
								{@const val = fieldVal(row, m) as number | null}
								<td class="px-2 py-0.5 text-right tabular-nums whitespace-nowrap {cellClass(val, m)}">
									{formatVal(m, val)}
								</td>
							{/each}
						</tr>
					{/each}
				</tbody>
			</table>
		{:else}
			<!-- Transposed: rows = metrics, columns = quarters -->
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
								class="px-2 py-1.5 text-right text-[10px] font-semibold text-[--text-tertiary] tabular-nums whitespace-nowrap"
							>
								{formatDate(row.repdte)}
							</th>
						{/each}
					</tr>
				</thead>
				<tbody class="bg-[--surface-1]">
					{#each metrics as m, i}
						<tr
							class="pivot-row"
							style:background-color={i % 2 === 1 ? 'var(--surface-stripe)' : undefined}
						>
							<td
								class="pivot-sticky-col px-2 py-0.5 font-medium text-[--text-primary] whitespace-nowrap"
								style:background-color={i % 2 === 1 ? 'var(--surface-stripe)' : 'var(--surface-1)'}
								title={getFieldDef(m)?.description ?? ''}
							>
								{shortLabel(m)}
								{#if mode === 'power' && getFieldMdrm(m)}
									{' '}<span class="text-[9px] text-[--text-disabled]">{getFieldMdrm(m)}</span>
								{/if}
							</td>
							{#each sortedData as row}
								{@const val = fieldVal(row, m) as number | null}
								<td class="px-2 py-0.5 text-right tabular-nums whitespace-nowrap {cellClass(val, m)}">
									{formatVal(m, val)}
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

	.pivot-row:hover {
		background-color: var(--accent-muted) !important;
	}

	.pivot-row:hover .pivot-sticky-col {
		background-color: var(--accent-muted) !important;
	}
</style>
