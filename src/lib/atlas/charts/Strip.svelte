<script lang="ts">
	/** Distribution strip: cohort points along a value axis, quartile band, median tick, focused banks. */
	interface Point { cert: number; value: number; label?: string; color?: string }
	interface Props {
		points: Point[];
		focus?: Point[];
		format?: (v: number) => string;
		height?: number;
		onselect?: (cert: number) => void;
	}
	let { points, focus = [], format = (v: number) => v.toFixed(2), height = 58, onselect }: Props = $props();
	let width = $state(320);
	let el: HTMLDivElement | undefined = $state();
	$effect(() => {
		if (!el) return;
		const ro = new ResizeObserver(([entry]) => { width = Math.max(120, entry.contentRect.width); });
		ro.observe(el);
		return () => ro.disconnect();
	});
	const pad = 56;
	let sorted = $derived([...points.map((p) => p.value), ...focus.map((p) => p.value)].filter(Number.isFinite).sort((a, b) => a - b));
	let lo = $derived(sorted[0] ?? 0);
	let hi = $derived(sorted[sorted.length - 1] ?? 1);
	function q(p: number) { if (!sorted.length) return 0; const idx = (sorted.length - 1) * p; const l = Math.floor(idx), h = Math.ceil(idx); return sorted[l] + (sorted[h] - sorted[l]) * (idx - l); }
	let q1 = $derived(q(0.25)), med = $derived(q(0.5)), q3 = $derived(q(0.75));
	function x(v: number) { return pad + ((v - lo) / ((hi - lo) || 1)) * (width - pad * 2); }
	// Stacked focus labels sit above the band; the band drops to leave room for however many there are.
	let cy = $derived(Math.max(height / 2 + 2, 16 + Math.max(1, focus.length) * 12));
	function jitter(i: number) { return ((i * 7919) % 9) - 4; }
</script>

<div bind:this={el} class="strip" style="height:{height}px">
	<svg viewBox="0 0 {width} {height}" width="100%" {height} role="img">
		<rect x={x(q1)} y={cy - 9} width={Math.max(1, x(q3) - x(q1))} height="18" fill="var(--band)" />
		<line x1={pad} x2={width - pad} y1={cy} y2={cy} stroke="var(--rule)" />
		{#each points as p, i}
			<circle cx={x(p.value)} cy={cy + jitter(i)} r="1.8" fill="var(--ink-3)" opacity="0.7" role="button" tabindex="0" aria-label={`${p.label ?? p.cert}: ${format(p.value)}`} onclick={() => onselect?.(p.cert)} onkeydown={(e) => (e.key === 'Enter' || e.key === ' ') && onselect?.(p.cert)} style="cursor:pointer"><title>{p.label ?? p.cert}: {format(p.value)}</title></circle>
		{/each}
		<line x1={x(med)} x2={x(med)} y1={cy - 12} y2={cy + 12} stroke="var(--ink)" stroke-width="1.25" />
		<text x={x(med)} y={cy + 21} text-anchor="middle">median {format(med)}</text>
		{#each focus as f, i}
			<circle cx={x(f.value)} cy={cy} r="5" fill={f.color ?? 'var(--accent)'} role="button" tabindex="0" aria-label={`${f.label ?? f.cert}: ${format(f.value)}`} onclick={() => onselect?.(f.cert)} onkeydown={(e) => (e.key === 'Enter' || e.key === ' ') && onselect?.(f.cert)} style="cursor:pointer"><title>{f.label ?? f.cert}: {format(f.value)}</title></circle>
			<text x={x(f.value)} y={cy - 14 - i * 12} text-anchor="middle" class="fl" style="fill:{f.color ?? 'var(--accent)'}">{f.label ? f.label + ' ' : ''}{format(f.value)}</text>
		{/each}
		<text x={pad - 6} y={cy + 4} text-anchor="end">{format(lo)}</text>
		<text x={width - pad + 6} y={cy + 4}>{format(hi)}</text>
	</svg>
</div>

<style>
	.strip { width: 100%; min-width: 0; display: block; }
	svg { display: block; overflow: visible; }
	svg text { font-family: var(--font-mono); font-size: 11px; fill: var(--ink-3); }
	svg text.fl { font-weight: 600; }
</style>
