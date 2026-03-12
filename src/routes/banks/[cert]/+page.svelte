<script lang="ts">
	import MetricCard from '$lib/components/data/MetricCard.svelte';
	import { formatCurrency, formatPercent, formatDate, formatNumber } from '$lib/utils/formatters.js';
	import { getRegulatorName, getCharterClassName } from '$lib/utils/field-meta.js';

	let { data } = $props();
	let bank = $derived(data.bank);
	let trends = $derived(data.trends ?? {});
	let hasFinancials = $derived(bank.latest_repdte !== null);

	function getMetricSemantic(metric: string, value: number | null): 'positive' | 'negative' | 'warning' | undefined {
		if (value === null || value === undefined) return undefined;
		const thresholds: Record<string, { good: number; warn: number; inverse?: boolean }> = {
			roa: { good: 1.0, warn: 0.5 },
			roe: { good: 10, warn: 5 },
			nim: { good: 3.0, warn: 2.0 },
			npl_ratio: { good: 1.0, warn: 3.0, inverse: true },
			tier1_ratio: { good: 10, warn: 8 }
		};
		const t = thresholds[metric];
		if (!t) return undefined;
		if (t.inverse) {
			if (value < t.good) return 'positive';
			if (value > t.warn) return 'negative';
			return 'warning';
		}
		if (value >= t.good) return 'positive';
		if (value >= t.warn) return 'warning';
		return 'negative';
	}
</script>

<div class="space-y-5 pt-3">
	<!-- Institution info -->
	<section>
		<div class="flex items-center gap-2 mb-3">
			<div class="w-0.5 h-4 bg-[--accent] rounded-full"></div>
			<h2 class="text-[15px] font-semibold text-[--text-primary]">Institution Details</h2>
		</div>
		<div class="rounded border border-[--border] bg-[--surface-1] divide-y divide-[--border-muted]">
			<div class="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-[--border-muted]">
				<!-- Left column -->
				<div class="divide-y divide-[--border-muted]">
					<div class="flex justify-between items-center px-3 py-2">
						<span class="text-[13px] text-[--text-tertiary]">Name</span>
						<span class="text-[13px] font-medium text-[--text-primary]">{bank.name}</span>
					</div>
					<div class="flex justify-between items-center px-3 py-2">
						<span class="text-[13px] text-[--text-tertiary]">CERT</span>
						<span class="text-[13px] font-medium text-[--text-primary] font-mono">{bank.cert}</span>
					</div>
					<div class="flex justify-between items-center px-3 py-2">
						<span class="text-[13px] text-[--text-tertiary]">RSSD ID</span>
						<span class="text-[13px] font-medium text-[--text-primary] font-mono">{bank.rssd_id ?? '\u2014'}</span>
					</div>
					<div class="flex justify-between items-center px-3 py-2">
						<span class="text-[13px] text-[--text-tertiary]">Location</span>
						<span class="text-[13px] font-medium text-[--text-primary]">
							{[bank.city, bank.state].filter(Boolean).join(', ')}{bank.zip ? ` ${bank.zip}` : ''}
						</span>
					</div>
					<div class="flex justify-between items-center px-3 py-2">
						<span class="text-[13px] text-[--text-tertiary]">County</span>
						<span class="text-[13px] font-medium text-[--text-primary]">{bank.county ?? '\u2014'}</span>
					</div>
					<div class="flex justify-between items-center px-3 py-2">
						<span class="text-[13px] text-[--text-tertiary]">Established</span>
						<span class="text-[13px] font-medium text-[--text-primary]">{formatDate(bank.established_date)}</span>
					</div>
					<div class="flex justify-between items-center px-3 py-2">
						<span class="text-[13px] text-[--text-tertiary]">Insured</span>
						<span class="text-[13px] font-medium text-[--text-primary]">{formatDate(bank.insured_date)}</span>
					</div>
				</div>

				<!-- Right column -->
				<div class="divide-y divide-[--border-muted]">
					<div class="flex justify-between items-center px-3 py-2">
						<span class="text-[13px] text-[--text-tertiary]">Regulator</span>
						<span class="text-[13px] font-medium text-[--text-primary]">
							{bank.regulator ? getRegulatorName(bank.regulator) : '\u2014'}
						</span>
					</div>
					<div class="flex justify-between items-center px-3 py-2">
						<span class="text-[13px] text-[--text-tertiary]">Charter Class</span>
						<span class="text-[13px] font-medium text-[--text-primary]">
							{bank.charter_class ? getCharterClassName(bank.charter_class) : '\u2014'}
						</span>
					</div>
					<div class="flex justify-between items-center px-3 py-2">
						<span class="text-[13px] text-[--text-tertiary]">Holding Company</span>
						<span class="text-[13px] font-medium text-[--text-primary]">{bank.holding_company ?? '\u2014'}</span>
					</div>
					<div class="flex justify-between items-center px-3 py-2">
						<span class="text-[13px] text-[--text-tertiary]">Status</span>
						<span>
							{#if bank.active === 1}
								<span class="inline-flex items-center rounded-sm px-1.5 py-0.5 text-[11px] font-medium tracking-wide bg-[--positive-muted] text-[--positive]">
									Active
								</span>
							{:else}
								<span class="inline-flex items-center rounded-sm px-1.5 py-0.5 text-[11px] font-medium tracking-wide bg-[--negative-muted] text-[--negative]">
									Inactive
								</span>
							{/if}
						</span>
					</div>
					<div class="flex justify-between items-center px-3 py-2">
						<span class="text-[13px] text-[--text-tertiary]">Branches</span>
						<span class="text-[13px] font-medium text-[--text-primary] tabular-nums">{formatNumber(bank.num_branches)}</span>
					</div>
					<div class="flex justify-between items-center px-3 py-2">
						<span class="text-[13px] text-[--text-tertiary]">Employees</span>
						<span class="text-[13px] font-medium text-[--text-primary] tabular-nums">{formatNumber(bank.num_employees)}</span>
					</div>
				</div>
			</div>
		</div>
	</section>

	<!-- Key metrics -->
	<section>
		<div class="flex items-center gap-2 mb-3">
			<div class="w-0.5 h-4 bg-[--accent] rounded-full"></div>
			<h2 class="text-[15px] font-semibold text-[--text-primary]">Key Metrics</h2>
			{#if hasFinancials}
				<span class="text-[11px] text-[--text-tertiary] ml-1">as of {formatDate(bank.latest_repdte)}</span>
			{/if}
		</div>

		{#if hasFinancials}
			<div class="grid grid-cols-2 md:grid-cols-4 gap-px bg-[--border-muted] rounded-[5px] overflow-hidden border border-[--border-muted]" style="box-shadow: var(--shadow-sm)">
				<MetricCard
					compact
					label="Total Assets"
					value={formatCurrency(bank.total_assets)}
					trend={trends.total_assets}
				/>
				<MetricCard
					compact
					label="Total Deposits"
					value={formatCurrency(bank.total_deposits)}
					trend={trends.total_deposits}
				/>
				<MetricCard
					compact
					label="ROA"
					value={formatPercent(bank.latest_roa)}
					sublabel="Return on Assets"
					trend={trends.roa}
					semantic={getMetricSemantic('roa', bank.latest_roa)}
				/>
				<MetricCard
					compact
					label="ROE"
					value={formatPercent(bank.latest_roe)}
					sublabel="Return on Equity"
					trend={trends.roe}
					semantic={getMetricSemantic('roe', bank.latest_roe)}
				/>
				<MetricCard
					compact
					label="NIM"
					value={formatPercent(bank.latest_nim)}
					sublabel="Net Interest Margin"
					trend={trends.nim}
					semantic={getMetricSemantic('nim', bank.latest_nim)}
				/>
				<MetricCard
					compact
					label="NPL Ratio"
					value={formatPercent(bank.latest_npl_ratio)}
					sublabel="Non-Performing Loans"
					trend={trends.npl_ratio}
					semantic={getMetricSemantic('npl_ratio', bank.latest_npl_ratio)}
				/>
				<MetricCard
					compact
					label="Tier 1 Capital"
					value={formatPercent(bank.latest_tier1_ratio)}
					sublabel="Risk-Based Capital"
					trend={trends.tier1_ratio}
					semantic={getMetricSemantic('tier1_ratio', bank.latest_tier1_ratio)}
				/>
			</div>
		{:else}
			<div class="rounded border border-[--border] bg-[--surface-1] py-12 text-center">
				<p class="text-[--text-tertiary]">No financial data available</p>
			</div>
		{/if}
	</section>
</div>
