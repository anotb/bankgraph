<script lang="ts">
	import { formatPercent } from '$lib/utils/formatters.js';

	let {
		metric,
		bankValue,
		p10,
		p25,
		median,
		p75,
		p90,
		percentile,
		format = 'percent',
		higherIsBetter = true
	}: {
		metric: string;
		bankValue: number | null;
		p10: number | null;
		p25: number | null;
		median: number | null;
		p75: number | null;
		p90: number | null;
		percentile: number | null;
		format?: 'percent' | 'currency' | 'number';
		higherIsBetter?: boolean;
	} = $props();

	// SVG layout constants
	const W = 400;
	const H = 56;
	const barY = 24;
	const barH = 14;
	const padL = 40;
	const padR = 40;
	const barW = W - padL - padR;

	function fmt(v: number | null): string {
		if (v === null) return '\u2014';
		if (format === 'percent') return formatPercent(v);
		if (format === 'number') return v.toFixed(2);
		return String(v);
	}

	// Map a value to x position within the bar
	function valToX(v: number): number {
		if (p10 === null || p90 === null || p90 === p10) return padL + barW / 2;
		const t = Math.max(0, Math.min(1, (v - p10) / (p90 - p10)));
		return padL + t * barW;
	}

	let x25 = $derived(p25 !== null ? valToX(p25) : padL);
	let x75 = $derived(p75 !== null ? valToX(p75) : padL + barW);
	let xMedian = $derived(median !== null ? valToX(median) : padL + barW / 2);
	let xBank = $derived(bankValue !== null ? valToX(bankValue) : null);

	// Color based on percentile position and higherIsBetter
	let markerColor = $derived.by(() => {
		if (percentile === null) return 'var(--neutral)';
		if (higherIsBetter) {
			if (percentile >= 60) return 'var(--positive)';
			if (percentile <= 25) return 'var(--negative)';
			return 'var(--warning)';
		} else {
			// For metrics where lower is better (efficiency ratio, NPL)
			if (percentile <= 40) return 'var(--positive)';
			if (percentile >= 75) return 'var(--negative)';
			return 'var(--warning)';
		}
	});

	let hasData = $derived(p10 !== null && p90 !== null);
</script>

{#if hasData}
	<svg viewBox="0 {0} {W} {H}" class="w-full h-auto" role="img" aria-label="{metric} percentile gauge">
		<!-- Full range bar (p10 to p90) -->
		<rect
			x={padL}
			y={barY}
			width={barW}
			height={barH}
			rx="3"
			fill="var(--surface-3)"
		/>

		<!-- IQR band (p25 to p75) -->
		<rect
			x={x25}
			y={barY}
			width={Math.max(0, x75 - x25)}
			height={barH}
			fill="var(--border)"
		/>

		<!-- Median line -->
		<line
			x1={xMedian}
			y1={barY - 2}
			x2={xMedian}
			y2={barY + barH + 2}
			stroke="var(--text-tertiary)"
			stroke-width="2"
			stroke-dasharray="2,2"
		/>

		<!-- Bank marker (diamond) -->
		{#if xBank !== null}
			<g transform="translate({xBank},{barY + barH / 2})">
				<polygon
					points="0,-8 6,0 0,8 -6,0"
					fill={markerColor}
					stroke="var(--surface-1)"
					stroke-width="1.5"
				/>
			</g>
			<!-- Bank value label above marker -->
			<text
				x={xBank}
				y={barY - 8}
				text-anchor="middle"
				fill={markerColor}
				font-size="11"
				font-weight="600"
				class="data-mono"
			>
				{fmt(bankValue)}
			</text>
		{/if}

		<!-- p10 label -->
		<text
			x={padL}
			y={barY + barH + 14}
			text-anchor="middle"
			fill="var(--text-disabled)"
			font-size="9"
			class="data-mono"
		>
			{fmt(p10)}
		</text>

		<!-- Median label -->
		<text
			x={xMedian}
			y={barY + barH + 14}
			text-anchor="middle"
			fill="var(--text-tertiary)"
			font-size="9"
			class="data-mono"
		>
			{fmt(median)}
		</text>

		<!-- p90 label -->
		<text
			x={padL + barW}
			y={barY + barH + 14}
			text-anchor="middle"
			fill="var(--text-disabled)"
			font-size="9"
			class="data-mono"
		>
			{fmt(p90)}
		</text>
	</svg>
{:else}
	<div class="h-14 flex items-center justify-center text-[11px] text-[--text-disabled]">
		No peer data
	</div>
{/if}
