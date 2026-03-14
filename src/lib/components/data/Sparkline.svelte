<script lang="ts">
	let {
		data,
		width = 80,
		height = 24,
		color = 'var(--accent)',
		showDot = true
	}: {
		data: (number | null)[];
		width?: number;
		height?: number;
		color?: string;
		showDot?: boolean;
	} = $props();

	let valid = $derived(data.filter((d): d is number => d !== null));

	let points = $derived.by(() => {
		if (valid.length < 2) return '';
		const min = Math.min(...valid);
		const max = Math.max(...valid);
		const range = max - min || 1;
		// 10% vertical padding on each side
		const padY = height * 0.1;
		const plotH = height - padY * 2;
		const step = width / (valid.length - 1);
		return valid
			.map((v, i) => `${i * step},${padY + plotH - ((v - min) / range) * plotH}`)
			.join(' ');
	});

	// Last point coordinates for the dot
	let lastPoint = $derived.by(() => {
		if (valid.length < 2) return null;
		const min = Math.min(...valid);
		const max = Math.max(...valid);
		const range = max - min || 1;
		const padY = height * 0.1;
		const plotH = height - padY * 2;
		const step = width / (valid.length - 1);
		const last = valid[valid.length - 1];
		const i = valid.length - 1;
		return {
			x: i * step,
			y: padY + plotH - ((last - min) / range) * plotH
		};
	});

	// Determine trend color: compare last to first valid value
	let trendColor = $derived.by(() => {
		if (valid.length < 2) return color;
		const first = valid[0];
		const last = valid[valid.length - 1];
		if (last > first) return 'var(--positive)';
		if (last < first) return 'var(--negative)';
		return 'var(--text-tertiary)';
	});
</script>

{#if points}
	<svg {width} {height} class="inline-block align-middle" aria-hidden="true">
		<polyline
			{points}
			fill="none"
			stroke={trendColor}
			stroke-width="1.5"
			stroke-linecap="round"
			stroke-linejoin="round"
		/>
		{#if showDot && lastPoint}
			<circle
				cx={lastPoint.x}
				cy={lastPoint.y}
				r="2"
				fill={trendColor}
			/>
		{/if}
	</svg>
{:else}
	<span class="text-[--text-disabled]">&mdash;</span>
{/if}
