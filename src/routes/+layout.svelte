<script lang="ts">
	import '../app.css';
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import TopBar from '$lib/atlas/shell/TopBar.svelte';
	import CommandPalette from '$lib/atlas/shell/CommandPalette.svelte';
	import { SiteWebMcp } from '$lib/components/webmcp';

	let { children, data } = $props();
	let palette: ReturnType<typeof CommandPalette> | undefined = $state();
	let onBoard = $derived(page.url.pathname === '/b' || page.url.pathname.startsWith('/b/') || page.url.pathname.startsWith('/bank/'));

	onMount(() => {
		const openSearch = () => palette?.show();
		window.addEventListener('atlas:search', openSearch);
		try {
			const density = localStorage.getItem('atlas.density');
			if (density) document.documentElement.dataset.density = density;
		} catch { /* storage unavailable */ }
		return () => window.removeEventListener('atlas:search', openSearch);
	});
</script>

<a href="#main" class="skip">Skip to content</a>
<TopBar latestQuarter={data.latestQuarter} onsearch={() => palette?.show()} />
{#if !onBoard}
	<SiteWebMcp latestQuarter={data.latestQuarter} activeBankCount={data.activeBankCount} liveDataState={data.liveData.state} />
{/if}
<main id="main" class:board={onBoard}>
	{@render children()}
</main>
{#if !onBoard}
	<footer class="foot">
		<span>Sources: FDIC BankFind and Call Reports · Federal Reserve H.8 and H.15 · U.S. Treasury · Bureau of Labor Statistics</span>
		<span class="links"><a href="/methods">Data and methods</a><a href="/privacy">Privacy</a></span>
	</footer>
{/if}
<CommandPalette bind:this={palette} />

<style>
	.skip { position: absolute; left: -9999px; top: 8px; z-index: 200; background: var(--ink); color: var(--bg); padding: 6px 10px; border-radius: 4px; }
	.skip:focus { left: 8px; }
	main { min-height: calc(100vh - 48px); }
	main.board { min-height: 0; height: calc(100dvh - 48px); display: flex; flex-direction: column; }
	.foot { padding: 18px 20px 22px; display: flex; justify-content: space-between; gap: 24px; color: var(--ink-3); font-size: 12px; }
	.foot .links { display: flex; gap: 16px; white-space: nowrap; }
	.foot a { color: var(--ink-2); text-decoration: none; }
	.foot a:hover { color: var(--ink); }
	@media (max-width: 720px) { .foot { flex-direction: column; gap: 8px; } }
</style>
