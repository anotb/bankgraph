<script lang="ts">
	import { getMode, toggleMode } from '$lib/stores/mode.svelte.js';

	let currentMode = $derived(getMode());
</script>

<button
	onclick={toggleMode}
	class="text-[11px] font-medium uppercase tracking-wider px-2.5 py-1 min-h-[44px] sm:min-h-0 flex items-center rounded border transition-colors
		{currentMode === 'power'
			? 'bg-[--accent]/10 text-[--accent] border-[--accent]/30'
			: 'text-[--text-tertiary] hover:text-[--text-primary] border-[--border]'}"
	title="Switch to {currentMode === 'accessible' ? 'compact' : 'comfortable'} density"
	aria-label="Current density: {currentMode === 'accessible' ? 'comfortable' : 'compact'}. Switch to {currentMode === 'accessible' ? 'compact' : 'comfortable'} density"
>
	{currentMode === 'accessible' ? 'Compact' : 'Comfortable'}
</button>
