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
		onrowclick
	}: {
		columns: Column[];
		data: Record<string, any>[];
		currentSort?: string;
		currentOrder?: 'asc' | 'desc';
		onsort?: (key: string) => void;
		onrowclick?: (row: any) => void;
	} = $props();

	function handleHeaderClick(col: Column) {
		if (col.sortable && onsort) {
			onsort(col.key);
		}
	}

	function getCellValue(row: Record<string, any>, col: Column): string {
		const val = row[col.key];
		if (col.format) return col.format(val);
		if (val === null || val === undefined) return '—';
		return String(val);
	}
</script>

<div class="overflow-x-auto rounded-lg border border-gray-200">
	<table class="min-w-full divide-y divide-gray-200">
		<thead class="bg-gray-50">
			<tr>
				{#each columns as col}
					<th
						class="px-4 py-3 text-xs font-medium tracking-wider text-gray-500 uppercase
							{col.align === 'right' ? 'text-right' : 'text-left'}
							{col.sortable ? 'cursor-pointer select-none hover:bg-gray-100' : ''}"
						onclick={() => handleHeaderClick(col)}
					>
						<span class="inline-flex items-center gap-1">
							{col.label}
							{#if col.sortable && currentSort === col.key}
								<span class="text-gray-900">
									{currentOrder === 'asc' ? '▲' : '▼'}
								</span>
							{:else if col.sortable}
								<span class="text-gray-300">▲</span>
							{/if}
						</span>
					</th>
				{/each}
			</tr>
		</thead>
		<tbody class="divide-y divide-gray-200 bg-white">
			{#each data as row}
				<tr
					class="{onrowclick ? 'cursor-pointer hover:bg-gray-50' : ''}"
					onclick={() => onrowclick?.(row)}
				>
					{#each columns as col}
						<td
							class="whitespace-nowrap px-4 py-3 text-sm text-gray-700
								{col.align === 'right' ? 'text-right' : 'text-left'}"
						>
							{getCellValue(row, col)}
						</td>
					{/each}
				</tr>
			{/each}
		</tbody>
	</table>
</div>
