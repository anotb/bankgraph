<script lang="ts">
	import {
		formatExactChartDate,
		normalizeChartDate
	} from '$lib/components/charts/time-series-interaction.js';
	import {
		evidenceTrendTooltipPlacement,
		nextEvidenceTrendIndex
	} from './evidence-trend-interaction.js';

	interface Point { repdte: string; value: number | null; }

	let {
		label,
		unit = '%',
		points,
		color = '#52d8e8',
		seriesHref,
		pointHref,
		format = (value: number) => `${value.toFixed(2)}${unit}`
	}: {
		label: string;
		unit?: string;
		points: Point[];
		color?: string;
		seriesHref?: string;
		pointHref?: (point: { repdte: string; value: number }) => string;
		format?: (value: number) => string;
	} = $props();

	const width = 520;
	const height = 104;
	const padX = 8;
	const padY = 13;
	let keyboardIndex = $state(-1);
	let inspectedIndex = $state(-1);
	let touchPreviewIndex = -1;
	let touchArmedIndex = -1;
	let touchArmedAt = 0;
	let pointLinks: Array<HTMLAnchorElement | undefined> = [];
	let valid = $derived(points.filter((point): point is { repdte: string; value: number } => typeof point.value === 'number' && Number.isFinite(point.value)));
	let minimum = $derived(valid.length ? Math.min(...valid.map((point) => point.value)) : 0);
	let maximum = $derived(valid.length ? Math.max(...valid.map((point) => point.value)) : 1);
	let spread = $derived(maximum - minimum || Math.abs(maximum) * .08 || 1);
	let path = $derived.by(() => {
		if (valid.length < 2) return '';
		return valid.map((point, index) => {
			const x = padX + index * ((width - padX * 2) / (valid.length - 1));
			const y = padY + (maximum - point.value) / spread * (height - padY * 2);
			return `${index === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
		}).join(' ');
	});
	let current = $derived(valid.at(-1)?.value ?? null);
	let prior = $derived(valid.at(-2)?.value ?? null);
	let change = $derived(current !== null && prior !== null ? current - prior : null);
	let inspectedPoint = $derived(valid[inspectedIndex] ?? null);
	let inspectedX = $derived(inspectedPoint ? pointX(inspectedIndex) : 0);
	let inspectedY = $derived(inspectedPoint ? pointY(inspectedPoint.value) : 0);
	let tooltipPlacement = $derived(
		evidenceTrendTooltipPlacement(inspectedX, inspectedY, width, height)
	);
	let tooltipUnit = $derived(unit === '%' ? 'Percent' : unit);
	let tabbableIndex = $derived(
		valid.length === 0 ? -1 : Math.max(0, Math.min(keyboardIndex < 0 ? valid.length - 1 : keyboardIndex, valid.length - 1))
	);

	$effect(() => {
		const length = valid.length;
		if (length === 0) {
			keyboardIndex = -1;
			inspectedIndex = -1;
			return;
		}
		if (keyboardIndex < 0 || keyboardIndex >= length) keyboardIndex = length - 1;
		if (inspectedIndex >= length) inspectedIndex = -1;
	});

	function pointX(index: number): number {
		return padX + index * ((width - padX * 2) / Math.max(valid.length - 1, 1));
	}

	function pointY(value: number): number {
		return padY + (maximum - value) / spread * (height - padY * 2);
	}

	function inspect(index: number): void {
		inspectedIndex = index;
	}

	function handlePointKeydown(event: KeyboardEvent, index: number): void {
		const next = nextEvidenceTrendIndex(index, valid.length, event.key);
		if (next === null) return;
		event.preventDefault();
		event.stopPropagation();
		keyboardIndex = next;
		inspect(next);
		requestAnimationFrame(() => pointLinks[next]?.focus());
	}

	function handlePointPointerDown(event: PointerEvent, index: number): void {
		if (event.pointerType === 'touch') {
			const now = Date.now();
			const isSecondTap = touchArmedIndex === index && now - touchArmedAt < 4_000;
			touchPreviewIndex = isSecondTap ? -1 : index;
			touchArmedIndex = isSecondTap ? -1 : index;
			touchArmedAt = isSecondTap ? 0 : now;
		} else {
			touchPreviewIndex = -1;
			touchArmedIndex = -1;
			touchArmedAt = 0;
		}
		inspect(index);
	}

	function handlePointClick(event: MouseEvent, index: number): void {
		keyboardIndex = index;
		if (touchPreviewIndex !== index) return;
		event.preventDefault();
		touchPreviewIndex = -1;
		pointLinks[index]?.focus();
	}

	function quarter(value: string): string {
		return value.length >= 6 ? `Q${Math.ceil(Number(value.slice(4, 6)) / 3)} '${value.slice(2, 4)}` : value;
	}
</script>

<div class="trend">
	<div class="trend__readout">
		{#if seriesHref}<a class="trend__label" href={seriesHref}>{label}<span aria-hidden="true"> →</span></a>{:else}<span class="trend__label">{label}</span>{/if}
		{#if current !== null}
			<strong>{format(current)}</strong>
			{#if change !== null}<span class:negative={change < 0}>{change > 0 ? '+' : ''}{unit === '%' ? (change * 100).toFixed(0) + ' bp' : format(change)}</span>{/if}
		{:else}
			<span>Not available</span>
		{/if}
	</div>
	{#if valid.length >= 2}
		<div class="trend__plot">
			<svg viewBox={`0 0 ${width} ${height}`} role="group" aria-label={`${label} from ${quarter(valid[0].repdte)} to ${quarter(valid.at(-1)!.repdte)}. Focus one point, then use Left and Right arrow keys to inspect adjacent quarters.`} preserveAspectRatio="none">
				<line x1={padX} y1={padY} x2={width - padX} y2={padY}></line>
				<line x1={padX} y1={height / 2} x2={width - padX} y2={height / 2}></line>
				<line x1={padX} y1={height - padY} x2={width - padX} y2={height - padY}></line>
				<path d={path} style:stroke={color}></path>
				{#each valid as point, index}
					{@const x = pointX(index)}
					{@const y = pointY(point.value)}
					{#if pointHref}
						<a
							bind:this={pointLinks[index]}
							href={pointHref(point)}
							tabindex={index === tabbableIndex ? 0 : -1}
							aria-label={`${label}, ${quarter(point.repdte)}, ${format(point.value)}. Open in workspace.`}
							aria-keyshortcuts="ArrowLeft ArrowRight Home End"
							onpointerenter={() => inspect(index)}
							onpointerleave={(event) => {
								if (event.pointerType === 'mouse' && pointLinks[index] !== document.activeElement) inspectedIndex = -1;
							}}
							onpointerdown={(event) => handlePointPointerDown(event, index)}
							onfocus={() => {
								keyboardIndex = index;
								inspect(index);
							}}
							onblur={() => {
								if (touchPreviewIndex !== index) inspectedIndex = -1;
							}}
							onkeydown={(event) => handlePointKeydown(event, index)}
							onclick={(event) => handlePointClick(event, index)}
						>
							<circle class="point-hit" cx={x} cy={y} r="12"></circle>
							<circle class="point-mark" class:inspected={index === inspectedIndex} cx={x} cy={y} r={index === valid.length - 1 ? 3 : 2} style:fill={color}></circle>
						</a>
					{:else}
						<circle class="point-mark" cx={x} cy={y} r={index === valid.length - 1 ? 3 : 1.7} style:fill={color}></circle>
					{/if}
				{/each}
			</svg>
			{#if inspectedPoint}
				<div
					class="trend__tooltip"
					class:trend__tooltip--start={tooltipPlacement.horizontal === 'start'}
					class:trend__tooltip--end={tooltipPlacement.horizontal === 'end'}
					class:trend__tooltip--below={tooltipPlacement.vertical === 'below'}
					style={`left:clamp(8px,${(inspectedX / width) * 100}%,calc(100% - 8px));top:${(inspectedY / height) * 100}%`}
					role="tooltip"
				>
					<strong>{quarter(inspectedPoint.repdte)}</strong>
					<time datetime={normalizeChartDate(inspectedPoint.repdte)}>{formatExactChartDate(inspectedPoint.repdte)}</time>
					<span>{label}</span>
					<div><b>{format(inspectedPoint.value)}</b><small>{tooltipUnit}</small></div>
				</div>
			{/if}
		</div>
		<div class="trend__axis"><span>{quarter(valid[0].repdte)}</span><span>{quarter(valid.at(-1)!.repdte)}</span></div>
		<details>
			<summary>Exact quarterly values</summary>
			<div class="trend__values">
				{#each valid as point}
					{#if pointHref}<a href={pointHref(point)}><b>{quarter(point.repdte)}</b>{format(point.value)}</a>{:else}<span><b>{quarter(point.repdte)}</b>{format(point.value)}</span>{/if}
				{/each}
			</div>
		</details>
	{:else}
		<p class="trend__empty">Two reporting periods are needed to draw this history.</p>
	{/if}
</div>

<style>
	.trend { padding: .85rem 0 .65rem; border-top: 1px solid #22333b; }
	.trend:first-child { border-top: 0; padding-top: 0; }
	.trend__readout { display: grid; grid-template-columns: minmax(10rem, 1fr) auto 4.8rem; align-items: baseline; gap: .75rem; }
	.trend__label { color: #b9c7cc; font-size: .78rem; font-weight: 600; text-decoration: none; }
	a.trend__label:hover, a.trend__label:focus-visible { color: #52d8e8; }
	.trend__readout strong { color: #edf4f5; font: 600 .82rem/1 var(--font-mono); font-variant-numeric: tabular-nums; }
	.trend__readout > span:last-child { color: #62d8bc; text-align: right; font: 600 .7rem/1 var(--font-mono); }
	.trend__readout > span.negative { color: #f39970; }
	.trend__plot { position: relative; margin-top: .4rem; }
	svg { display: block; width: 100%; height: 6.4rem; overflow: visible; }
	line { stroke: #20343d; stroke-width: 1; vector-effect: non-scaling-stroke; }
	path { fill: none; stroke-width: 1.7; vector-effect: non-scaling-stroke; }
	circle { vector-effect: non-scaling-stroke; }
	.point-hit { fill: transparent; pointer-events: all; }
	svg a { cursor: pointer; }
	svg a:hover .point-mark,
	svg a:focus-visible .point-mark,
	.point-mark.inspected { stroke: #edf4f5; stroke-width: 2; }
	.trend__tooltip {
		position: absolute;
		z-index: 3;
		display: grid;
		min-width: 9.5rem;
		max-width: min(14rem, calc(100% - 16px));
		gap: .12rem;
		padding: .48rem .55rem;
		border: 1px solid #29404e;
		background: #091a26;
		box-shadow: 0 18px 32px rgba(0, 0, 0, .34);
		color: #eef5f7;
		font-size: .68rem;
		line-height: 1.35;
		pointer-events: none;
		transform: translate(-50%, calc(-100% - 9px));
	}
	.trend__tooltip--start { transform: translate(0, calc(-100% - 9px)); }
	.trend__tooltip--end { transform: translate(-100%, calc(-100% - 9px)); }
	.trend__tooltip--below { transform: translate(-50%, 9px); }
	.trend__tooltip--start.trend__tooltip--below { transform: translate(0, 9px); }
	.trend__tooltip--end.trend__tooltip--below { transform: translate(-100%, 9px); }
	.trend__tooltip strong,
	.trend__tooltip b { font-family: var(--font-mono); font-variant-numeric: tabular-nums; }
	.trend__tooltip strong { color: #25cdf5; font-weight: 650; }
	.trend__tooltip time,
	.trend__tooltip > span,
	.trend__tooltip small { color: #93a8b1; }
	.trend__tooltip > span { overflow-wrap: anywhere; }
	.trend__tooltip > div { display: flex; align-items: baseline; justify-content: space-between; gap: .75rem; margin-top: .12rem; }
	.trend__tooltip b { color: #eef5f7; font-size: .76rem; font-weight: 650; }
	.trend__tooltip small { font-size: .62rem; }
	.trend__axis { display: flex; justify-content: space-between; color: #657781; font: 500 .62rem/1 var(--font-mono); }
	details { margin-top: .45rem; }
	summary { color: #7d8d95; font-size: .66rem; cursor: pointer; width: max-content; }
	.trend__values { display: grid; grid-template-columns: repeat(auto-fit, minmax(5rem, 1fr)); gap: 1px; margin-top: .5rem; background: #243841; }
	.trend__values span, .trend__values a { display: flex; flex-direction: column; gap: .2rem; background: #0b151a; padding: .45rem; color: #c5d0d3; font: 500 .67rem/1.2 var(--font-mono); text-decoration: none; }
	.trend__values a:hover, .trend__values a:focus-visible { background: #12242c; color: #52d8e8; }
	.trend__values b { color: #71828a; font-weight: 500; }
	.trend__empty { min-height: 6rem; display: grid; place-items: center; color: #74848c; font-size: .75rem; border-top: 1px solid #20343d; border-bottom: 1px solid #20343d; }
	@media (max-width: 520px) {
		.trend__readout { grid-template-columns: 1fr auto; }
		.trend__readout > span:last-child { grid-column: 2; }
		svg { height: 5.4rem; }
	}
</style>
