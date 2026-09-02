<script lang="ts">
	import BoardHost from '$lib/atlas/board/BoardHost.svelte';
	let { data } = $props();
</script>

<svelte:head><title>Board · Bankgraph</title><meta name="robots" content="noindex" /></svelte:head>

<BoardHost launch={data.launch} persist={true} release={data.release} releaseGeneration={data.releaseGeneration} pageLoadedAt={data.pageLoadedAt} cleanUrl="/b" />
