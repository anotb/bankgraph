<script lang="ts">
	import type { WebMcpDiagnosticEvent, WebMcpDiagnosticsSnapshot, WebMcpToolHost } from '$lib/webmcp';

	let { host, scope }: { host: WebMcpToolHost | null; scope: string } = $props();
	let snapshot: WebMcpDiagnosticsSnapshot | null = $state(null);

	$effect(() => {
		if (!host) { snapshot = null; return; }
		return host.subscribe((next) => { snapshot = next; });
	});

	const actions: Record<string, { active: string; complete: string }> = {
		'bankgraph.get_context': { active: 'Reading the current workspace', complete: 'Read the current workspace' },
		'bankgraph.read_research_board': { active: 'Reading the current board', complete: 'Read the current board' },
		'bankgraph.configure_screen': { active: 'Refining the bank screen', complete: 'Refined the bank screen' },
		'bankgraph.set_peer_cohort': { active: 'Defining the comparison cohort', complete: 'Defined the comparison cohort' },
		'bankgraph.analyze_cohort_change': { active: 'Explaining change across the cohort', complete: 'Explained cohort change' },
		'bankgraph.find_temporal_patterns': { active: 'Finding multi-quarter patterns', complete: 'Found multi-quarter patterns' },
		'bankgraph.analyze_financial_composition': { active: 'Analyzing financial composition', complete: 'Analyzed financial composition' },
		'bankgraph.analyze_failure_patterns': { active: 'Comparing historical failure paths', complete: 'Compared historical failure paths' },
		'bankgraph.plot_metric_history': { active: 'Adding a history chart', complete: 'Added a history chart' },
		'bankgraph.publish_exact_table': { active: 'Adding exact values', complete: 'Added exact values' },
		'bankgraph.publish_result_view': { active: 'Adding another analysis view', complete: 'Added another analysis view' },
		'bankgraph.upsert_takeaway': { active: 'Writing a linked takeaway', complete: 'Added a linked takeaway' },
		'bankgraph.update_board_block': { active: 'Refining a board view', complete: 'Refined a board view' },
		'bankgraph.arrange_research_board': { active: 'Arranging the research board', complete: 'Arranged the research board' },
		'bankgraph.remove_board_blocks': { active: 'Removing board views', complete: 'Removed board views' },
	};

	function actionLabel(event: WebMcpDiagnosticEvent, phase: 'active' | 'complete'): string {
		if (event.toolName && actions[event.toolName]) return actions[event.toolName][phase];
		return phase === 'active' ? 'Working in the research workspace' : 'Updated the research workspace';
	}

	let executionEvents = $derived.by((): readonly WebMcpDiagnosticEvent[] => {
		const current = snapshot as WebMcpDiagnosticsSnapshot | null;
		return (current?.events ?? []).filter((event: WebMcpDiagnosticEvent) => event.scope === scope && event.phase === 'execution');
	});
	let completedEvents = $derived(executionEvents.filter((event: WebMcpDiagnosticEvent) => event.status === 'success'));
	let latestEvent = $derived(executionEvents.at(-1) ?? null);
	let activeEvent = $derived(latestEvent?.status === 'info' ? latestEvent : null);
	let failedEvent = $derived(latestEvent?.status === 'failure' ? latestEvent : null);
	let recentCompleted = $derived(completedEvents.slice(-2) as readonly WebMcpDiagnosticEvent[]);
</script>

{#if latestEvent}
	<div class="composition-strip" class:composition-strip--active={activeEvent} class:composition-strip--failed={failedEvent} role="status" aria-live="polite">
		<i aria-hidden="true"></i>
		<div>
			{#if activeEvent}
				<strong>{actionLabel(activeEvent, 'active')}</strong>
				<span>ChatGPT is building in this board.</span>
			{:else if failedEvent}
				<strong>That agent step stopped</strong>
				<span>The board still contains every completed view.</span>
			{:else}
				<strong>Analysis built in {completedEvents.length} {completedEvents.length === 1 ? 'step' : 'steps'}</strong>
				<span>{recentCompleted.map((event: WebMcpDiagnosticEvent) => actionLabel(event, 'complete')).join(' · ')}</span>
			{/if}
		</div>
	</div>
{/if}

<style>
	.composition-strip {
		min-height: 40px;
		display: flex;
		align-items: center;
		gap: 0.55rem;
		padding: 0.42rem 0.7rem;
		border: 1px solid var(--workspace-rule);
		border-bottom: 0;
		background: var(--workspace-bg-elevated);
		color: var(--workspace-muted);
	}
	.composition-strip i {
		width: 7px;
		height: 7px;
		flex: 0 0 auto;
		border-radius: 50%;
		background: var(--workspace-cyan);
	}
	.composition-strip--active i {
		box-shadow: 0 0 0 4px color-mix(in srgb, var(--workspace-cyan) 14%, transparent);
		animation: breathe 1.4s ease-in-out infinite;
	}
	.composition-strip--failed i { background: var(--workspace-orange); }
	.composition-strip div { min-width: 0; display: flex; align-items: baseline; flex-wrap: wrap; gap: 0.2rem 0.55rem; }
	.composition-strip strong { color: var(--workspace-ink); font-size: 11px; font-weight: 650; }
	.composition-strip span { overflow: hidden; color: var(--workspace-faint); font: 500 10px/1.4 var(--workspace-data-font); text-overflow: ellipsis; white-space: nowrap; }
	@keyframes breathe { 50% { opacity: 0.45; } }
	@media (max-width: 620px) {
		.composition-strip { align-items: flex-start; }
		.composition-strip div { display: grid; }
		.composition-strip span { white-space: normal; }
	}
	@media (prefers-reduced-motion: reduce) { .composition-strip--active i { animation: none; } }
</style>
