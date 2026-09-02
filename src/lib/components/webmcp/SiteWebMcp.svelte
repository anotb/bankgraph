<script lang="ts">
	import { browser } from '$app/environment';
	import { page } from '$app/state';
	import { onMount } from 'svelte';
	import { agentPresence } from '$lib/atlas/agent.svelte';
	import { getTheme, setTheme } from '$lib/stores/theme.svelte';
	import {
		createBrowserBankSearch,
		createSiteWebMcpTools,
		createWebMcpToolHost
	} from '$lib/webmcp';
	import WebMcpHost from './WebMcpHost.svelte';

	let {
		latestQuarter,
		activeBankCount,
		liveDataState
	}: {
		latestQuarter: string | null;
		activeBankCount: number;
		liveDataState: 'live' | 'unavailable';
	} = $props();

	const scope = 'bankgraph-site';
	const host = browser ? createWebMcpToolHost({ document }) : null;
	const searchBanks = createBrowserBankSearch({ getAsOf: () => latestQuarter });
	let tools = $derived(createSiteWebMcpTools({
		context: () => ({
			path: `${page.url.pathname}${page.url.search}`,
			latestQuarter,
			activeBankCount,
			liveDataState
		}),
		searchBanks,
		open: (path) => window.setTimeout(() => window.location.assign(path), 40),
		appearance: getTheme,
		setAppearance: setTheme
	}));

	onMount(() => {
		agentPresence.attach(host, scope);
		return () => agentPresence.detach();
	});
</script>

<WebMcpHost {scope} {tools} host={host ?? undefined} />
