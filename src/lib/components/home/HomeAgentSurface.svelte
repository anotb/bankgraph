<script lang="ts">
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';
	import { createWebMcpToolHost, type WebMcpToolHost } from '$lib/webmcp';
	import AgentCapabilityPanel from '$lib/components/webmcp/AgentCapabilityPanel.svelte';
	import { createHomeAgentTools } from './home-agent-tools';

	const scope = 'bankgraph-home';
	const prompts = [
		'Build a Research board showing how banks that failed from 2007 to 2012 changed in the eight quarters before failure. Add the historical trajectory, compare the strongest signals, and show which active banks have the most similar reported patterns.',
		'Was the latest quarter’s change in U.S. bank deposits broad across the system, or concentrated in a few institutions? Build a system trend, a table of the largest contributors, and a comparison across bank sizes.',
		'Find active banks whose deposits declined in at least three of the last four quarters while noncurrent loans rose. Build a comparison table and charts against a sensible peer group, then add a short takeaway tied to those views.'
	] as const;
	let host = $state<WebMcpToolHost | null>(null);

	onMount(() => {
		const activeHost = createWebMcpToolHost({ document });
		host = activeHost;
		const tools = createHomeAgentTools({ fetch: window.fetch.bind(window), openWorkspace: (href) => goto(href) });
		void activeHost.syncScope(scope, tools);
		return () => { activeHost.dispose('homepage unmounted'); host = null; };
	});
</script>

<AgentCapabilityPanel {host} {scope} {prompts} />
