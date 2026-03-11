<script lang="ts">
	let {
		score,
		label,
		size = 'sm'
	}: {
		score: number;
		label: string;
		size?: 'sm' | 'lg';
	} = $props();

	let clampedScore = $derived(Math.max(0, Math.min(100, score)));
	let pct = $derived(`${clampedScore}%`);

	let color = $derived(
		clampedScore < 30
			? 'var(--negative)'
			: clampedScore < 60
				? 'var(--warning)'
				: 'var(--positive)'
	);

	let bgColor = $derived(
		clampedScore < 30
			? 'var(--negative-muted)'
			: clampedScore < 60
				? 'var(--warning-muted)'
				: 'var(--positive-muted)'
	);
</script>

{#if size === 'lg'}
	<div class="score-gauge-lg">
		<div class="flex items-center justify-between mb-1">
			<span class="text-[13px] font-medium text-[--text-primary]">{label}</span>
		</div>
		<div class="bar-track-lg" style="background-color: {bgColor}">
			<div
				class="bar-fill-lg"
				style="width: {pct}; background-color: {color}"
			>
				<span class="score-overlay">{clampedScore.toFixed(0)}</span>
			</div>
		</div>
	</div>
{:else}
	<div class="score-gauge-sm">
		<div class="flex items-center gap-2">
			<span class="text-[13px] text-[--text-tertiary] min-w-[100px]">{label}</span>
			<div class="bar-track-sm" style="background-color: {bgColor}">
				<div
					class="bar-fill-sm"
					style="width: {pct}; background-color: {color}"
				></div>
			</div>
			<span
				class="text-[13px] font-semibold tabular-nums min-w-[28px] text-right"
				style="color: {color}"
			>
				{clampedScore.toFixed(0)}
			</span>
		</div>
	</div>
{/if}

<style>
	.bar-track-lg {
		position: relative;
		height: 28px;
		border-radius: 6px;
		overflow: hidden;
	}

	.bar-fill-lg {
		height: 100%;
		border-radius: 6px;
		display: flex;
		align-items: center;
		justify-content: center;
		min-width: 40px;
		transition: width 0.4s ease;
	}

	.score-overlay {
		font-size: 14px;
		font-weight: 700;
		color: white;
		text-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
		font-variant-numeric: tabular-nums;
	}

	.bar-track-sm {
		flex: 1;
		height: 8px;
		border-radius: 4px;
		overflow: hidden;
	}

	.bar-fill-sm {
		height: 100%;
		border-radius: 4px;
		transition: width 0.4s ease;
	}
</style>
