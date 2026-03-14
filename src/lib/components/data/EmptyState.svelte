<script lang="ts">
	let {
		title,
		message,
		icon = 'data',
		onRetry
	}: {
		title: string;
		message?: string;
		icon?: 'chart' | 'search' | 'data' | 'error';
		onRetry?: () => void;
	} = $props();
</script>

<div class="rounded-md bg-[--surface-1] py-16 text-center" style="box-shadow: var(--shadow-sm)">
	<div class="mx-auto mb-3 text-[--text-disabled]">
		{#if icon === 'chart'}
			<!-- Bar chart icon -->
			<svg class="mx-auto" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
				<rect x="3" y="12" width="4" height="9" rx="0.5" />
				<rect x="10" y="7" width="4" height="14" rx="0.5" />
				<rect x="17" y="3" width="4" height="18" rx="0.5" />
			</svg>
		{:else if icon === 'search'}
			<!-- Magnifying glass icon -->
			<svg class="mx-auto" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
				<circle cx="11" cy="11" r="7" />
				<path d="M21 21l-4.35-4.35" />
			</svg>
		{:else if icon === 'error'}
			<!-- Exclamation triangle icon -->
			<svg class="mx-auto" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
				<path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
				<line x1="12" y1="9" x2="12" y2="13" />
				<line x1="12" y1="17" x2="12.01" y2="17" />
			</svg>
		{:else}
			<!-- Database/data icon -->
			<svg class="mx-auto" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
				<ellipse cx="12" cy="5" rx="9" ry="3" />
				<path d="M21 12c0 1.66-4.03 3-9 3s-9-1.34-9-3" />
				<path d="M3 5v14c0 1.66 4.03 3 9 3s9-1.34 9-3V5" />
			</svg>
		{/if}
	</div>
	<p class="text-[--text-tertiary] text-[15px]">{title}</p>
	{#if message}
		<p class="text-[--text-disabled] text-[13px] mt-1 max-w-md mx-auto">{message}</p>
	{/if}
	{#if onRetry}
		<button
			onclick={onRetry}
			class="mt-4 inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[13px] font-medium text-[--accent] bg-[--accent-muted] hover:bg-[--surface-2] transition-colors cursor-pointer"
		>
			Try again
		</button>
	{/if}
</div>
