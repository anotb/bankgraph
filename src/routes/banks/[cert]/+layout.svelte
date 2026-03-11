<script lang="ts">
	import { page } from '$app/stores';

	let { data, children } = $props();

	let tabs = $derived([
		{ label: 'Overview', href: `/banks/${data.bank.cert}`, comingSoon: false },
		{ label: 'Financials', href: `/banks/${data.bank.cert}/financials`, comingSoon: true },
		{ label: 'Peers', href: `/banks/${data.bank.cert}/peers`, comingSoon: true },
		{ label: 'Risk', href: `/banks/${data.bank.cert}/risk`, comingSoon: true }
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

<div class="space-y-4">
	<!-- Back link -->
	<a
		href="/banks"
		class="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
	>
		&larr; All Banks
	</a>

	<!-- Header -->
	<div>
		<h1 class="text-2xl font-bold text-gray-900">{data.bank.name}</h1>
		<p class="text-sm text-gray-500">CERT #{data.bank.cert}</p>
	</div>

	<!-- Tab navigation -->
	<nav class="border-b border-gray-200">
		<div class="flex gap-6 -mb-px">
			{#each tabs as tab}
				<a
					href={tab.href}
					class="inline-flex items-center gap-1 border-b-2 px-1 py-3 text-sm font-medium transition-colors
						{isActive(tab.href)
							? 'border-blue-600 text-blue-600'
							: tab.comingSoon
								? 'border-transparent text-gray-400 hover:text-gray-500 hover:border-gray-300'
								: 'border-transparent text-gray-600 hover:text-gray-900 hover:border-gray-300'}"
				>
					{tab.label}
					{#if tab.comingSoon}
						<span class="text-xs text-gray-400">(coming soon)</span>
					{/if}
				</a>
			{/each}
		</div>
	</nav>

	<!-- Tab content -->
	{@render children()}
</div>
