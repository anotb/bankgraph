<script>
	import '../app.css';

	let { children } = $props();
</script>

<div class="min-h-screen bg-gray-50">
	<nav class="bg-white border-b border-gray-200">
		<div class="max-w-7xl mx-auto px-4 py-3 flex items-center gap-6">
			<a href="/" class="text-lg font-semibold text-gray-900">Bank Data</a>
			<a href="/banks" class="text-sm text-gray-600 hover:text-gray-900">Banks</a>
		</div>
	</nav>
	<main class="max-w-7xl mx-auto px-4 py-6">
		{@render children()}
	</main>
</div>
