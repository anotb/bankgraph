<script lang="ts">
	import {
		fieldDefs,
		categoryLabels,
		categoryOrder,
		getFieldPeriodLabel,
		getFieldShortLabel,
		type FieldCategory
	} from '$lib/utils/field-meta.js';
	import { getMode } from '$lib/stores/mode.svelte.js';

	let {
		selected = $bindable<string[]>([]),
		id,
		onchange,
		maxSelections = 6
	}: {
		selected: string[];
		id?: string;
		onchange?: (fields: string[]) => void;
		maxSelections?: number;
	} = $props();

	let open = $state(false);
	let search = $state('');
	let collapsedCategories = $state<Set<FieldCategory>>(new Set());
	let dropdownRef = $state<HTMLDivElement | null>(null);
	let triggerRef = $state<HTMLButtonElement | null>(null);
	let searchRef = $state<HTMLInputElement | null>(null);
	let mode = $derived(getMode());

	// Group fields by category, applying search filter
	let grouped = $derived.by(() => {
		const query = search.toLowerCase().trim();
		const groups = {} as Record<FieldCategory, Array<{
			key: string;
			shortLabel: string;
			periodLabel: 'Quarter' | 'YTD' | null;
			sourceCode?: string;
		}>>;
		for (const cat of categoryOrder) {
			groups[cat] = [];
		}
		for (const [key, def] of Object.entries(fieldDefs)) {
			if (query) {
				const haystack = `${def.label} ${key} ${def.sourceField ?? ''} ${def.mdrm ?? ''}`.toLowerCase();
				if (!haystack.includes(query)) continue;
			}
			if (groups[def.category]) {
				groups[def.category].push({
					key,
					shortLabel: getFieldShortLabel(key),
					periodLabel: getFieldPeriodLabel(key),
					sourceCode: def.sourceField ?? def.mdrm
				});
			}
		}
		return groups;
	});

	// Count of non-empty categories (for search feedback)
	let visibleCategoryCount = $derived(
		categoryOrder.filter((cat) => grouped[cat].length > 0).length
	);

	function toggle(key: string): void {
		if (selected.includes(key)) {
			selected = selected.filter((k) => k !== key);
		} else if (selected.length < maxSelections) {
			selected = [...selected, key];
		}
		onchange?.(selected);
	}

	function selectAllCategory(cat: FieldCategory): void {
		const catKeys = grouped[cat].map((f) => f.key);
		const currentSet = new Set(selected);
		const toAdd = catKeys.filter((k) => !currentSet.has(k));
		const remaining = maxSelections - selected.length;
		selected = [...selected, ...toAdd.slice(0, remaining)];
		onchange?.(selected);
	}

	function clearCategory(cat: FieldCategory): void {
		const catKeys = new Set(grouped[cat].map((f) => f.key));
		selected = selected.filter((k) => !catKeys.has(k));
		onchange?.(selected);
	}

	function isCategoryAllSelected(cat: FieldCategory): boolean {
		const catKeys = grouped[cat].map((f) => f.key);
		if (catKeys.length === 0) return false;
		return catKeys.every((k) => selected.includes(k));
	}

	function isCategoryPartialSelected(cat: FieldCategory): boolean {
		const catKeys = grouped[cat].map((f) => f.key);
		const count = catKeys.filter((k) => selected.includes(k)).length;
		return count > 0 && count < catKeys.length;
	}

	function toggleCategory(cat: FieldCategory): void {
		const next = new Set(collapsedCategories);
		if (next.has(cat)) {
			next.delete(cat);
		} else {
			next.add(cat);
		}
		collapsedCategories = next;
	}

	function openDropdown(): void {
		open = true;
		// Focus search input after mount
		requestAnimationFrame(() => {
			searchRef?.focus();
		});
	}

	function closeDropdown(): void {
		open = false;
		search = '';
	}

	function handleKeydown(e: KeyboardEvent): void {
		if (e.key === 'Escape') {
			closeDropdown();
			triggerRef?.focus();
		}
	}

	// Click-outside handler
	function handleDocumentClick(e: MouseEvent): void {
		if (!open) return;
		const target = e.target as Node;
		if (dropdownRef?.contains(target) || triggerRef?.contains(target)) return;
		closeDropdown();
	}

	$effect(() => {
		if (open) {
			document.addEventListener('click', handleDocumentClick, true);
			return () => document.removeEventListener('click', handleDocumentClick, true);
		}
	});

	let atLimit = $derived(selected.length >= maxSelections);
</script>

<div class="relative" {id}>
	<button
		bind:this={triggerRef}
		type="button"
		onclick={() => (open ? closeDropdown() : openDropdown())}
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
		{selected.length} metric{selected.length !== 1 ? 's' : ''} selected
		<svg
			class="w-3 h-3 transition-transform {open ? 'rotate-180' : ''}"
			fill="none"
			stroke="currentColor"
			viewBox="0 0 24 24"
		>
			<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
		</svg>
	</button>

	{#if open}
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div
			bind:this={dropdownRef}
			onkeydown={handleKeydown}
			class="absolute right-0 mt-1 w-80 max-h-[28rem] flex flex-col rounded-[5px] border border-[--border-muted] bg-[--surface-1] z-30"
			style="box-shadow: var(--shadow-md)"
		>
			<!-- Search input -->
			<div class="p-2 border-b border-[--border-muted]">
				<div class="relative">
					<svg
						class="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[--text-disabled]"
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
					<input
						bind:this={searchRef}
						bind:value={search}
						type="text"
						placeholder="Filter metrics..."
						class="w-full pl-7 pr-2 py-1.5 text-[12px] rounded bg-[--surface-2] text-[--text-primary] border border-[--border-muted]
							focus:border-[--accent] focus:outline-none focus:ring-1 focus:ring-[--accent]/30
							placeholder:text-[--text-disabled]"
					/>
				</div>
				{#if atLimit}
					<p class="mt-1 text-[10px] text-[--warning]">
						Max {maxSelections} metrics. Deselect one to add another.
					</p>
				{/if}
			</div>

			<!-- Scrollable field list -->
			<div class="overflow-y-auto flex-1 p-2">
				{#if search && visibleCategoryCount === 0}
					<p class="text-[12px] text-[--text-tertiary] text-center py-4">
						No fields matching "{search}"
					</p>
				{/if}

				{#each categoryOrder as cat}
					{@const fields = grouped[cat]}
					{#if fields.length > 0}
						{@const collapsed = collapsedCategories.has(cat)}
						{@const allSelected = isCategoryAllSelected(cat)}
						{@const partialSelected = isCategoryPartialSelected(cat)}
						<div class="mb-1.5">
							<!-- Category header -->
							<div class="flex items-center gap-1 px-1 py-1">
								<button
									type="button"
									class="flex items-center gap-1 flex-1 text-left"
									onclick={() => toggleCategory(cat)}
								>
									<svg
										class="w-3 h-3 text-[--text-disabled] transition-transform {collapsed
											? '-rotate-90'
											: ''}"
										fill="none"
										stroke="currentColor"
										viewBox="0 0 24 24"
									>
										<path
											stroke-linecap="round"
											stroke-linejoin="round"
											stroke-width="2"
											d="M19 9l-7 7-7-7"
										/>
									</svg>
									<span
										class="text-[10px] font-semibold text-[--text-tertiary] uppercase tracking-wider"
									>
										{categoryLabels[cat]}
									</span>
									{#if partialSelected || allSelected}
										<span class="text-[9px] text-[--accent] ml-0.5">
											({fields.filter((f) => selected.includes(f.key)).length}/{fields.length})
										</span>
									{/if}
								</button>
								<div class="flex items-center gap-1">
									{#if !allSelected && !atLimit}
										<button
											type="button"
											class="text-[10px] text-[--text-tertiary] hover:text-[--accent] transition-colors px-1"
											onclick={() => selectAllCategory(cat)}
										>
											All
										</button>
									{/if}
									{#if partialSelected || allSelected}
										<button
											type="button"
											class="text-[10px] text-[--text-tertiary] hover:text-[--negative] transition-colors px-1"
											onclick={() => clearCategory(cat)}
										>
											Clear
										</button>
									{/if}
								</div>
							</div>

							<!-- Field checkboxes -->
							{#if !collapsed}
								{#each fields as field}
									{@const isSelected = selected.includes(field.key)}
									{@const isDisabled = !isSelected && atLimit}
									<label
										class="flex items-center gap-2 px-1 py-1 cursor-pointer rounded text-[12px] transition-colors
											{isDisabled
											? 'opacity-40 cursor-not-allowed'
											: 'hover:bg-[--accent-muted]'}"
									>
										<input
											type="checkbox"
											checked={isSelected}
											disabled={isDisabled}
											onchange={() => toggle(field.key)}
											class="rounded border-[--border] text-[--accent] focus:ring-[--accent]/30 w-3.5 h-3.5"
										/>
										<span class="min-w-0 text-[--text-primary] leading-tight">
											{field.shortLabel}
										</span>
										{#if field.periodLabel}
											<span
												class="shrink-0 border border-[--border-muted] px-1 py-px text-[11px] font-semibold uppercase tracking-wide text-[--text-tertiary] data-mono"
												title={field.periodLabel === 'Quarter' ? 'Single reporting quarter' : 'Calendar year to date'}
											>
												{field.periodLabel}
											</span>
										{/if}
										{#if mode === 'power' && field.sourceCode}
											<span
												class="ml-auto text-[11px] text-[--text-disabled] data-mono shrink-0"
											>
												{field.sourceCode}
											</span>
										{/if}
									</label>
								{/each}
							{/if}
						</div>
					{/if}
				{/each}
			</div>
		</div>
	{/if}
</div>
