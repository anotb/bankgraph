<script lang="ts">
	import type { ResearchBoardBlock } from '$lib/workspace/types';
	import type { ViewRole } from './layout';
	import StatementsView from './views/StatementsView.svelte';
	import HistoryView from './views/HistoryView.svelte';
	import TableView from './views/TableView.svelte';
	import DistributionView from './views/DistributionView.svelte';
	import AttributionView from './views/AttributionView.svelte';
	import RelationshipView from './views/RelationshipView.svelte';
	import GeographyView from './views/GeographyView.svelte';
	import EconomyView from './views/EconomyView.svelte';
	import RecordView from './views/RecordView.svelte';
	import FailurePatternView from './views/FailurePatternView.svelte';
	import AnalysisView from './views/AnalysisView.svelte';

	let { block, role, span, tall = false }: { block: ResearchBoardBlock; role: ViewRole; span: number; tall?: boolean } = $props();
</script>

{#if block.kind === 'history'}
	<HistoryView {block} {span} {tall} />
{:else if block.kind === 'exact_table'}
	<TableView {block} />
{:else if block.kind === 'workspace_view'}
	{#if block.binding.view === 'comparison_matrix'}<StatementsView {block} {span} />
	{:else if block.binding.view === 'metric_history'}<HistoryView {block} {span} {tall} />
	{:else if block.binding.view === 'peer_distribution'}<DistributionView {block} {span} />
	{:else if block.binding.view === 'change_attribution'}<AttributionView {block} {span} {tall} />
	{:else if block.binding.view === 'metric_relationship'}<RelationshipView {block} {span} {tall} />
	{:else if block.binding.view === 'headquarters_geography'}<GeographyView {block} {span} />
	{:else if block.binding.view === 'economic_context'}<EconomyView {block} {span} {tall} />
	{:else if block.binding.view === 'bank_context'}<RecordView {block} />
	{/if}
{:else if block.kind === 'analysis'}
	{#if block.binding.resultRef.kind === 'failure_pattern'}<FailurePatternView {block} {span} {tall} />
	{:else}<AnalysisView {block} {span} />{/if}
{:else if block.kind === 'takeaway'}
	<p class="note">{block.text}</p>
{/if}

<style>
	.note { margin: 0; font-size: 12.5px; color: var(--ink-2); line-height: 1.5; border-left: 2px solid var(--rule); padding-left: 10px; }
</style>
