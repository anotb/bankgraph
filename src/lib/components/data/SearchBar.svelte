<script lang="ts">
	import type { Institution } from '$lib/types';

	let {
		value = '',
		placeholder = 'Search...',
		onsearch,
		autocomplete = false,
		onselect
	}: {
		value?: string;
		placeholder?: string;
		onsearch: (query: string) => void;
		autocomplete?: boolean;
		onselect?: (cert: number) => void;
	} = $props();

	let inputValue = $state('');
	let debounceTimer: ReturnType<typeof setTimeout> | undefined;
	let suggestions = $state<Institution[]>([]);
	let highlightedIndex = $state(-1);
	let showDropdown = $state(false);
	let loading = $state(false);
	let fetchTimer: ReturnType<typeof setTimeout> | undefined;
	let lastQuery = $state('');

	// Sync external value changes into local state
	$effect(() => {
		inputValue = value;
	});

	// Fetch suggestions when input changes (autocomplete mode)
	$effect(() => {
		if (!autocomplete) return;
		const q = inputValue.trim();

		if (q.length < 2) {
			suggestions = [];
			showDropdown = false;
			loading = false;
			lastQuery = '';
			return;
		}

		clearTimeout(fetchTimer);
		loading = true;
		showDropdown = true;
		fetchTimer = setTimeout(async () => {
			try {
				const res = await fetch(`/api/v1/banks?q=${encodeURIComponent(q)}&limit=8&active=1`);
				if (!res.ok) {
					loading = false;
					return;
				}
				const json = (await res.json()) as { data?: Institution[] };
				suggestions = json.data ?? [];
				highlightedIndex = -1;
				lastQuery = q;
				showDropdown = true;
			} catch {
				// Silently ignore fetch errors
			} finally {
				loading = false;
			}
		}, 300);
	});

	function handleInput(e: Event) {
		const target = e.target as HTMLInputElement;
		inputValue = target.value;

		clearTimeout(debounceTimer);
		debounceTimer = setTimeout(() => {
			onsearch(inputValue.trim());
		}, 300);
	}

	function handleClear() {
		inputValue = '';
		suggestions = [];
		showDropdown = false;
		loading = false;
		lastQuery = '';
		clearTimeout(debounceTimer);
		clearTimeout(fetchTimer);
		onsearch('');
	}

	function selectSuggestion(cert: number) {
		showDropdown = false;
		suggestions = [];
		onselect?.(cert);
	}

	function handleKeydown(e: KeyboardEvent) {
		if (autocomplete && showDropdown && suggestions.length > 0) {
			if (e.key === 'ArrowDown') {
				e.preventDefault();
				highlightedIndex = (highlightedIndex + 1) % suggestions.length;
				return;
			}
			if (e.key === 'ArrowUp') {
				e.preventDefault();
				highlightedIndex = highlightedIndex <= 0 ? suggestions.length - 1 : highlightedIndex - 1;
				return;
			}
			if (e.key === 'Enter' && highlightedIndex >= 0) {
				e.preventDefault();
				selectSuggestion(suggestions[highlightedIndex].cert);
				return;
			}
			if (e.key === 'Escape') {
				e.preventDefault();
				showDropdown = false;
				return;
			}
		}

		if (e.key === 'Enter') {
			clearTimeout(debounceTimer);
			onsearch(inputValue.trim());
		}
	}

	function handleBlur() {
		// Delay so click on suggestion registers before dropdown closes
		setTimeout(() => {
			showDropdown = false;
		}, 200);
	}

	function handleFocus() {
		if (autocomplete && (suggestions.length > 0 || lastQuery.length >= 2)) {
			showDropdown = true;
		}
	}
</script>

<div class="relative">
	<div class="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
		<svg class="h-4 w-4 text-[--text-disabled]" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
			<path
				stroke-linecap="round"
				stroke-linejoin="round"
				stroke-width="2"
				d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
			/>
		</svg>
	</div>
	<input
		type="text"
		value={inputValue}
		oninput={handleInput}
		onkeydown={handleKeydown}
		onblur={handleBlur}
		onfocus={handleFocus}
		{placeholder}
		role={autocomplete ? 'combobox' : undefined}
		aria-expanded={autocomplete ? showDropdown : undefined}
		aria-controls={autocomplete ? 'search-listbox' : undefined}
		aria-activedescendant={autocomplete && highlightedIndex >= 0 ? `search-option-${highlightedIndex}` : undefined}
		aria-autocomplete={autocomplete ? 'list' : undefined}
		class="block w-full rounded-[5px] border border-[--border-muted] bg-[--surface-1] py-2 pr-9 pl-9
			text-[14px] text-[--text-primary] placeholder:text-[--text-disabled]
			focus:border-[--accent] focus:ring-2 focus:ring-[--accent]/20 focus:outline-none
			transition-all duration-150"
	style="box-shadow: var(--shadow-xs)"
	/>
	{#if inputValue}
		<button
			type="button"
			onclick={handleClear}
			aria-label="Clear search"
			class="absolute inset-y-0 right-0 flex items-center pr-3 text-[--text-disabled] hover:text-[--text-secondary]"
		>
			<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
				<path
					stroke-linecap="round"
					stroke-linejoin="round"
					stroke-width="2"
					d="M6 18L18 6M6 6l12 12"
				/>
			</svg>
		</button>
	{/if}

	{#if autocomplete && showDropdown}
		<div
			class="absolute z-50 mt-1 w-full overflow-hidden rounded-md border border-[--border-muted] bg-[--surface-1] max-h-[320px] overflow-y-auto"
			style="box-shadow: var(--shadow-md)"
			role="listbox"
			id="search-listbox"
		>
			{#if loading && suggestions.length === 0}
				<div class="px-3 py-2.5 text-[13px] text-[--text-tertiary]">Searching...</div>
			{:else if !loading && suggestions.length === 0 && lastQuery.length >= 2}
				<div class="px-3 py-2.5 text-[13px] text-[--text-tertiary]">No results</div>
			{:else}
				{#each suggestions as suggestion, i}
					<button
						type="button"
						role="option"
						aria-selected={i === highlightedIndex}
						class="flex w-full items-center justify-between px-3 py-2.5 sm:py-2 text-left cursor-pointer transition-colors min-h-[44px] sm:min-h-0
							{i === highlightedIndex ? 'bg-[--accent-muted]' : 'hover:bg-[--accent-muted]'}"
						onmousedown={() => selectSuggestion(suggestion.cert)}
					>
						<span class="font-medium text-[--text-primary] text-[13px] truncate">{suggestion.name}</span>
						<span class="ml-2 shrink-0 text-[12px] text-[--text-tertiary] data-mono">
							{suggestion.state ?? ''} &middot; {suggestion.cert}
						</span>
					</button>
				{/each}
			{/if}
		</div>
	{/if}
</div>
