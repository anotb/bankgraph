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
	<meta name="description" content="Definitions for all financial fields, ratios, and metrics used in Bank Data Explorer." />
	<meta property="og:title" content="Glossary | Bank Data Explorer" />
	<meta property="og:description" content="Definitions for all financial fields, ratios, and metrics used in Bank Data Explorer." />
</svelte:head>

<div class="space-y-5">
	<!-- Header -->
	<div>
		<h1 class="text-2xl font-semibold text-[--text-primary]">Field Glossary</h1>
		<p class="mt-1 text-[13px] text-[--text-secondary]">
			Definitions for all financial fields, ratios, and metrics used across the application.
		</p>
	</div>

	<!-- Search -->
	<div class="relative max-w-md">
		<input
			type="text"
			bind:value={query}
			placeholder="Search fields..."
			class="w-full rounded-[5px] border border-[--border-muted] bg-[--surface-1] px-4 py-2 pl-9
				text-[14px] text-[--text-primary] placeholder:text-[--text-disabled]
				focus:border-[--accent] focus:outline-none focus:ring-2 focus:ring-[--accent]/20
				transition-colors"
		/>
		<svg
			class="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[--text-disabled]"
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
		<p class="text-[11px] text-[--text-tertiary]">
			Showing {filtered.length} of {allEntries.length} terms
		</p>
	{/if}

	<!-- Grouped fields -->
	{#if grouped.size === 0}
		<div class="rounded-md bg-[--surface-1] py-16 text-center" style="box-shadow: var(--shadow-sm)">
			<p class="text-[--text-tertiary]">No fields match your search.</p>
		</div>
	{:else}
		{#each categoryOrder as cat}
			{@const items = grouped.get(cat)}
			{#if items}
				<section>
					<div class="flex items-center gap-2 mb-3">
						<div class="w-0.5 h-4 bg-[--accent] rounded-full"></div>
						<h2 class="text-[15px] font-semibold text-[--text-primary]">{categoryLabels[cat]}</h2>
					</div>
					<div class="space-y-1">
						{#each items as { key, def }}
							<div class="rounded-md bg-[--surface-1] px-3 py-2.5" style="box-shadow: var(--shadow-xs)">
								<div class="flex flex-wrap items-baseline gap-x-3 gap-y-1">
									<h3 class="font-medium text-[--text-primary] text-[14px]">{def.label}</h3>
									<code class="text-[11px] text-[--text-tertiary] font-mono">{key}</code>
									{#if def.mdrm}
										<span
											class="rounded-sm bg-[--accent-muted] px-1.5 py-0.5 text-[11px] font-medium text-[--accent-text]"
										>
											MDRM {def.mdrm}
										</span>
									{/if}
								</div>
								<p class="mt-1 text-[13px] leading-relaxed text-[--text-secondary]">
									{def.description}
								</p>
								{#if def.formula}
									<p class="mt-1.5 font-mono text-[11px] text-[--text-tertiary]">
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
