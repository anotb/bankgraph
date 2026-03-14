<script lang="ts">
	import { page } from '$app/stores';
	import AnomalyBadge from '$lib/components/data/AnomalyBadge.svelte';

	let { data, children } = $props();

	let hasPeerData = $derived(
		(data.peerComparison ?? []).length > 0 &&
		(data.peerComparison ?? []).some((m: { percentile: number | null }) => m.percentile !== null)
	);
	let hasCriticalAnomalies = $derived((data.anomalyCounts?.critical ?? 0) > 0);

	let tabs = $derived([
		{ label: 'Overview', href: `/banks/${data.bank.cert}`, comingSoon: false },
		{ label: 'Financials', href: `/banks/${data.bank.cert}/financials`, comingSoon: false },
		{ label: 'Peers', href: `/banks/${data.bank.cert}/peers`, comingSoon: false },
		{ label: 'Risk', href: `/banks/${data.bank.cert}/risk`, comingSoon: false }
	]);

	let basePath = $derived(`/banks/${data.bank.cert}`);
	let currentPath = $derived($page.url.pathname);

	function isActive(href: string): boolean {
		if (href === basePath) {
			return currentPath === href;
		}
		return currentPath.startsWith(href);
	}

	let location = $derived(
		[data.bank.city, data.bank.state].filter(Boolean).join(', ')
	);

	let isActiveProp = $derived(data.bank.active === 1);
</script>

<svelte:head>
	<title>{data.bank.name} | Bank Data Explorer</title>
	<meta name="description" content="Financial overview, trends, peer comparison, and risk profile for {data.bank.name}." />
	<meta property="og:title" content="{data.bank.name} | Bank Data Explorer" />
	<meta property="og:description" content="Financial overview, trends, peer comparison, and risk profile for {data.bank.name}." />
</svelte:head>

<div class="space-y-4">
	<!-- Breadcrumb navigation -->
	<nav aria-label="Breadcrumb" class="text-[13px]">
		<ol class="flex items-center gap-1.5">
			<li>
				<a
					href="/"
					class="text-[--text-tertiary] hover:text-[--accent] transition-colors"
				>Home</a>
			</li>
			<li aria-hidden="true" class="text-[--text-disabled] select-none">/</li>
			<li>
				<a
					href="/banks"
					class="text-[--text-tertiary] hover:text-[--accent] transition-colors"
				>Banks</a>
			</li>
			<li aria-hidden="true" class="text-[--text-disabled] select-none">/</li>
			<li>
				<span class="text-[--text-secondary] font-medium" aria-current="page">{data.bank.name}</span>
			</li>
		</ol>
	</nav>

	<!-- Bank header card -->
	<header
		class="rounded-lg p-5 border border-[--border-muted]"
		style="background-color: var(--surface-1); box-shadow: var(--shadow-sm);"
		aria-label="Bank details for {data.bank.name}"
	>
		<div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
			<!-- Left: name, location, metadata -->
			<div class="space-y-2 min-w-0">
				<div class="flex items-center gap-3 flex-wrap">
					<h1 class="text-2xl font-semibold text-[--text-primary] truncate">{data.bank.name}</h1>
					<!-- Active/inactive badge -->
					{#if isActiveProp}
						<span class="inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold tracking-wide bg-[--positive-muted] text-[--positive]">
							Active
						</span>
					{:else}
						<span class="inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold tracking-wide bg-[--negative-muted] text-[--negative]">
							Inactive
						</span>
					{/if}
					{#if data.anomalyCounts && (data.anomalyCounts.critical > 0 || data.anomalyCounts.warning > 0)}
						<AnomalyBadge
							critical={data.anomalyCounts.critical}
							warning={data.anomalyCounts.warning}
							info={data.anomalyCounts.info}
						/>
					{/if}
				</div>

				<div class="flex items-center gap-4 flex-wrap text-[13px] text-[--text-secondary]">
					{#if location}
						<span class="inline-flex items-center gap-1.5">
							<svg class="w-3.5 h-3.5 text-[--text-tertiary] shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" aria-hidden="true">
								<path stroke-linecap="round" stroke-linejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
								<path stroke-linecap="round" stroke-linejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
							</svg>
							{location}
						</span>
					{/if}
					<span class="inline-flex items-center gap-1.5">
						<span class="text-[--text-tertiary]">CERT</span>
						<span class="data-mono font-medium text-[--text-primary]">#{data.bank.cert}</span>
					</span>
					{#if data.bank.charter_class}
						<span class="inline-flex items-center gap-1.5">
							<span class="text-[--text-tertiary]">Charter</span>
							<span class="font-medium">{data.bank.charter_class}</span>
						</span>
					{/if}
					{#if data.bank.regulator}
						<span class="inline-flex items-center gap-1.5">
							<span class="text-[--text-tertiary]">Regulator</span>
							<span class="font-medium">{data.bank.regulator}</span>
						</span>
					{/if}
				</div>
			</div>
		</div>
	</header>

	<!-- Tab navigation -->
	<nav
		aria-label="Bank detail sections"
		class="rounded-lg border border-[--border-muted] overflow-x-auto scrollbar-hide"
		style="background-color: var(--surface-1); box-shadow: var(--shadow-xs);"
	>
		<div class="flex gap-0 whitespace-nowrap px-1 py-1" role="tablist" aria-label="Bank sections">
			{#each tabs as tab}
				{@const active = isActive(tab.href)}
				<a
					href={tab.href}
					role="tab"
					aria-selected={active}
					aria-label="{tab.label} section{tab.comingSoon ? ' (coming soon)' : ''}"
					class="relative inline-flex items-center gap-1.5 rounded-md px-4 py-2 text-[13px] font-medium transition-all duration-150
						{active
							? 'text-[--accent-text]'
							: tab.comingSoon
								? 'text-[--text-disabled] hover:text-[--text-tertiary]'
								: 'text-[--text-tertiary] hover:text-[--text-primary] hover:bg-[--surface-2]'}"
					style={active ? 'background-color: var(--accent-muted); box-shadow: var(--shadow-xs);' : ''}
				>
					{tab.label}
					{#if tab.label === 'Peers' && hasPeerData}
						<span class="w-1.5 h-1.5 rounded-full bg-[--accent] opacity-60" aria-label="Peer data available"></span>
					{/if}
					{#if tab.label === 'Risk' && hasCriticalAnomalies}
						<span class="w-1.5 h-1.5 rounded-full bg-[--negative]" aria-label="Critical anomalies detected"></span>
					{/if}
					{#if tab.comingSoon}
						<span class="text-[10px] text-[--text-disabled]">(soon)</span>
					{/if}
				</a>
			{/each}
		</div>
	</nav>

	<!-- Tab content -->
	<div role="tabpanel" aria-label="Tab content">
		{@render children()}
	</div>
</div>
