<script lang="ts">
	let {
		baseUrl,
		filename = 'data'
	}: {
		baseUrl: string;
		filename?: string;
	} = $props();

	let open = $state(false);

	function download(format: 'csv' | 'json') {
		const separator = baseUrl.includes('?') ? '&' : '?';
		const url =
			format === 'csv'
				? `${baseUrl}${separator}format=csv`
				: `${baseUrl}${separator}format=json&download=1`;
		window.open(url, '_blank');
		open = false;
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape' && open) {
			e.preventDefault();
			open = false;
		}
	}

	function handleBlur() {
		setTimeout(() => {
			open = false;
		}, 150);
	}
</script>

<div class="relative">
	<button
		type="button"
		onclick={() => (open = !open)}
		onkeydown={handleKeydown}
		onblur={handleBlur}
		aria-expanded={open}
		aria-haspopup="true"
		aria-label="Export data"
		class="inline-flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-medium rounded border border-[--border-muted] bg-[--surface-1] text-[--text-secondary] hover:text-[--text-primary] hover:border-[--border] transition-colors"
		style="box-shadow: var(--shadow-xs)"
	>
		<svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
			<path
				stroke-linecap="round"
				stroke-linejoin="round"
				stroke-width="2"
				d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
			/>
		</svg>
		Export
	</button>
	{#if open}
		<div
			class="absolute right-0 mt-1 w-32 rounded-[5px] border border-[--border-muted] bg-[--surface-1] z-20"
			style="box-shadow: var(--shadow-md)"
			role="menu"
		>
			<button
				type="button"
				role="menuitem"
				class="block w-full text-left px-3 py-2 text-[13px] text-[--text-secondary] hover:bg-[--accent-muted] hover:text-[--text-primary] transition-colors rounded-t-[5px]"
				onmousedown={() => download('csv')}
			>
				Download CSV
			</button>
			<button
				type="button"
				role="menuitem"
				class="block w-full text-left px-3 py-2 text-[13px] text-[--text-secondary] hover:bg-[--accent-muted] hover:text-[--text-primary] transition-colors rounded-b-[5px]"
				onmousedown={() => download('json')}
			>
				Download JSON
			</button>
		</div>
	{/if}
</div>
