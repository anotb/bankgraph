<script lang="ts">
	import { page } from '$app/state';
	import { browser } from '$app/environment';
	import AgentTile from './AgentTile.svelte';
	import { quarterLabel } from '$lib/atlas/format';
	import { getTheme, toggleTheme } from '$lib/stores/theme.svelte';

	let { latestQuarter, onsearch }: { latestQuarter: string | null; onsearch: () => void } = $props();
	let modKey = $derived(browser && /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘' : 'Ctrl');
	let night = $derived(getTheme() === 'dark');
	const links = [
		{ href: '/b', label: 'Research' },
		{ href: '/banks', label: 'Institutions' },
		{ href: '/system', label: 'Banking system' },
		{ href: '/economy', label: 'Economy' },
		{ href: '/methods', label: 'Data & methods' }
	];
	function active(href: string) { return page.url.pathname === href || page.url.pathname.startsWith(href + '/') || (href === '/b' && page.url.pathname.startsWith('/bank/')); }
</script>

<header class="topbar">
	<a href="/" class="brand" aria-label="Bankgraph home"><span class="mark" aria-hidden="true"></span><span class="name">Bankgraph</span></a>
	<nav class="links" aria-label="Main">
		{#each links as link}<a href={link.href} aria-current={active(link.href) ? 'page' : undefined}>{link.label}</a>{/each}
	</nav>
	<button type="button" class="k" onclick={onsearch} aria-label="Search banks, places, measures, or ask a question">
		<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5"></circle><path d="m16 16 4 4"></path></svg>
		<span>Search or ask</span>
		<kbd>{modKey} K</kbd>
	</button>
	<div class="right">
		{#if latestQuarter}<span class="status" title="Latest published FDIC reporting period"><i></i>Data through {quarterLabel(latestQuarter)}</span>{/if}
		<AgentTile compact />
		<button type="button" class="night-toggle" onclick={toggleTheme} aria-pressed={night} aria-label={night ? 'Switch to day' : 'Switch to night'}>
			<svg viewBox="0 0 24 24" aria-hidden="true">{#if night}<circle cx="12" cy="12" r="4.5"></circle><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1 7 17M17 7l2.1-2.1"></path>{:else}<path d="M20 14.5A8 8 0 1 1 9.5 4a7 7 0 0 0 10.5 10.5Z"></path>{/if}</svg>
		</button>
	</div>
</header>

<style>
	.topbar { position: sticky; top: 0; z-index: 30; height: 48px; display: grid; grid-template-columns: auto auto 1fr auto; align-items: center; gap: 22px; padding: 0 20px; background: var(--bg); border-bottom: 1px solid var(--rule); }
	.brand { display: inline-flex; align-items: center; gap: 9px; color: var(--ink); text-decoration: none; font-weight: 650; font-size: 14px; letter-spacing: -0.01em; }
	.mark { width: 16px; height: 16px; border-radius: 4px; background: var(--ink); position: relative; flex: none; }
	.mark::after { content: ''; position: absolute; left: 4px; top: 4px; width: 8px; height: 8px; border-radius: 2px; background: var(--accent); }
	.links { display: flex; gap: 4px; }
	.links a { color: var(--ink-2); text-decoration: none; font-size: 12.5px; font-weight: 500; padding: 5px 9px; border-radius: 4px; transition: background 140ms ease-out, color 140ms ease-out; }
	.links a:hover { color: var(--ink); background: var(--surface-2); }
	.links a[aria-current] { color: var(--ink); background: var(--surface); box-shadow: 0 0 0 1px var(--rule); }
	.k { height: 30px; max-width: 420px; width: 100%; justify-self: center; border: 1px solid var(--rule); background: var(--surface); display: flex; align-items: center; padding: 0 10px; gap: 9px; color: var(--ink-3); font-size: 12.5px; cursor: text; border-radius: 4px; transition: border-color 140ms ease-out; }
	.k:hover { border-color: var(--ink-4); }
	.k svg { width: 14px; fill: none; stroke: currentColor; stroke-width: 1.8; flex: none; }
	.k span { flex: 1; text-align: left; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
	@media (max-width: 1180px) { .k { min-width: 160px; } .k kbd { display: none; } .links a { padding: 5px 7px; } }
	.k kbd { font-family: var(--font-mono); font-size: 10.5px; border: 1px solid var(--rule); border-radius: 3px; padding: 1px 5px; color: var(--ink-3); }
	.right { display: flex; align-items: center; gap: 12px; }
	.status { display: inline-flex; align-items: center; gap: 6px; color: var(--ink-2); font-size: 12px; white-space: nowrap; }
	.status i { width: 7px; height: 7px; background: var(--favorable); border-radius: 50%; display: inline-block; }
	.night-toggle { border: 1px solid transparent; background: transparent; color: var(--ink-2); width: 28px; height: 28px; display: grid; place-items: center; cursor: pointer; border-radius: 4px; }
	.night-toggle:hover { color: var(--ink); background: var(--surface-2); }
	.night-toggle svg { width: 15px; fill: none; stroke: currentColor; stroke-width: 1.8; }
	@media (max-width: 1100px) { .status { display: none; } }
	@media (max-width: 860px) {
		.topbar { grid-template-columns: auto 1fr auto; gap: 10px; padding: 0 12px; }
		.links { display: none; }
		.k span, .k kbd { display: none; }
		.k { width: 32px; max-width: none; justify-self: end; justify-content: center; padding: 0; }
		.name { display: none; }
	}
</style>
