<script lang="ts">
	import type { Snippet } from 'svelte';

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

<div class="overflow-x-auto rounded-[5px] border border-[--border-muted] table-shadow">
	<table class="min-w-full text-[13px]">
		<thead>
			<tr class="bg-[--surface-2] border-b border-[--border]">
				{#each columns as col}
					<th
						class="px-3 py-2 text-[11px] font-medium tracking-wider text-[--text-tertiary] uppercase
							{col.align === 'right' ? 'text-right' : 'text-left'}
							{col.sortable ? 'cursor-pointer select-none hover:text-[--text-secondary] transition-colors' : ''}"
						onclick={() => handleHeaderClick(col)}
					>
						<span class="inline-flex items-center gap-1">
							{col.label}
							{#if col.sortable && currentSort === col.key}
								<span class="text-[--accent]">
									{currentOrder === 'asc' ? '\u25B2' : '\u25BC'}
								</span>
							{:else if col.sortable}
								<span class="text-[--text-disabled]">\u25B2</span>
							{/if}
						</span>
					</th>
				{/each}
			</tr>
		</thead>
		<tbody class="data-table-body bg-[--surface-1]">
			{#each data as row, rowIdx}
				<tr
					class="{onrowclick ? 'cursor-pointer hover:bg-[--accent-muted] transition-colors duration-75' : ''}"
					onclick={() => onrowclick?.(row)}
				>
					{#each columns as col, i}
						<td
							class="whitespace-nowrap px-3 py-1.5
								{col.align === 'right' ? 'text-right tabular-nums' : 'text-left'}
								{i === 0 ? 'font-medium text-[--text-primary]' : 'text-[--text-secondary]'}"
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
