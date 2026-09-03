<script lang="ts">
	import {
		createMacroRouteTools,
		createRouteWorkspaceBridge,
		type MacroRouteData
	} from '$lib/webmcp';
	import WebMcpHost from './WebMcpHost.svelte';

	let { economy }: { economy: MacroRouteData } = $props();
	const bridge = createRouteWorkspaceBridge();
	let tools = $derived(createMacroRouteTools(economy, bridge));
</script>

<WebMcpHost scope="economy-page" {tools} />
