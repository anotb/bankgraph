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

<div class="flex items-center justify-between py-3">
	<p class="text-sm text-gray-600">
		{#if total === 0}
			No results
		{:else}
			Showing {start}–{end} of {total.toLocaleString()} results
		{/if}
	</p>
	<div class="flex gap-2">
		<button
			type="button"
			disabled={!hasPrev}
			onclick={() => onpage(page - 1)}
			class="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
		>
			Previous
		</button>
		<button
			type="button"
			disabled={!hasNext}
			onclick={() => onpage(page + 1)}
			class="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
		>
			Next
		</button>
	</div>
</div>
