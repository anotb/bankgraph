<script lang="ts">
	let {
		page,
		limit,
		total,
		onpage
	}: {
		page: number;
		limit: number;
		total: number;
		onpage: (page: number) => void;
	} = $props();

	let totalPages = $derived(Math.max(1, Math.ceil(total / limit)));
	let start = $derived(total === 0 ? 0 : (page - 1) * limit + 1);
	let end = $derived(Math.min(page * limit, total));
	let hasPrev = $derived(page > 1);
	let hasNext = $derived(page < totalPages);

	/** Generate page numbers with ellipsis for large page counts */
	let pageNumbers = $derived.by(() => {
		if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1);

		const pages: (number | '...')[] = [1];
		if (page > 3) pages.push('...');

		const rangeStart = Math.max(2, page - 1);
		const rangeEnd = Math.min(totalPages - 1, page + 1);
		for (let i = rangeStart; i <= rangeEnd; i++) pages.push(i);

		if (page < totalPages - 2) pages.push('...');
		pages.push(totalPages);
		return pages;
	});

	const btnBase = `rounded-[5px] border border-[--border-muted] bg-[--surface-1]
		text-[13px] font-medium text-[--text-secondary]
		hover:bg-[--surface-2] hover:text-[--text-primary]
		disabled:cursor-not-allowed disabled:opacity-40 transition-all duration-150
		min-h-[44px] sm:min-h-0`;
</script>

<div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 py-3">
	<p class="text-[13px] text-[--text-secondary] tabular-nums">
		{#if total === 0}
			No results
		{:else}
			Showing {start}&ndash;{end} of {total.toLocaleString()} results
		{/if}
	</p>
	<div class="flex items-center gap-1">
		<button
			type="button"
			disabled={!hasPrev}
			onclick={() => onpage(page - 1)}
			class="{btnBase} px-2 py-2 sm:px-2 sm:py-1"
			style="box-shadow: var(--shadow-xs)"
			aria-label="Previous page"
		>
			<svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
				<path stroke-linecap="round" stroke-linejoin="round" d="M15 19l-7-7 7-7" />
			</svg>
		</button>

		{#if totalPages > 1}
			<div class="hidden sm:flex items-center gap-1">
				{#each pageNumbers as p}
					{#if p === '...'}
						<span class="px-1 text-[12px] text-[--text-disabled]">&hellip;</span>
					{:else}
						<button
							type="button"
							onclick={() => onpage(p)}
							class="rounded-[5px] px-2.5 py-1 text-[13px] font-medium tabular-nums transition-all duration-150
								{p === page
									? 'bg-[--accent-muted] text-[--accent-text] border border-[--accent]/30'
									: 'text-[--text-secondary] hover:bg-[--surface-2] hover:text-[--text-primary] border border-transparent'}"
						>
							{p}
						</button>
					{/if}
				{/each}
			</div>
			<span class="sm:hidden text-[12px] text-[--text-tertiary] tabular-nums px-2">
				{page} / {totalPages}
			</span>
		{/if}

		<button
			type="button"
			disabled={!hasNext}
			onclick={() => onpage(page + 1)}
			class="{btnBase} px-2 py-2 sm:px-2 sm:py-1"
			style="box-shadow: var(--shadow-xs)"
			aria-label="Next page"
		>
			<svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
				<path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7" />
			</svg>
		</button>
	</div>
</div>
