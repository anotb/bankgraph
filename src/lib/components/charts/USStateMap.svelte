<script lang="ts">
	import { onMount } from 'svelte';
	import { geoAlbersUsa, geoPath } from 'd3-geo';
	import { feature, mesh } from 'topojson-client';
	import type { Feature, FeatureCollection, GeoJsonProperties, Geometry, MultiLineString } from 'geojson';
	import { fipsToUsps } from '$lib/utils/state-fips.js';
	import { getStateName } from '$lib/utils/states.js';
	import { formatNumber, formatCurrency } from '$lib/utils/formatters.js';

	export interface StateDatum {
		state: string;
		bank_count: number;
		total_assets: number | null;
	}

	let {
		data: stateData,
		metric = 'bank_count',
		onSelect,
		height = 360
	}: {
		data: StateDatum[];
		metric?: 'bank_count' | 'total_assets';
		onSelect?: (state: string) => void;
		height?: number;
	} = $props();

	const WIDTH = 960;
	const HEIGHT = 600;

	let features = $state<Feature<Geometry, GeoJsonProperties>[]>([]);
	let meshGeo = $state<MultiLineString | null>(null);
	let hovered = $state<string | null>(null);
	let hoverPos = $state<{ x: number; y: number } | null>(null);
	let svgEl = $state<SVGSVGElement | undefined>();

	// Build lookup: USPS code → bank metric value
	let valueByState = $derived.by(() => {
		const map = new Map<string, number>();
		for (const s of stateData) {
			const v = metric === 'total_assets' ? (s.total_assets ?? 0) : s.bank_count;
			if (v > 0) map.set(s.state, v);
		}
		return map;
	});

	let maxValue = $derived.by(() => {
		let max = 0;
		for (const v of valueByState.values()) if (v > max) max = v;
		return max || 1;
	});

	onMount(async () => {
		try {
			const res = await fetch('/us-states-10m.json');
			if (!res.ok) return;
			// us-atlas TopoJSON: structure is well-known but the @types are strict.
			// Cast to a loose shape so we can hand it to topojson-client helpers.
			const topo = (await res.json()) as { objects: Record<string, unknown> };
			const statesObj = topo.objects.states;
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const fc = feature(topo as any, statesObj as any) as unknown as FeatureCollection;
			features = fc.features;
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			meshGeo = mesh(topo as any, statesObj as any, (a: any, b: any) => a !== b) as MultiLineString;
		} catch {
			features = [];
			meshGeo = null;
		}
	});

	// Projection + path generator depend only on `features` — stable once the topology loads.
	let pathGen = $derived.by(() => {
		const projection = geoAlbersUsa().fitSize([WIDTH, HEIGHT], { type: 'FeatureCollection', features } as FeatureCollection);
		return geoPath(projection);
	});

	// Precompute every state's SVG path once. Without this, geoPath would re-run for all
	// ~50 MultiPolygons on each mousemove (hover/tooltip are reactive and read in the template).
	let statePaths = $derived.by(() => {
		const map = new Map<string, string>();
		for (const f of features) {
			const id = String(f.id ?? '');
			map.set(id, pathGen(f) ?? '');
		}
		return map;
	});

	let borderPath = $derived(meshGeo ? (pathGen(meshGeo) ?? '') : '');

	function stateUsps(f: Feature<Geometry, GeoJsonProperties>): string | undefined {
		const id = typeof f.id === 'string' ? f.id : String(f.id ?? '').padStart(2, '0');
		return fipsToUsps(id);
	}

	function intensity(usps: string | undefined): number {
		if (!usps) return 0;
		const v = valueByState.get(usps) ?? 0;
		if (v === 0) return 0;
		// Sqrt scale to compensate for heavily skewed distributions (TX, CA dominate)
		return Math.sqrt(v / maxValue);
	}

	function fillFor(usps: string | undefined): string {
		const t = intensity(usps);
		if (t === 0) return 'var(--surface-2)';
		// Lift opacity to 12–88 for readability
		const opacity = Math.max(12, Math.min(88, Math.round(t * 88)));
		return `color-mix(in srgb, var(--accent) ${opacity}%, var(--surface-2))`;
	}

	function strokeFor(usps: string): string {
		return hovered === usps ? 'var(--accent)' : 'var(--surface-1)';
	}

	function handleEnter(e: MouseEvent, usps: string | undefined) {
		if (!usps) return;
		hovered = usps;
		if (!svgEl) return;
		const rect = svgEl.getBoundingClientRect();
		hoverPos = {
			x: e.clientX - rect.left,
			y: e.clientY - rect.top
		};
	}

	function handleMove(e: MouseEvent) {
		if (!svgEl || !hovered) return;
		const rect = svgEl.getBoundingClientRect();
		hoverPos = { x: e.clientX - rect.left, y: e.clientY - rect.top };
	}

	function handleLeave() {
		hovered = null;
		hoverPos = null;
	}

	function handleClick(usps: string | undefined) {
		if (!usps) return;
		if (onSelect) onSelect(usps);
	}

	let hoveredDatum = $derived.by(() => {
		if (!hovered) return null;
		return stateData.find((s) => s.state === hovered) ?? null;
	});

	const tickPercents = [0, 25, 50, 75, 100];
</script>

<div class="us-map" style:height="{height}px">
	<svg
		bind:this={svgEl}
		viewBox="0 0 {WIDTH} {HEIGHT}"
		preserveAspectRatio="xMidYMid meet"
		role="img"
		aria-label="US state map colored by {metric === 'total_assets' ? 'total bank assets' : 'bank count'}"
		onmousemove={handleMove}
		onmouseleave={handleLeave}
	>
		{#each features as f (f.id)}
			{@const usps = stateUsps(f)}
			{@const fill = fillFor(usps)}
			<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
			<path
				d={statePaths.get(String(f.id ?? '')) ?? ''}
				fill={fill}
				stroke={usps ? strokeFor(usps) : 'var(--surface-1)'}
				stroke-width={hovered === usps ? 1.5 : 0.6}
				role={onSelect ? 'button' : 'img'}
				tabindex={onSelect && usps ? 0 : -1}
				aria-label={usps ? `${getStateName(usps)}: ${valueByState.get(usps) ?? 0}` : 'Unknown state'}
				onmouseenter={(e) => handleEnter(e, usps)}
				onfocus={(e) => handleEnter(e as unknown as MouseEvent, usps)}
				onclick={() => handleClick(usps)}
				onkeydown={(e) => {
					if (e.key === 'Enter' || e.key === ' ') {
						e.preventDefault();
						handleClick(usps);
					}
				}}
				class:us-map__state--interactive={onSelect && usps}
			/>
		{/each}
		{#if borderPath}
			<path d={borderPath} fill="none" stroke="var(--surface-1)" stroke-width="0.7" pointer-events="none" />
		{/if}
	</svg>

	{#if hovered && hoveredDatum && hoverPos}
		<div class="us-map__tooltip" style="left: {hoverPos.x + 14}px; top: {hoverPos.y - 8}px">
			<p class="us-map__tt-state">{getStateName(hovered)}</p>
			<p class="us-map__tt-row">
				<span>Banks</span>
				<span class="data-mono">{formatNumber(hoveredDatum.bank_count)}</span>
			</p>
			{#if hoveredDatum.total_assets != null && hoveredDatum.total_assets > 0}
				<p class="us-map__tt-row">
					<span>Total assets</span>
					<span class="data-mono">{formatCurrency(hoveredDatum.total_assets)}</span>
				</p>
			{/if}
			{#if onSelect}
				<p class="us-map__tt-hint">Click to filter →</p>
			{/if}
		</div>
	{/if}

	<div class="us-map__legend" aria-hidden="true">
		<span class="us-map__legend-label">Less</span>
		<div class="us-map__legend-strip">
			{#each tickPercents as pct}
				<span style="background-color: color-mix(in srgb, var(--accent) {Math.max(12, Math.round(Math.sqrt(pct / 100) * 88))}%, var(--surface-2))"></span>
			{/each}
		</div>
		<span class="us-map__legend-label">More</span>
		<span class="us-map__legend-meta">
			{metric === 'total_assets' ? 'Total assets' : 'Bank count'} · sqrt scale
		</span>
	</div>
</div>

<style>
	.us-map {
		position: relative;
		width: 100%;
		user-select: none;
	}
	.us-map svg {
		width: 100%;
		height: 100%;
		display: block;
	}
	.us-map__state--interactive {
		cursor: pointer;
		transition: filter 0.1s ease;
	}
	.us-map__state--interactive:hover,
	.us-map__state--interactive:focus {
		filter: brightness(1.08);
		outline: none;
	}
	.us-map__tooltip {
		position: absolute;
		pointer-events: none;
		min-width: 160px;
		background-color: var(--surface-1);
		border: 1px solid var(--border);
		border-radius: 6px;
		box-shadow: var(--shadow-md);
		padding: 0.5rem 0.625rem;
		font-size: 12px;
		color: var(--text-primary);
		z-index: 5;
	}
	.us-map__tt-state {
		font-size: 12px;
		font-weight: 600;
		margin: 0 0 0.375rem;
		color: var(--text-primary);
	}
	.us-map__tt-row {
		display: flex;
		justify-content: space-between;
		gap: 0.875rem;
		margin: 0 0 0.125rem;
		font-size: 11px;
		color: var(--text-secondary);
	}
	.us-map__tt-row .data-mono { color: var(--text-primary); font-weight: 500; }
	.us-map__tt-hint {
		margin: 0.375rem 0 0;
		padding-top: 0.375rem;
		border-top: 1px dashed var(--border-muted);
		font-size: 10px;
		color: var(--text-tertiary);
	}
	.us-map__legend {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 10px;
		color: var(--text-tertiary);
		margin-top: 0.5rem;
	}
	.us-map__legend-label {
		font-size: 10px;
		color: var(--text-tertiary);
	}
	.us-map__legend-strip {
		display: flex;
		height: 8px;
		border-radius: 2px;
		overflow: hidden;
		border: 1px solid var(--border-muted);
		flex-shrink: 0;
	}
	.us-map__legend-strip > span {
		display: block;
		width: 16px;
		height: 100%;
	}
	.us-map__legend-meta {
		margin-left: auto;
		font-size: 10px;
		color: var(--text-tertiary);
	}
</style>
