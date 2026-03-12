<script lang="ts">
	import PercentileGauge from '$lib/components/charts/PercentileGauge.svelte';
	import EmptyState from '$lib/components/data/EmptyState.svelte';
	import { formatPercent, formatDate } from '$lib/utils/formatters.js';
	import { getFieldLabel } from '$lib/utils/field-meta.js';
	import { getMode } from '$lib/stores/mode.svelte.js';
	import type { PeerMetricComparison } from '$lib/types';

	let { data } = $props();
	let peers = $derived(data.peers);
	let mode = $derived(getMode());

	/** Metrics shown in accessible mode (core set) */
	const ACCESSIBLE_METRICS = new Set(['roa', 'roe', 'nimy', 'rbcrwaj']);

	/** Metrics where lower values are better */
	const LOWER_IS_BETTER = new Set(['eeffr', 'nclnlsr']);

	let visibleMetrics = $derived.by((): PeerMetricComparison[] => {
		if (!peers) return [];
		if (mode === 'power') return peers.metrics;
		return peers.metrics.filter((m) => ACCESSIBLE_METRICS.has(m.metric));
	});

	function metricLabel(key: string): string {
		return getFieldLabel(key);
	}

	function metricFormat(key: string): 'percent' | 'number' {
		return 'percent';
	}

	/** Asset tier human labels */
	function peerGroupLabel(pg: string): string {
		const tierMap: Record<string, string> = {
			'asset_bucket:1': 'Under $100M',
			'asset_bucket:2': '$100M - $300M',
			'asset_bucket:3': '$300M - $1B',
			'asset_bucket:4': '$1B - $10B',
			'asset_bucket:5': '$10B - $50B',
			'asset_bucket:6': '$50B - $250B',
			'asset_bucket:7': 'Over $250B'
		};
		return tierMap[pg] ?? pg;
	}
</script>

<div class="space-y-5 pt-3">
	{#if !peers}
		<EmptyState
			icon="data"
			title="No peer comparison data available"
			message="This bank may not have financials for the latest quarter. Run the peer aggregation pipeline to generate comparisons."
		/>
	{:else}
		<!-- Peer group header -->
		<div class="flex items-center gap-2">
			<div class="w-0.5 h-4 bg-[--accent] rounded-full"></div>
			<h2 class="text-[15px] font-semibold text-[--text-primary]">Peer Comparison</h2>
			<span class="inline-flex items-center rounded-sm px-1.5 py-0.5 text-[11px] font-medium tracking-wide bg-[--accent-muted] text-[--accent-text]">
				{peerGroupLabel(peers.peer_group)}
			</span>
			<span class="text-[11px] text-[--text-tertiary] ml-1">as of {formatDate(peers.repdte)}</span>
		</div>

		<!-- Gauge cards grid -->
		<div class="grid grid-cols-1 md:grid-cols-2 gap-2">
			{#each visibleMetrics as m (m.metric)}
				<section class="rounded-md bg-[--surface-1] p-3" style="box-shadow: var(--shadow-sm)">
					<div class="flex items-center justify-between mb-1">
						<h3 class="text-[13px] font-semibold text-[--text-primary]">{metricLabel(m.metric)}</h3>
						{#if m.percentile !== null}
							<span
								class="text-[11px] font-medium data-mono px-1.5 py-0.5 rounded-sm
									{LOWER_IS_BETTER.has(m.metric)
										? m.percentile <= 40 ? 'bg-[--positive-muted] text-[--positive]' : m.percentile >= 75 ? 'bg-[--negative-muted] text-[--negative]' : 'bg-[--warning-muted] text-[--warning]'
										: m.percentile >= 60 ? 'bg-[--positive-muted] text-[--positive]' : m.percentile <= 25 ? 'bg-[--negative-muted] text-[--negative]' : 'bg-[--warning-muted] text-[--warning]'}"
							>
								P{m.percentile.toFixed(0)}
							</span>
						{/if}
					</div>
					<div class="flex items-baseline gap-3 mb-2">
						<span class="text-[13px] text-[--text-tertiary]">Bank: <span class="font-medium text-[--text-primary] data-mono">{formatPercent(m.bank_value)}</span></span>
						<span class="text-[13px] text-[--text-tertiary]">Median: <span class="font-medium text-[--text-secondary] data-mono">{formatPercent(m.peer_median)}</span></span>
					</div>
					<PercentileGauge
						metric={m.metric}
						bankValue={m.bank_value}
						p10={m.p10}
						p25={m.p25}
						median={m.peer_median}
						p75={m.p75}
						p90={m.p90}
						percentile={m.percentile}
						format={metricFormat(m.metric)}
						higherIsBetter={!LOWER_IS_BETTER.has(m.metric)}
					/>
				</section>
			{/each}
		</div>

		<!-- Summary table -->
		<section>
			<div class="flex items-center gap-2 mb-3">
				<div class="w-0.5 h-4 bg-[--accent] rounded-full"></div>
				<h2 class="text-[15px] font-semibold text-[--text-primary]">Detail Table</h2>
			</div>
			<div class="rounded-md bg-[--surface-1] overflow-x-auto" style="box-shadow: var(--shadow-sm)">
				<table class="w-full text-[13px]">
					<thead>
						<tr class="bg-[--surface-3]">
							<th class="text-left px-3 py-2 text-[11px] font-medium text-[--text-tertiary] uppercase tracking-wider">Metric</th>
							<th class="text-right px-3 py-2 text-[11px] font-medium text-[--text-tertiary] uppercase tracking-wider">Bank</th>
							<th class="text-right px-3 py-2 text-[11px] font-medium text-[--text-tertiary] uppercase tracking-wider">Peer Median</th>
							<th class="text-right px-3 py-2 text-[11px] font-medium text-[--text-tertiary] uppercase tracking-wider">Peer Mean</th>
							<th class="text-right px-3 py-2 text-[11px] font-medium text-[--text-tertiary] uppercase tracking-wider">Percentile</th>
						</tr>
					</thead>
					<tbody class="divide-y divide-[--surface-2]">
						{#each visibleMetrics as m (m.metric)}
							<tr class="hover:bg-[--accent-muted] transition-colors">
								<td class="px-3 py-2 font-medium text-[--text-primary]">{metricLabel(m.metric)}</td>
								<td class="px-3 py-2 text-right data-mono text-[--text-primary]">{formatPercent(m.bank_value)}</td>
								<td class="px-3 py-2 text-right data-mono text-[--text-secondary]">{formatPercent(m.peer_median)}</td>
								<td class="px-3 py-2 text-right data-mono text-[--text-secondary]">{formatPercent(m.peer_mean)}</td>
								<td class="px-3 py-2 text-right data-mono">
									{#if m.percentile !== null}
										<span
											class="inline-flex items-center px-1.5 py-0.5 rounded-sm text-[11px] font-medium
												{LOWER_IS_BETTER.has(m.metric)
													? m.percentile <= 40 ? 'bg-[--positive-muted] text-[--positive]' : m.percentile >= 75 ? 'bg-[--negative-muted] text-[--negative]' : 'bg-[--warning-muted] text-[--warning]'
													: m.percentile >= 60 ? 'bg-[--positive-muted] text-[--positive]' : m.percentile <= 25 ? 'bg-[--negative-muted] text-[--negative]' : 'bg-[--warning-muted] text-[--warning]'}"
										>
											P{m.percentile.toFixed(0)}
										</span>
									{:else}
										<span class="text-[--text-disabled]">{'\u2014'}</span>
									{/if}
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		</section>
	{/if}
</div>
