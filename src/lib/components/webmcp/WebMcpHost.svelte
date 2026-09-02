<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/stores';
	import { createWebMcpToolHost, isWebMcpDebugSearch } from '$lib/webmcp/index.js';
	import type { WebMcpToolDefinition, WebMcpToolHost } from '$lib/webmcp/index.js';
	import WebMcpDiagnostics from './WebMcpDiagnostics.svelte';

	let {
		scope,
		tools,
		signal,
		host,
		showDiagnostics = false,
		diagnosticsClass = ''
	}: {
		scope: string;
		tools: readonly WebMcpToolDefinition[];
		signal?: AbortSignal;
		host?: WebMcpToolHost;
		showDiagnostics?: boolean;
		diagnosticsClass?: string;
	} = $props();

	let activeHost = $state<WebMcpToolHost | null>(null);
	let mounted = $state(false);
	let ownsHost = false;
	let lastScope = '';
	let diagnosticsVisible = $derived(
		showDiagnostics || isWebMcpDebugSearch($page.url.search)
	);

	onMount(() => {
		if (host) {
			activeHost = host;
		} else {
			activeHost = createWebMcpToolHost({ document });
			ownsHost = true;
		}
		lastScope = scope;
		mounted = true;
		return () => {
			mounted = false;
			if (ownsHost) activeHost?.dispose('top-level WebMCP host unmounted');
			else activeHost?.disposeScope(lastScope, 'route WebMCP host unmounted');
		};
	});

	$effect(() => {
		if (!mounted || !activeHost) return;
		const nextScope = scope;
		const nextTools = tools;
		const nextSignal = signal;
		if (lastScope !== nextScope) {
			activeHost.disposeScope(lastScope, 'route scope changed');
			lastScope = nextScope;
		}
		void activeHost.syncScope(nextScope, nextTools, { signal: nextSignal });
	});
</script>

{#if diagnosticsVisible && activeHost}
	<WebMcpDiagnostics host={activeHost} class={diagnosticsClass} />
{/if}
