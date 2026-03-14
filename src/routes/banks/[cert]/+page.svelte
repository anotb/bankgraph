<script lang="ts">
	import MetricCard from '$lib/components/data/MetricCard.svelte';
	import QuickCompare from '$lib/components/data/QuickCompare.svelte';
	import EmptyState from '$lib/components/data/EmptyState.svelte';
	import TimeSeriesChart from '$lib/components/charts/TimeSeriesChart.svelte';
	import Sparkline from '$lib/components/data/Sparkline.svelte';
	import { formatCurrency, formatPercent, formatDate, formatNumber, getMetricStatus, semanticColor } from '$lib/utils/formatters.js';
	import { getRegulatorName, getCharterClassName } from '$lib/utils/field-meta.js';
	import { getMode } from '$lib/stores/mode.svelte.js';

	let mode = $derived(getMode());
	let isPower = $derived(mode === 'power');

	let { data } = $props();
	let bank = $derived(data.bank);
	let trends = $derived(data.trends ?? {});
	let peerComparison = $derived(data.peerComparison ?? []);
	let recentQuarters = $derived(data.recentQuarters ?? []);
	let hasPeerData = $derived(peerComparison.length > 0 && peerComparison.some((m: { percentile: number | null }) => m.percentile !== null));
	let hasHistory = $derived(recentQuarters.length > 0);

	// Toggle for additional details section
	let showAdditionalDetails = $state(false);

	/** Derive metrics from recentQuarters[0] when institution snapshot fields are null */
	let latestQ = $derived(recentQuarters.length > 0 ? recentQuarters[0] : null);

	let metricsSource = $derived.by(() => {
		const fromSnapshot = bank.latest_repdte !== null;
		const fromQuarters = !fromSnapshot && latestQ !== null;
		if (!fromSnapshot && !fromQuarters) return null;

		return {
			repdte: fromSnapshot ? bank.latest_repdte : latestQ!.repdte,
			total_assets: fromSnapshot ? bank.total_assets : latestQ!.asset,
			total_deposits: fromSnapshot ? bank.total_deposits : latestQ!.dep,
			roa: fromSnapshot ? bank.latest_roa : latestQ!.roa,
			roe: fromSnapshot ? bank.latest_roe : latestQ!.roe,
			nim: fromSnapshot ? bank.latest_nim : latestQ!.nimy,
			npl_ratio: fromSnapshot ? bank.latest_npl_ratio : latestQ!.nclnlsr,
			tier1_ratio: fromSnapshot ? bank.latest_tier1_ratio : latestQ!.rbcrwaj,
			derived: fromQuarters
		};
	});

	let hasFinancials = $derived(metricsSource !== null);

	/** Compute QoQ trend from recentQuarters when server-side trends are empty */
	let effectiveTrends = $derived.by(() => {
		const serverTrends = data.trends ?? {};
		const hasServerTrends = Object.values(serverTrends).some((v) => v !== null && v !== undefined);
		if (hasServerTrends) return serverTrends;

		if (recentQuarters.length < 2) return {};

		const [current, previous] = recentQuarters;
		function qoqDelta(curr: number | null, prev: number | null): number | null {
			if (curr === null || prev === null) return null;
			return curr - prev;
		}
		function pctChange(curr: number | null, prev: number | null): number | null {
			if (curr === null || prev === null || prev === 0) return null;
			return ((curr - prev) / Math.abs(prev)) * 100;
		}

		return {
			roa: qoqDelta(current.roa, previous.roa),
			roe: qoqDelta(current.roe, previous.roe),
			nim: qoqDelta(current.nimy, previous.nimy),
			npl_ratio: qoqDelta(current.nclnlsr, previous.nclnlsr),
			tier1_ratio: qoqDelta(current.rbcrwaj, previous.rbcrwaj),
			total_assets: pctChange(current.asset, previous.asset),
			total_deposits: pctChange(current.dep, previous.dep)
		};
	});

	/** Derive semantic for growth metrics: shrinking = warning, flat/growing = neutral */
	function getGrowthSemantic(trend: number | null | undefined): 'warning' | undefined {
		if (trend == null) return undefined;
		return trend < -5 ? 'warning' : undefined;
	}

	/** Employee count: prefer institution field, fallback to latest quarter */
	let employeeCount = $derived(bank.num_employees ?? latestQ?.numemp ?? null);

	/** Format YYYYMMDD to Q1 2024 style */
	function formatQuarter(repdte: string): string {
		if (!repdte || repdte.length !== 8) return repdte ?? '\u2014';
		const month = parseInt(repdte.slice(4, 6), 10);
		const year = repdte.slice(0, 4);
		const q = month <= 3 ? 'Q1' : month <= 6 ? 'Q2' : month <= 9 ? 'Q3' : 'Q4';
		return `${q} ${year}`;
	}

	/** Fields that are commonly null and should go in "Additional Details" */
	let additionalFields = $derived.by(() => {
		const fields: Array<{ label: string; value: string }> = [];
		if (bank.rssd_id !== null) fields.push({ label: 'RSSD ID', value: String(bank.rssd_id) });
		if (bank.hc_rssd_id !== null) fields.push({ label: 'HC RSSD ID', value: String(bank.hc_rssd_id) });
		if (bank.county) fields.push({ label: 'County', value: bank.county });
		if (bank.zip) fields.push({ label: 'ZIP', value: bank.zip });
		if (bank.asset_tier !== null) {
			const tierLabels: Record<number, string> = {
				1: 'Under $100M', 2: '$100M - $300M', 3: '$300M - $1B',
				4: '$1B - $10B', 5: '$10B - $50B', 6: '$50B - $250B', 7: 'Over $250B'
			};
			fields.push({ label: 'Asset Tier', value: tierLabels[bank.asset_tier] ?? `Tier ${bank.asset_tier}` });
		}
		return fields;
	});

	let detailRow = $derived(isPower
		? 'flex justify-between items-center px-3 py-1.5 gap-2'
		: 'flex justify-between items-center px-3 py-2 gap-2'
	);
	let detailLabel = $derived(isPower
		? 'text-[12px] text-[--text-tertiary] shrink-0'
		: 'text-[13px] text-[--text-tertiary] shrink-0'
	);
	let detailValue = $derived(isPower
		? 'text-[12px] font-medium text-[--text-primary] text-right break-words min-w-0'
		: 'text-[13px] font-medium text-[--text-primary] text-right break-words min-w-0'
	);

	// Power mode: tighter table cell padding
	let tableCellPy = $derived(isPower ? 'py-1' : 'py-1.5');
</script>

<div class="{isPower ? 'space-y-3 pt-2' : 'space-y-5 pt-3'}">
	<!-- Institution Details: grouped into Identity, Location, Regulatory -->
	<section>
		<div class="flex items-center gap-2 mb-3">
			<div class="w-0.5 h-4 bg-[--accent] rounded-full"></div>
			<h2 class="text-[15px] font-semibold text-[--text-primary]">Institution Details</h2>
		</div>
		<div class="{isPower ? 'rounded-none' : 'rounded-md'} bg-[--surface-1] {isPower ? 'border border-[--border-muted]' : ''}" style="{isPower ? '' : 'box-shadow: var(--shadow-sm)'}">
			<div class="grid grid-cols-1 md:grid-cols-2">
				<!-- Identity & Location -->
				<div class="divide-y divide-[--surface-2]">
					<div class="{detailRow}">
						<span class="{detailLabel}">Name</span>
						<span class="{detailValue}">{bank.name}</span>
					</div>
					<div class="{detailRow}">
						<span class="{detailLabel}">CERT</span>
						<span class="{detailValue} data-mono">{bank.cert}</span>
					</div>
					<div class="{detailRow}">
						<span class="{detailLabel}">Location</span>
						<span class="{detailValue}">
							{[bank.city, bank.state].filter(Boolean).join(', ')}
						</span>
					</div>
					<div class="{detailRow}">
						<span class="{detailLabel}">Established</span>
						<span class="{detailValue}">{formatDate(bank.established_date)}</span>
					</div>
					<div class="{detailRow}">
						<span class="{detailLabel}">Status</span>
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
				</div>

				<!-- Regulatory & Operations -->
				<div class="divide-y divide-[--surface-2] md:border-l md:border-[--surface-2]">
					<div class="{detailRow}">
						<span class="{detailLabel}">Regulator</span>
						<span class="{detailValue}">
							{bank.regulator ? getRegulatorName(bank.regulator) : '\u2014'}
						</span>
					</div>
					<div class="{detailRow}">
						<span class="{detailLabel}">Charter Class</span>
						<span class="{detailValue}">
							{bank.charter_class ? getCharterClassName(bank.charter_class) : '\u2014'}
						</span>
					</div>
					<div class="{detailRow}">
						<span class="{detailLabel}">FDIC Insured</span>
						<span class="{detailValue}">
							{#if bank.insured_date}
								<span class="inline-flex items-center gap-1.5">
									<span class="w-1.5 h-1.5 rounded-full {bank.active === 1 ? 'bg-[--positive]' : 'bg-[--text-disabled]'}"></span>
									{bank.active === 1 ? 'Yes' : 'Was insured'} (since {formatDate(bank.insured_date)})
								</span>
							{:else}
								{'\u2014'}
							{/if}
						</span>
					</div>
					<div class="{detailRow}">
						<span class="{detailLabel}">Holding Company</span>
						<span class="{detailValue}">{bank.holding_company ?? '\u2014'}</span>
					</div>
					<div class="{detailRow}">
						<span class="{detailLabel}">Branches</span>
						<span class="{detailValue} tabular-nums">{formatNumber(bank.num_branches)}</span>
					</div>
					<div class="{detailRow}">
						<span class="{detailLabel}">Employees</span>
						<span class="{detailValue} tabular-nums">{formatNumber(employeeCount)}</span>
					</div>
				</div>
			</div>

			<!-- Additional Details (collapsible, for fields that are often null) -->
			{#if additionalFields.length > 0}
				<div class="border-t border-[--surface-2]">
					<button
						class="w-full flex items-center justify-between px-3 py-2 text-[12px] text-[--text-tertiary] hover:text-[--text-secondary] transition-colors"
						onclick={() => showAdditionalDetails = !showAdditionalDetails}
					>
						<span class="font-medium">Additional Details ({additionalFields.length})</span>
						<svg
							class="w-3.5 h-3.5 transition-transform duration-200 {showAdditionalDetails ? 'rotate-180' : ''}"
							fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"
						>
							<path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7" />
						</svg>
					</button>
					{#if showAdditionalDetails}
						<div class="divide-y divide-[--surface-2] border-t border-[--surface-2]">
							<div class="grid grid-cols-1 md:grid-cols-2">
								{#each additionalFields as field, i}
									<div class="{detailRow} {i % 2 === 1 ? 'md:border-l md:border-[--surface-2]' : ''}">
										<span class="{detailLabel}">{field.label}</span>
										<span class="{detailValue} data-mono">{field.value}</span>
									</div>
								{/each}
							</div>
						</div>
					{/if}
				</div>
			{/if}
		</div>
	</section>

	<!-- Key Metrics -->
	<section>
		<div class="flex items-center gap-2 mb-3">
			<div class="w-0.5 h-4 bg-[--accent] rounded-full"></div>
			<h2 class="text-[15px] font-semibold text-[--text-primary]">Key Metrics</h2>
			{#if metricsSource}
				<span class="text-[11px] text-[--text-tertiary] ml-1">
					as of {formatQuarter(metricsSource.repdte ?? '')}
				</span>
				{#if metricsSource.derived}
					<span class="text-[10px] text-[--warning] ml-1">(from quarterly data)</span>
				{/if}
			{/if}
		</div>

		{#if hasFinancials && metricsSource}
			<div class="grid grid-cols-2 md:grid-cols-4 gap-px bg-[--border-muted] {isPower ? 'rounded-none' : 'rounded-md'} overflow-hidden" style="{isPower ? '' : 'box-shadow: var(--shadow-sm)'}">
				<MetricCard
					compact
					variant={isPower ? 'dense' : 'default'}
					label="Total Assets"
					value={formatCurrency(metricsSource.total_assets)}
					trend={effectiveTrends.total_assets}
					semantic={getGrowthSemantic(effectiveTrends.total_assets)}
				/>
				<MetricCard
					compact
					variant={isPower ? 'dense' : 'default'}
					label="Total Deposits"
					value={formatCurrency(metricsSource.total_deposits)}
					trend={effectiveTrends.total_deposits}
					semantic={getGrowthSemantic(effectiveTrends.total_deposits)}
				/>
				<MetricCard
					compact
					variant={isPower ? 'dense' : 'default'}
					label="ROA"
					value={formatPercent(metricsSource.roa)}
					sublabel="Return on Assets"
					trend={effectiveTrends.roa}
					semantic={getMetricStatus('roa', metricsSource.roa)}
				/>
				<MetricCard
					compact
					variant={isPower ? 'dense' : 'default'}
					label="ROE"
					value={formatPercent(metricsSource.roe)}
					sublabel="Return on Equity"
					trend={effectiveTrends.roe}
					semantic={getMetricStatus('roe', metricsSource.roe)}
				/>
				<MetricCard
					compact
					variant={isPower ? 'dense' : 'default'}
					label="NIM"
					value={formatPercent(metricsSource.nim)}
					sublabel="Net Interest Margin"
					trend={effectiveTrends.nim}
					semantic={getMetricStatus('nim', metricsSource.nim)}
				/>
				<MetricCard
					compact
					variant={isPower ? 'dense' : 'default'}
					label="NPL Ratio"
					value={formatPercent(metricsSource.npl_ratio)}
					sublabel="Non-Performing Loans"
					trend={effectiveTrends.npl_ratio}
					invertTrend
					semantic={getMetricStatus('npl_ratio', metricsSource.npl_ratio)}
				/>
				<MetricCard
					compact
					variant={isPower ? 'dense' : 'default'}
					label="Tier 1 Capital"
					value={formatPercent(metricsSource.tier1_ratio)}
					sublabel="Risk-Based Capital"
					trend={effectiveTrends.tier1_ratio}
					semantic={getMetricStatus('tier1_ratio', metricsSource.tier1_ratio)}
				/>
			</div>
		{:else}
			<EmptyState
				icon="chart"
				title="No financial data available"
				message="Run the backfill pipeline to populate financial data for this institution."
			/>
		{/if}
	</section>

	<!-- Performance Trends -->
	{#if recentQuarters.length >= 2}
		<section>
			<div class="flex items-center gap-2 mb-3">
				<div class="w-0.5 h-4 bg-[--accent] rounded-full"></div>
				<h2 class="text-[15px] font-semibold text-[--text-primary]">Performance Trends</h2>
				<span class="text-[11px] text-[--text-tertiary] ml-1">last {recentQuarters.length} quarters</span>
			</div>
			<div class="grid grid-cols-1 md:grid-cols-2 gap-3">
				<div class="borderless-card p-3">
					<TimeSeriesChart
						series={[
							{
								key: 'roa',
								label: 'ROA',
								data: [...recentQuarters].reverse().map(q => ({ date: q.repdte, value: q.roa }))
							},
							{
								key: 'nim',
								label: 'NIM',
								data: [...recentQuarters].reverse().map(q => ({ date: q.repdte, value: q.nimy }))
							}
						]}
						yAxisFormat="percent"
						height="180px"
					/>
				</div>
				<div class="borderless-card p-3">
					<TimeSeriesChart
						series={[
							{
								key: 'assets',
								label: 'Total Assets',
								data: [...recentQuarters].reverse().map(q => ({ date: q.repdte, value: q.asset }))
							}
						]}
						yAxisFormat="currency"
						height="180px"
					/>
				</div>
			</div>
		</section>
	{/if}

	<!-- Quick Compare -->
	{#if hasPeerData}
		<section>
			<div class="flex items-center gap-2 mb-3">
				<div class="w-0.5 h-4 bg-[--accent] rounded-full"></div>
				<h2 class="text-[15px] font-semibold text-[--text-primary]">Quick Compare</h2>
				<span class="text-[11px] text-[--text-tertiary] ml-1">vs. peer group</span>
			</div>
			<QuickCompare metrics={peerComparison} />
		</section>
	{/if}

	<!-- Recent Financial History -->
	{#if hasHistory}
		<section>
			<div class="flex items-center gap-2 mb-3">
				<div class="w-0.5 h-4 bg-[--accent] rounded-full"></div>
				<h2 class="text-[15px] font-semibold text-[--text-primary]">Recent Quarters</h2>
			</div>
			<div class="{isPower ? 'rounded-none border border-[--border-muted]' : 'rounded-md'} bg-[--surface-1] overflow-x-auto" style="{isPower ? '' : 'box-shadow: var(--shadow-sm)'}">
				<table class="w-full min-w-[400px]" style="font-size: 12px;">
					<thead>
						<tr class="bg-[--surface-3]">
							<th class="text-left px-3 {tableCellPy} text-[11px] font-medium text-[--text-tertiary] uppercase tracking-wider sticky left-0 bg-[--surface-3] z-10">Quarter</th>
							<th class="text-right px-3 {tableCellPy} text-[11px] font-medium text-[--text-tertiary] uppercase tracking-wider">Assets</th>
							<th class="text-right px-3 {tableCellPy} text-[11px] font-medium text-[--text-tertiary] uppercase tracking-wider">
								<span class="inline-flex items-center gap-1.5 justify-end">
									ROA
									{#if recentQuarters.length >= 2}
										<Sparkline data={[...recentQuarters].reverse().map(r => r.roa)} width={48} height={16} showDot={false} />
									{/if}
								</span>
							</th>
							<th class="text-right px-3 {tableCellPy} text-[11px] font-medium text-[--text-tertiary] uppercase tracking-wider">QoQ</th>
							<th class="text-right px-3 {tableCellPy} text-[11px] font-medium text-[--text-tertiary] uppercase tracking-wider">ROE</th>
							<th class="text-right px-3 {tableCellPy} text-[11px] font-medium text-[--text-tertiary] uppercase tracking-wider">NIM</th>
						</tr>
					</thead>
					<tbody class="divide-y divide-[--surface-2]">
						{#each recentQuarters as q, i (q.repdte)}
							{@const prevQ = i < recentQuarters.length - 1 ? recentQuarters[i + 1] : null}
							{@const roaDelta = (q.roa !== null && prevQ?.roa !== null && prevQ !== null) ? q.roa - prevQ.roa : null}
							<tr class="hover:bg-[--accent-muted] transition-colors">
								<td class="px-3 {tableCellPy} font-medium text-[--text-primary] data-mono sticky left-0 bg-inherit z-[5]">{formatQuarter(q.repdte)}</td>
								<td class="px-3 {tableCellPy} text-right text-[--text-primary] data-mono">{formatCurrency(q.asset)}</td>
								<td class="px-3 {tableCellPy} text-right data-mono">
									<span class="{semanticColor(getMetricStatus('roa', q.roa))}">
										{formatPercent(q.roa)}
									</span>
								</td>
								<td class="px-3 {tableCellPy} text-right data-mono text-[11px]">
									{#if roaDelta !== null}
										<span class="inline-flex items-center gap-0.5" style="color: {roaDelta >= 0 ? 'var(--positive)' : 'var(--negative)'}">
											{#if roaDelta > 0}
												<svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M5 15l7-7 7 7"/></svg>
											{:else if roaDelta < 0}
												<svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7"/></svg>
											{/if}
											{roaDelta > 0 ? '+' : ''}{roaDelta.toFixed(2)}
										</span>
									{:else}
										<span class="text-[--text-disabled]">&mdash;</span>
									{/if}
								</td>
								<td class="px-3 {tableCellPy} text-right data-mono">
									<span class="{semanticColor(getMetricStatus('roe', q.roe))}">
										{formatPercent(q.roe)}
									</span>
								</td>
								<td class="px-3 {tableCellPy} text-right data-mono">
									<span class="{semanticColor(getMetricStatus('nim', q.nimy))}">
										{formatPercent(q.nimy)}
									</span>
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		</section>
	{/if}
</div>
