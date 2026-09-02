import {
	createDefaultWorkspaceState,
	serializeWorkspaceSearch,
	type ChartSpec,
	type WorkspacePanel
} from '$lib/workspace';
import type { WorkspaceMetric } from '$lib/components/workspace/workspace-data';

const SYSTEM_SIGNAL_WORKSPACE_METRICS: Readonly<Partial<Record<string, WorkspaceMetric>>> = {
	total_assets: 'asset',
	total_deposits: 'dep',
	net_interest_margin: 'nimy',
	noncurrent_loans_ratio: 'nclnlsr'
};

export function workspaceMetricForSystemSignal(metric: string): WorkspaceMetric | null {
	return SYSTEM_SIGNAL_WORKSPACE_METRICS[metric] ?? null;
}

export interface WorkspaceLinkOptions {
	question: string;
	states?: string[];
	cert?: number;
	selectedCerts?: number[];
	workspaceMetrics?: readonly WorkspaceMetric[];
	assetMin?: number | null;
	assetMax?: number | null;
	quarter?: string;
	from?: string;
	to?: string;
	panel?: WorkspacePanel;
	depth?: 'guided' | 'pro';
}

export function buildWorkspaceHref(options: WorkspaceLinkOptions): string {
	const base = createDefaultWorkspaceState();
	const certs = [...new Set([...(options.selectedCerts ?? []), ...(options.cert ? [options.cert] : [])])];
	const metrics = [...new Set(options.workspaceMetrics ?? [])].slice(0, 6);
	const assetRange = { min: options.assetMin ?? null, max: options.assetMax ?? null };
	const charts: ChartSpec[] = metrics.length === 0 ? [] : [{
		id: 'home-context',
		title: options.question,
		kind: 'line',
		metrics,
		certs,
		scale: 'value',
		stacked: false,
		visible: true
	}];
	const state = {
		...base,
		question: options.question,
		filters: { ...base.filters, states: options.states ?? [], assetRange },
		activeBank: options.cert ?? null,
		selectedCerts: certs,
		mapSelection: { ...base.mapSelection, states: options.states ?? [] },
		peerRecipe: { ...base.peerRecipe, states: options.states ?? [], assetRange },
		period: options.quarter
			? { kind: 'quarter' as const, quarter: options.quarter }
			: options.from && options.to
			? { kind: 'range' as const, from: options.from, to: options.to }
			: base.period,
		charts,
		activePanel: options.panel ?? (certs.length ? 'bank' : charts.length ? 'charts' : 'screen'),
		depth: options.depth ?? 'guided'
	};
	return `/b?${serializeWorkspaceSearch(state)}`;
}
