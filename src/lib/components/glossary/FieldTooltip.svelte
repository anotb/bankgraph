<script lang="ts">
	import type { Snippet } from 'svelte';
	import { getFieldDef } from '$lib/utils/field-meta.js';

	let { field, children }: { field: string; children: Snippet } = $props();

	let show = $state(false);
	let def = $derived(getFieldDef(field));
</script>

<span
	class="relative inline-block cursor-help border-b border-dotted border-[--text-disabled]"
	tabindex="0"
	role="button"
	aria-describedby="tooltip-{field}"
	onmouseenter={() => (show = true)}
	onmouseleave={() => (show = false)}
	onfocus={() => (show = true)}
	onblur={() => (show = false)}
>
	{@render children()}

	{#if show && def}
		<div
			id="tooltip-{field}"
			role="tooltip"
			class="absolute bottom-full left-1/2 z-50 mb-2 w-max max-w-[300px] -translate-x-1/2 rounded bg-[--surface-2] px-3 py-2 text-left text-xs shadow-lg
				dark:bg-[#22262f]"
			style="background-color: var(--surface-2); border: 1px solid var(--border);"
		>
			<p class="font-semibold text-[13px] text-[--text-primary]">{def.label}</p>
			<p class="mt-1 leading-relaxed text-[--text-secondary]">{def.description}</p>
			{#if def.formula}
				<p class="mt-1.5 font-mono text-[11px] text-[--accent-text]">= {def.formula}</p>
			{/if}
			<!-- Arrow -->
			<div
				class="absolute left-1/2 top-full -translate-x-1/2 border-4 border-transparent"
				style="border-top-color: var(--border);"
			></div>
		</div>
	{/if}
</span>
