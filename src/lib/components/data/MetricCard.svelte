<script lang="ts">
	let {
		label,
		value,
		sublabel
	}: {
		label: string;
		value: string;
		sublabel?: string;
	} = $props();
</script>

<div class="rounded-lg border border-gray-200 bg-white px-4 py-4">
	<p class="text-xs font-medium text-gray-500 uppercase tracking-wide">{label}</p>
	<p class="mt-1 text-2xl font-bold text-gray-900">{value}</p>
	{#if sublabel}
		<p class="mt-0.5 text-xs text-gray-400">{sublabel}</p>
	{/if}
</div>
