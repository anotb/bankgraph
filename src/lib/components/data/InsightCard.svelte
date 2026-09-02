<script lang="ts">
	let {
		title,
		description,
		correlation,
		metric,
		lagQuarters,
		windowStart,
		windowEnd,
		observations,
		alignmentDirection
	}: {
		title: string;
		description: string;
		correlation?: number | null;
		metric?: string;
		lagQuarters?: number | null;
		windowStart?: string | null;
		windowEnd?: string | null;
		observations?: number | null;
		alignmentDirection?: string | null;
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

	let metaLine = $derived.by(() => {
		const parts: string[] = [];
		if (lagQuarters != null) {
			parts.push(lagQuarters === 0 ? 'same-quarter alignment' : `macro t vs bank t+${lagQuarters}Q`);
		}
		if (observations != null) parts.push(`n=${observations}`);
		if (windowStart && windowEnd) {
			parts.push(`${windowStart} to ${windowEnd}`);
		}
		if (alignmentDirection) parts.push(alignmentDirection.replaceAll('_', ' '));
		return parts.length > 0 ? parts.join(' · ') : null;
	});
</script>

<div class="rounded-md bg-[--surface-1] p-3 transition-shadow hover:shadow-md" style="box-shadow: var(--shadow-sm)">
	<div class="flex items-start justify-between gap-2">
		<div class="min-w-0 flex-1">
			<p class="text-[13px] font-semibold text-[--text-primary] leading-tight">{title}</p>
			{#if metric}
				<p class="text-[11px] text-[--text-tertiary] mt-0.5 font-medium uppercase tracking-wider">{metric}</p>
			{/if}
		</div>
		{#if correlation != null}
			<div class="flex flex-col items-end shrink-0">
				<span class="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[13px] font-semibold {corrColor} {corrBg}" data-mono>
					{correlation > 0 ? '+' : ''}{correlation.toFixed(2)}
				</span>
				<span class="text-[10px] text-[--text-tertiary] mt-0.5">{strengthLabel}</span>
			</div>
		{/if}
	</div>
	<p class="text-[12px] text-[--text-secondary] mt-1.5 leading-relaxed">{description}</p>

	<!-- Correlation bar visualization -->
	{#if correlation != null}
		{@const pct = Math.abs(correlation) * 50}
		{@const fillColor = correlation > 0 ? 'var(--positive)' : 'var(--negative)'}
		<div class="mt-2 relative h-[6px] rounded-full bg-[--surface-3] overflow-hidden" role="img" aria-label="Correlation: {correlation.toFixed(2)}">
			<!-- Center line (0 mark) -->
			<div class="absolute left-1/2 top-0 bottom-0 w-px bg-[--border]"></div>
			<!-- Fill from center -->
			<div
				class="absolute top-0 bottom-0 rounded-full"
				style="
					{correlation >= 0 ? 'left: 50%;' : `right: 50%;`}
					width: {pct}%;
					background-color: {fillColor};
					opacity: 0.6;
				"
			></div>
		</div>
	{/if}

	{#if metaLine}
		<p class="text-[10px] text-[--text-tertiary] mt-1">{metaLine}</p>
	{/if}
</div>
