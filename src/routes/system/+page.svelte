<script lang="ts">
	import SystemSurface from '$lib/atlas/system/SystemSurface.svelte';
	import { count } from '$lib/atlas/format';
	import type { PageData } from '../$types';
	let { data }: { data: PageData & { activeCount: number } } = $props();
</script>

<svelte:head><title>Banking system · Bankgraph</title><meta name="description" content="The U.S. banking system by size group over ten years: assets, deposits, margins, credit quality, breadth of the latest quarter's move, and where banks are headquartered." /></svelte:head>

<div class="page">
	<div class="head"><h1>Banking system</h1><span class="dim">{count(data.activeCount)} active institutions · every FDIC filer, summed or taken at the median · quarterly since 1992</span></div>
	<section class="grid">
		<SystemSurface {data} full={true} />
	</section>
</div>

<style>
	.page { padding: 14px 20px 20px; display: grid; gap: 12px; }
	.head { display: flex; align-items: baseline; gap: 12px; flex-wrap: wrap; }
	h1 { font-size: 18px; font-weight: 650; margin: 0; letter-spacing: -0.01em; }
	.grid { display: grid; grid-template-columns: repeat(12, minmax(0, 1fr)); gap: 12px; grid-template-areas: "sys sys sys sys sys sys sys sys sys sys sys sys" "geo geo geo geo geo geo geo geo st st st st"; }
	.grid :global(.plate.system) { grid-area: sys; }
	.grid :global(.plate.geo) { grid-area: geo; }
	.grid :global(.plate.states) { grid-area: st; }
	@media (max-width: 1024px) { .grid { grid-template-columns: repeat(6, minmax(0, 1fr)); grid-template-areas: "sys sys sys sys sys sys" "geo geo geo geo geo geo" "st st st st st st"; } }
	@media (max-width: 640px) { .page { padding: 10px 12px 16px; } .grid { grid-template-columns: minmax(0, 1fr); grid-template-areas: "sys" "geo" "st"; gap: 10px; } }
</style>
