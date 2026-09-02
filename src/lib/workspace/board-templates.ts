import type { ResearchMetric } from '$lib/research-metrics';
import type {
	ResearchBoardBlock,
	ResearchBoardSpan,
	ResearchHistoryChartKind,
	ResearchHistoryScale,
	ResearchWorkspaceView
} from './types';
import { normalizeResearchBoardBlock, normalizeResearchBoardBlockId } from './validation';

export const RESEARCH_BOARD_TEMPLATES = [
	{
		id: 'bank_comparison',
		name: 'Bank comparison',
		description: 'Compare the selected banks, follow their measures over time, and put the differences in peer context.'
	},
	{
		id: 'credit_stress',
		name: 'Credit stress',
		description: 'Trace possible stress, see where the banks sit among peers, and identify what changed.'
	},
	{
		id: 'growth_and_funding',
		name: 'Growth and funding',
		description: 'Connect balance-sheet growth with funding, peer position, and the measures driving change.'
	},
	{
		id: 'banking_and_the_economy',
		name: 'Banking and the economy',
		description: 'Place the selected banks and measures alongside economic conditions and geographic context.'
	}
] as const;

export type ResearchBoardTemplateId = typeof RESEARCH_BOARD_TEMPLATES[number]['id'];

export interface CreateResearchBoardTemplateInput {
	templateId: ResearchBoardTemplateId;
	selectedCerts: readonly number[];
	selectedMetrics: readonly ResearchMetric[];
	from: string;
	to: string;
	/** Stable caller-controlled namespace for every block produced by this invocation. */
	idPrefix: string;
}

interface TemplateContext {
	idPrefix: string;
	certs: number[];
	metrics: ResearchMetric[];
	from: string;
	to: string;
}

function id(context: TemplateContext, suffix: string): string {
	return `${context.idPrefix}-${suffix}`;
}

function workspaceView(
	context: TemplateContext,
	suffix: string,
	title: string,
	span: ResearchBoardSpan,
	view: ResearchWorkspaceView
): ResearchBoardBlock {
	return { id: id(context, suffix), title, span, kind: 'workspace_view', binding: { view } };
}

function history(
	context: TemplateContext,
	suffix: string,
	title: string,
	span: ResearchBoardSpan,
	chartKind: ResearchHistoryChartKind,
	scale: ResearchHistoryScale
): ResearchBoardBlock {
	return {
		id: id(context, suffix),
		title,
		span,
		kind: 'history',
		binding: {
			certs: context.certs,
			metrics: context.metrics,
			from: context.from,
			to: context.to,
			chartKind,
			scale
		}
	};
}

const TEMPLATE_BUILDERS: Record<ResearchBoardTemplateId, (context: TemplateContext) => ResearchBoardBlock[]> = {
	bank_comparison: (context) => [
		workspaceView(context, 'comparison', 'How the selected banks compare', 'full', 'comparison_matrix'),
		history(context, 'history', 'How the selected measures have changed', 'three_quarter', 'line', 'index'),
		workspaceView(context, 'peers', 'Where the banks sit among peers', 'quarter', 'peer_distribution'),
		workspaceView(context, 'drivers', 'What drove the latest change', 'full', 'change_attribution')
	],
	credit_stress: (context) => [
		history(context, 'stress-history', 'How the selected stress measures have moved', 'full', 'area', 'value'),
		workspaceView(context, 'stress-peers', 'Stress relative to peers', 'quarter', 'peer_distribution'),
		workspaceView(context, 'stress-drivers', 'What drove the latest change', 'three_quarter', 'change_attribution'),
		workspaceView(context, 'stress-context', 'The institution context around the signals', 'full', 'bank_context')
	],
	growth_and_funding: (context) => [
		history(context, 'growth-history', 'The path of growth and funding', 'three_quarter', 'line', 'index'),
		workspaceView(context, 'growth-peers', 'Growth and funding relative to peers', 'quarter', 'peer_distribution'),
		workspaceView(context, 'growth-relationship', 'How the selected measures move together', 'full', 'metric_relationship'),
		workspaceView(context, 'growth-drivers', 'What contributed to the change', 'full', 'change_attribution')
	],
	banking_and_the_economy: (context) => [
		workspaceView(context, 'economy', 'The economic setting for the period', 'full', 'economic_context'),
		history(context, 'economy-history', 'How the selected bank measures evolved', 'three_quarter', 'line', 'value'),
		workspaceView(context, 'economy-geography', 'Where the selected banks are based', 'quarter', 'headquarters_geography'),
		workspaceView(context, 'economy-relationship', 'How bank measures relate to one another', 'full', 'metric_relationship')
	]
};

/** Build an ordered, semantic-only board. The returned blocks contain bindings, never materialized values. */
export function createResearchBoardTemplate(input: CreateResearchBoardTemplateInput): ResearchBoardBlock[] {
	const context: TemplateContext = {
		idPrefix: normalizeResearchBoardBlockId(input.idPrefix, 'idPrefix'),
		certs: [...input.selectedCerts],
		metrics: [...input.selectedMetrics],
		from: input.from,
		to: input.to
	};

	return TEMPLATE_BUILDERS[input.templateId](context).map((block, index) =>
		normalizeResearchBoardBlock(block, `blocks[${index}]`)
	);
}
