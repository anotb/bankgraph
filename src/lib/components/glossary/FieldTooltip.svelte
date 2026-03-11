<script lang="ts">
	import type { Snippet } from 'svelte';
	import { getFieldDef } from '$lib/utils/field-meta.js';

	let { field, children }: { field: string; children: Snippet } = $props();

	let show = $state(false);
	let def = $derived(getFieldDef(field));
</script>

<span
	class="relative inline-block cursor-help border-b border-dotted border-gray-400"
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
			class="absolute bottom-full left-1/2 z-50 mb-2 w-max max-w-[300px] -translate-x-1/2 rounded-lg bg-gray-900 px-3 py-2 text-left text-xs text-white shadow-lg"
		>
			<p class="font-semibold text-sm">{def.label}</p>
			<p class="mt-1 leading-relaxed text-gray-300">{def.description}</p>
			{#if def.formula}
				<p class="mt-1.5 font-mono text-[11px] text-blue-300">= {def.formula}</p>
			{/if}
			<!-- Arrow -->
			<div
				class="absolute left-1/2 top-full -translate-x-1/2 border-4 border-transparent border-t-gray-900"
			></div>
		</div>
	{/if}
</span>
