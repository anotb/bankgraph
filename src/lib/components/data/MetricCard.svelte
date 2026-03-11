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

<div class="group rounded border border-[--border] bg-[--surface-1] px-3 py-3 transition-colors hover:border-[--accent]/30">
	<p class="text-[11px] font-medium text-[--text-tertiary] uppercase tracking-wider">{label}</p>
	<div class="mt-0.5 flex items-baseline gap-1.5">
		<p class="text-xl font-semibold text-[--text-primary] tabular-nums">{value}</p>
		{#if trendFormatted}
			<span class="inline-flex items-center gap-0.5 text-xs font-medium tabular-nums
				{trendDirection === 'positive' ? 'text-[--positive]' : trendDirection === 'negative' ? 'text-[--negative]' : 'text-[--neutral]'}">
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
