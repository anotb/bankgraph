<script lang="ts">
	let {
		selected = $bindable<string>('10Y'),
		onchange
	}: {
		selected: string;
		availableQuarters?: string[];
		onchange?: (range: { from: string | null; to: string | null; preset: string }) => void;
	} = $props();

	const presets = [
		{ label: 'Last 4Q', value: '4Q' },
		{ label: 'Last 8Q', value: '8Q' },
		{ label: 'Last 5Y', value: '5Y' },
		{ label: 'Last 10Y', value: '10Y' },
		{ label: 'All', value: 'All' }
	];
</script>

<div class="flex items-center gap-2">
	<span class="text-[13px] text-[--text-tertiary]">Period:</span>
	<div class="flex gap-1">
		{#each presets as preset}
			<button
				class="px-3 py-1 text-[13px] rounded font-medium transition-colors
					{selected === preset.value
					? 'bg-[--accent]/10 text-[--accent] border border-[--accent]/30'
					: 'bg-[--surface-2] text-[--text-secondary] hover:bg-[--surface-3] border border-transparent'}"
				onclick={() => {
					selected = preset.value;
					onchange?.({ from: null, to: null, preset: preset.value });
				}}
			>
				{preset.label}
			</button>
		{/each}
	</div>
</div>
