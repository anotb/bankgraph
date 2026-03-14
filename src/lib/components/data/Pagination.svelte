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
</script>

<div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 py-3">
	<p class="text-[13px] text-[--text-secondary] tabular-nums">
		{#if total === 0}
			No results
		{:else}
			Showing {start}&ndash;{end} of {total.toLocaleString()} results
		{/if}
	</p>
	<div class="flex gap-2">
		<button
			type="button"
			disabled={!hasPrev}
			onclick={() => onpage(page - 1)}
			class="rounded-[5px] border border-[--border-muted] bg-[--surface-1] px-3 py-2 sm:px-2.5 sm:py-1
				text-[13px] font-medium text-[--text-secondary]
				hover:bg-[--surface-2] hover:text-[--text-primary]
				disabled:cursor-not-allowed disabled:opacity-40 transition-all duration-150
				min-h-[44px] sm:min-h-0"
			style="box-shadow: var(--shadow-xs)"
		>
			Previous
		</button>
		<button
			type="button"
			disabled={!hasNext}
			onclick={() => onpage(page + 1)}
			class="rounded-[5px] border border-[--border-muted] bg-[--surface-1] px-3 py-2 sm:px-2.5 sm:py-1
				text-[13px] font-medium text-[--text-secondary]
				hover:bg-[--surface-2] hover:text-[--text-primary]
				disabled:cursor-not-allowed disabled:opacity-40 transition-all duration-150
				min-h-[44px] sm:min-h-0"
			style="box-shadow: var(--shadow-xs)"
		>
			Next
		</button>
	</div>
</div>
