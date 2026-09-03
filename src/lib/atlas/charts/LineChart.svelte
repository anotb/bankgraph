<script lang="ts">
	/**
	 * Atlas line chart: hairline axes, three y ticks, optional cohort band, event
	 * shading, as-of and comparison carets, direct end labels with collision
	 * avoidance, and a hover readout the parent renders. Pure SVG, no library.
	 */
	export interface Series { id: string; label: string; values: (number | null)[]; color?: string; dash?: string; width?: number; muted?: boolean; noLabel?: boolean; context?: boolean }
	interface Props {
		series: Series[];
		labels: string[];              // one per x index
		band?: { lo: (number | null)[]; hi: (number | null)[] } | null;
		events?: Array<{ from: number; to: number; label?: string }>;
		marker?: number | null;        // as-of index
		marker2?: number | null;       // comparison index
		format?: (v: number) => string;
		height?: number;
		yTicks?: number;
		zero?: boolean;
		direct?: boolean;
		dots?: boolean;
		area?: boolean;
		min?: number | null;
		max?: number | null;
		hover?: number | null;
		onhover?: (index: number | null) => void;
		onselect?: (index: number, shift: boolean) => void;
	}
	let {
		series, labels, band = null, events = [], marker = null, marker2 = null,
		format = (v: number) => v.toFixed(2), height = 140, yTicks = 3, zero = false,
		direct = true, dots = false, area = false, min = null, max = null, hover = $bindable(null), onhover, onselect
	}: Props = $props();

	let width = $state(320);
	let el: HTMLDivElement | undefined = $state();
	$effect(() => {
		if (!el) return;
		const ro = new ResizeObserver(([entry]) => { width = Math.max(120, entry.contentRect.width); });
		ro.observe(el);
		return () => ro.disconnect();
	});

	const colors = ['var(--s1)', 'var(--s2)', 'var(--s3)', 'var(--s4)', 'var(--s5)', 'var(--s6)', 'var(--s7)', 'var(--s8)'];
	let n = $derived(Math.max(labels.length, ...series.map((s) => s.values.length)));
	let pad = $derived({ l: 44, r: direct ? Math.min(128, Math.max(64, width * 0.22)) : 10, t: 10, b: 20 });
	let iw = $derived(width - pad.l - pad.r);
	let ih = $derived(height - pad.t - pad.b);

	let domain = $derived.by(() => {
		const all: number[] = [];
		for (const s of series) if (!s.context) for (const v of s.values) if (v != null && Number.isFinite(v)) all.push(v);
		// The band is context: it is clamped to the series' range rather than stretching the axis.
		if (band && !all.length) for (const v of [...band.lo, ...band.hi]) if (v != null && Number.isFinite(v)) all.push(v);
		if (zero) all.push(0);
		let lo = min ?? (all.length ? Math.min(...all) : 0);
		let hi = max ?? (all.length ? Math.max(...all) : 1);
		if (lo === hi) { lo -= 1; hi += 1; }
		const padv = (hi - lo) * 0.06;
		return { lo: min ?? lo - padv, hi: max ?? hi + padv };
	});
	function x(i: number) { return pad.l + (n <= 1 ? iw / 2 : (i * iw) / (n - 1)); }
	function y(v: number) { return pad.t + ih - ((Math.max(domain.lo, Math.min(domain.hi, v)) - domain.lo) / (domain.hi - domain.lo)) * ih; }
	function path(values: (number | null)[]) {
		let d = ''; let started = false;
		values.forEach((v, i) => { if (v == null || !Number.isFinite(v)) { started = false; return; } d += `${started ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)} `; started = true; });
		return d;
	}
	function areaPaths(values: (number | null)[]) {
		const paths: string[] = [];
		let points: Array<{ i: number; value: number }> = [];
		const close = () => {
			if (!points.length) return;
			const first = points[0], last = points[points.length - 1];
			paths.push(`M${x(first.i)} ${pad.t + ih} L${points.map((point) => `${x(point.i)} ${y(point.value)}`).join(' L')} L${x(last.i)} ${pad.t + ih} Z`);
			points = [];
		};
		values.forEach((value, i) => { if (value == null || !Number.isFinite(value)) close(); else points.push({ i, value }); });
		close();
		return paths;
	}
	let bandPath = $derived.by(() => {
		if (!band) return '';
		let d = ''; let started = false;
		band.hi.forEach((v, i) => { if (v == null) { started = false; return; } d += `${started ? 'L' : 'M'}${x(i)} ${y(v)} `; started = true; });
		for (let i = band.lo.length - 1; i >= 0; i--) { const v = band.lo[i]; if (v != null) d += `L${x(i)} ${y(v)} `; }
		return d ? d + 'Z' : '';
	});
	let ticks = $derived(Array.from({ length: yTicks }, (_, k) => domain.lo + ((domain.hi - domain.lo) * k) / (yTicks - 1)));
	let labelPositions = $derived.by(() => {
		const ends = series.map((s, si) => { if (s.noLabel) return { si, v: null, li: 0 }; const last = [...s.values].reverse().find((v) => v != null) ?? null; const li = s.values.length - 1 - [...s.values].reverse().findIndex((v) => v != null); return { si, v: last, li }; }).filter((e) => e.v != null) as { si: number; v: number; li: number }[];
		ends.sort((a, b) => y(a.v) - y(b.v));
		let prev = -Infinity; const pos: Record<number, number> = {};
		for (const e of ends) { const yy = Math.max(y(e.v), prev + 11); pos[e.si] = yy; prev = yy; }
		const over = prev - (pad.t + ih + 4);
		if (over > 0) for (const e of ends) pos[e.si] -= over;
		return { pos, ends };
	});
	// Callers that pre-thin their labels (leaving gaps as '') get every label they asked for.
	let sparseLabels = $derived(labels.filter(Boolean).length <= 12);
	function xLabelAnchor(i: number) { return i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle'; }

	function pointer(e: PointerEvent) {
		const rect = (e.currentTarget as SVGElement).getBoundingClientRect();
		const px = e.clientX - rect.left;
		const i = Math.round(((px - pad.l) / iw) * (n - 1));
		const idx = Math.max(0, Math.min(n - 1, i));
		hover = idx; onhover?.(idx);
	}
	function leave() { hover = null; onhover?.(null); }
	function click(e: MouseEvent) { if (hover != null) onselect?.(hover, e.shiftKey); }
	function key(e: KeyboardEvent) {
		if (!onselect) return;
		if (e.key === 'ArrowLeft') { e.preventDefault(); hover = Math.max(0, (hover ?? n - 1) - 1); onhover?.(hover); }
		if (e.key === 'ArrowRight') { e.preventDefault(); hover = Math.min(n - 1, (hover ?? 0) + 1); onhover?.(hover); }
		if ((e.key === 'Enter' || e.key === ' ') && hover != null) { e.preventDefault(); onselect(hover, e.shiftKey); }
	}
</script>

<div bind:this={el} class="lc" style="height:{height}px">
	<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
	<svg viewBox="0 0 {width} {height}" width="100%" {height} role={onselect ? 'button' : 'img'} tabindex={onselect ? 0 : undefined} aria-label={onselect ? 'Interactive time series. Use left and right arrows to choose a period; press Enter to select it.' : 'Time series'} onpointermove={pointer} onpointerleave={leave} onclick={click} onkeydown={key}>
		{#each events as ev}
			<rect x={x(ev.from)} y={pad.t} width={Math.max(2, x(ev.to) - x(ev.from))} height={ih} fill="var(--band)" />
			{#if ev.label}<text x={x(ev.from) + 3} y={pad.t + 9} class="lbl">{ev.label}</text>{/if}
		{/each}
		{#each ticks as t}
			<line x1={pad.l} x2={width - pad.r} y1={y(t)} y2={y(t)} stroke="var(--rule-2)" stroke-dasharray="1 3" />
			<text x={pad.l - 6} y={y(t) + 3} text-anchor="end">{format(t)}</text>
		{/each}
		{#if zero}<line x1={pad.l} x2={width - pad.r} y1={y(0)} y2={y(0)} stroke="var(--ink-3)" stroke-dasharray="2 3" />{/if}
		{#if bandPath}<path d={bandPath} fill="var(--band)" />{/if}
		{#each labels as l, i}
			{#if l && (sparseLabels || i === 0 || i === n - 1 || (n > 8 ? i % Math.ceil(n / 6) === 0 : true))}
				<text x={x(i)} y={height - 4} text-anchor={xLabelAnchor(i)}>{l}</text>
			{/if}
		{/each}
		{#if marker2 != null}<line x1={x(marker2)} x2={x(marker2)} y1={pad.t} y2={pad.t + ih} stroke="var(--ink-3)" stroke-dasharray="2 3" />{/if}
		{#if marker != null}<line x1={x(marker)} x2={x(marker)} y1={pad.t} y2={pad.t + ih} stroke="var(--accent)" stroke-width="1.5" />{/if}
		{#each series as s, si}
			{@const c = s.color ?? colors[si % colors.length]}
			{#if area && !s.context}{#each areaPaths(s.values) as d}<path {d} fill={c} opacity="0.10" />{/each}{/if}
			<path d={path(s.values)} fill="none" stroke={c} stroke-width={s.width ?? (s.muted ? 1 : 1.5)} stroke-dasharray={s.dash ?? 'none'} opacity={s.muted ? 0.55 : 1} stroke-linejoin="round" />
			{#if dots}{#each s.values as v, i}{#if v != null}<circle cx={x(i)} cy={y(v)} r="2.2" fill={c} />{/if}{/each}{/if}
			{#if direct && labelPositions.pos[si] != null}
				{@const e = labelPositions.ends.find((q) => q.si === si)}
				{#if e}
					<circle cx={x(e.li)} cy={y(e.v)} r="2.2" fill={c} />
					{#if Math.abs(labelPositions.pos[si] - y(e.v)) > 3}<line x1={x(e.li) + 3} x2={x(e.li) + 5} y1={y(e.v)} y2={labelPositions.pos[si]} stroke={c} stroke-width="0.75" />{/if}
					<text x={x(e.li) + 6} y={labelPositions.pos[si] + 3} style="fill:{c}">{s.label ? s.label + '  ' : ''}{format(e.v)}</text>
				{/if}
			{/if}
		{/each}
		{#if hover != null}
			<line x1={x(hover)} x2={x(hover)} y1={pad.t} y2={pad.t + ih} stroke="var(--ink)" />
			{#each series as s, si}{@const v = s.values[hover]}{#if v != null}<circle cx={x(hover)} cy={y(v)} r="3.5" fill="var(--surface)" stroke={s.color ?? colors[si % colors.length]} stroke-width="2" />{/if}{/each}
		{/if}
	</svg>
</div>

<style>
	.lc { width: 100%; min-width: 0; display: block; position: relative; }
	svg { display: block; overflow: visible; cursor: crosshair; }
	svg text { font-family: var(--font-mono); font-size: 11px; fill: var(--ink-3); }
	svg text.lbl { font-family: var(--font-sans); font-size: 11px; font-weight: 500; fill: var(--ink-2); }
</style>
