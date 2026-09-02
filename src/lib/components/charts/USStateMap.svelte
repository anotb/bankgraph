<script lang="ts">
	import { onMount } from 'svelte';
	import { geoAlbersUsa, geoPath } from 'd3-geo';
	import { feature, mesh } from 'topojson-client';
	import type { Feature, FeatureCollection, GeoJsonProperties, Geometry, MultiLineString } from 'geojson';
	import { fipsToUsps } from '$lib/utils/state-fips.js';
	import { getStateName } from '$lib/utils/states.js';
	import { formatNumber, formatCurrency } from '$lib/utils/formatters.js';
	import { nextMapState, type MapDirection, type MapStatePoint } from './state-map-navigation.js';

	export interface StateDatum {
		state: string;
		bank_count: number;
		total_assets: number | null;
	}

	let {
		data: stateData,
		metric = 'bank_count',
		selectedStates = [],
		onSelect,
		onClear,
		height = 360
	}: {
		data: StateDatum[];
		metric?: 'bank_count' | 'total_assets';
		selectedStates?: string[];
		onSelect?: (state: string) => void;
		onClear?: () => void;
		height?: number;
	} = $props();

	const WIDTH = 960;
	const HEIGHT = 600;

	let features = $state<Feature<Geometry, GeoJsonProperties>[]>([]);
	let meshGeo = $state<MultiLineString | null>(null);
	let pointedState = $state<string | null>(null);
	let focusedState = $state<string | null>(null);
	let activeState = $state<string | null>(null);
	let tooltipPos = $state<{ x: number; y: number; side: 'left' | 'right' } | null>(null);
	let svgEl = $state<SVGSVGElement | undefined>();
	let plotEl = $state<HTMLDivElement | undefined>();

	// Build lookup: USPS code → bank metric value
	let valueByState = $derived.by(() => {
		const map = new Map<string, number>();
		for (const s of stateData) {
			const v = metric === 'total_assets' ? (s.total_assets ?? 0) : s.bank_count;
			if (v > 0) map.set(s.state, v);
		}
		return map;
	});
	let datumByState = $derived(new Map(stateData.map((datum) => [datum.state, datum])));

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
	let statePoints = $derived.by(() => {
		const points: MapStatePoint[] = [];
		for (const item of features) {
			const state = stateUsps(item);
			if (!state) continue;
			const [x, y] = pathGen.centroid(item);
			if (Number.isFinite(x) && Number.isFinite(y)) points.push({ state, x, y });
		}
		return points;
	});

	$effect(() => {
		const available = new Set(statePoints.map((item) => item.state));
		if (activeState && available.has(activeState)) return;
		activeState = selectedStates.find((state) => available.has(state)) ?? statePoints[0]?.state ?? null;
	});

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
		return previewedState === usps || selectedStates.includes(usps) ? 'var(--accent)' : 'var(--surface-1)';
	}

	function anchorTooltip(node: SVGPathElement) {
		if (!plotEl) return;
		const stateBounds = node.getBoundingClientRect();
		const plotBounds = plotEl.getBoundingClientRect();
		const centerX = stateBounds.left - plotBounds.left + stateBounds.width / 2;
		const centerY = stateBounds.top - plotBounds.top + stateBounds.height / 2;
		const side = centerX > plotBounds.width * 0.62 ? 'left' : 'right';
		tooltipPos = {
			x: Math.max(8, Math.min(plotBounds.width - 8, centerX + (side === 'left' ? -10 : 10))),
			y: Math.max(54, Math.min(plotBounds.height - 54, centerY)),
			side
		};
	}

	function handleEnter(event: MouseEvent, usps: string | undefined) {
		if (!usps) return;
		pointedState = usps;
		anchorTooltip(event.currentTarget as SVGPathElement);
	}

	function handleLeave() {
		pointedState = null;
		if (!focusedState) tooltipPos = null;
	}

	function handleFocus(event: FocusEvent, usps: string | undefined) {
		if (!usps) return;
		activeState = usps;
		focusedState = usps;
		anchorTooltip(event.currentTarget as SVGPathElement);
	}

	function handleBlur() {
		focusedState = null;
		if (!pointedState) tooltipPos = null;
	}

	function handleClick(usps: string | undefined) {
		if (!usps) return;
		if (onSelect) onSelect(usps);
	}

	function focusState(state: string) {
		activeState = state;
		svgEl?.querySelector<SVGPathElement>(`[data-state="${state}"]`)?.focus();
	}

	function handleKeydown(event: KeyboardEvent, usps: string | undefined) {
		if (!usps || !onSelect) return;
		if (event.key === 'Enter' || event.key === ' ') {
			event.preventDefault();
			handleClick(usps);
			return;
		}
		if (event.key === 'Escape' && selectedStates.length && onClear) {
			event.preventDefault();
			onClear();
			return;
		}
		if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
		event.preventDefault();
		focusState(nextMapState(statePoints, usps, event.key as MapDirection));
	}

	function valueLabel(usps: string): string {
		const datum = datumByState.get(usps);
		if (metric === 'total_assets') return datum?.total_assets ? formatCurrency(datum.total_assets) : 'no reported assets';
		return `${formatNumber(datum?.bank_count ?? 0)} ${datum?.bank_count === 1 ? 'bank' : 'banks'}`;
	}

	let previewedState = $derived(focusedState ?? pointedState);
	let previewedDatum = $derived(
		previewedState
			? (datumByState.get(previewedState) ?? {
					state: previewedState,
					bank_count: 0,
					total_assets: null
				})
			: null
	);
	let selectedLabel = $derived(selectedStates.map((state) => getStateName(state)).join(', '));

	const tickPercents = [0, 25, 50, 75, 100];
</script>

<div class="us-map">
	<div class="us-map__plot" bind:this={plotEl} style:height="{height}px">
		<svg
			bind:this={svgEl}
			viewBox="0 0 {WIDTH} {HEIGHT}"
			preserveAspectRatio="xMidYMid meet"
			role={onSelect ? 'group' : 'img'}
			aria-label="US state map colored by {metric === 'total_assets' ? 'total bank assets' : 'bank count'}"
			aria-describedby={onSelect ? 'state-map-keyboard-help' : undefined}
			onmouseleave={handleLeave}
		>
			{#each features as f (f.id)}
				{@const usps = stateUsps(f)}
				{@const fill = fillFor(usps)}
				<!-- One roving tab stop enters the map; arrow keys move between states. -->
				<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
				<path
					data-state={usps}
					d={statePaths.get(String(f.id ?? '')) ?? ''}
					fill={fill}
					stroke={usps ? strokeFor(usps) : 'var(--surface-1)'}
					stroke-width={previewedState === usps ? 1.5 : 0.6}
					vector-effect="non-scaling-stroke"
					class:us-map__state--selected={usps ? selectedStates.includes(usps) : false}
					role={onSelect && usps ? 'button' : undefined}
					tabindex={onSelect && usps === activeState ? 0 : -1}
					aria-label={onSelect && usps ? `${getStateName(usps)}: ${valueLabel(usps)}` : undefined}
					aria-pressed={onSelect && usps ? selectedStates.includes(usps) : undefined}
					onmouseenter={(event) => handleEnter(event, usps)}
					onfocus={(event) => handleFocus(event, usps)}
					onblur={handleBlur}
					onclick={() => handleClick(usps)}
					onkeydown={(event) => handleKeydown(event, usps)}
					class:us-map__state--interactive={onSelect && usps}
				/>
			{/each}
			{#if borderPath}
				<path d={borderPath} fill="none" stroke="var(--surface-1)" stroke-width="0.7" vector-effect="non-scaling-stroke" pointer-events="none" />
			{/if}
		</svg>

		{#if previewedState && previewedDatum && tooltipPos}
		<div
			class="us-map__tooltip"
			class:us-map__tooltip--left={tooltipPos.side === 'left'}
			style:left="{tooltipPos.x}px"
			style:top="{tooltipPos.y}px"
			role="tooltip"
		>
			<p class="us-map__tt-state">{getStateName(previewedState)}</p>
			<p class="us-map__tt-row">
				<span>Banks</span>
				<span class="data-mono">{formatNumber(previewedDatum.bank_count)}</span>
			</p>
			{#if previewedDatum.total_assets != null && previewedDatum.total_assets > 0}
				<p class="us-map__tt-row">
					<span>Total assets</span>
					<span class="data-mono">{formatCurrency(previewedDatum.total_assets)}</span>
				</p>
			{/if}
			{#if onSelect}
				<p class="us-map__tt-hint">
					{selectedStates.includes(previewedState) ? 'Select again to clear' : 'Select to filter'}
				</p>
			{/if}
		</div>
		{/if}
	</div>

	<div
		class="us-map__legend"
		role="img"
		aria-label="{metric === 'total_assets' ? 'Total assets' : 'Bank count'} color scale from less to more, using a square-root scale"
	>
		<span class="us-map__legend-label">Less</span>
		<div class="us-map__legend-strip" aria-hidden="true">
			{#each tickPercents as pct}
				<span style="background-color: color-mix(in srgb, var(--accent) {Math.max(12, Math.round(Math.sqrt(pct / 100) * 88))}%, var(--surface-2))"></span>
			{/each}
		</div>
		<span class="us-map__legend-label">More</span>
		<span class="us-map__legend-meta">
			{metric === 'total_assets' ? 'Total assets' : 'Bank count'} · square-root scale
		</span>
	</div>
	{#if onSelect}
		<div class="us-map__selection" aria-live="polite">
			<span>{selectedStates.length ? `Filtering by ${selectedLabel}` : 'No state filter'}</span>
			<span id="state-map-keyboard-help">Use arrow keys to explore states. Press Escape to clear the filter.</span>
			{#if onClear}
				<button type="button" disabled={!selectedStates.length} onclick={onClear}>Clear state filter</button>
			{/if}
		</div>
	{/if}
</div>

<style>
	.us-map {
		position: relative;
		width: 100%;
		user-select: none;
	}
	.us-map__plot {
		position: relative;
		width: 100%;
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
	.us-map__state--interactive:focus-visible {
		filter: brightness(1.08);
		outline: none;
	}
	.us-map__state--interactive:focus-visible {
		stroke: var(--accent);
		stroke-width: 3px;
	}
	.us-map__state--selected {
		filter: brightness(1.12);
		stroke-dasharray: 4 2;
	}
	.us-map__tooltip {
		position: absolute;
		pointer-events: none;
		min-width: 160px;
		background-color: var(--surface-1);
		border: 1px solid var(--border);
		border-radius: 0;
		box-shadow: var(--shadow-md);
		padding: 0.5rem 0.625rem;
		font-size: 12px;
		color: var(--text-primary);
		z-index: 5;
		transform: translate(0, -50%);
	}
	.us-map__tooltip--left {
		transform: translate(-100%, -50%);
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
		font-size: 11px;
		color: var(--text-tertiary);
	}
	.us-map__legend {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 11px;
		color: var(--text-tertiary);
		margin-top: 0.5rem;
	}
	.us-map__legend-label {
		font-size: 11px;
		color: var(--text-tertiary);
	}
	.us-map__legend-strip {
		display: flex;
		height: 8px;
		border-radius: 0;
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
		font-size: 11px;
		color: var(--text-tertiary);
	}
	.us-map__selection {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		min-height: 32px;
		margin-top: 0.4rem;
		padding-top: 0.4rem;
		border-top: 1px solid var(--border-muted);
		color: var(--text-secondary);
		font-size: 11px;
	}
	.us-map__selection span:nth-child(2) {
		color: var(--text-tertiary);
	}
	.us-map__selection button {
		margin-inline-start: auto;
		min-height: 28px;
		padding: 0 0.45rem;
		border: 1px solid var(--border);
		background: transparent;
		color: var(--accent-text);
		font-size: 11px;
		cursor: pointer;
	}
	.us-map__selection button:hover {
		border-color: var(--accent);
		color: var(--accent-hover);
	}
	.us-map__selection button:disabled {
		border-color: var(--border-muted);
		color: var(--text-disabled);
		cursor: default;
	}
	@media (max-width: 520px) {
		.us-map__legend,
		.us-map__selection {
			flex-wrap: wrap;
		}
		.us-map__legend-meta,
		.us-map__selection button {
			margin-inline-start: 0;
		}
	}
</style>
