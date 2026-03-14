<script lang="ts">
	import '../app.css';
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import ModeToggle from '$lib/components/layout/ModeToggle.svelte';
	import ThemeToggle from '$lib/components/layout/ThemeToggle.svelte';
	import KeyboardShortcuts from '$lib/components/layout/KeyboardShortcuts.svelte';
	import NavigationProgress from '$lib/components/layout/NavigationProgress.svelte';
	import ScrollToTop from '$lib/components/layout/ScrollToTop.svelte';
	import SearchBar from '$lib/components/data/SearchBar.svelte';
	import { getMode } from '$lib/stores/mode.svelte.js';
	import { formatNumber, formatDate } from '$lib/utils/formatters.js';

	let { children, data } = $props();
	let currentMode = $derived(getMode());
	let keyboardShortcutsRef: ReturnType<typeof KeyboardShortcuts> | undefined = $state();
	let navSearchExpanded = $state(false);
	let navSearchEl: HTMLDivElement | undefined = $state();

	function isActive(href: string): boolean {
		const path = $page.url.pathname;
		if (href === '/') return path === '/';
		return path.startsWith(href);
	}

	function handleNavSearch(query: string) {
		if (query) {
			goto(`/banks?q=${encodeURIComponent(query)}`);
			navSearchExpanded = false;
		}
	}

	function handleNavSelect(cert: number) {
		goto(`/banks/${cert}`);
		navSearchExpanded = false;
	}

	function toggleNavSearch() {
		navSearchExpanded = !navSearchExpanded;
		if (navSearchExpanded) {
			// Focus the input after it renders
			setTimeout(() => {
				navSearchEl?.querySelector('input')?.focus();
			}, 50);
		}
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

			<div class="relative flex-1 min-w-0">
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
								{isActive(link.href) ? 'text-[--text-primary] font-medium' : 'text-[--text-secondary] hover:text-[--text-primary]'}"
						>
							{link.label}{#if link.href === '/banks' && data.activeBankCount}<span class="text-[11px] text-[--text-tertiary] font-normal ml-0.5">({data.activeBankCount.toLocaleString()})</span>{/if}
							{#if isActive(link.href)}
								<span class="absolute bottom-0 left-0 right-0 h-[2px] bg-[--accent]"></span>
							{/if}
						</a>
					{/each}
				</div>
				<!-- Scroll fade hint: gradient on right edge when content overflows -->
				<div class="sm:hidden absolute right-0 top-0 bottom-0 w-8 pointer-events-none nav-scroll-fade"></div>
			</div>

			<div class="ml-auto flex items-center gap-1 sm:gap-2 shrink-0">
				<!-- Nav search: icon on mobile, inline input on desktop -->
				<button
					type="button"
					onclick={toggleNavSearch}
					aria-label="Search banks"
					class="sm:hidden p-1.5 rounded text-[--text-secondary] hover:text-[--text-primary] hover:bg-[--surface-2] transition-colors"
				>
					<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
					</svg>
				</button>
				<div class="hidden sm:block w-44 lg:w-52">
					<SearchBar
						placeholder="Search banks..."
						onsearch={handleNavSearch}
						autocomplete={true}
						onselect={handleNavSelect}
						compact={true}
					/>
				</div>
				<ThemeToggle />
				<ModeToggle />
			</div>
		</div>

		<!-- Mobile search expansion -->
		{#if navSearchExpanded}
			<div
				class="sm:hidden px-4 pb-2 pt-1"
				bind:this={navSearchEl}
			>
				<SearchBar
					placeholder="Search banks..."
					onsearch={handleNavSearch}
					autocomplete={true}
					onselect={handleNavSelect}
					compact={true}
				/>
			</div>
		{/if}
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
		<div class="max-w-[1400px] mx-auto flex flex-wrap items-center justify-center gap-x-4 gap-y-1">
			{#if data.latestQuarter}
				<span>Q{Math.ceil(parseInt(data.latestQuarter.slice(4, 6)) / 3)} {data.latestQuarter.slice(0, 4)}</span>
			{/if}
			{#if data.activeBankCount}
				<span>{formatNumber(data.activeBankCount)} institutions</span>
			{/if}
			<span>Source: <a href="https://banks.data.fdic.gov" class="underline hover:text-[--text-secondary]">FDIC BankFind</a> & <a href="https://fred.stlouisfed.org" class="underline hover:text-[--text-secondary]">FRED</a></span>
			{#if currentMode === 'power'}
				<button
					onclick={() => keyboardShortcutsRef?.open()}
					class="inline-flex items-center gap-1 hover:text-[--text-secondary] transition-colors"
					aria-label="Keyboard shortcuts"
				>
					<kbd class="bg-[--surface-2] text-[--text-tertiary] px-1 py-0.5 rounded text-[10px] font-mono border border-[--border-muted]">?</kbd>
					<span>Shortcuts</span>
				</button>
			{/if}
		</div>
		<p class="mt-1 text-center text-[11px] text-[--text-tertiary]">Not financial advice. Data provided as-is for educational purposes.</p>
	</footer>
</div>

<KeyboardShortcuts bind:this={keyboardShortcutsRef} />
<ScrollToTop />
