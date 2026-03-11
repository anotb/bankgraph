<script lang="ts">
	import ScoreGauge from '$lib/components/charts/ScoreGauge.svelte';
	import AnomalyBadge from '$lib/components/data/AnomalyBadge.svelte';
	import Disclaimer from '$lib/components/data/Disclaimer.svelte';
	import { formatDate, formatPercent } from '$lib/utils/formatters.js';
	import { getMode } from '$lib/stores/mode.svelte.js';
	import type { Anomaly } from '$lib/types';

	let { data } = $props();
	let risk = $derived(data.risk);
	let anomalies = $derived(data.anomalies);
	let mode = $derived(getMode());

	let pcaLabel = $derived.by(() => {
		if (!risk?.pca_category) return null;
		const labels: Record<string, string> = {
			well_capitalized: 'Well Capitalized',
			adequately_capitalized: 'Adequately Capitalized',
			undercapitalized: 'Undercapitalized',
			significantly_undercapitalized: 'Significantly Undercapitalized',
			critically_undercapitalized: 'Critically Undercapitalized'
		};
		return labels[risk.pca_category] ?? risk.pca_category;
	});

	let pcaColorClass = $derived.by(() => {
		if (!risk?.pca_category) return '';
		if (risk.pca_category === 'well_capitalized')
			return 'bg-[--positive-muted] text-[--positive]';
		if (risk.pca_category === 'adequately_capitalized')
			return 'bg-[--warning-muted] text-[--warning]';
		return 'bg-[--negative-muted] text-[--negative]';
	});

	function severityOrder(s: string): number {
		if (s === 'critical') return 0;
		if (s === 'warning') return 1;
		return 2;
	}

	let sortedAnomalies = $derived.by((): Anomaly[] => {
		if (!anomalies?.anomalies) return [];
		return [...anomalies.anomalies].sort(
			(a, b) => severityOrder(a.severity) - severityOrder(b.severity)
		);
	});

	function severityBadgeClass(severity: string): string {
		if (severity === 'critical') return 'bg-[--negative-muted] text-[--negative]';
		if (severity === 'warning') return 'bg-[--warning-muted] text-[--warning]';
		return 'bg-[--accent-muted] text-[--accent-text]';
	}

	function formatValue(v: number | null): string {
		if (v === null) return '\u2014';
		if (Math.abs(v) < 1) return formatPercent(v);
		return v.toLocaleString('en-US', { maximumFractionDigits: 2 });
	}
</script>

<div class="space-y-5 pt-3">
	{#if !risk}
		<div class="rounded border border-[--border] bg-[--surface-1] py-24 text-center">
			<p class="text-[--text-tertiary] text-[15px]">No risk analysis data available</p>
			<p class="text-[--text-disabled] text-[13px] mt-1">This bank may not have financials for the latest quarter.</p>
		</div>
	{:else}
		<!-- Financial Health Summary -->
		<section>
			<div class="flex items-center gap-2 mb-3">
				<div class="w-0.5 h-4 bg-[--accent] rounded-full"></div>
				<h2 class="text-[15px] font-semibold text-[--text-primary]">Financial Health Summary</h2>
				<span class="text-[11px] text-[--text-tertiary] ml-1">as of {formatDate(risk.repdte)}</span>
			</div>

			<div class="rounded border border-[--border] bg-[--surface-1] p-3 space-y-4">
				<!-- Composite score + PCA badge -->
				<div class="flex items-center gap-4 flex-wrap">
					<div class="flex-1 min-w-[200px]">
						{#if risk.scores.composite !== null}
							<ScoreGauge score={risk.scores.composite} label="Composite Score" size="lg" />
						{:else}
							<p class="text-[13px] text-[--text-disabled]">Composite score unavailable</p>
						{/if}
					</div>
					{#if pcaLabel}
						<div class="flex flex-col items-end gap-1">
							<span class="text-[11px] text-[--text-tertiary] uppercase tracking-wider">PCA Status</span>
							<span class="inline-flex items-center rounded-sm px-2 py-1 text-[12px] font-semibold tracking-wide {pcaColorClass}">
								{pcaLabel}
							</span>
						</div>
					{/if}
				</div>

				<!-- Component scores (power mode only) -->
				{#if mode === 'power'}
					<div class="border-t border-[--border-muted] pt-3 space-y-2">
						<p class="text-[11px] font-medium text-[--text-tertiary] uppercase tracking-wider mb-2">Component Scores</p>
						{#if risk.scores.capital !== null}
							<ScoreGauge score={risk.scores.capital} label="Capital" size="sm" />
						{/if}
						{#if risk.scores.asset_quality !== null}
							<ScoreGauge score={risk.scores.asset_quality} label="Asset Quality" size="sm" />
						{/if}
						{#if risk.scores.earnings !== null}
							<ScoreGauge score={risk.scores.earnings} label="Earnings" size="sm" />
						{/if}
						{#if risk.scores.liquidity !== null}
							<ScoreGauge score={risk.scores.liquidity} label="Liquidity" size="sm" />
						{/if}
					</div>
				{/if}
			</div>
		</section>

		<!-- Anomaly List (power mode only) -->
		{#if mode === 'power'}
			<section>
				<div class="flex items-center gap-2 mb-3">
					<div class="w-0.5 h-4 bg-[--accent] rounded-full"></div>
					<h2 class="text-[15px] font-semibold text-[--text-primary]">Detected Anomalies</h2>
					{#if anomalies?.counts}
						<AnomalyBadge
							critical={anomalies.counts.critical}
							warning={anomalies.counts.warning}
							info={anomalies.counts.info}
						/>
					{/if}
				</div>

				{#if sortedAnomalies.length === 0}
					<div class="rounded border border-[--border] bg-[--surface-1] py-12 text-center">
						<p class="text-[--text-tertiary] text-[13px]">No anomalies detected for this quarter</p>
					</div>
				{:else}
					<div class="rounded border border-[--border] bg-[--surface-1] overflow-x-auto">
						<table class="w-full text-[13px]">
							<thead>
								<tr class="border-b border-[--border]">
									<th class="text-left px-3 py-2 text-[11px] font-medium text-[--text-tertiary] uppercase tracking-wider">Severity</th>
									<th class="text-left px-3 py-2 text-[11px] font-medium text-[--text-tertiary] uppercase tracking-wider">Metric</th>
									<th class="text-left px-3 py-2 text-[11px] font-medium text-[--text-tertiary] uppercase tracking-wider">Type</th>
									<th class="text-right px-3 py-2 text-[11px] font-medium text-[--text-tertiary] uppercase tracking-wider">Value</th>
									<th class="text-right px-3 py-2 text-[11px] font-medium text-[--text-tertiary] uppercase tracking-wider">Reference</th>
									<th class="text-left px-3 py-2 text-[11px] font-medium text-[--text-tertiary] uppercase tracking-wider">Description</th>
								</tr>
							</thead>
							<tbody class="divide-y divide-[--border-muted]">
								{#each sortedAnomalies as anomaly}
									<tr class="hover:bg-[--surface-2] transition-colors">
										<td class="px-3 py-2">
											<span class="inline-flex items-center rounded-sm px-1.5 py-0.5 text-[11px] font-medium tracking-wide {severityBadgeClass(anomaly.severity)}">
												{anomaly.severity}
											</span>
										</td>
										<td class="px-3 py-2 font-medium text-[--text-primary]">{anomaly.metric}</td>
										<td class="px-3 py-2 text-[--text-secondary]">{anomaly.anomaly_type}</td>
										<td class="px-3 py-2 text-right tabular-nums text-[--text-primary]">{formatValue(anomaly.value)}</td>
										<td class="px-3 py-2 text-right tabular-nums text-[--text-secondary]">{formatValue(anomaly.reference_value)}</td>
										<td class="px-3 py-2 text-[--text-secondary] max-w-[300px] truncate">{anomaly.description ?? '\u2014'}</td>
									</tr>
								{/each}
							</tbody>
						</table>
					</div>
				{/if}
			</section>
		{/if}
	{/if}

	<Disclaimer />
</div>
