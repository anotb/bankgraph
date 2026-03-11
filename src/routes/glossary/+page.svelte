<script lang="ts">
	import {
		fieldDefs,
		categoryLabels,
		categoryOrder,
		type FieldDef,
		type FieldCategory
	} from '$lib/utils/field-meta.js';

	let query = $state('');

	type FieldEntry = { key: string; def: FieldDef };

	let allEntries: FieldEntry[] = Object.entries(fieldDefs).map(([key, def]) => ({ key, def }));

	let filtered = $derived.by(() => {
		if (!query.trim()) return allEntries;
		const q = query.toLowerCase().trim();
		return allEntries.filter(
			({ def }) =>
				def.label.toLowerCase().includes(q) ||
				def.description.toLowerCase().includes(q) ||
				(def.mdrm && def.mdrm.toLowerCase().includes(q))
		);
	});

	let grouped = $derived.by(() => {
		const map = new Map<FieldCategory, FieldEntry[]>();
		for (const cat of categoryOrder) {
			const items = filtered.filter((e) => e.def.category === cat);
			if (items.length > 0) map.set(cat, items);
		}
		return map;
	});
</script>

<svelte:head>
	<title>Glossary | Bank Data Explorer</title>
</svelte:head>

<div class="space-y-6">
	<!-- Header -->
	<div>
		<h1 class="text-2xl font-bold text-gray-900">Field Glossary</h1>
		<p class="mt-1 text-sm text-gray-500">
			Definitions for all financial fields, ratios, and metrics used across the application.
		</p>
	</div>

	<!-- Search -->
	<div class="relative max-w-md">
		<input
			type="text"
			bind:value={query}
			placeholder="Search fields..."
			class="w-full rounded-lg border border-gray-300 bg-white px-4 py-2 pl-10 text-sm text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
		/>
		<svg
			class="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400"
			fill="none"
			stroke="currentColor"
			viewBox="0 0 24 24"
		>
			<path
				stroke-linecap="round"
				stroke-linejoin="round"
				stroke-width="2"
				d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
			/>
		</svg>
	</div>

	<!-- Results count -->
	{#if query.trim()}
		<p class="text-xs text-gray-400">
			{filtered.length} field{filtered.length === 1 ? '' : 's'} matching "{query.trim()}"
		</p>
	{/if}

	<!-- Grouped fields -->
	{#if grouped.size === 0}
		<div class="rounded-lg border border-gray-200 bg-white py-16 text-center">
			<p class="text-gray-500">No fields match your search.</p>
		</div>
	{:else}
		{#each categoryOrder as cat}
			{@const items = grouped.get(cat)}
			{#if items}
				<section>
					<h2 class="mb-3 text-lg font-semibold text-gray-800">{categoryLabels[cat]}</h2>
					<div class="space-y-2">
						{#each items as { key, def }}
							<div
								class="rounded-lg border border-gray-200 bg-white px-4 py-3"
							>
								<div class="flex flex-wrap items-baseline gap-x-3 gap-y-1">
									<h3 class="font-medium text-gray-900">{def.label}</h3>
									<code class="text-xs text-gray-400">{key}</code>
									{#if def.mdrm}
										<span
											class="rounded bg-blue-50 px-1.5 py-0.5 text-[11px] font-medium text-blue-700"
										>
											MDRM {def.mdrm}
										</span>
									{/if}
								</div>
								<p class="mt-1 text-sm leading-relaxed text-gray-600">
									{def.description}
								</p>
								{#if def.formula}
									<p class="mt-1.5 font-mono text-xs text-gray-500">
										= {def.formula}
									</p>
								{/if}
							</div>
						{/each}
					</div>
				</section>
			{/if}
		{/each}
	{/if}
</div>
