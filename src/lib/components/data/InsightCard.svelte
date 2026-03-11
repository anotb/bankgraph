<script lang="ts">
	let {
		title,
		description,
		correlation,
		metric
	}: {
		title: string;
		description: string;
		correlation?: number | null;
		metric?: string;
	} = $props();

	let corrColor = $derived.by(() => {
		if (correlation == null) return 'text-[--text-tertiary]';
		const abs = Math.abs(correlation);
		if (abs >= 0.7) return correlation > 0 ? 'text-[--positive]' : 'text-[--negative]';
		if (abs >= 0.4) return correlation > 0 ? 'text-[--accent]' : 'text-[--warning]';
		return 'text-[--text-tertiary]';
	});

	let corrBg = $derived.by(() => {
		if (correlation == null) return 'bg-[--surface-2]';
		const abs = Math.abs(correlation);
		if (abs >= 0.7) return correlation > 0 ? 'bg-[--positive-muted]' : 'bg-[--negative-muted]';
		if (abs >= 0.4) return correlation > 0 ? 'bg-[--accent-muted]' : 'bg-[--warning-muted]';
		return 'bg-[--surface-2]';
	});

	let strengthLabel = $derived.by(() => {
		if (correlation == null) return '';
		const abs = Math.abs(correlation);
		if (abs >= 0.7) return 'Strong';
		if (abs >= 0.4) return 'Moderate';
		return 'Weak';
	});
</script>

<div class="rounded border border-[--border] bg-[--surface-1] p-3 transition-colors hover:border-[--accent]/30">
	<div class="flex items-start justify-between gap-2">
		<div class="min-w-0 flex-1">
			<p class="text-[13px] font-semibold text-[--text-primary] leading-tight">{title}</p>
			{#if metric}
				<p class="text-[11px] text-[--text-tertiary] mt-0.5 font-medium uppercase tracking-wider">{metric}</p>
			{/if}
		</div>
		{#if correlation != null}
			<div class="flex flex-col items-end shrink-0">
				<span class="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[13px] font-semibold tabular-nums {corrColor} {corrBg}">
					{correlation > 0 ? '+' : ''}{correlation.toFixed(2)}
				</span>
				<span class="text-[10px] text-[--text-tertiary] mt-0.5">{strengthLabel}</span>
			</div>
		{/if}
	</div>
	<p class="text-[12px] text-[--text-secondary] mt-1.5 leading-relaxed">{description}</p>
</div>
