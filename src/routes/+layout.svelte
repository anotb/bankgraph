<script lang="ts">
	import '../app.css';
	import { page } from '$app/stores';
	import ModeToggle from '$lib/components/layout/ModeToggle.svelte';
	import ThemeToggle from '$lib/components/layout/ThemeToggle.svelte';
	import KeyboardShortcuts from '$lib/components/layout/KeyboardShortcuts.svelte';
	import NavigationProgress from '$lib/components/layout/NavigationProgress.svelte';
	import { getMode } from '$lib/stores/mode.svelte.js';

	let { children, data } = $props();
	let currentMode = $derived(getMode());

	function isActive(href: string): boolean {
		const path = $page.url.pathname;
		if (href === '/') return path === '/';
		return path.startsWith(href);
	}
</script>

<NavigationProgress />
<a href="#main-content" class="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[200] focus:px-4 focus:py-2 focus:rounded focus:bg-[--accent] focus:text-white focus:text-sm focus:font-medium">
	Skip to content
</a>
<div class="min-h-screen bg-[--surface-0] flex flex-col">
	<!-- Nav -->
	<nav class="bg-[--surface-1] sticky top-0 z-50" aria-label="Main" style="box-shadow: var(--shadow-md)">
		<!-- Power mode indicator -->
		{#if currentMode === 'power'}
			<div class="h-[1px] bg-gradient-to-r from-transparent via-[--accent] to-transparent"></div>
		{/if}
		<div class="max-w-[1400px] mx-auto px-4 h-12 sm:h-11 flex items-center gap-4 sm:gap-6">
			<a href="/" class="text-[15px] font-semibold tracking-tight text-[--text-primary] flex items-center gap-1.5 shrink-0">
				<span class="text-[--accent] font-bold">BDE</span>
				<span class="hidden sm:inline text-[13px] font-normal text-[--text-secondary]">Bank Data Explorer</span>
			</a>

			<div class="flex items-center gap-1 sm:gap-5 text-[13px] overflow-x-auto scrollbar-hide">
				{#each [
					{ href: '/banks', label: 'Banks' },
					{ href: '/industry', label: 'Industry' },
					{ href: '/macro', label: 'Macro' },
					{ href: '/compare', label: 'Compare' },
					{ href: '/glossary', label: 'Glossary' }
				] as link}
					<a
						href={link.href}
						aria-current={isActive(link.href) ? "page" : undefined}
						class="relative py-3 sm:py-0 px-2 sm:px-0 sm:pb-[9px] sm:-mb-[9px] transition-colors duration-150 whitespace-nowrap
							{isActive(link.href) ? 'text-[--accent-text] font-semibold' : 'text-[--text-secondary] hover:text-[--text-primary] font-medium'}"
					>
						{link.label}{#if link.href === '/banks' && data.activeBankCount}<span class="text-[11px] text-[--text-tertiary] font-normal ml-0.5">({data.activeBankCount.toLocaleString()})</span>{/if}
						{#if isActive(link.href)}
							<span class="absolute bottom-0 left-0 right-0 h-[2.5px] bg-[--accent] rounded-full"></span>
						{/if}
					</a>
				{/each}
			</div>

			<div class="ml-auto flex items-center gap-1 sm:gap-2 shrink-0">
				<ThemeToggle />
				<ModeToggle />
			</div>
		</div>
	</nav>

	<!-- Main content -->
	<main id="main-content" class="max-w-[1400px] mx-auto w-full px-4 py-5 flex-1">
		{#key $page.url.pathname}
			<div class="animate-fade-in">
				{@render children()}
			</div>
		{/key}
	</main>

	<!-- Footer -->
	<footer class="border-t border-[--border-muted] px-4 py-3 text-[11px] text-[--text-tertiary]">
		<div class="max-w-[1400px] mx-auto flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
			<p>Data from <a href="https://banks.data.fdic.gov" class="underline hover:text-[--text-secondary]">FDIC BankFind</a> & <a href="https://fred.stlouisfed.org" class="underline hover:text-[--text-secondary]">FRED</a></p>
			<p>Built with SvelteKit</p>
		</div>
	</footer>
</div>

<KeyboardShortcuts />
