<script lang="ts">
	let {
		value = '',
		placeholder = 'Search...',
		onsearch
	}: {
		value?: string;
		placeholder?: string;
		onsearch: (query: string) => void;
	} = $props();

	let inputValue = $state('');
	let debounceTimer: ReturnType<typeof setTimeout> | undefined;

	// Sync external value changes into local state
	$effect(() => {
		inputValue = value;
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
		clearTimeout(debounceTimer);
		onsearch('');
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter') {
			clearTimeout(debounceTimer);
			onsearch(inputValue.trim());
		}
	}
</script>

<div class="relative">
	<div class="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
		<svg class="h-4 w-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
		{placeholder}
		class="block w-full rounded-lg border border-gray-300 bg-white py-2 pr-10 pl-10 text-sm text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
	/>
	{#if inputValue}
		<button
			type="button"
			onclick={handleClear}
			aria-label="Clear search"
			class="absolute inset-y-0 right-0 flex items-center pr-3 text-gray-400 hover:text-gray-600"
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
</div>
