<script lang="ts">
	let {
		label,
		value,
		sublabel,
		trend,
		trendLabel
	}: {
		label: string;
		value: string;
		sublabel?: string;
		trend?: number | null;
		trendLabel?: string;
	} = $props();

	let trendDirection = $derived(
		trend == null ? 'neutral' : trend > 0 ? 'positive' : trend < 0 ? 'negative' : 'neutral'
	);

	let trendFormatted = $derived(
		trend != null ? (trend > 0 ? `+${trend.toFixed(2)}%` : `${trend.toFixed(2)}%`) : null
	);
</script>

<div class="group relative overflow-hidden rounded-[5px] border border-[--border-muted] bg-[--surface-1] px-3 py-3 card-shadow hover:border-[--accent]/30 hover:-translate-y-px">
	<div class="absolute top-0 left-0 right-0 h-[2px] bg-[--accent] rounded-t-[5px] opacity-0 group-hover:opacity-100 transition-opacity duration-150"></div>
	<p class="text-[11px] font-medium text-[--text-tertiary] uppercase tracking-wider">{label}</p>
	<div class="mt-0.5 flex items-baseline gap-1.5">
		<p class="text-[22px] font-semibold tracking-tight text-[--text-primary] tabular-nums">{value}</p>
		{#if trendFormatted}
			<span class="inline-flex items-center gap-0.5 text-xs font-medium tabular-nums rounded-sm px-1 py-0.5
				{trendDirection === 'positive' ? 'text-[--positive] bg-[--positive-muted]' : trendDirection === 'negative' ? 'text-[--negative] bg-[--negative-muted]' : 'text-[--neutral] bg-[--surface-2]'}">
				{#if trendDirection === 'positive'}
					<svg class="w-3 h-3" viewBox="0 0 12 12" fill="currentColor">
						<path d="M6 2L10 7H2L6 2Z"/>
					</svg>
				{:else if trendDirection === 'negative'}
					<svg class="w-3 h-3" viewBox="0 0 12 12" fill="currentColor">
						<path d="M6 10L2 5H10L6 10Z"/>
					</svg>
				{:else}
					<svg class="w-3 h-3" viewBox="0 0 12 12" fill="currentColor">
						<rect x="2" y="5" width="8" height="2" rx="0.5"/>
					</svg>
				{/if}
				{trendFormatted}
			</span>
		{/if}
	</div>
	{#if sublabel}
		<p class="mt-0.5 text-[11px] text-[--text-tertiary]">{sublabel}</p>
	{/if}
	{#if trendLabel}
		<div class="mt-1 max-h-0 overflow-hidden opacity-0 transition-all duration-200
					group-hover:max-h-8 group-hover:opacity-100">
			<p class="text-[11px] text-[--text-tertiary]">{trendLabel}</p>
		</div>
	{/if}
</div>
