<script lang="ts">
	import { getFieldLabel, getFieldMdrm } from '$lib/utils/field-meta.js';
	import { formatPercent, formatCurrency, formatDate } from '$lib/utils/formatters.js';
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

	const CURRENCY_FIELDS = new Set([
		'asset',
		'dep',
		'eq',
		'lnlsnet',
		'lnre',
		'lnci',
		'lncon',
		'sec',
		'netinc',
		'intinc',
		'eintexp',
		'nim',
		'nonii',
		'nonix',
		'elnatr',
		'othbfhlb'
	]);

	function formatVal(key: string, val: number | null): string {
		if (val === null) return '\u2014';
		if (CURRENCY_FIELDS.has(key)) return formatCurrency(val);
		if (key === 'numemp') return val.toLocaleString();
		return formatPercent(val);
	}

	let minMax = $derived.by(() => {
		const result: Record<string, { min: number; max: number }> = {};
		for (const m of metrics) {
			const values = data
				.map((d) => fieldVal(d, m))
				.filter((v): v is number => v !== null && typeof v === 'number');
			if (values.length > 0) {
				result[m] = { min: Math.min(...values), max: Math.max(...values) };
			}
		}
		return result;
	});

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

	function handleSort(col: string) {
		if (sortCol === col) {
			sortDir = sortDir === 'asc' ? 'desc' : 'asc';
		} else {
			sortCol = col;
			sortDir = 'desc';
		}
	}

	function cellClass(val: number | null, m: string): string {
		const mm = minMax[m];
		if (val !== null && mm && val === mm.max) return 'text-[--positive] font-medium';
		if (val !== null && mm && val === mm.min) return 'text-[--negative]';
		return 'text-[--text-secondary]';
	}
</script>

<div>
	<div class="flex items-center justify-between mb-2">
		<span class="text-[11px] text-[--text-tertiary]"
			>{sortedData.length} quarters &times; {metrics.length} metrics</span
		>
		<button
			type="button"
			onclick={() => (transposed = !transposed)}
			class="text-[11px] text-[--text-secondary] hover:text-[--text-primary] transition-colors"
		>
			&#8635; Transpose
		</button>
	</div>
	<div
		class="rounded-[5px] border border-[--border-muted] overflow-x-auto"
		style="box-shadow: var(--shadow-sm)"
	>
		{#if !transposed}
			<table class="w-full text-[12px]">
				<thead>
					<tr class="bg-[--surface-2] border-b border-[--border-muted]">
						<th
							class="px-2 py-1.5 text-left text-[10px] font-medium text-[--text-tertiary] uppercase tracking-wider cursor-pointer sticky left-0 bg-[--surface-2]"
							onclick={() => handleSort('repdte')}
						>
							Quarter {sortCol === 'repdte' ? (sortDir === 'asc' ? '\u25B2' : '\u25BC') : ''}
						</th>
						{#each metrics as m}
							<th
								class="px-2 py-1.5 text-right text-[10px] font-medium text-[--text-tertiary] uppercase tracking-wider cursor-pointer whitespace-nowrap"
								onclick={() => handleSort(m)}
							>
								{getFieldLabel(m).replace(/\s*\(.*\)/, '')}
								{sortCol === m ? (sortDir === 'asc' ? '\u25B2' : '\u25BC') : ''}
								{#if mode === 'power' && getFieldMdrm(m)}
									<br/><span class="text-[9px] normal-case tracking-normal font-normal text-[--text-disabled]">{getFieldMdrm(m)}</span>
								{/if}
							</th>
						{/each}
					</tr>
				</thead>
				<tbody class="bg-[--surface-1]">
					{#each sortedData as row, i}
						<tr
							class="hover:bg-[--accent-muted] transition-colors"
							style:background-color={i % 2 === 1 ? 'var(--surface-stripe)' : undefined}
						>
							<td
								class="px-2 py-1 font-medium text-[--text-primary] tabular-nums sticky left-0"
								style:background-color={i % 2 === 1
									? 'var(--surface-stripe)'
									: 'var(--surface-1)'}
							>
								{formatDate(row.repdte)}
							</td>
							{#each metrics as m}
								{@const val = fieldVal(row, m) as number | null}
								<td class="px-2 py-1 text-right tabular-nums {cellClass(val, m)}">
									{formatVal(m, val)}
								</td>
							{/each}
						</tr>
					{/each}
				</tbody>
			</table>
		{:else}
			<table class="w-full text-[12px]">
				<thead>
					<tr class="bg-[--surface-2] border-b border-[--border-muted]">
						<th
							class="px-2 py-1.5 text-left text-[10px] font-medium text-[--text-tertiary] uppercase tracking-wider sticky left-0 bg-[--surface-2]"
							>Metric</th
						>
						{#each sortedData as row}
							<th
								class="px-2 py-1.5 text-right text-[10px] font-medium text-[--text-tertiary] tabular-nums whitespace-nowrap"
								>{formatDate(row.repdte)}</th
							>
						{/each}
					</tr>
				</thead>
				<tbody class="bg-[--surface-1]">
					{#each metrics as m, i}
						<tr
							class="hover:bg-[--accent-muted] transition-colors"
							style:background-color={i % 2 === 1 ? 'var(--surface-stripe)' : undefined}
						>
							<td
								class="px-2 py-1 font-medium text-[--text-primary] whitespace-nowrap sticky left-0"
								style:background-color={i % 2 === 1
									? 'var(--surface-stripe)'
									: 'var(--surface-1)'}
								>{getFieldLabel(m).replace(/\s*\(.*\)/, '')}{#if mode === 'power' && getFieldMdrm(m)}{' '}<span class="text-[9px] text-[--text-disabled]">{getFieldMdrm(m)}</span>{/if}</td
							>
							{#each sortedData as row}
								{@const val = fieldVal(row, m) as number | null}
								<td class="px-2 py-1 text-right tabular-nums text-[--text-secondary]"
									>{formatVal(m, val)}</td
								>
							{/each}
						</tr>
					{/each}
				</tbody>
			</table>
		{/if}
	</div>
</div>
