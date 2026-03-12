<script lang="ts">
	import type { Snippet } from 'svelte';
	import { getMode } from '$lib/stores/mode.svelte.js';

	let mode = $derived(getMode());

	export interface Column {
		key: string;
		label: string;
		sortable?: boolean;
		format?: (val: any) => string;
		align?: 'left' | 'right';
	}

	let {
		columns,
		data,
		currentSort = '',
		currentOrder = 'asc',
		onsort,
		onrowclick,
		customColumns
	}: {
		columns: Column[];
		data: Record<string, any>[];
		currentSort?: string;
		currentOrder?: 'asc' | 'desc';
		onsort?: (key: string) => void;
		onrowclick?: (row: any) => void;
		customColumns?: Record<string, Snippet<[Record<string, any>]>>;
	} = $props();

	function handleHeaderClick(col: Column) {
		if (col.sortable && onsort) {
			onsort(col.key);
		}
	}

	function getCellValue(row: Record<string, any>, col: Column): string {
		const val = row[col.key];
		if (col.format) return col.format(val);
		if (val === null || val === undefined) return '\u2014';
		return String(val);
	}
</script>

<div class="overflow-x-auto rounded-md bg-[--surface-1] table-shadow">
	<table class="min-w-full text-[13px]">
		<thead>
			<tr class="bg-[--surface-3] border-b border-[--border]">
				{#each columns as col, i}
					<th
						class="px-3 py-2.5 text-[11px] font-semibold tracking-wider text-[--text-secondary] uppercase
							{col.align === 'right' ? 'text-right' : 'text-left'}
							{col.sortable ? 'cursor-pointer select-none hover:text-[--text-primary] transition-colors' : ''}
							{i === 0 ? 'sticky left-0 z-20 bg-[--surface-3]' : ''}"
						onclick={() => handleHeaderClick(col)}
					>
						<span class="inline-flex items-center gap-1">
							{col.label}
							{#if col.sortable && currentSort === col.key}
								<span class="text-[--accent]">
									{currentOrder === 'asc' ? '\u25B2' : '\u25BC'}
								</span>
							{:else if col.sortable}
								<span class="text-[--text-disabled]">{'\u25B2'}</span>
							{/if}
						</span>
					</th>
				{/each}
			</tr>
		</thead>
		<tbody class="data-table-body bg-[--surface-1]">
			{#each data as row, rowIdx}
				<tr
					class="relative {onrowclick ? 'cursor-pointer group transition-colors duration-75' : ''}"
					class:hover-row={!!onrowclick}
					onclick={() => onrowclick?.(row)}
				>
					{#each columns as col, i}
						<td
							class="whitespace-nowrap {mode === 'power' ? 'px-2 py-0.5 text-[12px]' : 'px-3 py-1.5'}
								{col.align === 'right' ? 'text-right data-mono' : 'text-left'}
								{i === 0 ? 'font-medium text-[--text-primary] sticky left-0 z-10 bg-inherit' : 'text-[--text-secondary]'}"
						>
							{#if customColumns?.[col.key]}
								{@render customColumns[col.key](row)}
							{:else}
								{getCellValue(row, col)}
							{/if}
						</td>
					{/each}
				</tr>
			{/each}
		</tbody>
	</table>
</div>

<style>
	tr.hover-row:hover {
		background-color: var(--accent-muted);
		box-shadow: inset 3px 0 0 var(--accent);
	}
</style>
