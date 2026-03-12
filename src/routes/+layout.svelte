<script lang="ts">
	import '../app.css';
	import { page } from '$app/stores';
	import ModeToggle from '$lib/components/layout/ModeToggle.svelte';
	import KeyboardShortcuts from '$lib/components/layout/KeyboardShortcuts.svelte';

	let { children } = $props();

	function isActive(href: string): boolean {
		const path = $page.url.pathname;
		if (href === '/') return path === '/';
		return path.startsWith(href);
	}
</script>

<div class="min-h-screen bg-[--surface-0] flex flex-col">
	<!-- Nav -->
	<nav class="bg-[--surface-1] sticky top-0 z-50" style="box-shadow: var(--shadow-md)">
		<div class="max-w-[1400px] mx-auto px-4 h-11 flex items-center gap-6">
			<a href="/" class="text-[15px] font-semibold tracking-tight text-[--text-primary] flex items-center gap-1.5">
				<span class="text-[--accent] font-bold">BDE</span>
				<span class="hidden sm:inline text-[13px] font-normal text-[--text-secondary]">Bank Data Explorer</span>
			</a>

			<div class="flex items-center gap-5 text-[13px] overflow-x-auto scrollbar-hide">
				{#each [
					{ href: '/banks', label: 'Banks' },
					{ href: '/industry', label: 'Industry' },
					{ href: '/macro', label: 'Macro' },
					{ href: '/compare', label: 'Compare' },
					{ href: '/glossary', label: 'Glossary' }
				] as link}
					<a
						href={link.href}
						class="relative pb-[9px] -mb-[9px] transition-colors duration-150
							{isActive(link.href) ? 'text-[--accent-text] font-semibold' : 'text-[--text-secondary] hover:text-[--text-primary] font-medium'}"
					>
						{link.label}
						{#if isActive(link.href)}
							<span class="absolute bottom-0 left-0 right-0 h-[2.5px] bg-[--accent] rounded-full"></span>
						{/if}
					</a>
				{/each}
			</div>

			<div class="ml-auto flex items-center gap-3">
				<ModeToggle />
			</div>
		</div>
	</nav>

	<!-- Main content -->
	<main class="max-w-[1400px] mx-auto w-full px-4 py-5 flex-1">
		{@render children()}
	</main>

	<!-- Footer -->
	<footer class="border-t border-[--border] bg-[--surface-2]">
		<div class="max-w-[1400px] mx-auto px-4 py-4 text-center text-[11px] text-[--text-tertiary] space-y-0.5">
			<p>Data sourced from FDIC BankFind, Federal Reserve, and FFIEC.</p>
			<p>Not financial advice. Data provided as-is for educational purposes.</p>
		</div>
	</footer>
</div>

<KeyboardShortcuts />
