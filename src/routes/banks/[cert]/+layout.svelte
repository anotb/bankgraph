<script lang="ts">
	import { page } from '$app/stores';
	import AnomalyBadge from '$lib/components/data/AnomalyBadge.svelte';

	let { data, children } = $props();

	let tabs = $derived([
		{ label: 'Overview', href: `/banks/${data.bank.cert}`, comingSoon: false },
		{ label: 'Financials', href: `/banks/${data.bank.cert}/financials`, comingSoon: false },
		{ label: 'Peers', href: `/banks/${data.bank.cert}/peers`, comingSoon: false },
		{ label: 'Risk', href: `/banks/${data.bank.cert}/risk`, comingSoon: false }
	]);

	let basePath = $derived(`/banks/${data.bank.cert}`);
	let currentPath = $derived($page.url.pathname);

	function isActive(href: string): boolean {
		// Overview tab: exact match only
		if (href === basePath) {
			return currentPath === href;
		}
		// Other tabs: prefix match
		return currentPath.startsWith(href);
	}
</script>

<svelte:head>
	<title>{data.bank.name} | Bank Data Explorer</title>
</svelte:head>

<div class="space-y-3">
	<!-- Back link -->
	<a
		href="/banks"
		class="inline-flex items-center gap-1 text-[13px] text-[--text-tertiary] hover:text-[--text-primary] transition-colors"
	>
		&larr; All Banks
	</a>

	<!-- Header -->
	<div>
		<div class="flex items-center gap-2 flex-wrap">
			<h1 class="text-2xl font-semibold text-[--text-primary]">{data.bank.name}</h1>
			{#if data.anomalyCounts && (data.anomalyCounts.critical > 0 || data.anomalyCounts.warning > 0)}
				<AnomalyBadge
					critical={data.anomalyCounts.critical}
					warning={data.anomalyCounts.warning}
					info={data.anomalyCounts.info}
				/>
			{/if}
		</div>
		<p class="text-[13px] text-[--text-tertiary] data-mono">CERT  #{data.bank.cert}</p>
	</div>

	<!-- Tab navigation -->
	<nav class="border-b border-[--border-muted] -mx-4 px-4">
		<div class="flex gap-0 -mb-px">
			{#each tabs as tab}
				<a
					href={tab.href}
					class="inline-flex items-center gap-1 border-b-2 px-4 py-2.5 text-[13px] font-medium transition-colors -mb-px
						{isActive(tab.href)
							? 'border-[--accent] text-[--accent]'
							: tab.comingSoon
								? 'border-transparent text-[--text-disabled] hover:text-[--text-tertiary] hover:border-[--border]'
								: 'border-transparent text-[--text-tertiary] hover:text-[--text-secondary] hover:border-[--border]'}"
				>
					{tab.label}
					{#if tab.comingSoon}
						<span class="text-[10px] text-[--text-disabled]">(soon)</span>
					{/if}
				</a>
			{/each}
		</div>
	</nav>

	<!-- Tab content -->
	{@render children()}
</div>
