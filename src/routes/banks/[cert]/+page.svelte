<script lang="ts">
	import MetricCard from '$lib/components/data/MetricCard.svelte';
	import { formatCurrency, formatPercent, formatDate, formatNumber } from '$lib/utils/formatters.js';
	import { getRegulatorName, getCharterClassName } from '$lib/utils/field-meta.js';

	let { data } = $props();
	let bank = $derived(data.bank);
	let hasFinancials = $derived(bank.latest_repdte !== null);
</script>

<div class="space-y-6 pt-4">
	<!-- Institution info -->
	<section>
		<h2 class="text-lg font-semibold text-gray-900 mb-3">Institution Details</h2>
		<div class="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-1 rounded-lg border border-gray-200 bg-white p-5">
			<!-- Left column -->
			<div class="space-y-2">
				<div class="flex justify-between py-1.5 border-b border-gray-100">
					<span class="text-sm text-gray-500">Name</span>
					<span class="text-sm font-medium text-gray-900">{bank.name}</span>
				</div>
				<div class="flex justify-between py-1.5 border-b border-gray-100">
					<span class="text-sm text-gray-500">CERT</span>
					<span class="text-sm font-medium text-gray-900">{bank.cert}</span>
				</div>
				<div class="flex justify-between py-1.5 border-b border-gray-100">
					<span class="text-sm text-gray-500">RSSD ID</span>
					<span class="text-sm font-medium text-gray-900">{bank.rssd_id ?? '—'}</span>
				</div>
				<div class="flex justify-between py-1.5 border-b border-gray-100">
					<span class="text-sm text-gray-500">Location</span>
					<span class="text-sm font-medium text-gray-900">
						{[bank.city, bank.state].filter(Boolean).join(', ')}{bank.zip ? ` ${bank.zip}` : ''}
					</span>
				</div>
				<div class="flex justify-between py-1.5 border-b border-gray-100">
					<span class="text-sm text-gray-500">County</span>
					<span class="text-sm font-medium text-gray-900">{bank.county ?? '—'}</span>
				</div>
				<div class="flex justify-between py-1.5 border-b border-gray-100">
					<span class="text-sm text-gray-500">Established</span>
					<span class="text-sm font-medium text-gray-900">{formatDate(bank.established_date)}</span>
				</div>
				<div class="flex justify-between py-1.5">
					<span class="text-sm text-gray-500">Insured</span>
					<span class="text-sm font-medium text-gray-900">{formatDate(bank.insured_date)}</span>
				</div>
			</div>

			<!-- Right column -->
			<div class="space-y-2">
				<div class="flex justify-between py-1.5 border-b border-gray-100">
					<span class="text-sm text-gray-500">Regulator</span>
					<span class="text-sm font-medium text-gray-900">
						{bank.regulator ? getRegulatorName(bank.regulator) : '—'}
					</span>
				</div>
				<div class="flex justify-between py-1.5 border-b border-gray-100">
					<span class="text-sm text-gray-500">Charter Class</span>
					<span class="text-sm font-medium text-gray-900">
						{bank.charter_class ? getCharterClassName(bank.charter_class) : '—'}
					</span>
				</div>
				<div class="flex justify-between py-1.5 border-b border-gray-100">
					<span class="text-sm text-gray-500">Holding Company</span>
					<span class="text-sm font-medium text-gray-900">{bank.holding_company ?? '—'}</span>
				</div>
				<div class="flex justify-between py-1.5 border-b border-gray-100">
					<span class="text-sm text-gray-500">Status</span>
					<span>
						{#if bank.active === 1}
							<span class="inline-flex items-center rounded-full bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700 ring-1 ring-inset ring-green-600/20">
								Active
							</span>
						{:else}
							<span class="inline-flex items-center rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700 ring-1 ring-inset ring-red-600/20">
								Inactive
							</span>
						{/if}
					</span>
				</div>
				<div class="flex justify-between py-1.5 border-b border-gray-100">
					<span class="text-sm text-gray-500">Branches</span>
					<span class="text-sm font-medium text-gray-900">{formatNumber(bank.num_branches)}</span>
				</div>
				<div class="flex justify-between py-1.5">
					<span class="text-sm text-gray-500">Employees</span>
					<span class="text-sm font-medium text-gray-900">{formatNumber(bank.num_employees)}</span>
				</div>
			</div>
		</div>
	</section>

	<!-- Key metrics -->
	<section>
		<h2 class="text-lg font-semibold text-gray-900 mb-3">
			Key Metrics
			{#if hasFinancials}
				<span class="text-sm font-normal text-gray-400 ml-2">as of {formatDate(bank.latest_repdte)}</span>
			{/if}
		</h2>

		{#if hasFinancials}
			<div class="grid grid-cols-2 md:grid-cols-4 gap-3">
				<MetricCard
					label="Total Assets"
					value={formatCurrency(bank.total_assets)}
				/>
				<MetricCard
					label="Total Deposits"
					value={formatCurrency(bank.total_deposits)}
				/>
				<MetricCard
					label="ROA"
					value={formatPercent(bank.latest_roa)}
					sublabel="Return on Assets"
				/>
				<MetricCard
					label="ROE"
					value={formatPercent(bank.latest_roe)}
					sublabel="Return on Equity"
				/>
				<MetricCard
					label="NIM"
					value={formatPercent(bank.latest_nim)}
					sublabel="Net Interest Margin"
				/>
				<MetricCard
					label="NPL Ratio"
					value={formatPercent(bank.latest_npl_ratio)}
					sublabel="Non-Performing Loans"
				/>
				<MetricCard
					label="Tier 1 Capital"
					value={formatPercent(bank.latest_tier1_ratio)}
					sublabel="Risk-Based Capital"
				/>
			</div>
		{:else}
			<div class="rounded-lg border border-gray-200 bg-white py-12 text-center">
				<p class="text-gray-500">No financial data available</p>
			</div>
		{/if}
	</section>
</div>
