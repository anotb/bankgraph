<script lang="ts">
	import {
		fieldDefs,
		categoryLabels,
		categoryOrder,
		type FieldCategory
	} from '$lib/utils/field-meta.js';

	let {
		selected = $bindable<string[]>([]),
		maxSelected = 8
	}: {
		selected: string[];
		maxSelected?: number;
	} = $props();

	let open = $state(false);

	let grouped = $derived.by(() => {
		const groups = {} as Record<FieldCategory, Array<{ key: string; label: string }>>;
		for (const cat of categoryOrder) {
			groups[cat] = [];
		}
		for (const [key, def] of Object.entries(fieldDefs)) {
			if (groups[def.category]) {
				groups[def.category].push({ key, label: def.label });
			}
		}
		return groups;
	});

	function toggle(key: string) {
		if (selected.includes(key)) {
			selected = selected.filter((k) => k !== key);
		} else if (selected.length < maxSelected) {
			selected = [...selected, key];
		}
	}

	function selectAllCategory(cat: FieldCategory) {
		const catKeys = grouped[cat].map((f) => f.key);
		const currentSet = new Set(selected);
		const allSelected = catKeys.every((k) => currentSet.has(k));
		if (allSelected) {
			selected = selected.filter((k) => !catKeys.includes(k));
		} else {
			const toAdd = catKeys.filter((k) => !currentSet.has(k));
			const remaining = maxSelected - selected.length;
			selected = [...selected, ...toAdd.slice(0, remaining)];
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
		onblur={handleBlur}
		class="inline-flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-medium rounded border border-[--border-muted] bg-[--surface-1] text-[--text-secondary] hover:text-[--text-primary] hover:border-[--border] transition-colors"
		style="box-shadow: var(--shadow-xs)"
	>
		<svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
			<path
				stroke-linecap="round"
				stroke-linejoin="round"
				stroke-width="2"
				d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4"
			/>
		</svg>
		Fields ({selected.length})
	</button>
	{#if open}
		<div
			class="absolute left-0 mt-1 w-72 max-h-80 overflow-y-auto rounded-[5px] border border-[--border-muted] bg-[--surface-1] z-20 p-2"
			style="box-shadow: var(--shadow-md)"
		>
			{#each categoryOrder as cat}
				{@const fields = grouped[cat]}
				{#if fields.length > 0}
					<div class="mb-2">
						<button
							type="button"
							class="w-full text-left text-[10px] font-semibold text-[--text-tertiary] uppercase tracking-wider px-1 py-0.5 hover:text-[--text-secondary] transition-colors"
							onmousedown={(e) => {
								e.preventDefault();
								selectAllCategory(cat);
							}}
						>
							{categoryLabels[cat]}
						</button>
						{#each fields as field}
							<label
								class="flex items-center gap-2 px-1 py-1 cursor-pointer hover:bg-[--accent-muted] rounded text-[13px]"
							>
								<input
									type="checkbox"
									checked={selected.includes(field.key)}
									onchange={() => toggle(field.key)}
									class="rounded border-[--border] text-[--accent] focus:ring-[--accent]/30"
								/>
								<span class="text-[--text-primary]">{field.label}</span>
							</label>
						{/each}
					</div>
				{/if}
			{/each}
		</div>
	{/if}
</div>
