<script lang="ts">
	import { page } from '$app/stores';
</script>

<div class="flex flex-col items-center justify-center py-24 text-center">
	<div class="mb-4 text-[--text-disabled]">
		<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
			<path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
			<line x1="12" y1="9" x2="12" y2="13" />
			<line x1="12" y1="17" x2="12.01" y2="17" />
		</svg>
	</div>

	<p class="text-[48px] font-semibold text-[--text-primary] data-mono leading-none">
		{$page.status}
	</p>
	<p class="text-[15px] text-[--text-secondary] mt-2 max-w-sm">
		{#if $page.status === 404}
			The page you're looking for doesn't exist or has been moved.
		{:else if $page.error?.message}
			{$page.error.message}
		{:else}
			Something went wrong. Please try again later.
		{/if}
	</p>

	<a
		href="/"
		class="mt-6 inline-flex items-center gap-1.5 rounded-md bg-[--accent] px-4 py-2 text-[13px] font-medium text-white hover:bg-[--accent-hover] transition-colors"
	>
		<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
			<path d="M19 12H5" />
			<path d="M12 19l-7-7 7-7" />
		</svg>
		Go home
	</a>
</div>
