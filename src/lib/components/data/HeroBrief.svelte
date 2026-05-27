<script lang="ts">
	import Sparkline from './Sparkline.svelte';
	import { formatPercent } from '$lib/utils/formatters.js';

	let {
		quarter,
		headlineLabel = 'Median ROA',
		headlineValue,
		headlineDelta,
		sparkline = [],
		sentences = []
	}: {
		quarter: string | null;
		headlineLabel?: string;
		headlineValue: number | null;
		headlineDelta: number | null;
		sparkline?: (number | null)[];
		sentences?: string[];
	} = $props();

	let quarterDisplay = $derived.by(() => {
		if (!quarter || quarter.length < 6) return '';
		const y = quarter.slice(0, 4);
		const m = parseInt(quarter.slice(4, 6), 10);
		const q = Math.ceil(m / 3);
		return `Q${q} ${y}`;
	});

	let deltaText = $derived.by(() => {
		if (headlineDelta == null) return null;
		const sign = headlineDelta > 0 ? '+' : '';
		return `${sign}${headlineDelta.toFixed(2)}%`;
	});

	let deltaSemantic = $derived(
		headlineDelta == null ? 'neutral'
		: headlineDelta > 0 ? 'positive'
		: headlineDelta < 0 ? 'negative'
		: 'neutral'
	);
</script>

<section class="hero-brief">
	<div class="hero-brief__inner">
		<div class="hero-brief__eyebrow">
			<span class="hero-brief__pulse" aria-hidden="true"></span>
			<span>This quarter in banking</span>
			{#if quarterDisplay}
				<span class="hero-brief__quarter">{quarterDisplay}</span>
			{/if}
		</div>

		<div class="hero-brief__headline">
			<div class="hero-brief__metric">
				<p class="hero-brief__metric-label">{headlineLabel}</p>
				<div class="hero-brief__metric-row">
					<p class="hero-brief__value data-mono">{formatPercent(headlineValue)}</p>
					{#if deltaText}
						<span class="hero-brief__delta hero-brief__delta--{deltaSemantic} data-mono">
							{#if deltaSemantic === 'positive'}
								<svg viewBox="0 0 12 12" fill="currentColor" aria-hidden="true"><path d="M6 2L10 7H2L6 2Z"/></svg>
							{:else if deltaSemantic === 'negative'}
								<svg viewBox="0 0 12 12" fill="currentColor" aria-hidden="true"><path d="M6 10L2 5H10L6 10Z"/></svg>
							{/if}
							{deltaText} QoQ
						</span>
					{/if}
				</div>
				{#if sparkline.length >= 2}
					<div class="hero-brief__spark">
						<Sparkline data={sparkline} width={220} height={44} showDot={true} showFill={true} />
						<span class="hero-brief__spark-label">last {sparkline.filter(v => v != null).length} quarters</span>
					</div>
				{/if}
			</div>

			{#if sentences.length}
				<div class="hero-brief__narrative">
					{#each sentences as line, i}
						<p class:hero-brief__narrative-lead={i === 0}>{line}</p>
					{/each}
				</div>
			{/if}
		</div>
	</div>
</section>

<style>
	/* Flat surface tier + a single faint grid texture (no gradients, per the design system).
	   The accent lives in the top hairline and the data, not a wash. */
	.hero-brief {
		position: relative;
		margin: 0 calc(-1 * var(--page-pad, 1rem));
		padding: 0 var(--page-pad, 1rem);
		background-color: var(--surface-1);
		border-top: 2px solid var(--accent);
		border-bottom: 1px solid var(--border-muted);
		overflow: hidden;
	}
	.hero-brief::before {
		content: '';
		position: absolute;
		inset: 0;
		background-image:
			linear-gradient(to right, color-mix(in srgb, var(--border-muted) 55%, transparent) 1px, transparent 1px),
			linear-gradient(to bottom, color-mix(in srgb, var(--border-muted) 55%, transparent) 1px, transparent 1px);
		background-size: 48px 48px;
		mask-image: linear-gradient(to right, black, transparent 65%);
		opacity: 0.35;
		pointer-events: none;
	}
	.hero-brief__inner {
		position: relative;
		padding: 1.75rem 0 2rem;
		max-width: 1400px;
		margin: 0 auto;
	}
	.hero-brief__eyebrow {
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 11px;
		font-weight: 600;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--text-secondary);
		padding: 0.25rem 0.625rem;
		background-color: color-mix(in srgb, var(--surface-1) 80%, transparent);
		border: 1px solid var(--border-muted);
		border-radius: 999px;
	}
	.hero-brief__pulse {
		width: 6px;
		height: 6px;
		border-radius: 50%;
		background-color: var(--accent);
		box-shadow: 0 0 0 0 color-mix(in srgb, var(--accent) 60%, transparent);
		animation: heroPulse 2s ease-out infinite;
	}
	@keyframes heroPulse {
		0% { box-shadow: 0 0 0 0 color-mix(in srgb, var(--accent) 60%, transparent); }
		70% { box-shadow: 0 0 0 8px color-mix(in srgb, var(--accent) 0%, transparent); }
		100% { box-shadow: 0 0 0 0 color-mix(in srgb, var(--accent) 0%, transparent); }
	}
	.hero-brief__quarter {
		color: var(--accent-text);
		font-weight: 700;
	}
	.hero-brief__headline {
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		gap: 1.25rem;
		margin-top: 0.875rem;
	}
	@media (min-width: 768px) {
		.hero-brief__headline {
			grid-template-columns: minmax(280px, 360px) 1fr;
			gap: 2.5rem;
			align-items: end;
		}
	}
	.hero-brief__metric-label {
		font-size: 11px;
		font-weight: 600;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--text-tertiary);
	}
	.hero-brief__metric-row {
		display: flex;
		align-items: baseline;
		gap: 0.625rem;
		margin-top: 0.125rem;
		flex-wrap: wrap;
	}
	.hero-brief__value {
		font-size: clamp(2.5rem, 5vw, 3.5rem);
		font-weight: 600;
		letter-spacing: -0.025em;
		line-height: 1;
		color: var(--text-primary);
	}
	.hero-brief__delta {
		display: inline-flex;
		align-items: center;
		gap: 0.25rem;
		padding: 0.25rem 0.5rem;
		border-radius: 4px;
		font-size: 12px;
		font-weight: 600;
	}
	.hero-brief__delta svg { width: 11px; height: 11px; }
	.hero-brief__delta--positive { color: var(--positive); background-color: var(--positive-muted); }
	.hero-brief__delta--negative { color: var(--negative); background-color: var(--negative-muted); }
	.hero-brief__delta--neutral { color: var(--text-secondary); background-color: var(--surface-2); }
	.hero-brief__spark {
		display: flex;
		align-items: center;
		gap: 0.625rem;
		margin-top: 0.5rem;
	}
	.hero-brief__spark-label {
		font-size: 11px;
		color: var(--text-tertiary);
	}
	.hero-brief__narrative {
		font-size: 15px;
		line-height: 1.6;
		color: var(--text-secondary);
		max-width: 56ch;
	}
	.hero-brief__narrative p { margin: 0 0 0.25rem; }
	.hero-brief__narrative-lead {
		color: var(--text-primary);
		font-weight: 500;
		font-size: 16px;
	}
</style>
