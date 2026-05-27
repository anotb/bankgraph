<script lang="ts">
	import { goto } from '$app/navigation';
	import { browser } from '$app/environment';
	import HeroBrief from '$lib/components/data/HeroBrief.svelte';
	import PulseCard from '$lib/components/data/PulseCard.svelte';
	import Sparkline from '$lib/components/data/Sparkline.svelte';
	import TimeSeriesChart from '$lib/components/charts/TimeSeriesChart.svelte';
	import USStateMap from '$lib/components/charts/USStateMap.svelte';
	import { formatNumber, formatDate, formatPercent, formatCurrency } from '$lib/utils/formatters.js';
	import { getFieldLabel } from '$lib/utils/field-meta.js';
	import { getStateName } from '$lib/utils/states.js';
	import { getWatchlist, removeFromWatchlist, clearWatchlist } from '$lib/stores/watchlist.svelte.js';
	import type { Institution } from '$lib/types';

	let { data } = $props();

	// Watchlist state (client-side only)
	let watchedBanks = $state<Institution[]>([]);
	let watchlistLoading = $state(false);
	let watchlistCerts = $derived(getWatchlist());

	$effect(() => {
		if (!browser) return;
		const certs = watchlistCerts;
		if (certs.length === 0) {
			watchedBanks = [];
			return;
		}
		watchlistLoading = true;
		Promise.all(
			certs.map((cert) =>
				fetch(`/api/v1/banks/${cert}`)
					.then((r) => (r.ok ? r.json() : null))
					.catch(() => null)
			)
		).then((results) => {
			watchedBanks = results.filter((b): b is Institution => b !== null);
			watchlistLoading = false;
		});
	});

	function handleSelect({ cert }: import('$lib/types').Institution) {
		goto(`/banks/${cert}`);
	}

	// Build ROA history (chronological) for the hero sparkline — last 12 quarters
	let roaHistory = $derived.by(() => {
		if (!data.industryTrends || data.industryTrends.length < 2) return [];
		const chrono = [...data.industryTrends].reverse();
		return chrono.slice(-12).map((q) => q.metrics?.median_roa ?? null);
	});

	let trendSeries = $derived.by(() => {
		if (!data.industryTrends || data.industryTrends.length < 2) return null;
		const quarters = [...data.industryTrends].reverse();
		return {
			roa: quarters.map((q) => ({ date: q.repdte, value: q.metrics?.median_roa ?? null })),
			roe: quarters.map((q) => ({ date: q.repdte, value: q.metrics?.median_roe ?? null })),
			nim: quarters.map((q) => ({ date: q.repdte, value: q.metrics?.median_nim ?? null }))
		};
	});

	// Pulse strip values
	let anomalyTotal = $derived(data.anomalyCounts.critical + data.anomalyCounts.warning);
	let mostRecentFailure = $derived(data.failureSummary.recent_failures[0] ?? null);
	let macroSpread = $derived.by(() => {
		const ten = data.macroSnapshot.dgs10?.value;
		const two = data.macroSnapshot.dgs2?.value;
		if (ten == null || two == null) return null;
		return ten - two;
	});

	// Top states by bank count - we'll show the heatmap as before but with more presence
	let stateLeaders = $derived(data.stateDistribution.slice(0, 10));

	let mapMetric = $state<'bank_count' | 'total_assets'>('bank_count');
	let topByAssets = $derived(
		[...data.stateDistribution]
			.filter((s) => s.total_assets != null)
			.sort((a, b) => (b.total_assets ?? 0) - (a.total_assets ?? 0))
			.slice(0, 10)
	);
	let visibleLeaders = $derived(mapMetric === 'total_assets' ? topByAssets : stateLeaders);

	function handleStateClick(state: string) {
		goto(`/banks?state=${state}`);
	}
</script>

<svelte:head>
	<title>Bank Data Explorer</title>
	<meta name="description" content="FDIC quarterly call-report data for U.S. banks: industry aggregates, anomaly flags, peer benchmarks, and macro context." />
	<meta property="og:title" content="Bank Data Explorer" />
	<meta property="og:description" content="FDIC and FRED data for U.S. banks: aggregates, anomaly flags, peer benchmarks, macro context." />
</svelte:head>

<h1 class="sr-only">Bank Data Explorer — U.S. bank industry brief</h1>

<HeroBrief
	quarter={data.meta.latest_quarter}
	headlineLabel="Industry median ROA"
	headlineValue={data.industryMetrics.median_roa}
	headlineDelta={data.deltas.median_roa}
	sparkline={roaHistory}
	sentences={data.narrative}
/>

<!-- Pulse strip: scrollable on small screens -->
<section class="pulse-strip" aria-label="Industry pulse">
	<div class="pulse-strip__grid">
		<PulseCard
			label="Active banks"
			value={formatNumber(data.meta.active_count)}
			sublabel="FDIC-insured"
			footer={data.industryMetrics.total_assets != null ? `${formatCurrency(data.industryMetrics.total_assets)} total assets` : undefined}
			tone="accent"
			icon="state"
			href="/banks"
		/>

		{#if anomalyTotal > 0}
			<PulseCard
				label="Critical signals"
				value={formatNumber(data.anomalyCounts.critical)}
				sublabel={data.meta.active_count > 0 ? `${((data.anomalyCounts.critical / data.meta.active_count) * 100).toFixed(0)}% of active banks` : `${data.anomalyCounts.warning} warnings`}
				footer={data.recentAnomalies[0] ? `${data.recentAnomalies[0].name ?? `CERT ${data.recentAnomalies[0].cert}`} · ${getFieldLabel(data.recentAnomalies[0].metric)}` : `${formatNumber(data.anomalyCounts.warning)} warning-level banks`}
				tone={data.anomalyCounts.critical > 0 ? 'negative' : 'warning'}
				icon="anomaly"
				href={data.recentAnomalies[0] ? `/banks/${data.recentAnomalies[0].cert}/risk` : '/industry'}
			/>
		{/if}

		{#if data.failureSummary.total_failures > 0}
			<PulseCard
				label="Recent failures"
				value={formatNumber(data.failureSummary.recent_5yr_count)}
				sublabel="in last 5 years"
				footer={mostRecentFailure ? `Most recent: ${mostRecentFailure.name ?? 'Unknown'} (${formatDate(mostRecentFailure.fail_date)})` : `${formatNumber(data.failureSummary.total_failures)} historical`}
				tone="warning"
				icon="failure"
				href="/industry/failures"
			/>
		{/if}

		{#if data.topMover}
			<PulseCard
				label="Top mover · ROA"
				value={`${data.topMover.delta_bps > 0 ? '+' : ''}${data.topMover.delta_bps}bps`}
				sublabel={data.topMover.name}
				footer={`Now ${formatPercent(data.topMover.current)} ROA`}
				tone={data.topMover.delta_bps > 0 ? 'positive' : 'negative'}
				icon="mover"
				href={`/banks/${data.topMover.cert}`}
			/>
		{/if}

		{#if data.macroSnapshot.fedfunds || data.macroSnapshot.dgs10}
			<PulseCard
				label="Macro context"
				value={data.macroSnapshot.fedfunds ? `${data.macroSnapshot.fedfunds.value.toFixed(2)}%` : (data.macroSnapshot.dgs10 ? `${data.macroSnapshot.dgs10.value.toFixed(2)}%` : '—')}
				sublabel={data.macroSnapshot.fedfunds ? 'Fed funds rate' : '10-year Treasury'}
				footer={macroSpread != null ? `10y–2y spread: ${macroSpread > 0 ? '+' : ''}${macroSpread.toFixed(2)}%` : (data.macroSnapshot.dgs10 ? `10y: ${data.macroSnapshot.dgs10.value.toFixed(2)}%` : undefined)}
				tone="accent"
				icon="macro"
				href="/macro"
			/>
		{/if}
	</div>
</section>

<!-- Watchlist (client-side only) -->
{#if watchedBanks.length > 0}
	<section class="mb-6">
		<header class="section-header">
			<div class="section-header__bar" style="background-color: var(--warning)"></div>
			<h2 class="section-header__title">Watchlist</h2>
			<span class="section-header__count">{watchedBanks.length} bank{watchedBanks.length !== 1 ? 's' : ''}</span>
			<button
				onclick={() => clearWatchlist()}
				class="section-header__action"
			>
				Clear all
			</button>
		</header>
		<div class="rounded-md bg-[--surface-1] divide-y divide-[--surface-2]" style="box-shadow: var(--shadow-sm)">
			{#each watchedBanks as bank}
				<div class="flex items-center justify-between px-3 py-2.5 group">
					<a href="/banks/{bank.cert}" class="flex items-center gap-2.5 min-w-0 flex-1 hover:text-[--accent] transition-colors">
						<div class="min-w-0">
							<span class="text-[13px] font-medium text-[--text-primary] group-hover:text-[--accent] transition-colors truncate block">{bank.name}</span>
							{#if bank.state}
								<span class="text-[11px] text-[--text-tertiary]">{bank.state}</span>
							{/if}
						</div>
					</a>
					<div class="flex items-center gap-4 shrink-0 ml-2">
						{#if bank.total_assets !== null}
							<span class="text-[12px] text-[--text-tertiary]">
								Assets <span class="font-medium text-[--text-primary] data-mono">{formatCurrency(bank.total_assets)}</span>
							</span>
						{/if}
						{#if bank.latest_roa !== null}
							<span class="text-[12px] text-[--text-tertiary]">
								ROA <span class="font-medium data-mono" style="color: {(bank.latest_roa ?? 0) >= 0 ? 'var(--positive)' : 'var(--negative)'}">{formatPercent(bank.latest_roa)}</span>
							</span>
						{/if}
						<button
							onclick={() => removeFromWatchlist(bank.cert)}
							class="text-[--text-disabled] hover:text-[--negative] transition-colors p-0.5"
							aria-label="Remove {bank.name} from watchlist"
						>
							<svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
								<path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
							</svg>
						</button>
					</div>
				</div>
			{/each}
		</div>
	</section>
{:else if watchlistLoading}
	<section class="mb-6">
		<header class="section-header">
			<div class="section-header__bar" style="background-color: var(--warning)"></div>
			<h2 class="section-header__title">Watchlist</h2>
		</header>
		<div class="rounded-md bg-[--surface-1] px-3 py-4 text-[13px] text-[--text-tertiary]" style="box-shadow: var(--shadow-sm)">
			Loading watchlist...
		</div>
	</section>
{/if}

<!-- Movers & shakers: actual QoQ ROA changes for $500M+ banks -->
{#if data.movers.up.length > 0 || data.movers.down.length > 0}
	<section class="mb-6">
		<header class="section-header">
			<div class="section-header__bar" style="background-color: var(--accent)"></div>
			<h2 class="section-header__title">Movers &amp; shakers</h2>
			<span class="section-header__count">
				ROA quarter-on-quarter · banks &gt; $500M ·
				<span style="color: var(--positive)">{formatNumber(data.movers.improved)} up</span>
				·
				<span style="color: var(--negative)">{formatNumber(data.movers.deteriorated)} down</span>
			</span>
		</header>
		<div class="grid grid-cols-1 md:grid-cols-2 gap-3">
			{#each [{ title: 'Improved', tone: 'positive', items: data.movers.up }, { title: 'Deteriorated', tone: 'negative', items: data.movers.down }] as col}
				<div class="movers-card">
					<div class="movers-card__head">
						<span class="movers-card__title" style:color="var(--{col.tone})">{col.title}</span>
						<span class="movers-card__count">{col.items.length}</span>
					</div>
					<ul class="movers-card__list">
						{#each col.items as m}
							<li>
								<a class="movers-card__row" href={`/banks/${m.cert}`}>
									<div class="movers-card__main">
										<span class="movers-card__name">{m.name}</span>
										<span class="movers-card__meta">
											{#if m.state}<span>{m.state}</span> · {/if}
											<span>{m.total_assets != null ? formatCurrency(m.total_assets) : ''}</span>
										</span>
									</div>
									<div class="movers-card__spark">
										<Sparkline data={m.roa_trend} width={64} height={20} showDot={true} />
									</div>
									<div class="movers-card__right">
										<span class="movers-card__delta data-mono" style:color="var(--{col.tone})">
											{m.delta_bps > 0 ? '+' : ''}{m.delta_bps}bps
										</span>
										<span class="movers-card__value data-mono">
											{formatPercent(m.curr)}
										</span>
									</div>
								</a>
							</li>
						{/each}
					</ul>
				</div>
			{/each}
		</div>
	</section>
{/if}

<!-- Industry trend charts -->
{#if trendSeries}
	<section class="mb-6">
		<header class="section-header">
			<div class="section-header__bar" style="background-color: var(--text-disabled)"></div>
			<h2 class="section-header__title">Industry trends</h2>
			<span class="section-header__count">last 12 quarters · medians</span>
			<a href="/industry" class="section-header__action">
				Full industry view →
			</a>
		</header>
		<div class="grid grid-cols-1 lg:grid-cols-2 gap-3">
			<div class="borderless-card p-3">
				<h3 class="text-[12px] font-semibold text-[--text-secondary] uppercase tracking-wider mb-2">ROA & NIM</h3>
				<TimeSeriesChart
					series={[
						{ key: 'roa', label: 'Median ROA', data: trendSeries.roa },
						{ key: 'nim', label: 'Median NIM', data: trendSeries.nim }
					]}
					yAxisFormat="percent"
					height="200px"
				/>
			</div>
			<div class="borderless-card p-3">
				<h3 class="text-[12px] font-semibold text-[--text-secondary] uppercase tracking-wider mb-2">ROE</h3>
				<TimeSeriesChart
					series={[
						{ key: 'roe', label: 'Median ROE', data: trendSeries.roe }
					]}
					yAxisFormat="percent"
					height="200px"
				/>
			</div>
		</div>
	</section>
{/if}

<!-- Anomalies + Top banks side by side -->
<section class="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
	<!-- Recent anomalies -->
	{#if data.recentAnomalies.length > 0}
		<div>
			<header class="section-header">
				<div class="section-header__bar" style="background-color: var(--negative)"></div>
				<h2 class="section-header__title">Recent anomalies</h2>
				<a href="/industry" class="section-header__action">View all →</a>
			</header>
			<div class="rounded-md bg-[--surface-1] divide-y divide-[--surface-2]" style="box-shadow: var(--shadow-sm)">
				{#each data.recentAnomalies as anomaly}
					<a href="/banks/{anomaly.cert}/risk" class="block px-3 py-2.5 hover:bg-[--accent-muted] transition-colors">
						<div class="flex items-center justify-between gap-2">
							<div class="flex items-center gap-2 min-w-0">
								<span class="inline-flex shrink-0 items-center rounded-sm px-1.5 py-0.5 text-[10px] font-medium tracking-wide uppercase
									{anomaly.severity === 'critical' ? 'bg-[--negative-muted] text-[--negative]' : 'bg-[--warning-muted] text-[--warning]'}">
									{anomaly.severity}
								</span>
								<span class="text-[13px] font-medium text-[--text-primary] truncate">{anomaly.name ?? `CERT ${anomaly.cert}`}</span>
							</div>
							<span class="text-[12px] font-medium text-[--text-secondary] shrink-0">{getFieldLabel(anomaly.metric)}</span>
						</div>
						{#if anomaly.description || anomaly.value !== null}
							<div class="mt-1 pl-12 text-[11px] text-[--text-tertiary] leading-snug">
								{#if anomaly.value !== null}
									<span class="data-mono font-medium text-[--text-secondary]">{formatPercent(anomaly.value)}</span>
								{/if}
								{#if anomaly.description}
									<span>{anomaly.value !== null ? ' · ' : ''}{anomaly.description}</span>
								{/if}
							</div>
						{/if}
					</a>
				{/each}
			</div>
		</div>
	{/if}

	<!-- Largest banks -->
	{#if data.topBanks.length > 0}
		<div>
			<header class="section-header">
				<div class="section-header__bar" style="background-color: var(--text-disabled)"></div>
				<h2 class="section-header__title">Largest banks by assets</h2>
				<a href="/banks?sort=assets&order=desc" class="section-header__action">View all →</a>
			</header>
			<div class="rounded-md bg-[--surface-1] divide-y divide-[--surface-2]" style="box-shadow: var(--shadow-sm)">
				{#each data.topBanks as bank, i}
					<a href="/banks/{bank.cert}" class="flex items-center justify-between px-3 py-2.5 hover:bg-[--accent-muted] transition-colors group">
						<div class="flex items-center gap-2.5 min-w-0">
							<span class="text-[11px] font-semibold text-[--text-disabled] w-4 text-right shrink-0">{i + 1}</span>
							<div class="min-w-0">
								<span class="text-[13px] font-medium text-[--text-primary] group-hover:text-[--accent] transition-colors truncate block">{bank.name}</span>
								{#if bank.state}
									<span class="text-[11px] text-[--text-tertiary]">{bank.state}</span>
								{/if}
							</div>
						</div>
						<div class="flex items-center gap-3 shrink-0 ml-2">
							{#if bank.roa_trend?.length >= 2}
								<div class="hidden sm:block" title="ROA trend (8 quarters)">
									<Sparkline data={bank.roa_trend} width={56} height={18} showDot={true} />
								</div>
							{/if}
							<div class="text-right">
								<span class="text-[13px] font-medium text-[--text-primary] data-mono">{formatCurrency(bank.total_assets)}</span>
								{#if bank.total_deposits}
									<span class="block text-[11px] text-[--text-tertiary] data-mono">{formatCurrency(bank.total_deposits)} dep</span>
								{/if}
							</div>
						</div>
					</a>
				{/each}
			</div>
		</div>
	{/if}
</section>

<!-- Footprint: real US state map -->
{#if data.stateDistribution.length > 0}
	<section class="mb-8">
		<header class="section-header">
			<div class="section-header__bar" style="background-color: var(--text-disabled)"></div>
			<h2 class="section-header__title">Banking footprint</h2>
			<span class="section-header__count">{data.stateDistribution.length} states · {formatNumber(data.meta.active_count)} banks</span>
			<div class="map-metric-toggle" role="tablist" aria-label="Map metric">
				<button
					type="button"
					role="tab"
					aria-selected={mapMetric === 'bank_count'}
					class:map-metric-toggle__btn--active={mapMetric === 'bank_count'}
					class="map-metric-toggle__btn"
					onclick={() => (mapMetric = 'bank_count')}
				>Bank count</button>
				<button
					type="button"
					role="tab"
					aria-selected={mapMetric === 'total_assets'}
					class:map-metric-toggle__btn--active={mapMetric === 'total_assets'}
					class="map-metric-toggle__btn"
					onclick={() => (mapMetric = 'total_assets')}
				>Total assets</button>
			</div>
		</header>
		<div class="grid grid-cols-1 lg:grid-cols-[1fr_260px] gap-4 items-start">
			<div class="rounded-md bg-[--surface-1] p-3" style="box-shadow: var(--shadow-sm)">
				<USStateMap
					data={data.stateDistribution}
					metric={mapMetric}
					onSelect={handleStateClick}
					height={400}
				/>
			</div>
			<aside class="rounded-md bg-[--surface-1] p-3" style="box-shadow: var(--shadow-sm)">
				<p class="text-[10px] font-semibold uppercase tracking-wider text-[--text-tertiary] mb-2">
					Top 10 by {mapMetric === 'total_assets' ? 'total assets' : 'bank count'}
				</p>
				<ol class="space-y-1">
					{#each visibleLeaders as s, i (s.state)}
						<li>
							<a href="/banks?state={s.state}" class="flex items-center gap-2 px-1.5 py-1 rounded hover:bg-[--accent-muted] transition-colors">
								<span class="text-[10px] font-semibold text-[--text-disabled] w-4 text-right">{i + 1}</span>
								<span class="text-[12px] font-medium text-[--text-primary] flex-1 truncate">{getStateName(s.state)}</span>
								<span class="text-[11px] text-[--text-tertiary] data-mono">
									{#if mapMetric === 'total_assets'}
										{formatCurrency(s.total_assets)}
									{:else}
										{s.bank_count}
									{/if}
								</span>
							</a>
						</li>
					{/each}
				</ol>
			</aside>
		</div>
	</section>
{/if}

<style>
	.pulse-strip {
		margin-top: 1.5rem;
		margin-bottom: 1.75rem;
	}
	.pulse-strip__grid {
		display: grid;
		gap: 0.625rem;
		grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
	}
	@media (max-width: 640px) {
		.pulse-strip__grid {
			grid-auto-flow: column;
			grid-auto-columns: minmax(78%, 1fr);
			grid-template-columns: none;
			overflow-x: auto;
			scroll-snap-type: x mandatory;
			padding-bottom: 0.5rem;
			margin: 0 -1rem;
			padding-left: 1rem;
			padding-right: 1rem;
		}
		.pulse-strip__grid > :global(*) {
			scroll-snap-align: start;
		}
	}

	.section-header {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		margin-bottom: 0.75rem;
	}
	.section-header__bar {
		width: 2px;
		height: 14px;
		border-radius: 1px;
	}
	.section-header__title {
		font-size: 14px;
		font-weight: 600;
		color: var(--text-primary);
		letter-spacing: -0.01em;
	}
	.section-header__count {
		font-size: 11px;
		color: var(--text-tertiary);
		margin-left: 0.125rem;
	}
	.section-header__action {
		margin-left: auto;
		font-size: 12px;
		font-weight: 500;
		color: var(--accent);
		text-decoration: none;
		background: none;
		border: none;
		padding: 0;
		font-family: inherit;
		cursor: pointer;
	}
	.section-header__action:hover { color: var(--accent-hover); }

	.movers-card {
		background-color: var(--surface-1);
		border-radius: 6px;
		box-shadow: var(--shadow-sm);
		overflow: hidden;
	}
	.movers-card__head {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		padding: 0.5rem 0.875rem;
		border-bottom: 1px solid var(--border-muted);
	}
	.movers-card__title {
		font-size: 11px;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.08em;
	}
	.movers-card__count {
		font-size: 10px;
		color: var(--text-tertiary);
		font-variant-numeric: tabular-nums;
	}
	.movers-card__list { list-style: none; margin: 0; padding: 0; }
	.movers-card__list li + li { border-top: 1px solid var(--surface-2); }
	.movers-card__row {
		display: grid;
		grid-template-columns: 1fr auto auto;
		gap: 0.625rem;
		align-items: center;
		padding: 0.5rem 0.875rem;
		text-decoration: none;
		color: var(--text-primary);
		transition: background-color 0.1s ease;
	}
	.movers-card__row:hover { background-color: var(--accent-muted); }
	.movers-card__main {
		display: flex;
		flex-direction: column;
		gap: 2px;
		min-width: 0;
	}
	.movers-card__name {
		font-size: 13px;
		font-weight: 500;
		color: var(--text-primary);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.movers-card__meta {
		font-size: 11px;
		color: var(--text-tertiary);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.movers-card__spark {
		display: none;
		opacity: 0.85;
	}
	@media (min-width: 480px) {
		.movers-card__spark { display: block; }
	}
	.movers-card__right {
		text-align: right;
		display: flex;
		flex-direction: column;
		align-items: flex-end;
		gap: 1px;
	}
	.movers-card__delta {
		font-size: 12px;
		font-weight: 600;
	}
	.movers-card__value {
		font-size: 11px;
		color: var(--text-tertiary);
	}

	.map-metric-toggle {
		margin-left: auto;
		display: inline-flex;
		border: 1px solid var(--border-muted);
		border-radius: 5px;
		overflow: hidden;
		background-color: var(--surface-2);
	}
	.map-metric-toggle__btn {
		padding: 0.25rem 0.625rem;
		font-size: 11px;
		font-weight: 500;
		color: var(--text-secondary);
		background: transparent;
		border: none;
		cursor: pointer;
		transition: background-color 0.15s ease, color 0.15s ease;
		font-family: inherit;
	}
	.map-metric-toggle__btn:hover { color: var(--text-primary); }
	.map-metric-toggle__btn--active {
		background-color: var(--surface-1);
		color: var(--accent);
		font-weight: 600;
	}
</style>
