<script lang="ts">
	let { values, color = 'var(--ink-2)', endColor, height = 26 }: { values: (number | null)[]; color?: string; endColor?: string; height?: number } = $props();
	let width = $state(120);
	let el: HTMLDivElement | undefined = $state();
	$effect(() => {
		if (!el) return;
		const ro = new ResizeObserver(([entry]) => { width = Math.max(40, entry.contentRect.width); });
		ro.observe(el);
		return () => ro.disconnect();
	});
	let clean = $derived(values.filter((v): v is number => v != null && Number.isFinite(v)));
	let lo = $derived(clean.length ? Math.min(...clean) : 0);
	let hi = $derived(clean.length ? Math.max(...clean) : 1);
	function x(i: number) { return 1 + (i * (width - 2)) / Math.max(1, values.length - 1); }
	function y(v: number) { return 2 + (height - 4) - ((v - lo) / ((hi - lo) || 1)) * (height - 4); }
	let d = $derived.by(() => { let s = ''; let started = false; values.forEach((v, i) => { if (v == null) { started = false; return; } s += `${started ? 'L' : 'M'}${x(i)} ${y(v)} `; started = true; }); return s; });
	let lastIndex = $derived(values.length - 1 - [...values].reverse().findIndex((v) => v != null));
	let last = $derived(values[lastIndex] ?? null);
</script>

<div bind:this={el} class="sp" style="height:{height}px">
	{#if clean.length > 1}
		<svg viewBox="0 0 {width} {height}" width="100%" {height} aria-hidden="true">
			<path {d} fill="none" stroke={color} stroke-width="1.25" />
			{#if last != null}<circle cx={x(lastIndex)} cy={y(last)} r="2" fill={endColor ?? color} />{/if}
		</svg>
	{/if}
</div>

<style>
	.sp { width: 100%; min-width: 0; display: block; }
	svg { display: block; overflow: visible; }
</style>
