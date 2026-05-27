<script lang="ts">
	import '../app.css';
	import { page } from '$app/stores';
	import { onNavigate } from '$app/navigation';
	import ModeToggle from '$lib/components/layout/ModeToggle.svelte';
	import ThemeToggle from '$lib/components/layout/ThemeToggle.svelte';
	import KeyboardShortcuts from '$lib/components/layout/KeyboardShortcuts.svelte';
	import NavigationProgress from '$lib/components/layout/NavigationProgress.svelte';
	import ScrollToTop from '$lib/components/layout/ScrollToTop.svelte';
	import CommandPalette from '$lib/components/layout/CommandPalette.svelte';
	import { getMode } from '$lib/stores/mode.svelte.js';
	import { formatNumber } from '$lib/utils/formatters.js';
	import { browser } from '$app/environment';

	let { children, data } = $props();
	let currentMode = $derived(getMode());
	let keyboardShortcutsRef: ReturnType<typeof KeyboardShortcuts> | undefined = $state();
	let commandPaletteRef: ReturnType<typeof CommandPalette> | undefined = $state();
	let modKeyLabel = $derived(browser && /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘' : 'Ctrl');
	let navScrollEl: HTMLDivElement | undefined = $state();
	let navCanScrollRight = $state(true);

	// View Transitions API for smooth route changes.
	// Falls back gracefully on browsers without support.
	onNavigate((navigation) => {
		if (typeof document === 'undefined') return;
		const startViewTransition = (document as Document & { startViewTransition?: (cb: () => Promise<void>) => unknown }).startViewTransition;
		if (typeof startViewTransition !== 'function') return;
		return new Promise<void>((resolve) => {
			startViewTransition.call(document, async () => {
				resolve();
				await navigation.complete;
			});
		});
	});

	function isActive(href: string): boolean {
		const path = $page.url.pathname;
		if (href === '/') return path === '/';
		return path.startsWith(href);
	}

	function checkNavScroll() {
		if (!navScrollEl) return;
		const { scrollLeft, scrollWidth, clientWidth } = navScrollEl;
		navCanScrollRight = scrollLeft + clientWidth < scrollWidth - 4;
	}

	$effect(() => {
		if (!navScrollEl) return;
		checkNavScroll();
		navScrollEl.addEventListener('scroll', checkNavScroll, { passive: true });
		const ro = new ResizeObserver(checkNavScroll);
		ro.observe(navScrollEl);
		return () => {
			navScrollEl?.removeEventListener('scroll', checkNavScroll);
			ro.disconnect();
		};
	});
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
				<div
					bind:this={navScrollEl}
					class="flex items-center gap-1 sm:gap-5 text-[13px] overflow-x-auto scrollbar-hide"
				>
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
				<!-- Scroll fade + chevron: visible when more nav items are off-screen right -->
				<div
					class="sm:hidden absolute right-0 top-0 bottom-0 w-10 pointer-events-none nav-scroll-fade flex items-center justify-end pr-0.5 transition-opacity duration-300 {navCanScrollRight ? 'opacity-100' : 'opacity-0'}"
					aria-hidden="true"
				>
					<svg class="h-3.5 w-3.5 text-[--text-tertiary] animate-nudge-right" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M9 5l7 7-7 7" />
					</svg>
				</div>
			</div>

			<div class="ml-auto flex items-center gap-1 sm:gap-2 shrink-0">
				<!-- Command palette trigger: icon on mobile, pill on desktop -->
				<button
					type="button"
					onclick={() => commandPaletteRef?.show()}
					aria-label="Open command palette"
					class="sm:hidden p-1.5 rounded text-[--text-secondary] hover:text-[--text-primary] hover:bg-[--surface-2] transition-colors"
				>
					<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
					</svg>
				</button>
				<button
					type="button"
					onclick={() => commandPaletteRef?.show()}
					aria-label="Open command palette"
					class="cmdk-trigger hidden sm:inline-flex"
				>
					<svg class="h-3.5 w-3.5 text-[--text-tertiary]" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
					</svg>
					<span class="cmdk-trigger__label">Search banks, jump to a page</span>
					<span class="cmdk-trigger__kbd"><kbd>{modKeyLabel}</kbd><kbd>K</kbd></span>
				</button>
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
		<div class="max-w-[1400px] mx-auto flex flex-wrap items-center justify-center gap-x-4 gap-y-1">
			<span class="text-[--text-disabled]">v1.0</span>
			{#if data.latestQuarter}
				<span>Q{Math.ceil(parseInt(data.latestQuarter.slice(4, 6)) / 3)} {data.latestQuarter.slice(0, 4)}</span>
			{/if}
			{#if data.activeBankCount}
				<span>{formatNumber(data.activeBankCount)} institutions</span>
			{/if}
			<a href="/glossary" class="underline hover:text-[--text-secondary]">Glossary</a>
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
<CommandPalette bind:this={commandPaletteRef} />
<ScrollToTop />

<style>
	.cmdk-trigger {
		align-items: center;
		gap: 0.5rem;
		padding: 0.3rem 0.5rem 0.3rem 0.625rem;
		background-color: var(--surface-2);
		border: 1px solid var(--border-muted);
		border-radius: 6px;
		color: var(--text-tertiary);
		font-size: 12px;
		font-family: inherit;
		cursor: pointer;
		min-width: 220px;
		transition: border-color 0.15s ease, background-color 0.15s ease;
	}
	.cmdk-trigger:hover {
		background-color: var(--surface-1);
		border-color: var(--border);
		color: var(--text-secondary);
	}
	.cmdk-trigger__label { flex: 1; text-align: left; }
	.cmdk-trigger__kbd {
		display: inline-flex;
		gap: 1px;
	}
	.cmdk-trigger__kbd :global(kbd) {
		display: inline-block;
		min-width: 14px;
		padding: 0px 4px;
		font-family: inherit;
		font-size: 10px;
		font-weight: 500;
		text-align: center;
		color: var(--text-tertiary);
		background-color: var(--surface-1);
		border: 1px solid var(--border-muted);
		border-radius: 3px;
	}
	@media (max-width: 1023px) {
		.cmdk-trigger { min-width: 160px; }
		.cmdk-trigger__label { font-size: 11px; }
	}
</style>
