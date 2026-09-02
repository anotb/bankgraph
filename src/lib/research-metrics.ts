import type { Financial } from '$lib/types';

export const RESEARCH_METRIC_CATEGORIES = [
	'balance_sheet',
	'profitability',
	'funding',
	'credit',
	'capital',
	'operating_scale'
] as const;

export type ResearchMetricCategory = typeof RESEARCH_METRIC_CATEGORIES[number];
export type ResearchMetricUnit = 'usd_thousands' | 'percent' | 'count';
export type ResearchMetricChange = 'percent_change' | 'percentage_points' | 'absolute_change';
export type ResearchMetricAggregation = 'additive' | 'distribution_only';
export type ResearchMetricEndpointDependency =
	| 'reported'
	| 'prior_year'
	| 'prior_quarter_fallback'
	| 'latest_snapshot';

export const RESEARCH_METRIC_CATEGORY_LABELS: Record<ResearchMetricCategory, string> = {
	balance_sheet: 'Balance sheet',
	profitability: 'Profitability',
	funding: 'Funding',
	credit: 'Credit',
	capital: 'Capital',
	operating_scale: 'Operating scale'
};

interface ScreenMetricDefinition {
	id: string;
	unit: ResearchMetricUnit;
	minimum: number;
	maximum: number;
	integer: boolean;
	snapshotField: string;
}

interface ResearchMetricDefinitionShape {
	id: string;
	label: string;
	shortLabel: string;
	category: ResearchMetricCategory;
	unit: ResearchMetricUnit;
	displayUnit: string;
	source: string;
	description: string;
	direction: 'higher' | 'lower' | 'neutral';
	change: ResearchMetricChange;
	aggregation: ResearchMetricAggregation;
	endpointDependency: ResearchMetricEndpointDependency;
	valueField?: keyof Financial;
	derived?: 'loan_growth_yoy' | 'quarterly_net_income';
	latestInstitutionField?: 'num_branches';
	aliases?: readonly string[];
	screen?: ScreenMetricDefinition;
}

/**
 * Canonical product vocabulary for research, display, export, and agent tools.
 * Raw fields keep FDIC units: money in thousands of US dollars, ratios in percent,
 * and operating scale as counts.
 */
export const RESEARCH_METRICS = [
	{
		id: 'asset', label: 'Total assets', shortLabel: 'Assets', category: 'balance_sheet',
		unit: 'usd_thousands', displayUnit: 'USD', source: 'ASSET',
		description: 'Total assets reported by the institution.', direction: 'neutral',
		change: 'percent_change', aggregation: 'additive', endpointDependency: 'reported', valueField: 'asset', aliases: ['assets'],
		screen: { id: 'assets', unit: 'usd_thousands', minimum: 0, maximum: 100_000_000_000_000, integer: true, snapshotField: 'total_assets' }
	},
	{
		id: 'lnlsnet', label: 'Net loans and leases', shortLabel: 'Net loans', category: 'balance_sheet',
		unit: 'usd_thousands', displayUnit: 'USD', source: 'LNLSNET',
		description: 'Loans and leases after unearned income and the loss allowance.', direction: 'neutral',
		change: 'percent_change', aggregation: 'additive', endpointDependency: 'reported', valueField: 'lnlsnet', aliases: ['netLoans']
	},
	{
		id: 'eq', label: 'Total equity capital', shortLabel: 'Equity', category: 'balance_sheet',
		unit: 'usd_thousands', displayUnit: 'USD', source: 'EQ',
		description: 'Reported equity capital, including retained earnings.', direction: 'neutral',
		change: 'percent_change', aggregation: 'additive', endpointDependency: 'reported', valueField: 'eq', aliases: ['equity']
	},
	{
		id: 'roa', label: 'Return on assets', shortLabel: 'ROA', category: 'profitability',
		unit: 'percent', displayUnit: '%', source: 'ROA',
		description: 'Annualized net income as a percentage of average assets.', direction: 'higher',
		change: 'percentage_points', aggregation: 'distribution_only', endpointDependency: 'reported', valueField: 'roa',
		screen: { id: 'roa', unit: 'percent', minimum: -1_000, maximum: 1_000, integer: false, snapshotField: 'latest_roa' }
	},
	{
		id: 'roe', label: 'Return on equity', shortLabel: 'ROE', category: 'profitability',
		unit: 'percent', displayUnit: '%', source: 'ROE',
		description: 'Annualized net income as a percentage of average equity.', direction: 'higher',
		change: 'percentage_points', aggregation: 'distribution_only', endpointDependency: 'reported', valueField: 'roe',
		screen: { id: 'roe', unit: 'percent', minimum: -100_000, maximum: 100_000, integer: false, snapshotField: 'latest_roe' }
	},
	{
		id: 'nimy', label: 'Net interest margin', shortLabel: 'NIM', category: 'profitability',
		unit: 'percent', displayUnit: '%', source: 'NIMY',
		description: 'Annualized net interest income as a percentage of average earning assets.', direction: 'higher',
		change: 'percentage_points', aggregation: 'distribution_only', endpointDependency: 'reported', valueField: 'nimy', aliases: ['nim'],
		screen: { id: 'nim', unit: 'percent', minimum: -1_000, maximum: 1_000, integer: false, snapshotField: 'latest_nim' }
	},
	{
		id: 'eeffr', label: 'Efficiency ratio', shortLabel: 'Efficiency', category: 'profitability',
		unit: 'percent', displayUnit: '%', source: 'EEFFR',
		description: 'Noninterest expense relative to net revenue. Lower values indicate less expense per dollar of revenue.', direction: 'lower',
		change: 'percentage_points', aggregation: 'distribution_only', endpointDependency: 'reported', valueField: 'eeffr', aliases: ['efficiencyRatio']
	},
	{
		id: 'netinc', label: 'Quarterly net income', shortLabel: 'Net income', category: 'profitability',
		unit: 'usd_thousands', displayUnit: 'USD', source: 'NETINCQ; derived from NETINC when needed',
		description: 'Net income for the quarter. Bankgraph uses the reported single-quarter value or the exact change in year-to-date net income.', direction: 'higher',
		change: 'absolute_change', aggregation: 'additive', endpointDependency: 'prior_quarter_fallback', derived: 'quarterly_net_income', aliases: ['quarterlyNetIncome']
	},
	{
		id: 'dep', label: 'Total deposits', shortLabel: 'Deposits', category: 'funding',
		unit: 'usd_thousands', displayUnit: 'USD', source: 'DEP',
		description: 'Institution-level deposits across domestic and foreign offices.', direction: 'neutral',
		change: 'percent_change', aggregation: 'additive', endpointDependency: 'reported', valueField: 'dep', aliases: ['deposits'],
		screen: { id: 'deposits', unit: 'usd_thousands', minimum: 0, maximum: 100_000_000_000_000, integer: true, snapshotField: 'total_deposits' }
	},
	{
		id: 'loanGrowth', label: 'Net loan growth', shortLabel: 'Loan growth', category: 'funding',
		unit: 'percent', displayUnit: '% YoY', source: 'Derived from LNLSNET',
		description: 'Year-over-year change in net loans and leases.', direction: 'neutral',
		change: 'percentage_points', aggregation: 'distribution_only', endpointDependency: 'prior_year', derived: 'loan_growth_yoy', aliases: ['loan_growth']
	},
	{
		id: 'lnlsdepr', label: 'Loan-to-deposit ratio', shortLabel: 'Loans / deposits', category: 'funding',
		unit: 'percent', displayUnit: '%', source: 'LNLSDEPR',
		description: 'Loans and leases as a percentage of total deposits.', direction: 'neutral',
		change: 'percentage_points', aggregation: 'distribution_only', endpointDependency: 'reported', valueField: 'lnlsdepr', aliases: ['loanToDeposit']
	},
	{
		id: 'othbfhlb', label: 'Other borrowed funds', shortLabel: 'Borrowed funds', category: 'funding',
		unit: 'usd_thousands', displayUnit: 'USD', source: 'OTHBFHLB',
		description: 'Other borrowed money, including Federal Home Loan Bank advances.', direction: 'neutral',
		change: 'percent_change', aggregation: 'additive', endpointDependency: 'reported', valueField: 'othbfhlb', aliases: ['borrowedFunds']
	},
	{
		id: 'nclnlsr', label: 'Noncurrent loan ratio', shortLabel: 'Noncurrent loans', category: 'credit',
		unit: 'percent', displayUnit: '%', source: 'NCLNLSR',
		description: 'Loans 90 days past due or in nonaccrual as a percentage of loans and leases.', direction: 'lower',
		change: 'percentage_points', aggregation: 'distribution_only', endpointDependency: 'reported', valueField: 'nclnlsr', aliases: ['noncurrentLoanRatio'],
		screen: { id: 'noncurrentLoanRatio', unit: 'percent', minimum: 0, maximum: 1_000, integer: false, snapshotField: 'latest_npl_ratio' }
	},
	{
		id: 'nco_ratio', label: 'Net charge-off ratio', shortLabel: 'Charge-offs', category: 'credit',
		unit: 'percent', displayUnit: '%', source: 'NTLNLSR',
		description: 'Annualized net charge-offs as a percentage of average loans.', direction: 'lower',
		change: 'percentage_points', aggregation: 'distribution_only', endpointDependency: 'reported', valueField: 'nco_ratio', aliases: ['netChargeOffRatio']
	},
	{
		id: 'lnatresr', label: 'Reserve coverage', shortLabel: 'Reserve coverage', category: 'credit',
		unit: 'percent', displayUnit: '%', source: 'LNATRESR',
		description: 'Loan-loss allowance as a percentage of noncurrent loans and leases.', direction: 'higher',
		change: 'percentage_points', aggregation: 'distribution_only', endpointDependency: 'reported', valueField: 'lnatresr', aliases: ['reserveCoverage']
	},
	{
		id: 'rbc1rwaj', label: 'Tier 1 risk-based capital ratio', shortLabel: 'Tier 1 capital', category: 'capital',
		unit: 'percent', displayUnit: '%', source: 'RBC1RWAJ',
		description: 'Tier 1 capital as a percentage of risk-weighted assets.', direction: 'higher',
		change: 'percentage_points', aggregation: 'distribution_only', endpointDependency: 'reported', valueField: 'rbc1rwaj', aliases: ['tier1Ratio'],
		screen: { id: 'tier1Ratio', unit: 'percent', minimum: -1_000, maximum: 1_000, integer: false, snapshotField: 'latest_tier1_ratio' }
	},
	{
		id: 'rbcrwaj', label: 'Total risk-based capital ratio', shortLabel: 'Total capital', category: 'capital',
		unit: 'percent', displayUnit: '%', source: 'RBCRWAJ',
		description: 'Total qualifying capital as a percentage of risk-weighted assets.', direction: 'higher',
		change: 'percentage_points', aggregation: 'distribution_only', endpointDependency: 'reported', valueField: 'rbcrwaj', aliases: ['totalCapitalRatio']
	},
	{
		id: 'rbc1aaj', label: 'Tier 1 leverage ratio', shortLabel: 'Tier 1 leverage', category: 'capital',
		unit: 'percent', displayUnit: '%', source: 'RBC1AAJ',
		description: 'Tier 1 capital as a percentage of average consolidated assets.', direction: 'higher',
		change: 'percentage_points', aggregation: 'distribution_only', endpointDependency: 'reported', valueField: 'rbc1aaj', aliases: ['tier1LeverageRatio']
	},
	{
		id: 'eqv', label: 'Equity-to-assets ratio', shortLabel: 'Equity / assets', category: 'capital',
		unit: 'percent', displayUnit: '%', source: 'EQV',
		description: 'Total equity capital as a percentage of total assets.', direction: 'higher',
		change: 'percentage_points', aggregation: 'distribution_only', endpointDependency: 'reported', valueField: 'eqv', aliases: ['equityToAssets']
	},
	{
		id: 'numemp', label: 'Employees', shortLabel: 'Employees', category: 'operating_scale',
		unit: 'count', displayUnit: 'FTE', source: 'NUMEMP',
		description: 'Full-time-equivalent employees reported for the institution.', direction: 'neutral',
		change: 'percent_change', aggregation: 'additive', endpointDependency: 'reported', valueField: 'numemp', aliases: ['employees'],
		screen: { id: 'employees', unit: 'count', minimum: 0, maximum: 100_000_000, integer: true, snapshotField: 'num_employees' }
	},
	{
		id: 'offdom', label: 'Domestic offices', shortLabel: 'Offices', category: 'operating_scale',
		unit: 'count', displayUnit: 'offices', source: 'OFFDOM',
		description: 'Current reported count of domestic offices, including the headquarters.', direction: 'neutral',
		change: 'absolute_change', aggregation: 'additive', endpointDependency: 'latest_snapshot', latestInstitutionField: 'num_branches', aliases: ['domesticOffices'],
		screen: { id: 'domesticOffices', unit: 'count', minimum: 0, maximum: 100_000_000, integer: true, snapshotField: 'num_branches' }
	}
] as const satisfies readonly ResearchMetricDefinitionShape[];

export type ResearchMetric = typeof RESEARCH_METRICS[number]['id'];
export type ResearchMetricDefinition = typeof RESEARCH_METRICS[number];
export type ScreenableResearchMetricDefinition = Extract<ResearchMetricDefinition, { screen: ScreenMetricDefinition }>;
export type ResearchScreenMetric = ScreenableResearchMetricDefinition['screen']['id'];

export const RESEARCH_METRIC_IDS = RESEARCH_METRICS.map((metric) => metric.id) as ResearchMetric[];
export const DEFAULT_WORKSPACE_METRICS: readonly ResearchMetric[] = [
	'asset', 'dep', 'roa', 'nimy', 'loanGrowth', 'nclnlsr'
];
export const WORKSPACE_VISIBLE_METRIC_LIMIT = 6;

export const RESEARCH_RAW_FIELDS = [...new Set(RESEARCH_METRICS.flatMap((metric) => {
	if ('valueField' in metric && metric.valueField) return [metric.valueField];
	if ('derived' in metric && metric.derived === 'loan_growth_yoy') return ['lnlsnet'];
	if ('derived' in metric && metric.derived === 'quarterly_net_income') return ['netinc', 'netincq'];
	return [];
}))] as Array<keyof Financial>;

const DEFINITION_BY_ID = new Map<ResearchMetric, ResearchMetricDefinition>(
	RESEARCH_METRICS.map((definition) => [definition.id, definition])
);

const METRIC_ALIASES = new Map<string, ResearchMetric>(
	RESEARCH_METRICS.flatMap((definition) => [
		[definition.id, definition.id] as const,
		...('aliases' in definition ? definition.aliases.map((alias) => [alias, definition.id] as const) : [])
	])
);

export function researchMetricDefinition(metric: ResearchMetric): ResearchMetricDefinition {
	return DEFINITION_BY_ID.get(metric)!;
}

export function canonicalResearchMetric(value: string): ResearchMetric | null {
	return METRIC_ALIASES.get(value) ?? null;
}

export function isResearchMetric(value: string): value is ResearchMetric {
	return DEFINITION_BY_ID.has(value as ResearchMetric);
}

export function researchMetricsByCategory(category: ResearchMetricCategory): ResearchMetricDefinition[] {
	return RESEARCH_METRICS.filter((metric) => metric.category === category);
}

export interface ResearchMetricEndpointDependencies {
	metric: ResearchMetric;
	endpoint: string;
	status: 'supported' | 'latest_only' | 'invalid_period';
	requiredPeriods: string[];
	fallbackPeriods: string[];
	fetchPeriods: string[];
	sourceFields: string[];
}

export interface ResearchMetricHistoryDependencies {
	metrics: ResearchMetric[];
	endpoints: string[];
	status: 'supported' | 'includes_latest_only' | 'invalid_period';
	requiredPeriods: string[];
	fallbackPeriods: string[];
	fetchPeriods: string[];
	sourceFields: string[];
}

const FDIC_QUARTER_ENDS = ['0331', '0630', '0930', '1231'] as const;

function validReportingPeriod(period: string): boolean {
	return /^\d{4}(0331|0630|0930|1231)$/.test(period);
}

function previousReportingQuarter(period: string): string | null {
	if (!validReportingPeriod(period)) return null;
	const year = Number(period.slice(0, 4));
	const quarter = FDIC_QUARTER_ENDS.indexOf(period.slice(4) as typeof FDIC_QUARTER_ENDS[number]);
	return quarter === 0
		? `${year - 1}1231`
		: `${year}${FDIC_QUARTER_ENDS[quarter - 1]}`;
}

/**
 * Periods needed to materialize one metric at one endpoint. Fallback periods
 * are fetched opportunistically; the endpoint can still resolve from a direct
 * reported value when that fallback is absent.
 */
export function resolveResearchMetricEndpointDependencies(
	metric: ResearchMetric,
	endpoint: string
): ResearchMetricEndpointDependencies {
	const definition = researchMetricDefinition(metric);
	if (definition.endpointDependency === 'latest_snapshot') {
		return {
			metric, endpoint, status: 'latest_only', requiredPeriods: [], fallbackPeriods: [], fetchPeriods: [],
			sourceFields: [definition.latestInstitutionField]
		};
	}
	const sourceFields = 'valueField' in definition && definition.valueField
		? [definition.valueField]
		: definition.derived === 'loan_growth_yoy'
			? ['lnlsnet']
			: ['netincq', 'netinc'];
	if (!validReportingPeriod(endpoint)) {
		return {
			metric, endpoint, status: 'invalid_period', requiredPeriods: [], fallbackPeriods: [], fetchPeriods: [], sourceFields
		};
	}
	const requiredPeriods = [endpoint];
	const fallbackPeriods: string[] = [];
	if (definition.endpointDependency === 'prior_year') {
		requiredPeriods.push(`${Number(endpoint.slice(0, 4)) - 1}${endpoint.slice(4)}`);
	} else if (definition.endpointDependency === 'prior_quarter_fallback') {
		const prior = previousReportingQuarter(endpoint);
		if (prior) fallbackPeriods.push(prior);
	}
	return {
		metric,
		endpoint,
		status: 'supported',
		requiredPeriods,
		fallbackPeriods,
		fetchPeriods: [...new Set([...requiredPeriods, ...fallbackPeriods])],
		sourceFields
	};
}

/** Resolve the deterministic union of periods required for several endpoints. */
export function resolveResearchMetricHistoryDependencies(
	metrics: readonly ResearchMetric[],
	endpoints: readonly string[]
): ResearchMetricHistoryDependencies {
	const resolutions = metrics.flatMap((metric) =>
		endpoints.map((endpoint) => resolveResearchMetricEndpointDependencies(metric, endpoint))
	);
	const periods = (key: 'requiredPeriods' | 'fallbackPeriods') => [...new Set(
		resolutions.flatMap((resolution) => resolution[key])
	)].sort();
	const requiredPeriods = periods('requiredPeriods');
	const fallbackPeriods = periods('fallbackPeriods');
	return {
		metrics: [...new Set(metrics)],
		endpoints: [...new Set(endpoints)],
		status: resolutions.some((resolution) => resolution.status === 'invalid_period')
			? 'invalid_period'
			: resolutions.some((resolution) => resolution.status === 'latest_only')
				? 'includes_latest_only'
				: 'supported',
		requiredPeriods,
		fallbackPeriods,
		fetchPeriods: [...new Set([...requiredPeriods, ...fallbackPeriods])].sort(),
		sourceFields: [...new Set(resolutions.flatMap((resolution) => resolution.sourceFields))]
	};
}
