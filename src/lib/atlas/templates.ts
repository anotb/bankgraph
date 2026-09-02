/**
 * Board templates: analytical layouts applied to the current anchors.
 * A template never carries values; it carries which views to add and their roles.
 */
export type ViewRole = 'lead' | 'support' | 'contrast' | 'reference' | 'multiples' | 'context' | 'investigation';

export type ViewKind =
	| 'statements'
	| 'history'
	| 'exact_table'
	| 'distribution'
	| 'attribution'
	| 'relationship'
	| 'geography'
	| 'economy'
	| 'record'
	| 'composition'
	| 'cohort_change'
	| 'failure_pattern';

export interface TemplateView {
	kind: ViewKind;
	role: ViewRole;
	title?: string;
	/** Kind-specific presentation defaults. */
	options?: Record<string, unknown>;
}

export interface BoardTemplate {
	id: string;
	name: string;
	description: string;
	/** Which anchors this template needs to be meaningful. */
	needs: Array<'banks' | 'cohort' | 'measures'>;
	timeForm: 'compact' | 'standard' | 'event';
	strips: Array<{ title: string; views: TemplateView[] }>;
	/** Thumbnail column layout for pickers: each row is a list of spans summing to 12. */
	thumb: number[][];
}

export const BOARD_TEMPLATES: BoardTemplate[] = [
	{
		id: 'one_bank',
		name: 'One bank',
		description: 'Balance sheet, earnings, credit, capital, where it sits among peers, and what moved last quarter.',
		needs: ['banks'],
		timeForm: 'standard',
		strips: [
			{ title: 'Position', views: [{ kind: 'statements', role: 'lead' }] },
			{ title: 'Eight quarters', views: [{ kind: 'history', role: 'lead', options: { layout: 'multiples' } }, { kind: 'distribution', role: 'support' }] },
			{ title: 'What moved last quarter', views: [{ kind: 'attribution', role: 'lead' }, { kind: 'record', role: 'reference' }] }
		],
		thumb: [[12], [8, 4], [7, 5]]
	},
	{
		id: 'peer_comparison',
		name: 'Peer comparison',
		description: 'Up to ten banks on six measures, with the cohort band behind them.',
		needs: ['banks'],
		timeForm: 'standard',
		strips: [
			{ title: 'Side by side', views: [{ kind: 'exact_table', role: 'lead' }] },
			{ title: 'Over time', views: [{ kind: 'history', role: 'multiples', options: { layout: 'multiples' } }] },
			{ title: 'Among peers', views: [{ kind: 'distribution', role: 'lead' }, { kind: 'relationship', role: 'contrast' }] }
		],
		thumb: [[12], [12], [6, 6]]
	},
	{
		id: 'credit_stress',
		name: 'Credit stress',
		description: 'Noncurrent loans, charge-offs, reserve coverage, and which institutions are deteriorating.',
		needs: ['cohort'],
		timeForm: 'standard',
		strips: [
			{ title: 'Where credit is weakening', views: [{ kind: 'distribution', role: 'lead', options: { metrics: ['nclnlsr', 'nco_ratio', 'lnatresr'] } }, { kind: 'exact_table', role: 'reference', options: { metrics: ['nclnlsr', 'nco_ratio', 'lnatresr', 'asset'] } }] },
			{ title: 'Over time and across states', views: [{ kind: 'history', role: 'lead', options: { metrics: ['nclnlsr', 'nco_ratio', 'lnatresr'], layout: 'multiples' } }, { kind: 'geography', role: 'support', options: { metrics: ['nclnlsr'] } }] }
		],
		thumb: [[8, 4], [8, 4]]
	},
	{
		id: 'funding',
		name: 'Funding and liquidity',
		description: 'Deposits, borrowed funds, and loans to deposits across a cohort.',
		needs: ['cohort'],
		timeForm: 'standard',
		strips: [
			{ title: 'How the cohort funds itself', views: [{ kind: 'relationship', role: 'lead', options: { x: 'lnlsdepr', y: 'othbfhlb' } }, { kind: 'distribution', role: 'support', options: { metrics: ['lnlsdepr', 'dep'] } }] },
			{ title: 'Funding over time', views: [{ kind: 'history', role: 'contrast', options: { metrics: ['dep', 'othbfhlb', 'lnlsdepr'], layout: 'multiples' } }, { kind: 'exact_table', role: 'reference', options: { metrics: ['dep', 'othbfhlb', 'lnlsdepr', 'lnlsnet'] } }] }
		],
		thumb: [[7, 5], [6, 6]]
	},
	{
		id: 'geography',
		name: 'Geography',
		description: 'Where a cohort is headquartered and how the measures vary by state.',
		needs: ['cohort'],
		timeForm: 'compact',
		strips: [
			{ title: 'Where they are', views: [{ kind: 'geography', role: 'lead' }, { kind: 'exact_table', role: 'reference', options: { groupBy: 'state' } }] },
			{ title: 'How they differ', views: [{ kind: 'distribution', role: 'lead' }] }
		],
		thumb: [[7, 5], [12]]
	},
	{
		id: 'failure_analogues',
		name: 'Failure analogues',
		description: 'Historical failures aligned in event time, the measures that separated them, and active banks with similar paths.',
		needs: [],
		timeForm: 'event',
		strips: [
			{ title: 'Before failure', views: [{ kind: 'failure_pattern', role: 'investigation', options: { view: 'event_study' } }] },
			{ title: 'Active banks on a similar path', views: [{ kind: 'failure_pattern', role: 'lead', options: { view: 'analogue_table' } }, { kind: 'failure_pattern', role: 'support', options: { view: 'event_trajectories' } }] },
			{ title: 'Context', views: [{ kind: 'economy', role: 'context' }] }
		],
		thumb: [[12], [8, 4], [12]]
	}
];

export function templateById(id: string | null | undefined): BoardTemplate | null {
	return BOARD_TEMPLATES.find((t) => t.id === id) ?? null;
}
