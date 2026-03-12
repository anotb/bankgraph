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
	let fetchTimer: ReturnType<typeof setTimeout> | undefined;

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
			return;
		}

		clearTimeout(fetchTimer);
		fetchTimer = setTimeout(async () => {
			try {
				const res = await fetch(`/api/v1/banks?q=${encodeURIComponent(q)}&limit=8&active=1`);
				if (!res.ok) return;
				const json = (await res.json()) as { data?: Institution[] };
				suggestions = json.data ?? [];
				highlightedIndex = -1;
				showDropdown = suggestions.length > 0;
			} catch {
				// Silently ignore fetch errors
			}
		}, 200);
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
		clearTimeout(debounceTimer);
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
		if (autocomplete && suggestions.length > 0) {
			showDropdown = true;
		}
	}
</script>

<div class="relative">
	<div class="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
		<svg class="h-4 w-4 text-[--text-disabled]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
		class="block w-full rounded border border-[--border] bg-[--surface-1] py-2 pr-9 pl-9
			text-[14px] text-[--text-primary] placeholder:text-[--text-disabled]
			focus:border-[--accent] focus:ring-1 focus:ring-[--accent]/30 focus:outline-none
			transition-colors"
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

	{#if autocomplete && showDropdown && suggestions.length > 0}
		<div
			class="absolute z-50 mt-1 w-full overflow-hidden rounded-[5px] border border-[--border-muted] bg-[--surface-1]"
			style="box-shadow: var(--shadow-md)"
		>
			{#each suggestions as suggestion, i}
				<button
					type="button"
					class="flex w-full items-center justify-between px-3 py-2 text-left cursor-pointer transition-colors
						{i === highlightedIndex ? 'bg-[--accent-muted]' : 'hover:bg-[--accent-muted]'}"
					onmousedown={() => selectSuggestion(suggestion.cert)}
				>
					<span class="font-medium text-[--text-primary] text-[13px] truncate">{suggestion.name}</span>
					<span class="ml-2 shrink-0 text-[12px] text-[--text-tertiary]">
						{suggestion.city ? `${suggestion.city}, ` : ''}{suggestion.state ?? ''}
					</span>
				</button>
			{/each}
		</div>
	{/if}
</div>
