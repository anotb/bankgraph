<script lang="ts">
	import Skeleton from './Skeleton.svelte';
	import { formatMetricTrend, type MetricTrendUnit } from './metric-trend';

	let {
		label,
		value,
		sublabel,
		trend,
		trendUnit = 'percent',
		trendLabel,
		invertTrend = false,
		compact = false,
		borderless = false,
		variant = 'default',
		semantic,
		loading = false,
		href
	}: {
		label: string;
		value: string;
		sublabel?: string;
		trend?: number | null;
		trendUnit?: MetricTrendUnit;
		trendLabel?: string;
		/** When true, a positive trend is bad (e.g. a rising noncurrent loan ratio) */
		invertTrend?: boolean;
		compact?: boolean;
		borderless?: boolean;
		variant?: 'default' | 'dense';
		semantic?: 'positive' | 'negative' | 'warning' | 'neutral';
		loading?: boolean;
		/** Optional link target. When set, the card becomes a clickable link with hover lift. */
		href?: string;
	} = $props();

	let isDense = $derived(variant === 'dense');

	let trendDirection = $derived(
		trend == null ? 'neutral'
		: trend > 0 ? (invertTrend ? 'negative' : 'positive')
		: trend < 0 ? (invertTrend ? 'positive' : 'negative')
		: 'neutral'
	);

	let formattedTrend = $derived(trend != null ? formatMetricTrend(trend, trendUnit) : null);

	let trendAriaLabel = $derived(
		formattedTrend?.aria
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

{#snippet trendBadge()}
	{#if formattedTrend}
		<span aria-label={trendAriaLabel} class="inline-flex items-center gap-0.5 {isDense ? 'text-[10px]' : 'text-xs'} font-medium data-mono rounded-sm px-1 py-0.5
			{trendDirection === 'positive' ? 'text-[--positive] bg-[--positive-muted]' : trendDirection === 'negative' ? 'text-[--negative] bg-[--negative-muted]' : 'text-[--neutral] bg-[--surface-2]'}">
			{#if trendDirection === 'positive'}
				<svg class="w-3 h-3" viewBox="0 0 12 12" fill="currentColor" aria-hidden="true">
					<path d="M6 2L10 7H2L6 2Z"/>
				</svg>
			{:else if trendDirection === 'negative'}
				<svg class="w-3 h-3" viewBox="0 0 12 12" fill="currentColor" aria-hidden="true">
					<path d="M6 10L2 5H10L6 10Z"/>
				</svg>
			{:else}
				<svg class="w-3 h-3" viewBox="0 0 12 12" fill="currentColor" aria-hidden="true">
					<rect x="2" y="5" width="8" height="2" rx="0.5"/>
				</svg>
			{/if}
			{formattedTrend.visual}
		</span>
	{/if}
{/snippet}

{#snippet cardContent(ml: string)}
	<p class="{isDense ? 'text-[10px]' : 'text-[11px]'} font-medium text-[--text-tertiary] uppercase tracking-wider {ml}">{label}</p>
	{#if loading}
		<div class="mt-0.5 {ml}">
			<Skeleton width="100px" height={isDense ? "18px" : "22px"} />
		</div>
		{#if sublabel}
			<div class="mt-0.5 {ml}">
				<Skeleton width="70px" height="11px" />
			</div>
		{/if}
	{:else}
		<div class="mt-0.5 flex items-baseline gap-1.5 {ml}">
			<p class="{isDense ? 'text-[18px]' : 'text-[22px]'} font-semibold tracking-tight {valueColor} data-mono">{value}</p>
			{@render trendBadge()}
		</div>
		{#if sublabel}
			<p class="mt-0.5 {isDense ? 'text-[9px]' : 'text-[11px]'} text-[--text-tertiary] {ml}">{sublabel}</p>
		{/if}
		{#if trendLabel && !isDense}
			<div class="mt-1 max-h-0 overflow-hidden opacity-0 transition-all duration-200
						group-hover:max-h-8 group-hover:opacity-100 {ml}">
				<p class="text-[11px] text-[--text-tertiary]">{trendLabel}</p>
			</div>
		{/if}
	{/if}
{/snippet}

{#if compact}
<div class="relative bg-[--surface-1] {semantic ? 'pl-3.5' : 'px-2.5'} pr-2.5 {isDense ? 'py-1.5' : 'py-2'}">
	{#if semantic}
		<div class="absolute top-0 left-0 bottom-0 w-[2px] {semanticBarColor}"></div>
	{/if}
	<p class="{isDense ? 'text-[10px]' : 'text-[11px]'} font-medium text-[--text-tertiary] uppercase tracking-wider">{label}</p>
	{#if loading}
		<div class="mt-0.5">
			<Skeleton width="80px" height={isDense ? "16px" : "20px"} />
		</div>
		{#if sublabel}
			<div class="mt-0.5">
				<Skeleton width="60px" height="10px" />
			</div>
		{/if}
	{:else}
		<div class="mt-0.5 flex items-baseline gap-1.5">
			<p class="{isDense ? 'text-[18px]' : 'text-[20px]'} font-semibold tracking-tight {valueColor} data-mono">{value}</p>
			{@render trendBadge()}
		</div>
		{#if sublabel}
			<p class="mt-0.5 text-[10px] text-[--text-tertiary]">{sublabel}</p>
		{/if}
	{/if}
</div>
{:else if href}
<a href={href} class="block no-underline [color:inherit] group relative overflow-hidden {isDense ? 'rounded-none bg-[--surface-1]' : 'rounded-md'} {isDense ? '' : borderless ? 'borderless-card' : 'border border-[--border-muted] bg-[--surface-1] card-shadow'} {isDense ? 'px-2.5 py-1.5' : 'px-3 py-3'} {isDense ? '' : 'hover:-translate-y-px transition-transform duration-150'}">
	{#if semantic}
		<div class="absolute top-0 left-0 bottom-0 w-[2px] {semanticBarColor} {isDense ? '' : 'rounded-l-md'}"></div>
	{:else if !isDense}
		<div class="absolute top-0 left-0 right-0 h-[2px] bg-[--accent] rounded-t-md opacity-0 group-hover:opacity-100 transition-opacity duration-150"></div>
	{/if}
	{@render cardContent(semantic ? 'ml-1' : '')}
</a>
{:else}
<div class="group relative overflow-hidden {isDense ? 'rounded-none bg-[--surface-1]' : 'rounded-md'} {isDense ? '' : borderless ? 'borderless-card' : 'border border-[--border-muted] bg-[--surface-1] card-shadow'} {isDense ? 'px-2.5 py-1.5' : 'px-3 py-3'}">
	{#if semantic}
		<div class="absolute top-0 left-0 bottom-0 w-[2px] {semanticBarColor} {isDense ? '' : 'rounded-l-md'}"></div>
	{:else if !isDense}
		<div class="absolute top-0 left-0 right-0 h-[2px] bg-[--accent] rounded-t-md opacity-0 group-hover:opacity-100 transition-opacity duration-150"></div>
	{/if}
	{@render cardContent(semantic ? 'ml-1' : '')}
</div>
{/if}
