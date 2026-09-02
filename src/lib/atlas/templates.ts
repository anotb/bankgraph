/**
 * Board templates: analytical layouts applied to the current anchors.
 * Templates can also define a curated starting question, measures, and cohort.
 * These starts are used by the human-facing layout picker; agent composition can
 * still apply the view layout over anchors it has already chosen.
 */
import type { ResearchMetric } from '$lib/research-metrics';

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
	/** A complete, deterministic starting point for links and human layout choices. */
	start?: {
		question?: string;
		clearBanks?: boolean;
		clearCohort?: boolean;
		metrics?: ResearchMetric[];
		cohort?: {
			name: string;
			states?: string[];
			assetRange: { min: number | null; max: number | null };
			maximumPeers?: number;
		};
		/** Rank the curated universe by reported data, then use the matches as the banks on the board. */
		selection?: {
			metric: ResearchMetric;
			basis: 'level' | 'prior-quarter-change' | 'year-ago-change';
			direction: 'highest' | 'lowest';
			limit: number;
		};
	};
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
			{ title: 'Position', views: [{ kind: 'statements', role: 'lead', options: { columns: 8 } }, { kind: 'record', role: 'reference', options: { columns: 4 } }] },
			{ title: 'Eight quarters', views: [{ kind: 'history', role: 'lead', options: { layout: 'multiples', columns: 8 } }, { kind: 'distribution', role: 'support', options: { columns: 4 } }] },
			{ title: 'What moved last quarter', views: [{ kind: 'attribution', role: 'lead', options: { columns: 12 } }] }
		],
		thumb: [[8, 4], [8, 4], [12]]
	},
	{
		id: 'peer_comparison',
		name: 'Peer comparison',
		description: 'Up to ten banks on six measures, with the cohort band behind them.',
		needs: ['banks'],
		timeForm: 'standard',
		start: {
			question: 'How do the selected banks differ across size, funding, credit, profitability, and capital?'
		},
		strips: [
			{ title: 'Side by side', views: [{ kind: 'exact_table', role: 'lead', options: { columns: 12 } }] },
			{ title: 'Over time', views: [{ kind: 'history', role: 'multiples', options: { layout: 'multiples', columns: 12 } }] },
			{ title: 'Among peers', views: [{ kind: 'distribution', role: 'lead', options: { columns: 6 } }, { kind: 'relationship', role: 'contrast', options: { columns: 6 } }] }
		],
		thumb: [[12], [12], [6, 6]]
	},
	{
		id: 'credit_stress',
		name: 'Credit stress',
		description: 'Noncurrent loans, charge-offs, reserve coverage, and which institutions are deteriorating.',
		needs: ['cohort'],
		timeForm: 'standard',
		start: {
			question: 'Which large banks saw noncurrent loans rise fastest over the past year?',
			clearBanks: true,
			metrics: ['nclnlsr', 'nco_ratio', 'lnatresr', 'rbc1rwaj', 'asset'],
			cohort: { name: 'Active banks with at least $50B in assets', assetRange: { min: 50_000_000, max: null }, maximumPeers: 100 },
			selection: { metric: 'nclnlsr', basis: 'year-ago-change', direction: 'highest', limit: 8 }
		},
		strips: [
			{ title: 'Largest increases', views: [{ kind: 'exact_table', role: 'lead', title: 'Banks with the largest year-over-year increases', options: { metrics: ['nclnlsr', 'nco_ratio', 'lnatresr', 'rbc1rwaj', 'asset'], sortMetric: 'nclnlsr', sortBasis: 'change', sortDirection: 'desc', columns: 12 } }] },
			{ title: 'Path and position', views: [{ kind: 'history', role: 'lead', title: 'Credit stress over time', options: { metrics: ['nclnlsr', 'nco_ratio'], layout: 'multiples', columns: 8 } }, { kind: 'distribution', role: 'support', title: 'Against the large-bank cohort', options: { metrics: ['nclnlsr', 'nco_ratio', 'lnatresr', 'rbc1rwaj'], columns: 4 } }] },
			{ title: 'Capital against stress', views: [{ kind: 'relationship', role: 'lead', title: 'Capital and noncurrent loans', options: { x: 'rbc1rwaj', y: 'nclnlsr', columns: 12 } }] }
		],
		thumb: [[12], [8, 4], [12]]
	},
	{
		id: 'funding',
		name: 'Funding and liquidity',
		description: 'Deposits, borrowed funds, and loans to deposits across a cohort.',
		needs: ['cohort'],
		timeForm: 'standard',
		start: {
			question: 'Which $50B–$250B banks run the highest loan-to-deposit ratios, and how much do they borrow?',
			clearBanks: true,
			metrics: ['lnlsdepr', 'othbfhlb', 'dep', 'lnlsnet', 'asset'],
			cohort: { name: 'Active banks with $50B–$250B in assets', assetRange: { min: 50_000_000, max: 250_000_000 }, maximumPeers: 100 },
			selection: { metric: 'lnlsdepr', basis: 'level', direction: 'highest', limit: 8 }
		},
		strips: [
			{ title: 'Highest ratios', views: [{ kind: 'exact_table', role: 'lead', title: 'Highest loan-to-deposit ratios', options: { metrics: ['lnlsdepr', 'othbfhlb', 'dep', 'lnlsnet', 'asset'], sortMetric: 'lnlsdepr', sortBasis: 'level', sortDirection: 'desc', columns: 12 } }] },
			{ title: 'Funding position', views: [{ kind: 'relationship', role: 'lead', title: 'Loan-to-deposit ratio and borrowed funds', options: { x: 'lnlsdepr', y: 'othbfhlb', columns: 8 } }, { kind: 'distribution', role: 'support', title: 'Against the $50B–$250B cohort', options: { metrics: ['lnlsdepr', 'othbfhlb'], columns: 4 } }] },
			{ title: 'Path and setting', views: [{ kind: 'history', role: 'lead', title: 'Funding over time', options: { metrics: ['lnlsdepr', 'othbfhlb'], layout: 'multiples', columns: 8 } }, { kind: 'economy', role: 'context', title: 'Deposits, loans, and interest rates', options: { series: ['FRB_H8_DEPOSITS', 'FRB_H8_LOANS_LEASES', 'FRB_FEDFUNDS'], columns: 4 } }] }
		],
		thumb: [[12], [8, 4], [8, 4]]
	},
	{
		id: 'geography',
		name: 'Geography',
		description: 'Where a cohort is headquartered and how the measures vary by state.',
		needs: ['cohort'],
		timeForm: 'compact',
		start: {
			question: 'Where are the 200 largest active U.S. banks headquartered, and how do their balance sheets differ by state?',
			clearBanks: true,
			metrics: ['asset', 'dep', 'roa', 'nclnlsr'],
			cohort: { name: '200 largest active banks', assetRange: { min: null, max: null }, maximumPeers: 200 }
		},
		strips: [
			{ title: 'Where they are', views: [{ kind: 'geography', role: 'lead', options: { columns: 12 } }] }
		],
		thumb: [[12]]
	},
	{
		id: 'failure_analogues',
		name: 'Failure analogues',
		description: 'Historical failures aligned in event time, the measures that separated them, and active banks with similar paths.',
		needs: [],
		timeForm: 'event',
		start: {
			question: 'What did failing banks have in common before 2008—and which active banks look most similar today?',
			clearBanks: true,
			clearCohort: true,
			metrics: ['nclnlsr', 'nco_ratio', 'roa', 'rbc1rwaj']
		},
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
