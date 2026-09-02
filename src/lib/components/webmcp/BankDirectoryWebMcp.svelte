<script lang="ts">
	import {
		createBankDirectoryRouteTools,
		createRouteWorkspaceBridge,
		type BankDirectoryRouteData
	} from '$lib/webmcp/index.js';
	import WebMcpHost from './WebMcpHost.svelte';

	let { directory }: { directory: BankDirectoryRouteData } = $props();

	const bridge = createRouteWorkspaceBridge();
	let tools = $derived(createBankDirectoryRouteTools(directory, bridge));
</script>

<WebMcpHost scope="banks-directory" {tools} />
