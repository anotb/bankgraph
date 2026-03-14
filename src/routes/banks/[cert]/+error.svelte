<script lang="ts">
	import { page } from '$app/stores';

	let status = $derived($page.status);
	let message = $derived($page.error?.message);

	let isBankNotFound = $derived(status === 404);
</script>

<svelte:head>
	<title>{isBankNotFound ? 'Bank Not Found' : `Error ${status}`} | Bank Data Explorer</title>
</svelte:head>

<div class="space-y-3">
	<!-- Back link (matches layout pattern) -->
	<a
		href="/banks"
		class="inline-flex items-center gap-1 text-[13px] text-[--text-tertiary] hover:text-[--text-primary] transition-colors"
	>
		&larr; All Banks
	</a>

	<!-- Error card -->
	<div class="rounded-md bg-[--surface-1] py-14 text-center" style="box-shadow: var(--shadow-sm)">
		<div class="mx-auto mb-4 text-[--text-disabled]">
			{#if isBankNotFound}
				<!-- Search icon with X -->
				<svg class="mx-auto" width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
					<circle cx="11" cy="11" r="7" />
					<path d="M21 21l-4.35-4.35" />
					<path d="M8 8l6 6" />
					<path d="M14 8l-6 6" />
				</svg>
			{:else}
				<!-- Warning triangle -->
				<svg class="mx-auto" width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
					<path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
					<line x1="12" y1="9" x2="12" y2="13" />
					<line x1="12" y1="17" x2="12.01" y2="17" />
				</svg>
			{/if}
		</div>

		<p class="text-[36px] font-semibold text-[--text-primary] data-mono leading-none">
			{status}
		</p>

		{#if isBankNotFound}
			<p class="text-[15px] text-[--text-secondary] mt-2">Bank not found</p>
			<p class="text-[13px] text-[--text-tertiary] mt-1 max-w-sm mx-auto">
				No institution exists with this CERT number. Double-check the number or search for the bank by name.
			</p>
		{:else}
			<p class="text-[15px] text-[--text-secondary] mt-2">
				{message || 'Something went wrong loading this bank\'s data.'}
			</p>
		{/if}

		<div class="flex items-center justify-center gap-3 mt-6">
			<button
				onclick={() => history.back()}
				class="inline-flex items-center gap-1.5 rounded-md border border-[--border] bg-[--surface-1] px-4 py-2 text-[13px] font-medium text-[--text-secondary] hover:text-[--text-primary] hover:bg-[--surface-2] transition-colors"
			>
				<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
					<path d="M19 12H5" />
					<path d="M12 19l-7-7 7-7" />
				</svg>
				Go back
			</button>
			<a
				href="/banks"
				class="inline-flex items-center gap-1.5 rounded-md bg-[--accent] px-4 py-2 text-[13px] font-medium text-white hover:bg-[--accent-hover] transition-colors"
			>
				Browse banks
			</a>
		</div>
	</div>
</div>
