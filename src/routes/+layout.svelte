<script>
	import '../app.css';

	let { children } = $props();
</script>

<div class="min-h-screen bg-gray-50 flex flex-col">
	<!-- Nav -->
	<nav class="bg-slate-800 text-white">
		<div class="max-w-7xl mx-auto px-4 py-3 flex flex-wrap items-center gap-x-6 gap-y-1">
			<a href="/" class="text-lg font-semibold tracking-tight">Bank Data Explorer</a>
			<div class="flex items-center gap-x-5 text-sm">
				<a href="/banks" class="text-slate-200 hover:text-white transition-colors">Banks</a>
				<a
					href="/industry"
					class="text-slate-400 hover:text-slate-300 transition-colors"
					title="Coming soon"
				>Industry</a>
				<a
					href="/macro"
					class="text-slate-400 hover:text-slate-300 transition-colors"
					title="Coming soon"
				>Macro</a>
				<a
					href="/glossary"
					class="text-slate-200 hover:text-white transition-colors"
				>Glossary</a>
			</div>
		</div>
	</nav>

	<!-- Main content -->
	<main class="max-w-7xl mx-auto w-full px-4 py-6 flex-1">
		{@render children()}
	</main>

	<!-- Footer -->
	<footer class="border-t border-gray-200 bg-gray-100">
		<div class="max-w-7xl mx-auto px-4 py-6 text-center text-xs text-gray-400 space-y-1">
			<p>Data sourced from FDIC BankFind, Federal Reserve, and FFIEC.</p>
			<p>Not financial advice. Data provided as-is for educational purposes.</p>
		</div>
	</footer>
</div>
