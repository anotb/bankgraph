import { browser } from '$app/environment';
import { detectWebMcp } from '$lib/webmcp/feature';
import type { WebMcpDiagnosticEvent, WebMcpToolHost } from '$lib/webmcp';

export type AgentPhase = 'unsupported' | 'ready' | 'working' | 'done' | 'stopped';

export interface AgentStep {
	tool: string;
	label: string;
	status: 'active' | 'success' | 'failure';
	at: number;
}

const LABELS: Record<string, string> = {
	'bankgraph.get_context': 'Reading the board',
	'bankgraph.read_research_board': 'Reading the board',
	'bankgraph.read_board_block': 'Reading a view',
	'bankgraph.search_banks': 'Searching institutions',
	'bankgraph.configure_screen': 'Setting the screen',
	'bankgraph.configure_comparison': 'Choosing banks and measures',
	'bankgraph.configure_view': 'Adjusting the view',
	'bankgraph.set_peer_cohort': 'Defining the cohort',
	'bankgraph.read_current_cohort': 'Reading the cohort',
	'bankgraph.read_metric_history': 'Reading history',
	'bankgraph.inspect_change': 'Explaining a change',
	'bankgraph.investigate_bank': 'Investigating a bank',
	'bankgraph.analyze_peer_distribution': 'Reading the peer distribution',
	'bankgraph.analyze_metric_relationship': 'Testing a relationship',
	'bankgraph.analyze_cohort_trends': 'Scanning the cohort',
	'bankgraph.build_board_from_result': 'Turning the matches into a board',
	'bankgraph.rank_cohort_on_board': 'Ranking the cohort',
	'bankgraph.analyze_cohort_change': 'Explaining cohort change',
	'bankgraph.find_temporal_patterns': 'Finding multi-quarter patterns',
	'bankgraph.analyze_financial_composition': 'Analyzing composition',
	'bankgraph.analyze_failure_patterns': 'Comparing failure paths',
	'bankgraph.plot_metric_history': 'Adding a history chart',
	'bankgraph.publish_exact_table': 'Adding exact values',
	'bankgraph.publish_result_view': 'Adding an analysis view',
	'bankgraph.add_workspace_view': 'Adding a view',
	'bankgraph.apply_board_template': 'Applying a layout',
	'bankgraph.upsert_takeaway': 'Writing a note',
	'bankgraph.update_board_block': 'Adjusting a view',
	'bankgraph.arrange_research_board': 'Arranging the board',
	'bankgraph.remove_board_blocks': 'Removing views',
	'bankgraph.focus_board_block': 'Focusing a view',
	'bankgraph.update_research': 'Updating notes',
	'bankgraph.share_or_export': 'Preparing a link'
};

export function stepLabel(tool: string | null | undefined): string {
	return (tool && LABELS[tool]) || 'Working on the board';
}

/**
 * One reactive view of "can an agent work here, and is one working now".
 * Fed by the WebMCP host's diagnostics; the UI never inspects tool payloads.
 */
export class AgentPresence {
	supported = $state<boolean | null>(null);
	reason = $state<string | null>(null);
	registered = $state(0);
	steps = $state<AgentStep[]>([]);
	lastActivityAt = $state<number | null>(null);
	#unsubscribe: (() => void) | null = null;

	/** Call after mount so server and first client render agree. */
	detect() {
		if (!browser || this.supported !== null) return;
		const detection = detectWebMcp(document);
		this.supported = detection.available;
		this.reason = detection.available ? null : (detection.reason ?? null);
	}

	attach(host: WebMcpToolHost | null, scope: string) {
		this.#unsubscribe?.();
		this.#unsubscribe = null;
		if (!host) return;
		this.#unsubscribe = host.subscribe((snapshot) => {
			this.supported = snapshot.feature.available;
			this.registered = snapshot.registrations.filter((r) => r.scope === scope && r.status === 'registered').length;
			const events = snapshot.events.filter((e: WebMcpDiagnosticEvent) => e.scope === scope && e.phase === 'execution');
			this.steps = events.slice(-40).map((e) => ({
				tool: e.toolName ?? '',
				label: stepLabel(e.toolName),
				status: e.status === 'info' ? 'active' : e.status === 'success' ? 'success' : 'failure',
				at: Date.now()
			}));
			if (events.length) this.lastActivityAt = Date.now();
		});
	}

	detach() {
		this.#unsubscribe?.();
		this.#unsubscribe = null;
	}

	get phase(): AgentPhase {
		if (this.supported === false) return 'unsupported';
		const last = this.steps.at(-1);
		if (!last) return 'ready';
		if (last.status === 'active') return 'working';
		if (last.status === 'failure') return 'stopped';
		return 'done';
	}

	get current(): AgentStep | null {
		const last = this.steps.at(-1);
		return last?.status === 'active' ? last : null;
	}

	get completedCount(): number {
		return this.steps.filter((s) => s.status === 'success').length;
	}
}

export const agentPresence = new AgentPresence();
