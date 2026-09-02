<script lang="ts">
	/** A true waterfall: start total, signed steps, end total. Only used when the steps reconcile to the end. */
	interface Step { label: string; code?: string; value: number }
	interface Props { start: { label: string; value: number }; end: { label: string; value: number }; steps: Step[]; format: (v: number) => string; formatDelta: (v: number) => string; height?: number }
	let { start, end, steps, format, formatDelta, height = 240 }: Props = $props();
	let width = $state(600);
	let el: HTMLDivElement | undefined = $state();
	$effect(() => { if (!el) return; const ro = new ResizeObserver(([e]) => { width = Math.max(320, e.contentRect.width); }); ro.observe(el); return () => ro.disconnect(); });
	const pad = { l: 56, r: 12, t: 22, b: 54 };
	let cols = $derived(steps.length + 2);
	let bars = $derived.by(() => {
		let running = start.value;
		const out: Array<{ label: string; code?: string; y0: number; y1: number; delta: number | null; total: boolean }> = [{ label: start.label, y0: 0, y1: start.value, delta: null, total: true }];
		for (const s of steps) { out.push({ label: s.label, code: s.code, y0: running, y1: running + s.value, delta: s.value, total: false }); running += s.value; }
		out.push({ label: end.label, y0: 0, y1: end.value, delta: null, total: true });
		return out;
	});
	// Zoom the axis onto the region where the steps live so small components stay legible.
	let lo = $derived(Math.min(...bars.filter((b) => !b.total).flatMap((b) => [b.y0, b.y1]), start.value, end.value));
	let hi = $derived(Math.max(...bars.filter((b) => !b.total).flatMap((b) => [b.y0, b.y1]), start.value, end.value));
	let padV = $derived((hi - lo || 1) * 0.35);
	let dlo = $derived(lo - padV), dhi = $derived(hi + padV);
	function y(v: number) { return pad.t + (height - pad.t - pad.b) - ((Math.max(dlo, Math.min(dhi, v)) - dlo) / (dhi - dlo)) * (height - pad.t - pad.b); }
	let cw = $derived((width - pad.l - pad.r) / cols);
	let bw = $derived(Math.min(56, cw * 0.62));
	function x(i: number) { return pad.l + i * cw + (cw - bw) / 2; }
	let ticks = $derived([dlo, (dlo + dhi) / 2, dhi]);
	function wrap(label: string): string[] { const words = label.split(' '); const lines: string[] = []; let cur = ''; for (const w of words) { if ((cur + ' ' + w).trim().length > Math.max(8, Math.floor(cw / 6.2))) { if (cur) lines.push(cur); cur = w; } else cur = (cur + ' ' + w).trim(); } if (cur) lines.push(cur); return lines.slice(0, 2); }
</script>

<div bind:this={el} class="wf" style="height:{height}px">
	<svg viewBox="0 0 {width} {height}" width="100%" {height} role="img" aria-label="Waterfall from {start.label} to {end.label}">
		{#each ticks as t}<line x1={pad.l} x2={width - pad.r} y1={y(t)} y2={y(t)} stroke="var(--rule-2)" stroke-dasharray="1 3" /><text x={pad.l - 6} y={y(t) + 3} text-anchor="end">{format(t)}</text>{/each}
		{#each bars as b, i}
			{@const top = Math.min(y(b.y0), y(b.y1))}
			{@const h = Math.max(1.5, Math.abs(y(b.y0) - y(b.y1)))}
			{#if !b.total && i < bars.length - 1}<line x1={x(i) + bw} x2={x(i + 1)} y1={y(b.y1)} y2={y(b.y1)} stroke="var(--ink-4)" stroke-dasharray="2 3" />{/if}
			{#if b.total && i === 0}<line x1={x(0) + bw} x2={x(1)} y1={y(b.y1)} y2={y(b.y1)} stroke="var(--ink-4)" stroke-dasharray="2 3" />{/if}
			<rect x={x(i)} y={b.total ? y(b.y1) : top} width={bw} height={b.total ? height - pad.b - y(b.y1) : h} rx="2" fill={b.total ? 'var(--ink-2)' : (b.delta ?? 0) >= 0 ? 'var(--accent)' : 'var(--adverse)'} opacity={b.total ? 0.85 : 0.95} />
			<text x={x(i) + bw / 2} y={(b.total ? y(b.y1) : top) - 6} text-anchor="middle" class="val" style="fill:{b.total ? 'var(--ink)' : (b.delta ?? 0) >= 0 ? 'var(--accent)' : 'var(--adverse)'}">{b.total ? format(b.y1) : formatDelta(b.delta ?? 0)}</text>
			{#each wrap(b.label) as line, k}<text x={x(i) + bw / 2} y={height - pad.b + 14 + k * 12} text-anchor="middle" class="lbl">{line}</text>{/each}
			{#if b.code}<text x={x(i) + bw / 2} y={height - 6} text-anchor="middle" class="code">{b.code}</text>{/if}
		{/each}
	</svg>
</div>

<style>
	.wf { width: 100%; min-width: 0; overflow-x: auto; }
	svg { display: block; min-width: 320px; }
	svg text { font-family: var(--font-mono); font-size: 11px; fill: var(--ink-3); }
	svg text.val { font-size: 11px; font-weight: 600; }
	svg text.lbl { font-family: var(--font-sans); font-size: 11px; fill: var(--ink-2); }
	svg text.code { font-size: 10px; fill: var(--ink-4); }
</style>
