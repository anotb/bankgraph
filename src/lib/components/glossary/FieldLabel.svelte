<script lang="ts">
	import { getFieldLabel } from '$lib/utils/field-meta.js';
	import FieldTooltip from './FieldTooltip.svelte';

	let { field, showTooltip = true }: { field: string; showTooltip?: boolean } = $props();

	let label = $derived(getFieldLabel(field));
</script>

{#if showTooltip}
	<FieldTooltip {field}>
		{label}
	</FieldTooltip>
{:else}
	{label}
{/if}
