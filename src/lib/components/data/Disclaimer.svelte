<script lang="ts">
	let {
		text = 'This analysis is for informational purposes only. It does not constitute financial advice, a credit rating, or a recommendation to buy or sell any security.'
	}: {
		text?: string;
	} = $props();
</script>

<div class="border-t border-[--border] pt-4 mt-6">
	<p class="text-[11px] text-[--text-tertiary] leading-relaxed">{text}</p>
</div>
