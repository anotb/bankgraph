<script lang="ts">
	import { STATE_TILES, US_STATES } from '$lib/atlas/states';
	interface Props {
		values: Record<string, number | null | undefined>;
		labels?: Record<string, string>;
		focus?: string[];
		selected?: string[];
		gamma?: number;
		format?: (v: number) => string;
		onselect?: (state: string, shift: boolean) => void;
		onhover?: (state: string | null) => void;
		/** Fit both the available width and height instead of deriving height from width alone. */
		fit?: boolean;
	}
	let { values, labels = {}, focus = [], selected = [], gamma = 0.5, format = (v: number) => String(Math.round(v)), onselect, onhover, fit = false }: Props = $props();
	let width = $state(320);
	let availableHeight = $state(220);
	let el: HTMLDivElement | undefined = $state();
	$effect(() => {
		if (!el) return;
		const ro = new ResizeObserver(([entry]) => {
			width = Math.max(160, entry.contentRect.width);
			availableHeight = Math.max(120, entry.contentRect.height);
		});
		ro.observe(el);
		return () => ro.disconnect();
	});
	let s = $derived(Math.max(13, Math.floor(Math.min(width / 12.2, fit ? availableHeight / 8.2 : Number.POSITIVE_INFINITY))));
	let viewWidth = $derived(s * 12 + 6);
	let viewHeight = $derived(s * 8 + 6);
	let hi = $derived(Math.max(1, ...Object.values(values).filter((v): v is number => v != null && Number.isFinite(v))));
	function alpha(v: number | null | undefined) { return v == null ? 0 : Math.pow(v / hi, gamma); }
	let hovered = $state<string | null>(null);
</script>

<div bind:this={el} class="tm" class:fit>
	<svg viewBox="0 0 {viewWidth} {viewHeight}" width="100%" height={fit ? '100%' : viewHeight} preserveAspectRatio="xMidYMid meet" role="img" aria-label="Tile map of U.S. states">
		{#each Object.entries(STATE_TILES) as [st, [c, r]]}
			{@const v = values[st]}
			{@const a = alpha(v)}
			{@const isFocus = focus.includes(st) || selected.includes(st)}
			<g role="button" tabindex="0" aria-label="{US_STATES[st]}: {v == null ? 'no data' : format(v)}"
				onclick={(e) => onselect?.(st, e.shiftKey)}
				onkeydown={(e) => (e.key === 'Enter' || e.key === ' ') && onselect?.(st, e.shiftKey)}
				onpointerenter={() => { hovered = st; onhover?.(st); }}
				onpointerleave={() => { hovered = null; onhover?.(null); }}
				class:sel={selected.includes(st)} class:hov={hovered === st} style="cursor:{onselect ? 'pointer' : 'default'}">
				<rect x={c * s + 2} y={r * s + 2} width={s - 3} height={s - 3} fill={isFocus ? 'var(--accent)' : 'var(--ink)'} fill-opacity={isFocus ? 1 : 0.05 + a * 0.8} stroke="var(--surface)" stroke-width="1" rx="2" />
				<text x={c * s + 6} y={r * s + 13} class:onink={a > 0.45 || isFocus}>{st}</text>
				{#if s > 34 && v != null}<text x={c * s + s - 3} y={r * s + s - 5} text-anchor="end" class="v" class:onink={a > 0.45 || isFocus}>{labels[st] ?? format(v)}</text>{/if}
			</g>
		{/each}
	</svg>
</div>

<style>
	.tm { width: 100%; min-width: 0; display: block; }
	.tm.fit { height: 100%; min-height: 0; }
	svg { display: block; }
	svg text { font-family: var(--font-mono); font-size: 10.5px; font-weight: 500; fill: var(--ink-2); pointer-events: none; }
	svg text.v { font-size: 9.5px; font-weight: 400; fill: var(--ink-3); }
	svg text.onink { fill: var(--surface); }
	g.hov rect { stroke: var(--ink); stroke-width: 1.5; }
	g.sel rect { stroke: var(--accent); stroke-width: 2; }
</style>
