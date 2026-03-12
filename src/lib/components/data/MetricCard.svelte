<script lang="ts">
	import Skeleton from './Skeleton.svelte';

	let {
		label,
		value,
		sublabel,
		trend,
		trendLabel,
		compact = false,
		borderless = false,
		semantic,
		loading = false
	}: {
		label: string;
		value: string;
		sublabel?: string;
		trend?: number | null;
		trendLabel?: string;
		compact?: boolean;
		borderless?: boolean;
		semantic?: 'positive' | 'negative' | 'warning' | 'neutral';
		loading?: boolean;
	} = $props();

	let trendDirection = $derived(
		trend == null ? 'neutral' : trend > 0 ? 'positive' : trend < 0 ? 'negative' : 'neutral'
	);

	let trendFormatted = $derived(
		trend != null ? (trend > 0 ? `+${trend.toFixed(2)}%` : `${trend.toFixed(2)}%`) : null
	);

	let valueColor = $derived(
		semantic === 'positive' ? 'text-[--positive]'
		: semantic === 'negative' ? 'text-[--negative]'
		: semantic === 'warning' ? 'text-[--warning]'
		: 'text-[--text-primary]'
	);

	let semanticBarColor = $derived(
		semantic === 'positive' ? 'bg-[--positive]'
		: semantic === 'negative' ? 'bg-[--negative]'
		: semantic === 'warning' ? 'bg-[--warning]'
		: 'bg-[--accent]'
	);
</script>

{#if compact}
<div class="bg-[--surface-1] px-2.5 py-2">
	<p class="text-[11px] font-medium text-[--text-tertiary] uppercase tracking-wider">{label}</p>
	{#if loading}
		<div class="mt-0.5">
			<Skeleton width="80px" height="20px" />
		</div>
		{#if sublabel}
			<div class="mt-0.5">
				<Skeleton width="60px" height="10px" />
			</div>
		{/if}
	{:else}
		<div class="mt-0.5 flex items-baseline gap-1.5">
			<p class="text-[20px] font-semibold tracking-tight {valueColor} data-mono">{value}</p>
			{#if trendFormatted}
				<span class="inline-flex items-center gap-0.5 text-xs font-medium data-mono rounded-sm px-1 py-0.5
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
			<p class="mt-0.5 text-[10px] text-[--text-tertiary]">{sublabel}</p>
		{/if}
	{/if}
</div>
{:else}
<div class="group relative overflow-hidden rounded-md {borderless ? 'borderless-card' : 'border border-[--border-muted] bg-[--surface-1] card-shadow'} px-3 py-3 hover:-translate-y-px">
	{#if semantic}
		<div class="absolute top-0 left-0 bottom-0 w-[3px] {semanticBarColor} rounded-l-md"></div>
	{:else}
		<div class="absolute top-0 left-0 right-0 h-[2px] bg-[--accent] rounded-t-md opacity-0 group-hover:opacity-100 transition-opacity duration-150"></div>
	{/if}
	<p class="text-[11px] font-medium text-[--text-tertiary] uppercase tracking-wider {semantic ? 'ml-1' : ''}">{label}</p>
	{#if loading}
		<div class="mt-0.5 {semantic ? 'ml-1' : ''}">
			<Skeleton width="100px" height="22px" />
		</div>
		{#if sublabel}
			<div class="mt-0.5 {semantic ? 'ml-1' : ''}">
				<Skeleton width="70px" height="11px" />
			</div>
		{/if}
	{:else}
		<div class="mt-0.5 flex items-baseline gap-1.5 {semantic ? 'ml-1' : ''}">
			<p class="text-[22px] font-semibold tracking-tight {valueColor} data-mono">{value}</p>
			{#if trendFormatted}
				<span class="inline-flex items-center gap-0.5 text-xs font-medium data-mono rounded-sm px-1 py-0.5
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
			<p class="mt-0.5 text-[11px] text-[--text-tertiary] {semantic ? 'ml-1' : ''}">{sublabel}</p>
		{/if}
		{#if trendLabel}
			<div class="mt-1 max-h-0 overflow-hidden opacity-0 transition-all duration-200
						group-hover:max-h-8 group-hover:opacity-100 {semantic ? 'ml-1' : ''}">
				<p class="text-[11px] text-[--text-tertiary]">{trendLabel}</p>
			</div>
		{/if}
	{/if}
</div>
{/if}
