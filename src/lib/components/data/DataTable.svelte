<script lang="ts">
	import type { Snippet } from 'svelte';
	import { getMode } from '$lib/stores/mode.svelte.js';
	import EmptyState from './EmptyState.svelte';
	import Skeleton from './Skeleton.svelte';

	let mode = $derived(getMode());

	export interface Column {
		key: string;
		label: string;
		sortable?: boolean;
		format?: (val: any) => string;
		align?: 'left' | 'right';
		/** Tooltip text shown on header hover (e.g. MDRM code in power mode) */
		tooltip?: string;
		/** If true, column is only visible in power mode */
		powerOnly?: boolean;
	}

	let {
		columns,
		data,
		currentSort = '',
		currentOrder = 'asc',
		loading = false,
		dense = false,
		totalRows,
		onsort,
		onrowclick,
		customColumns
	}: {
		columns: Column[];
		data: Record<string, any>[];
		currentSort?: string;
		currentOrder?: 'asc' | 'desc';
		loading?: boolean;
		/** Compact layout: tighter padding, smaller font */
		dense?: boolean;
		/** Total row count (for "Showing X of Y rows" footer) */
		totalRows?: number;
		onsort?: (key: string) => void;
		onrowclick?: (row: any) => void;
		customColumns?: Record<string, Snippet<[Record<string, any>]>>;
	} = $props();

	// Density-derived classes
	let tableFontClass = $derived(dense ? 'text-[12px]' : 'text-[13px]');
	let headerPadClass = $derived(dense ? 'px-2 py-1.5' : 'px-3 py-2.5');
	let cellPadClass = $derived(dense ? 'px-2 py-1' : 'px-3 py-1.5');
	let skeletonPadClass = $derived(dense ? 'px-2 py-1' : 'px-3 py-2');

	// Column visibility (power mode)
	let hiddenColumns = $state<Set<string>>(new Set());
	let showColumnPicker = $state(false);

	let visibleColumns = $derived(
		mode === 'power'
			? columns.filter((c) => !hiddenColumns.has(c.key))
			: columns.filter((c) => !c.powerOnly)
	);

	function toggleColumnVisibility(key: string) {
		const next = new Set(hiddenColumns);
		if (next.has(key)) {
			next.delete(key);
		} else {
			// Don't allow hiding all columns
			if (visibleColumns.length <= 1) return;
			next.add(key);
		}
		hiddenColumns = next;
	}

	// Click-outside handler for column picker
	let columnPickerEl: HTMLDivElement | undefined = $state();

	function handleDocumentMousedown(e: MouseEvent) {
		if (showColumnPicker && columnPickerEl && !columnPickerEl.contains(e.target as Node)) {
			showColumnPicker = false;
		}
	}

	$effect(() => {
		if (showColumnPicker) {
			document.addEventListener('mousedown', handleDocumentMousedown);
			return () => document.removeEventListener('mousedown', handleDocumentMousedown);
		}
	});

	// Keyboard navigation (power mode)
	let selectedRowIdx = $state(-1);
	let tableWrapper: HTMLDivElement | undefined = $state();
	let showKbHint = $state(true);

	function handleKeydown(e: KeyboardEvent) {
		if (mode !== 'power' || data.length === 0) return;

		if (e.key === 'j') {
			e.preventDefault();
			selectedRowIdx = Math.min(selectedRowIdx + 1, data.length - 1);
			scrollSelectedIntoView();
		} else if (e.key === 'k') {
			e.preventDefault();
			selectedRowIdx = Math.max(selectedRowIdx - 1, 0);
			scrollSelectedIntoView();
		} else if (e.key === 'Enter' && selectedRowIdx >= 0 && onrowclick) {
			e.preventDefault();
			onrowclick(data[selectedRowIdx]);
		} else if (e.key === 'Escape') {
			selectedRowIdx = -1;
		}
	}

	function scrollSelectedIntoView() {
		// Defer to next tick so the class is applied
		requestAnimationFrame(() => {
			const row = tableWrapper?.querySelector('tr.kb-selected');
			row?.scrollIntoView({ block: 'nearest' });
		});
	}

	// Sort transition state
	let sorting = $state(false);
	let prevSort = $state('');
	let prevOrder = $state('');

	$effect(() => {
		if (currentSort !== prevSort || currentOrder !== prevOrder) {
			if (prevSort !== '') {
				sorting = true;
				setTimeout(() => (sorting = false), 100);
			}
			prevSort = currentSort;
			prevOrder = currentOrder;
		}
	});

	// Reset keyboard selection when data changes
	$effect(() => {
		// Touch data.length to track it
		data.length;
		selectedRowIdx = -1;
	});

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

<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<div
	class="overflow-x-auto rounded-md bg-[--surface-1] table-shadow relative"
	bind:this={tableWrapper}
	tabindex={mode === 'power' ? 0 : undefined}
	onkeydown={handleKeydown}
	role={mode === 'power' ? 'grid' : undefined}
	aria-live="polite"
	aria-busy={loading}
>
	{#if mode === 'power'}
		<!-- Column visibility toggle -->
		<div class="absolute top-1.5 right-1.5 z-30" bind:this={columnPickerEl}>
			<button
				class="p-2 sm:p-1 rounded text-[--text-disabled] hover:text-[--text-secondary] hover:bg-[--surface-3] transition-colors"
				onclick={() => (showColumnPicker = !showColumnPicker)}
				title="Toggle columns"
				aria-label="Toggle column visibility"
				aria-expanded={showColumnPicker}
			>
				<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
					<circle cx="12" cy="12" r="3" />
					<path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
				</svg>
			</button>

			{#if showColumnPicker}
				<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
				<div
					class="absolute right-0 top-7 bg-[--surface-2] border border-[--border] rounded-md shadow-lg py-1 min-w-[160px]"
					onkeydown={(e) => e.stopPropagation()}
					role="group"
					aria-label="Column visibility"
				>
					{#each columns as col}
						<label class="flex items-center gap-2 px-3 py-2 sm:py-1 text-[12px] text-[--text-secondary] hover:bg-[--surface-3] cursor-pointer select-none">
							<input
								type="checkbox"
								checked={!hiddenColumns.has(col.key)}
								onchange={() => toggleColumnVisibility(col.key)}
								class="accent-[--accent]"
							/>
							{col.label}
						</label>
					{/each}
				</div>
			{/if}
		</div>
	{/if}

	{#if loading || data.length === 0}
		{#if loading}
			<!-- Skeleton loading rows -->
			<table class="min-w-full {tableFontClass}">
				<thead>
					<tr class="bg-[--surface-3] border-b border-[--border]">
						{#each visibleColumns as col, i}
							<th
								scope="col"
								class="{headerPadClass} text-[11px] font-semibold tracking-wider uppercase
									{col.align === 'right' ? 'text-right' : 'text-left'}
									{i === 0 ? 'sticky left-0 z-20 bg-[--surface-3]' : ''}
									text-[--text-secondary]"
							>
								{col.label}
							</th>
						{/each}
					</tr>
				</thead>
				<tbody class="bg-[--surface-1]">
					{#each { length: 5 } as _, rowIdx}
						<tr>
							{#each visibleColumns as col, i}
								<td class="{skeletonPadClass} {i === 0 ? 'sticky left-0 z-10 bg-inherit' : ''}">
									<Skeleton
										width={i === 0 ? '60%' : col.align === 'right' ? '50%' : '45%'}
										height="14px"
									/>
								</td>
							{/each}
						</tr>
					{/each}
				</tbody>
			</table>
		{:else}
			<EmptyState title="No data" icon="data" />
		{/if}
	{:else}
		<table class="min-w-full {tableFontClass}">
			<thead>
				<tr class="bg-[--surface-3] border-b border-[--border]">
					{#each visibleColumns as col, i}
						<th
							scope="col"
							aria-sort={col.sortable && currentSort === col.key ? (currentOrder === 'asc' ? 'ascending' : 'descending') : col.sortable ? 'none' : undefined}
							tabindex={col.sortable ? 0 : undefined}
							class="{headerPadClass} text-[11px] font-semibold tracking-wider uppercase
								{col.align === 'right' ? 'text-right' : 'text-left'}
								{col.sortable ? 'cursor-pointer select-none hover:text-[--text-primary] transition-colors' : ''}
								{i === 0 ? 'sticky left-0 z-20 bg-[--surface-3]' : ''}
								{col.sortable && currentSort === col.key ? 'text-[--accent]' : 'text-[--text-secondary]'}"
							title={col.tooltip ?? undefined}
							onclick={() => handleHeaderClick(col)}
							onkeydown={(e) => { if (col.sortable && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); handleHeaderClick(col); } }}
						>
							<span class="inline-flex items-center gap-1 sort-header">
								{col.label}
								{#if col.sortable && currentSort === col.key}
									<span class="text-[--accent]">
										{currentOrder === 'asc' ? '\u25B2' : '\u25BC'}
									<span class="sr-only">{currentOrder === 'asc' ? 'sorted ascending' : 'sorted descending'}</span>
									</span>
								{:else if col.sortable}
									<span class="sort-hint text-[--text-disabled]">{'\u25B2'}</span>
								{/if}
							</span>
							{#if dense && col.tooltip}
								<span class="block text-[9px] text-[--text-disabled] font-normal tracking-wider">{col.tooltip}</span>
							{/if}
						</th>
					{/each}
				</tr>
			</thead>
			<tbody class="data-table-body bg-[--surface-1]" class:sorting>
				{#each data as row, rowIdx}
					<tr
						class="relative {onrowclick ? 'cursor-pointer group transition-colors duration-75' : ''} {rowIdx % 2 === 1 ? 'stripe-row' : ''}"
						class:hover-row={!!onrowclick}
						class:kb-selected={mode === 'power' && rowIdx === selectedRowIdx}
						onclick={() => onrowclick?.(row)}
						onkeydown={(e) => { if (onrowclick && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onrowclick(row); } }}
						tabindex={onrowclick ? 0 : undefined}
					>
						{#each visibleColumns as col, i}
							<td
								class="whitespace-nowrap {cellPadClass}
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

		<!-- Row count footer -->
		<div class="{dense ? 'px-2 py-1' : 'px-3 py-1.5'} text-[11px] text-[--text-tertiary] border-t border-[--border]">
			Showing {data.length.toLocaleString()}{totalRows != null ? ` of ${totalRows.toLocaleString()}` : ''} {data.length === 1 && !totalRows ? 'row' : 'rows'}
		</div>

		{#if mode === 'power' && showKbHint}
			<div class="px-3 pb-1.5 text-[10px] text-[--text-disabled]">
				Tip: Use j/k to navigate rows
			</div>
		{/if}
	{/if}
</div>

<style>
	tr.hover-row:hover {
		background-color: var(--accent-muted);
		box-shadow: inset 3px 0 0 var(--accent);
	}

	tr.kb-selected {
		background-color: var(--surface-3);
		box-shadow: inset 2px 0 0 var(--accent);
	}

	tr.kb-selected.hover-row:hover {
		background-color: var(--accent-muted);
	}

	.sorting {
		opacity: 0.6;
		transition: opacity 100ms ease;
	}

	.data-table-body:not(.sorting) {
		transition: opacity 100ms ease;
	}

	/* Subtle alternating row stripe */
	tr.stripe-row {
		background-color: color-mix(in srgb, var(--surface-2) 40%, transparent);
	}

	tr.stripe-row td.bg-inherit {
		background-color: color-mix(in srgb, var(--surface-2) 40%, var(--surface-1));
	}

	/* Only show inactive sort icons on hover */
	.sort-hint {
		opacity: 0;
		transition: opacity 150ms ease;
	}

	.sort-header:hover .sort-hint {
		opacity: 1;
	}
</style>
