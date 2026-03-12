<script lang="ts">
	let {
		data,
		width = 60,
		height = 20,
		color = 'var(--accent)'
	}: {
		data: (number | null)[];
		width?: number;
		height?: number;
		color?: string;
	} = $props();

	let points = $derived.by(() => {
		const valid = data.filter((d): d is number => d !== null);
		if (valid.length < 2) return '';
		const min = Math.min(...valid);
		const max = Math.max(...valid);
		const range = max - min || 1;
		const step = width / (valid.length - 1);
		return valid
			.map((v, i) => `${i * step},${height - ((v - min) / range) * (height - 2) - 1}`)
			.join(' ');
	});

	// Determine trend color: compare last to first valid value
	let trendColor = $derived.by(() => {
		const valid = data.filter((d): d is number => d !== null);
		if (valid.length < 2) return color;
		return valid[valid.length - 1] >= valid[0] ? 'var(--positive)' : 'var(--negative)';
	});
</script>

{#if points}
	<svg {width} {height} class="inline-block">
		<polyline
			{points}
			fill="none"
			stroke={trendColor}
			stroke-width="1.5"
			stroke-linecap="round"
			stroke-linejoin="round"
		/>
	</svg>
{:else}
	<span class="text-[--text-disabled]">—</span>
{/if}
