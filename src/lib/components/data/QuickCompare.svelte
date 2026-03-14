<script lang="ts">
	import { formatPercent } from '$lib/utils/formatters.js';

	interface CompareMetric {
		label: string;
		metric: string;
		value: number | null;
		peerMedian: number | null;
		percentile: number | null;
		format: 'percent' | 'currency';
	}

	let { metrics }: { metrics: CompareMetric[] } = $props();

	/** Metrics where lower values are better */
	const LOWER_IS_BETTER = new Set(['nclnlsr', 'eeffr']);

	function formatValue(val: number | null, fmt: 'percent' | 'currency'): string {
		if (val === null || val === undefined) return '\u2014';
		if (fmt === 'percent') return formatPercent(val);
		return val.toFixed(2);
	}

	function percentileColor(metric: string, pctile: number | null): string {
		if (pctile === null) return 'text-[--text-tertiary]';
		const invert = LOWER_IS_BETTER.has(metric);
		const good = invert ? pctile <= 40 : pctile >= 60;
		const bad = invert ? pctile >= 75 : pctile <= 25;
		if (good) return 'text-[--positive]';
		if (bad) return 'text-[--negative]';
		return 'text-[--warning]';
	}

	function percentileBadgeClass(metric: string, pctile: number | null): string {
		if (pctile === null) return 'bg-[--surface-2] text-[--text-tertiary]';
		const invert = LOWER_IS_BETTER.has(metric);
		const good = invert ? pctile <= 40 : pctile >= 60;
		const bad = invert ? pctile >= 75 : pctile <= 25;
		if (good) return 'bg-[--positive-muted] text-[--positive]';
		if (bad) return 'bg-[--negative-muted] text-[--negative]';
		return 'bg-[--warning-muted] text-[--warning]';
	}

	/** Map percentile (0-100) to a hue for the gradient marker (red=0, yellow=50, green=120) */
	function markerPosition(pctile: number | null): number {
		if (pctile === null) return 50;
		return Math.max(0, Math.min(100, pctile));
	}
</script>

<div class="space-y-0 divide-y divide-[--surface-2] rounded-md bg-[--surface-1] overflow-hidden" style="box-shadow: var(--shadow-sm)">
	{#each metrics as m (m.metric)}
		<div class="px-3 py-2.5">
			<!-- Label row -->
			<div class="flex items-center justify-between mb-1.5">
				<span class="text-[12px] font-medium text-[--text-tertiary]">{m.label}</span>
				{#if m.percentile !== null}
					<span class="text-[11px] font-medium data-mono px-1.5 py-0.5 rounded-sm {percentileBadgeClass(m.metric, m.percentile)}">
						P{m.percentile.toFixed(0)}
					</span>
				{/if}
			</div>

			<!-- Values row -->
			<div class="flex items-baseline gap-4 mb-1.5 text-[12px]">
				<span class="text-[--text-tertiary]">
					Bank: <span class="font-medium text-[--text-primary] data-mono">{formatValue(m.value, m.format)}</span>
				</span>
				<span class="text-[--text-tertiary]">
					Median: <span class="font-medium text-[--text-secondary] data-mono">{formatValue(m.peerMedian, m.format)}</span>
				</span>
			</div>

			<!-- Comparison bar -->
			{#if m.percentile !== null}
				<div
					class="relative h-[6px] rounded-full overflow-hidden bg-[--surface-3]"
					role="img"
					aria-label="{m.label}: {m.percentile !== null ? `${m.percentile.toFixed(0)}th` : 'unknown'} percentile among peers"
				>
					<!-- Gradient bar: red to yellow to green -->
					<div
						class="absolute inset-0 rounded-full"
						style="background: linear-gradient(to right, var(--negative), var(--warning) 50%, var(--positive));"
					></div>
					<!-- Bank position marker -->
					<div
						class="absolute top-[-2px] w-[10px] h-[10px] rounded-full bg-[--text-primary] border-2 border-[--surface-1]"
						style="left: calc({markerPosition(m.percentile)}% - 5px);"
					></div>
				</div>
			{:else}
				<div class="h-[6px] rounded-full bg-[--surface-3]"></div>
			{/if}
		</div>
	{:else}
		<div class="px-3 py-6 text-center">
			<p class="text-[13px] text-[--text-tertiary]">No peer data available</p>
		</div>
	{/each}
</div>
