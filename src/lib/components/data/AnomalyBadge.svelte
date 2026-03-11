<script lang="ts">
	let {
		critical = 0,
		warning = 0,
		info = 0
	}: {
		critical?: number;
		warning?: number;
		info?: number;
	} = $props();
</script>

<span class="inline-flex items-center gap-1.5 flex-wrap">
	{#if critical > 0}
		<span class="inline-flex items-center rounded-sm px-1.5 py-0.5 text-[11px] font-medium tracking-wide bg-[--negative-muted] text-[--negative]">
			{critical} critical
		</span>
	{/if}
	{#if warning > 0}
		<span class="inline-flex items-center rounded-sm px-1.5 py-0.5 text-[11px] font-medium tracking-wide bg-[--warning-muted] text-[--warning]">
			{warning} warning
		</span>
	{/if}
	{#if info > 0}
		<span class="inline-flex items-center rounded-sm px-1.5 py-0.5 text-[11px] font-medium tracking-wide bg-[--accent-muted] text-[--accent-text]">
			{info} info
		</span>
	{/if}
</span>
