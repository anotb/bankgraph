<script lang="ts">
	let visible = $state(false);

	function handleScroll() {
		visible = window.scrollY > 400;
	}

	function scrollToTop() {
		window.scrollTo({ top: 0, behavior: 'smooth' });
	}
</script>

<svelte:window onscroll={handleScroll} />

{#if visible}
	<button
		onclick={scrollToTop}
		class="fixed bottom-5 right-5 z-40 rounded-full bg-[--surface-1] border border-[--border-muted] p-2.5
			text-[--text-tertiary] hover:text-[--text-primary] hover:bg-[--surface-2]
			transition-all duration-200 opacity-70 hover:opacity-100"
		style="box-shadow: var(--shadow-md)"
		aria-label="Scroll to top"
	>
		<svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
			<path stroke-linecap="round" stroke-linejoin="round" d="M5 15l7-7 7 7" />
		</svg>
	</button>
{/if}
