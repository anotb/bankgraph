<script lang="ts">
	interface Point { id: number; x: number; y: number; label?: string; color?: string; focus?: boolean }
	interface Props { points: Point[]; fx?: (v: number) => string; fy?: (v: number) => string; xLabel: string; yLabel: string; height?: number; onselect?: (id: number) => void; onhover?: (id: number | null) => void }
	let { points, fx = (v) => v.toFixed(2), fy = (v) => v.toFixed(2), xLabel, yLabel, height = 220, onselect, onhover }: Props = $props();
	let width = $state(320);
	let el: HTMLDivElement | undefined = $state();
	$effect(() => { if (!el) return; const ro = new ResizeObserver(([e]) => { width = Math.max(160, e.contentRect.width); }); ro.observe(el); return () => ro.disconnect(); });
	const pad = { l: 44, r: 12, t: 10, b: 40 };
	let xs = $derived(points.map((p) => p.x)), ys = $derived(points.map((p) => p.y));
	function ext(v: number[]) { if (!v.length) return [0, 1]; const s = [...v].sort((a, b) => a - b); const lo = s[Math.floor(s.length * 0.02)], hi = s[Math.ceil(s.length * 0.98) - 1]; const p = (hi - lo || 1) * 0.08; return [lo >= 0 && lo - p < 0 ? 0 : lo - p, hi + p]; }
	let dx = $derived(ext(xs)), dy = $derived(ext(ys));
	function x(v: number) { return pad.l + ((v - dx[0]) / (dx[1] - dx[0])) * (width - pad.l - pad.r); }
	function y(v: number) { return pad.t + (height - pad.t - pad.b) - ((v - dy[0]) / (dy[1] - dy[0])) * (height - pad.t - pad.b); }
	let xt = $derived([dx[0], (dx[0] + dx[1]) / 2, dx[1]]), yt = $derived([dy[0], (dy[0] + dy[1]) / 2, dy[1]]);
	let focus = $derived(points.filter((p) => p.focus));
</script>

<div bind:this={el} class="sc" style="height:{height}px">
	<svg viewBox="0 0 {width} {height}" width="100%" {height} role="img" aria-label="{yLabel} against {xLabel}">
		{#each yt as t}<line x1={pad.l} x2={width - pad.r} y1={y(t)} y2={y(t)} stroke="var(--rule-2)" /><text x={pad.l - 6} y={y(t) + 3} text-anchor="end">{fy(t)}</text>{/each}
		{#each xt as t, i}<text x={x(t)} y={height - 22} text-anchor={i === 0 ? 'start' : i === 2 ? 'end' : 'middle'}>{fx(t)}</text>{/each}
		<text x={width - pad.r} y={height - 6} text-anchor="end" class="ax">{xLabel} →</text>
		<text x={pad.l + 4} y={pad.t + 9} class="ax">↑ {yLabel}</text>
		{#each points as p}{#if !p.focus && p.x >= dx[0] && p.x <= dx[1] && p.y >= dy[0] && p.y <= dy[1]}<circle cx={x(p.x)} cy={y(p.y)} r="2.4" fill="var(--ink-3)" opacity="0.55" role="button" tabindex="0" aria-label={`${p.label ?? p.id}: ${fx(p.x)}, ${fy(p.y)}`} onclick={() => onselect?.(p.id)} onkeydown={(e) => (e.key === 'Enter' || e.key === ' ') && onselect?.(p.id)} onpointerenter={() => onhover?.(p.id)} onpointerleave={() => onhover?.(null)} style="cursor:pointer"><title>{p.label ?? p.id}: {fx(p.x)}, {fy(p.y)}</title></circle>{/if}{/each}
		{#each focus as p}<circle cx={x(Math.max(dx[0], Math.min(dx[1], p.x)))} cy={y(Math.max(dy[0], Math.min(dy[1], p.y)))} r="5" fill={p.color ?? 'var(--accent)'} stroke="var(--surface)" stroke-width="1.5" role="button" tabindex="0" aria-label={`${p.label ?? p.id}: ${fx(p.x)}, ${fy(p.y)}`} onclick={() => onselect?.(p.id)} onkeydown={(e) => (e.key === 'Enter' || e.key === ' ') && onselect?.(p.id)} style="cursor:pointer" />{@const px = x(Math.max(dx[0], Math.min(dx[1], p.x)))}<text x={px > width * 0.72 ? px - 8 : px + 8} y={y(Math.max(dy[0], Math.min(dy[1], p.y))) + 3} text-anchor={px > width * 0.72 ? 'end' : 'start'} style="fill:{p.color ?? 'var(--accent)'}">{p.label}</text>{/each}
	</svg>
</div>

<style>
	.sc { width: 100%; min-width: 0; }
	svg { display: block; overflow: visible; }
	svg text { font-family: var(--font-mono); font-size: 11px; fill: var(--ink-3); }
	svg text.ax { font-family: var(--font-sans); font-size: 11px; font-weight: 500; fill: var(--ink-2); }
</style>
