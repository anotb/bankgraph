<script lang="ts">
	type Tone = 'accent' | 'positive' | 'negative' | 'warning' | 'neutral';

	let {
		label,
		value,
		sublabel,
		footer,
		href,
		tone = 'accent',
		icon
	}: {
		label: string;
		value: string;
		sublabel?: string;
		footer?: string;
		href?: string;
		tone?: Tone;
		icon?: 'anomaly' | 'failure' | 'mover' | 'macro' | 'state';
	} = $props();

	const toneColor: Record<Tone, string> = {
		accent: 'var(--accent)',
		positive: 'var(--positive)',
		negative: 'var(--negative)',
		warning: 'var(--warning)',
		neutral: 'var(--text-tertiary)'
	};
</script>

{#snippet inner()}
	<div class="pulse-card__top">
		<span class="pulse-card__label">
			{#if icon === 'anomaly'}
				<svg class="pulse-card__icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M8 1.5L1 14h14L8 1.5zM8 6v3M8 11.5h.01"/></svg>
			{:else if icon === 'failure'}
				<svg class="pulse-card__icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M3 13V5l5-3 5 3v8M3 13h10M6 13V9h4v4"/></svg>
			{:else if icon === 'mover'}
				<svg class="pulse-card__icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M2 11l4-4 3 3 5-5M9 3h4v4"/></svg>
			{:else if icon === 'macro'}
				<svg class="pulse-card__icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M8 1.5a6.5 6.5 0 100 13 6.5 6.5 0 000-13zM1.5 8h13M8 1.5a10 10 0 010 13M8 1.5a10 10 0 000 13"/></svg>
			{:else if icon === 'state'}
				<svg class="pulse-card__icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M8 1.5L14 4v9l-6 1.5L2 13V4l6-2.5zM8 1.5V14"/></svg>
			{/if}
			{label}
		</span>
		{#if href}
			<svg class="pulse-card__chevron" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.75" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M6 3l5 5-5 5"/></svg>
		{/if}
	</div>
	<p class="pulse-card__value data-mono">{value}</p>
	{#if sublabel}
		<p class="pulse-card__sublabel">{sublabel}</p>
	{/if}
	{#if footer}
		<p class="pulse-card__footer">{footer}</p>
	{/if}
{/snippet}

{#if href}
	<a {href} class="pulse-card pulse-card--link" style:--tone={toneColor[tone]}>
		{@render inner()}
	</a>
{:else}
	<div class="pulse-card" style:--tone={toneColor[tone]}>
		{@render inner()}
	</div>
{/if}

<style>
	.pulse-card {
		display: block;
		position: relative;
		padding: 0.75rem 0.875rem 0.875rem;
		background-color: var(--surface-1);
		border: 1px solid var(--border-muted);
		border-radius: 6px;
		box-shadow: var(--shadow-xs);
		color: inherit;
		text-decoration: none;
		min-width: 0;
		overflow: hidden;
		transition: transform 0.15s ease, box-shadow 0.15s ease, border-color 0.15s ease;
	}
	.pulse-card::before {
		content: '';
		position: absolute;
		top: 0;
		left: 0;
		right: 0;
		height: 2px;
		background-color: var(--tone);
		opacity: 0.65;
	}
	.pulse-card--link:hover {
		border-color: color-mix(in srgb, var(--tone) 40%, var(--border));
		box-shadow: var(--shadow-sm);
		transform: translateY(-1px);
	}
	.pulse-card--link:hover::before { opacity: 1; }
	.pulse-card--link:hover .pulse-card__chevron { transform: translateX(2px); color: var(--tone); }

	.pulse-card__top {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 0.5rem;
	}
	.pulse-card__label {
		display: inline-flex;
		align-items: center;
		gap: 0.375rem;
		font-size: 10px;
		font-weight: 600;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--tone);
	}
	.pulse-card__icon { width: 12px; height: 12px; flex-shrink: 0; }
	.pulse-card__chevron {
		width: 12px;
		height: 12px;
		color: var(--text-disabled);
		transition: transform 0.15s ease, color 0.15s ease;
	}
	.pulse-card__value {
		margin-top: 0.5rem;
		font-size: 22px;
		font-weight: 600;
		letter-spacing: -0.02em;
		color: var(--text-primary);
		line-height: 1.1;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.pulse-card__sublabel {
		margin-top: 0.125rem;
		font-size: 12px;
		color: var(--text-secondary);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.pulse-card__footer {
		margin-top: 0.5rem;
		padding-top: 0.5rem;
		border-top: 1px dashed var(--border-muted);
		font-size: 11px;
		color: var(--text-tertiary);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
</style>
