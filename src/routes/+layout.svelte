<script>
	import '../app.css';
	import ModeToggle from '$lib/components/layout/ModeToggle.svelte';

	let { children } = $props();
</script>

<div class="min-h-screen bg-[--surface-0] flex flex-col">
	<!-- Nav -->
	<nav class="bg-[--surface-1] border-b border-[--border]">
		<div class="max-w-[1400px] mx-auto px-4 h-11 flex items-center gap-6">
			<a href="/" class="text-[15px] font-semibold tracking-tight text-[--text-primary] flex items-center gap-1.5">
				<span class="text-[--accent] font-bold">BDE</span>
				<span class="hidden sm:inline text-[13px] font-normal text-[--text-secondary]">Bank Data Explorer</span>
			</a>

			<div class="flex items-center gap-5 text-[13px] font-medium">
				<a href="/banks" class="text-[--text-secondary] hover:text-[--text-primary] transition-colors">Banks</a>
				<a href="/industry" class="text-[--text-secondary] hover:text-[--text-primary] transition-colors">Industry</a>
				<a href="/macro" class="text-[--text-disabled] hover:text-[--text-tertiary] transition-colors" title="Coming soon">Macro</a>
				<a href="/glossary" class="text-[--text-secondary] hover:text-[--text-primary] transition-colors">Glossary</a>
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
