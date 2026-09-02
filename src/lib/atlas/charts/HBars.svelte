<script lang="ts">
	/** Signed horizontal bars for change attribution. Values in the caller's unit; format supplied. */
	interface Row { label: string; sub?: string; value: number; faint?: boolean }
	let { rows, format, labelWidth = 200, rowHeight = 22 }: { rows: Row[]; format: (v: number) => string; labelWidth?: number; rowHeight?: number } = $props();
	let width = $state(400);
	let el: HTMLDivElement | undefined = $state();
	$effect(() => {
		if (!el) return;
		const ro = new ResizeObserver(([entry]) => { width = Math.max(240, entry.contentRect.width); });
		ro.observe(el);
		return () => ro.disconnect();
	});
	let height = $derived(rows.length * rowHeight + 4);
	let valueWidth = 84;
	let maxAbs = $derived(Math.max(1e-9, ...rows.map((r) => Math.abs(r.value))));
	let hasNeg = $derived(rows.some((r) => r.value < 0));
	let lw = $derived(Math.min(labelWidth, width * 0.45));
	let x0 = $derived(lw + (width - lw - valueWidth) * (hasNeg ? 0.3 : 0.02));
	let scale = $derived((width - lw - valueWidth - (x0 - lw)) / maxAbs);
</script>

<div bind:this={el} class="hb">
	<svg viewBox="0 0 {width} {height}" width="100%" {height} role="img">
		<line x1={x0} x2={x0} y1="0" y2={height} stroke="var(--rule)" />
		{#each rows as r, i}
			{@const y = i * rowHeight + 4}
			{@const w = Math.abs(r.value) * scale}
			<text x="0" y={y + 11} class="lbl">{r.label}</text>
			{#if r.sub}<text x="0" y={y + 20} class="sub">{r.sub}</text>{/if}
			<rect x={r.value >= 0 ? x0 : x0 - w} y={y + 3} width={Math.max(w, 1)} height={rowHeight - 10} fill={r.value >= 0 ? 'var(--accent)' : 'var(--adverse)'} opacity={r.faint ? 0.3 : 0.9} rx="1" />
			<text x={width} y={y + 11} text-anchor="end" class="val" style="fill:{r.value < 0 ? 'var(--adverse)' : 'var(--ink)'}">{format(r.value)}</text>
		{/each}
	</svg>
</div>

<style>
	.hb { width: 100%; min-width: 0; display: block; }
	svg { display: block; }
	svg text { font-family: var(--font-mono); font-size: 11px; fill: var(--ink-3); }
	svg text.lbl { font-family: var(--font-sans); font-size: 12px; fill: var(--ink); }
	svg text.sub { font-size: 10.5px; }
	svg text.val { font-size: 11.5px; font-weight: 500; }
</style>
