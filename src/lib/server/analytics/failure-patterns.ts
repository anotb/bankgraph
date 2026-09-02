import { queryAll, queryOne } from '$lib/server/db';
import { mad, median, stdev } from '$lib/server/analytics/robust-stats';
import type { ReleaseLineage } from '$lib/types';
import { EXPECTED_RELEASE_GENERATION_PARAM } from '$lib/server/release-lineage';

export const FAILURE_PATTERN_DEFAULT_START_YEAR = 2007;
export const FAILURE_PATTERN_DEFAULT_END_YEAR = 2012;
export const FAILURE_PATTERN_DEFAULT_QUARTERS = 8;
export const FAILURE_PATTERN_DEFAULT_LIMIT = 25;
export const FAILURE_PATTERN_MAX_LIMIT = 100;
export const FAILURE_PATTERN_MIN_QUARTERS = 4;
export const FAILURE_PATTERN_MAX_QUARTERS = 12;
export const FAILURE_PATTERN_MAX_YEAR_SPAN = 20;
export const FAILURE_PATTERN_MIN_YEAR = 1934;
export const FAILURE_PATTERN_MAX_YEAR = 2099;

export type FailurePatternMetricId =
	| 'roa'
	| 'net_interest_margin'
	| 'noncurrent_loan_ratio'
	| 'net_charge_off_ratio'
	| 'total_risk_based_capital_ratio'
	| 'loan_to_deposit_ratio'
	| 'loans_to_assets'
	| 'borrowed_funds_share'
	| 'real_estate_loan_share'
	| 'commercial_loan_share'
	| 'consumer_loan_share';

export interface FailurePatternRequest {
	startYear: number;
	endYear: number;
	quarters: number;
	limit: number;
}

export class FailurePatternInputError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'FailurePatternInputError';
	}
}

export interface FailurePatternFinancialRow {
	cert: number;
	repdte: string;
	asset: number | null;
	dep: number | null;
	lnlsnet: number | null;
	lnre: number | null;
	lnci: number | null;
	lncon: number | null;
	othbfhlb: number | null;
	roa: number | null;
	nimy: number | null;
	nclnlsr: number | null;
	nco_ratio: number | null;
	rbcrwaj: number | null;
	rbc1aaj: number | null;
	lnlsdepr: number | null;
}

export interface FailureHistoryRow extends FailurePatternFinancialRow {
	source_id: string;
	failure_cert: number;
	failure_name: string | null;
	failure_city: string | null;
	failure_state: string | null;
	fail_date: string;
	anchor_repdte: string;
	history_rank?: number;
}

export interface ActiveHistoryRow extends FailurePatternFinancialRow {
	name: string;
	city: string | null;
	state: string | null;
	active: number;
	history_rank?: number;
}

export interface ExactFailureHistory {
	sourceId: string;
	cert: number;
	name: string | null;
	city: string | null;
	state: string | null;
	failDate: string;
	anchorRepdte: string;
	rows: FailurePatternFinancialRow[];
}

export interface ExactActiveHistory {
	cert: number;
	name: string;
	city: string | null;
	state: string | null;
	anchorRepdte: string;
	rows: FailurePatternFinancialRow[];
}

export interface FailurePatternFeature {
	id: FailurePatternMetricId;
	label: string;
	unit: 'percent';
	sourceFields: string[];
	formula: string;
	scaleFloor: number;
	value(row: FailurePatternFinancialRow): number | null;
}

function finite(value: unknown): value is number {
	return typeof value === 'number' && Number.isFinite(value);
}

function reported(value: number | null): number | null {
	return finite(value) ? value : null;
}

function share(numerator: number | null, denominator: number | null): number | null {
	if (!finite(numerator) || !finite(denominator) || denominator <= 0) return null;
	return (numerator / denominator) * 100;
}

/** Fixed, declared feature set shared by the historical pattern and current-bank comparison. */
export const FAILURE_PATTERN_FEATURES: readonly FailurePatternFeature[] = [
	{
		id: 'roa', label: 'Return on assets', unit: 'percent', sourceFields: ['ROA'],
		formula: 'FDIC-reported annualized return on assets', scaleFloor: 0.25,
		value: (row) => reported(row.roa)
	},
	{
		id: 'net_interest_margin', label: 'Net interest margin', unit: 'percent', sourceFields: ['NIMY'],
		formula: 'FDIC-reported net interest margin', scaleFloor: 0.25,
		value: (row) => reported(row.nimy)
	},
	{
		id: 'noncurrent_loan_ratio', label: 'Noncurrent loan ratio', unit: 'percent', sourceFields: ['NCLNLSR'],
		formula: 'FDIC-reported loans 90+ days past due or in nonaccrual as a percentage of loans and leases', scaleFloor: 0.25,
		value: (row) => reported(row.nclnlsr)
	},
	{
		id: 'net_charge_off_ratio', label: 'Net charge-off ratio', unit: 'percent', sourceFields: ['NTLNLSR'],
		formula: 'FDIC-reported annualized net charge-offs as a percentage of average loans', scaleFloor: 0.25,
		value: (row) => reported(row.nco_ratio)
	},
	{
		id: 'total_risk_based_capital_ratio', label: 'Total risk-based capital ratio', unit: 'percent', sourceFields: ['RBCRWAJ'],
		formula: 'FDIC-reported total risk-based capital as a percentage of risk-weighted assets', scaleFloor: 1,
		value: (row) => reported(row.rbcrwaj)
	},
	{
		id: 'loan_to_deposit_ratio', label: 'Loan-to-deposit ratio', unit: 'percent', sourceFields: ['LNLSDEPR'],
		formula: 'FDIC-reported loans and leases as a percentage of deposits', scaleFloor: 5,
		value: (row) => reported(row.lnlsdepr)
	},
	{
		id: 'loans_to_assets', label: 'Loans as a share of assets', unit: 'percent', sourceFields: ['LNLSNET', 'ASSET'],
		formula: 'LNLSNET / ASSET × 100', scaleFloor: 5,
		value: (row) => share(row.lnlsnet, row.asset)
	},
	{
		id: 'borrowed_funds_share', label: 'Other borrowed funds as a share of assets', unit: 'percent', sourceFields: ['OTHBFHLB', 'ASSET'],
		formula: 'OTHBFHLB / ASSET × 100', scaleFloor: 2,
		value: (row) => share(row.othbfhlb, row.asset)
	},
	{
		id: 'real_estate_loan_share', label: 'Real estate loans as a share of loans', unit: 'percent', sourceFields: ['LNRE', 'LNLSNET'],
		formula: 'LNRE / LNLSNET × 100', scaleFloor: 5,
		value: (row) => share(row.lnre, row.lnlsnet)
	},
	{
		id: 'commercial_loan_share', label: 'Commercial loans as a share of loans', unit: 'percent', sourceFields: ['LNCI', 'LNLSNET'],
		formula: 'LNCI / LNLSNET × 100', scaleFloor: 3,
		value: (row) => share(row.lnci, row.lnlsnet)
	},
	{
		id: 'consumer_loan_share', label: 'Consumer loans as a share of loans', unit: 'percent', sourceFields: ['LNCON', 'LNLSNET'],
		formula: 'LNCON / LNLSNET × 100', scaleFloor: 2,
		value: (row) => share(row.lncon, row.lnlsnet)
	}
] as const;

const ALLOWED_QUERY_PARAMS = new Set([
	'start_year', 'end_year', 'quarters', 'limit', EXPECTED_RELEASE_GENERATION_PARAM
]);

function boundedInteger(
	raw: string | null,
	name: string,
	fallback: number,
	minimum: number,
	maximum: number
): number {
	if (raw === null || raw === '') return fallback;
	if (!/^(0|[1-9]\d*)$/.test(raw)) throw new FailurePatternInputError(`${name} must be an integer`);
	const value = Number(raw);
	if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
		throw new FailurePatternInputError(`${name} must be between ${minimum} and ${maximum}`);
	}
	return value;
}

export function parseFailurePatternRequest(searchParams: URLSearchParams): FailurePatternRequest {
	const seen = new Set<string>();
	for (const key of searchParams.keys()) {
		if (!ALLOWED_QUERY_PARAMS.has(key)) throw new FailurePatternInputError(`Unknown query parameter: ${key}`);
		if (seen.has(key)) throw new FailurePatternInputError(`Duplicate query parameter: ${key}`);
		seen.add(key);
	}
	const startYear = boundedInteger(
		searchParams.get('start_year'), 'start_year', FAILURE_PATTERN_DEFAULT_START_YEAR,
		FAILURE_PATTERN_MIN_YEAR, FAILURE_PATTERN_MAX_YEAR
	);
	const endYear = boundedInteger(
		searchParams.get('end_year'), 'end_year', FAILURE_PATTERN_DEFAULT_END_YEAR,
		FAILURE_PATTERN_MIN_YEAR, FAILURE_PATTERN_MAX_YEAR
	);
	if (startYear > endYear) throw new FailurePatternInputError('start_year must not exceed end_year');
	if (endYear - startYear + 1 > FAILURE_PATTERN_MAX_YEAR_SPAN) {
		throw new FailurePatternInputError(`failure-year span must not exceed ${FAILURE_PATTERN_MAX_YEAR_SPAN} years`);
	}
	return {
		startYear,
		endYear,
		quarters: boundedInteger(
			searchParams.get('quarters'), 'quarters', FAILURE_PATTERN_DEFAULT_QUARTERS,
			FAILURE_PATTERN_MIN_QUARTERS, FAILURE_PATTERN_MAX_QUARTERS
		),
		limit: boundedInteger(
			searchParams.get('limit'), 'limit', FAILURE_PATTERN_DEFAULT_LIMIT, 1, FAILURE_PATTERN_MAX_LIMIT
		)
	};
}

const QUARTER_ENDS = ['0331', '0630', '0930', '1231'] as const;

function parseQuarterEnd(repdte: string): { year: number; quarterIndex: number } | null {
	if (!/^\d{8}$/.test(repdte)) return null;
	const year = Number(repdte.slice(0, 4));
	const quarterIndex = QUARTER_ENDS.indexOf(repdte.slice(4) as (typeof QUARTER_ENDS)[number]);
	return Number.isSafeInteger(year) && quarterIndex >= 0 ? { year, quarterIndex } : null;
}

export function previousQuarterEnd(repdte: string): string | null {
	const parsed = parseQuarterEnd(repdte);
	if (!parsed) return null;
	const quarterIndex = parsed.quarterIndex === 0 ? 3 : parsed.quarterIndex - 1;
	const year = parsed.quarterIndex === 0 ? parsed.year - 1 : parsed.year;
	return `${year}${QUARTER_ENDS[quarterIndex]}`;
}

export function exactQuarterEnds(anchor: string, quarters: number): string[] {
	if (!Number.isSafeInteger(quarters) || quarters < 1) return [];
	const dates = [anchor];
	while (dates.length < quarters) {
		const prior = previousQuarterEnd(dates[0]);
		if (!prior) return [];
		dates.unshift(prior);
	}
	return dates;
}

function baseFinancialRow(row: FailurePatternFinancialRow): FailurePatternFinancialRow {
	return {
		cert: row.cert,
		repdte: row.repdte,
		asset: row.asset,
		dep: row.dep,
		lnlsnet: row.lnlsnet,
		lnre: row.lnre,
		lnci: row.lnci,
		lncon: row.lncon,
		othbfhlb: row.othbfhlb,
		roa: row.roa,
		nimy: row.nimy,
		nclnlsr: row.nclnlsr,
		nco_ratio: row.nco_ratio,
		rbcrwaj: row.rbcrwaj,
		rbc1aaj: row.rbc1aaj,
		lnlsdepr: row.lnlsdepr
	};
}

function exactRows<T extends FailurePatternFinancialRow>(
	rows: readonly T[],
	anchor: string,
	quarters: number
): FailurePatternFinancialRow[] | null {
	const expected = exactQuarterEnds(anchor, quarters);
	if (expected.length !== quarters) return null;
	const byDate = new Map(rows.map((row) => [row.repdte, row]));
	const selected = expected.map((repdte) => byDate.get(repdte));
	return selected.every((row): row is T => row !== undefined)
		? selected.map(baseFinancialRow)
		: null;
}

/**
 * Re-validates SQL output in process. A row on or after the failure date is
 * discarded, so a future or same-day observation can never become the anchor.
 */
export function prepareExactFailureHistories(
	rows: readonly FailureHistoryRow[],
	quarters: number
): ExactFailureHistory[] {
	const grouped = new Map<string, FailureHistoryRow[]>();
	for (const row of rows) {
		const group = grouped.get(row.source_id) ?? [];
		group.push(row);
		grouped.set(row.source_id, group);
	}
	const histories: ExactFailureHistory[] = [];
	for (const [sourceId, group] of grouped) {
		const first = group[0];
		const eligible = group.filter((row) => row.repdte < first.fail_date);
		const anchor = eligible.map((row) => row.repdte).sort().at(-1);
		if (!anchor) continue;
		const selected = exactRows(eligible, anchor, quarters);
		if (!selected) continue;
		histories.push({
			sourceId,
			cert: first.failure_cert,
			name: first.failure_name,
			city: first.failure_city,
			state: first.failure_state,
			failDate: first.fail_date,
			anchorRepdte: anchor,
			rows: selected
		});
	}
	return histories.sort((a, b) => a.failDate.localeCompare(b.failDate) || a.cert - b.cert || a.sourceId.localeCompare(b.sourceId));
}

export function prepareExactActiveHistories(
	rows: readonly ActiveHistoryRow[],
	quarters: number,
	expectedAnchor?: string | null
): ExactActiveHistory[] {
	const grouped = new Map<number, ActiveHistoryRow[]>();
	for (const row of rows) {
		if (row.active !== 1) continue;
		const group = grouped.get(row.cert) ?? [];
		group.push(row);
		grouped.set(row.cert, group);
	}
	const inferredAnchor = rows.map((row) => row.repdte).sort().at(-1) ?? null;
	const anchor = expectedAnchor ?? inferredAnchor;
	if (!anchor) return [];
	const histories: ExactActiveHistory[] = [];
	for (const [cert, group] of grouped) {
		const selected = exactRows(group, anchor, quarters);
		if (!selected) continue;
		const first = group[0];
		histories.push({
			cert,
			name: first.name,
			city: first.city,
			state: first.state,
			anchorRepdte: anchor,
			rows: selected
		});
	}
	return histories.sort((a, b) => a.cert - b.cert);
}

function quantile(values: readonly number[], fraction: number): number | null {
	if (values.length === 0) return null;
	const sorted = [...values].sort((a, b) => a - b);
	const position = (sorted.length - 1) * fraction;
	const lower = Math.floor(position);
	const upper = Math.ceil(position);
	if (lower === upper) return sorted[lower];
	return sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower);
}

function round(value: number | null, digits = 6): number | null {
	if (value === null || !Number.isFinite(value)) return null;
	const result = Number(value.toFixed(digits));
	return Object.is(result, -0) ? 0 : result;
}

export type FailurePatternScaleMethod = 'mad' | 'iqr' | 'stdev' | 'feature_floor';

function distribution(values: readonly number[], scaleFloor: number) {
	const center = median([...values]);
	const p25 = quantile(values, 0.25);
	const p75 = quantile(values, 0.75);
	const madValue = mad([...values]);
	const madScale = madValue === null ? null : madValue * 1.4826;
	const iqrScale = p25 === null || p75 === null ? null : (p75 - p25) / 1.349;
	const standardDeviation = stdev([...values]);
	let scale = scaleFloor;
	let scaleMethod: FailurePatternScaleMethod = 'feature_floor';
	if (madScale !== null && madScale > 0) {
		scale = madScale;
		scaleMethod = 'mad';
	} else if (iqrScale !== null && iqrScale > 0) {
		scale = iqrScale;
		scaleMethod = 'iqr';
	} else if (standardDeviation > 0) {
		scale = standardDeviation;
		scaleMethod = 'stdev';
	}
	return {
		median: round(center),
		p25: round(p25),
		p75: round(p75),
		scale: round(scale) as number,
		scaleMethod
	};
}

export interface FailurePatternPoint {
	relativeQuarter: number;
	median: number | null;
	q25: number | null;
	q75: number | null;
	count: number;
	cohortCount: number;
	coverage: number;
	referenceScale: number;
	referenceScaleMethod: FailurePatternScaleMethod;
}

export interface FailurePatternSeries {
	metric: FailurePatternMetricId;
	label: string;
	unit: 'percent';
	points: FailurePatternPoint[];
}

export function deriveFailurePattern(
	histories: readonly ExactFailureHistory[],
	quarters: number
): FailurePatternSeries[] {
	return FAILURE_PATTERN_FEATURES.map((feature) => ({
		metric: feature.id,
		label: feature.label,
		unit: feature.unit,
		points: Array.from({ length: quarters }, (_, index) => {
			const values = histories
				.map((history) => feature.value(history.rows[index]))
				.filter((value): value is number => value !== null);
			const stats = distribution(values, feature.scaleFloor);
			return {
				relativeQuarter: index - quarters,
				median: stats.median,
				q25: stats.p25,
				q75: stats.p75,
				count: values.length,
				cohortCount: histories.length,
				coverage: histories.length === 0 ? 0 : round(values.length / histories.length) as number,
				referenceScale: stats.scale,
				referenceScaleMethod: stats.scaleMethod
			};
		})
	}));
}

export interface AnalogueObservation {
	relativeQuarter: number;
	bankValue: number | null;
	patternMedian: number | null;
	standardizedDifference: number | null;
}

export interface AnalogueFeatureContribution {
	metric: FailurePatternMetricId;
	label: string;
	observedPeriods: number;
	expectedPeriods: number;
	coverage: number;
	rmsStandardizedDistance: number | null;
	squaredDistanceShare: number;
	observations: AnalogueObservation[];
}

export interface CurrentAnalogue {
	rank: number;
	cert: number;
	name: string;
	city: string | null;
	state: string | null;
	asOf: string;
	distance: number;
	coverageAdjustedDistance: number;
	coverage: {
		observedCells: number;
		referenceCells: number;
		expectedCells: number;
		missingBankCells: number;
		unavailableReferenceCells: number;
		ratio: number;
	};
	featureContributions: AnalogueFeatureContribution[];
}

interface RankedAnalogue extends Omit<CurrentAnalogue, 'rank'> {}

export function rankCurrentAnalogues(
	histories: readonly ExactActiveHistory[],
	pattern: readonly FailurePatternSeries[],
	limit: number
): CurrentAnalogue[] {
	const patternByMetric = new Map(pattern.map((series) => [series.metric, series]));
	const expectedCells = FAILURE_PATTERN_FEATURES.reduce((sum, feature) => {
		return sum + (patternByMetric.get(feature.id)?.points.length ?? 0);
	}, 0);
	const ranked: RankedAnalogue[] = [];

	for (const history of histories) {
		let totalSquaredDistance = 0;
		let observedCells = 0;
		let referenceCells = 0;
		const pending: Array<AnalogueFeatureContribution & { squaredDistance: number }> = [];

		for (const feature of FAILURE_PATTERN_FEATURES) {
			const series = patternByMetric.get(feature.id);
			if (!series) continue;
			let featureSquaredDistance = 0;
			let featureObserved = 0;
			let featureExpected = 0;
			const observations: AnalogueObservation[] = [];
			for (let index = 0; index < series.points.length; index += 1) {
				const point = series.points[index];
				const bankValue = history.rows[index] ? feature.value(history.rows[index]) : null;
				if (point.median !== null) {
					referenceCells += 1;
					featureExpected += 1;
				}
				const standardizedDifference = bankValue === null || point.median === null || point.referenceScale <= 0
					? null
					: (bankValue - point.median) / point.referenceScale;
				if (standardizedDifference !== null && Number.isFinite(standardizedDifference)) {
					const squared = standardizedDifference ** 2;
					featureSquaredDistance += squared;
					totalSquaredDistance += squared;
					featureObserved += 1;
					observedCells += 1;
				}
				observations.push({
					relativeQuarter: point.relativeQuarter,
					bankValue: round(bankValue),
					patternMedian: point.median,
					standardizedDifference: round(standardizedDifference)
				});
			}
			pending.push({
				metric: feature.id,
				label: feature.label,
				observedPeriods: featureObserved,
				expectedPeriods: featureExpected,
				coverage: featureExpected === 0 ? 0 : round(featureObserved / featureExpected) as number,
				rmsStandardizedDistance: featureObserved === 0
					? null
					: round(Math.sqrt(featureSquaredDistance / featureObserved)),
				squaredDistanceShare: 0,
				observations,
				squaredDistance: featureSquaredDistance
			});
		}

		if (observedCells === 0 || referenceCells === 0) continue;
		const coverageRatio = observedCells / referenceCells;
		const distance = Math.sqrt(totalSquaredDistance / observedCells);
		const featureContributions = pending.map(({ squaredDistance, ...entry }) => ({
			...entry,
			squaredDistanceShare: totalSquaredDistance === 0 ? 0 : round(squaredDistance / totalSquaredDistance) as number
		}));
		ranked.push({
			cert: history.cert,
			name: history.name,
			city: history.city,
			state: history.state,
			asOf: history.anchorRepdte,
			distance: round(distance) as number,
			coverageAdjustedDistance: round(distance / coverageRatio) as number,
			coverage: {
				observedCells,
				referenceCells,
				expectedCells,
				missingBankCells: referenceCells - observedCells,
				unavailableReferenceCells: expectedCells - referenceCells,
				ratio: round(coverageRatio) as number
			},
			featureContributions
		});
	}

	return ranked
		.sort((a, b) =>
			a.coverageAdjustedDistance - b.coverageAdjustedDistance
			|| a.distance - b.distance
			|| b.coverage.ratio - a.coverage.ratio
			|| a.cert - b.cert
		)
		.slice(0, limit)
		.map((entry, index) => ({ rank: index + 1, ...entry }));
}

interface FailureSourceSummary {
	total_failures: number | null;
	with_certificate: number | null;
}

const FINANCIAL_SELECT = [
	'asset', 'dep', 'lnlsnet', 'lnre', 'lnci', 'lncon', 'othbfhlb',
	'roa', 'nimy', 'nclnlsr', 'nco_ratio', 'rbcrwaj', 'rbc1aaj', 'lnlsdepr'
];

export const FAILURE_HISTORY_SQL = `
WITH selected_failures AS (
  SELECT source_id, cert, name, city, state, fail_date
  FROM failures
  WHERE transaction_type = 'FAILURE'
    AND cert IS NOT NULL
    AND fail_date >= ?
    AND fail_date <= ?
), anchored_failures AS (
  SELECT selected_failures.*,
    (
      SELECT MAX(financial.repdte)
      FROM published_financials AS financial
      WHERE financial.cert = selected_failures.cert
        AND financial.repdte < selected_failures.fail_date
    ) AS anchor_repdte
  FROM selected_failures
), ranked_history AS (
  SELECT
    failure.source_id,
    failure.cert AS failure_cert,
    failure.name AS failure_name,
    failure.city AS failure_city,
    failure.state AS failure_state,
    failure.fail_date,
    failure.anchor_repdte,
    financial.cert,
    financial.repdte,
    ${FINANCIAL_SELECT.map((column) => `financial.${column}`).join(',\n    ')},
    ROW_NUMBER() OVER (
      PARTITION BY failure.source_id
      ORDER BY financial.repdte DESC
    ) AS history_rank
  FROM anchored_failures AS failure
  JOIN published_financials AS financial
    ON financial.cert = failure.cert
   AND financial.repdte <= failure.anchor_repdte
  WHERE failure.anchor_repdte IS NOT NULL
)
SELECT *
FROM ranked_history
WHERE history_rank <= ?
ORDER BY fail_date ASC, failure_cert ASC, source_id ASC, repdte DESC`;

export interface ActiveHistoryPlan {
	sql: string;
	params: string[];
}

/**
 * Read only the requested published quarter ends. Filtering on REPDTE lets D1
 * use the quarter index instead of ranking the full financial-history table.
 */
export function buildActiveHistoryPlan(anchor: string, quarters: number): ActiveHistoryPlan {
	const dates = exactQuarterEnds(anchor, quarters);
	if (dates.length !== quarters) throw new Error('Published release is not an FDIC quarter end');
	return {
		sql: `
SELECT
  institution.cert,
  institution.name,
  institution.city,
  institution.state,
  institution.active,
  financial.repdte,
  ${FINANCIAL_SELECT.map((column) => `financial.${column}`).join(',\n  ')}
FROM published_financials AS financial
JOIN published_institutions AS institution
  ON institution.cert = financial.cert
WHERE institution.active = 1
  AND financial.repdte IN (${dates.map(() => '?').join(', ')})
ORDER BY institution.cert ASC, financial.repdte DESC`,
		params: dates
	};
}

export interface FailurePatternsResponse {
	analysis: 'historical_failure_pattern_and_current_similarity';
	semantics: {
		kind: 'descriptive_similarity';
		statement: string;
		notA: string[];
	};
	request: FailurePatternRequest & {
		transactionType: 'FAILURE';
		anchorRule: 'latest FDIC quarter strictly before failure date';
	};
	featureSet: Array<{
		id: FailurePatternMetricId;
		label: string;
		unit: 'percent';
		sourceFields: string[];
		formula: string;
	}>;
	historicalCohort: {
		sourceFailureRecords: number;
		withCertificate: number;
		withPreFailureAnchor: number;
		withExactQuarterHistory: number;
		excludedWithoutCertificate: number;
		excludedWithoutAnchor: number;
		excludedForQuarterGaps: number;
		members: Array<{
			sourceId: string;
			cert: number;
			name: string | null;
			city: string | null;
			state: string | null;
			failDate: string;
			anchorRepdte: string;
		}>;
	};
	eventStudy: {
		timeBasis: 'quarters before failure';
		series: FailurePatternSeries[];
	};
	currentAnalogues: {
		asOf: string | null;
		activeInstitutionsWithFinancialRows: number;
		withExactQuarterHistory: number;
		returned: number;
		rankingMethod: string;
		data: CurrentAnalogue[];
	};
	methodology: {
		historicalMembership: string;
		quarterCompleteness: string;
		referenceCenter: string;
		referenceScale: string;
		missingness: string;
		ranking: string;
		controls: string;
	};
	provenance: ReleaseLineage & {
		source: 'FDIC BankFind Suite';
		sourceUrl: 'https://banks.data.fdic.gov/bankfind-suite';
		datasets: ['Failures & Assistance Transactions', 'Financials', 'Institutions'];
		sourceAsOf: string | null;
		sourceFields: Record<FailurePatternMetricId, string[]>;
	};
}

export async function analyzeFailurePatterns(
	db: D1Database,
	request: FailurePatternRequest,
	lineage: ReleaseLineage
): Promise<FailurePatternsResponse> {
	if (!lineage.release) throw new Error('Published release is unavailable');
	const startDate = `${request.startYear}0101`;
	const endDate = `${request.endYear}1231`;
	const activeHistoryPlan = buildActiveHistoryPlan(lineage.release, request.quarters);
	const [summary, failureRows, activeRows] = await Promise.all([
		queryOne<FailureSourceSummary>(
			db,
			`SELECT
			  COUNT(*) AS total_failures,
			  SUM(CASE WHEN cert IS NOT NULL THEN 1 ELSE 0 END) AS with_certificate
			 FROM failures
			 WHERE transaction_type = 'FAILURE'
			   AND fail_date >= ?
			   AND fail_date <= ?`,
			[startDate, endDate]
		),
		queryAll<FailureHistoryRow>(db, FAILURE_HISTORY_SQL, [startDate, endDate, request.quarters]),
		queryAll<ActiveHistoryRow>(db, activeHistoryPlan.sql, activeHistoryPlan.params)
	]);

	const historicalHistories = prepareExactFailureHistories(failureRows, request.quarters);
	const activeHistories = prepareExactActiveHistories(activeRows, request.quarters, lineage.release);
	const pattern = deriveFailurePattern(historicalHistories, request.quarters);
	const analogues = rankCurrentAnalogues(activeHistories, pattern, request.limit);
	const sourceFailureRecords = Number(summary?.total_failures ?? 0);
	const withCertificate = Number(summary?.with_certificate ?? 0);
	const anchoredFailureIds = new Set(failureRows.map((row) => row.source_id)).size;
	const activeInstitutionsWithFinancialRows = new Set(activeRows.map((row) => row.cert)).size;

	return {
		analysis: 'historical_failure_pattern_and_current_similarity',
		semantics: {
			kind: 'descriptive_similarity',
			statement: 'Current analogues have reported financial trajectories that are mathematically similar to the historical pre-failure median pattern over the selected quarters.',
			notA: ['failure probability', 'forecast', 'supervisory rating', 'investment recommendation']
		},
		request: {
			...request,
			transactionType: 'FAILURE',
			anchorRule: 'latest FDIC quarter strictly before failure date'
		},
		featureSet: FAILURE_PATTERN_FEATURES.map(({ id, label, unit, sourceFields, formula }) => ({
			id, label, unit, sourceFields, formula
		})),
		historicalCohort: {
			sourceFailureRecords,
			withCertificate,
			withPreFailureAnchor: anchoredFailureIds,
			withExactQuarterHistory: historicalHistories.length,
			excludedWithoutCertificate: sourceFailureRecords - withCertificate,
			excludedWithoutAnchor: Math.max(0, withCertificate - anchoredFailureIds),
			excludedForQuarterGaps: Math.max(0, anchoredFailureIds - historicalHistories.length),
			members: historicalHistories.map((history) => ({
				sourceId: history.sourceId,
				cert: history.cert,
				name: history.name,
				city: history.city,
				state: history.state,
				failDate: history.failDate,
				anchorRepdte: history.anchorRepdte
			}))
		},
		eventStudy: {
			timeBasis: 'quarters before failure',
			series: pattern
		},
		currentAnalogues: {
			asOf: lineage.release ?? activeHistories[0]?.anchorRepdte ?? null,
			activeInstitutionsWithFinancialRows,
			withExactQuarterHistory: activeHistories.length,
			returned: analogues.length,
			rankingMethod: 'Ascending root-mean-square robust-standardized distance, divided by observed reference-cell coverage; ties resolve by raw distance, coverage, then FDIC certificate number.',
			data: analogues
		},
		methodology: {
			historicalMembership: 'FDIC Failures & Assistance rows whose transaction type is FAILURE and whose effective date falls within the selected years.',
			quarterCompleteness: 'Every included institution has the requested number of exact consecutive FDIC quarter ends. Historical windows end at the latest reported quarter strictly before the failure date. Current windows end at the published release.',
			referenceCenter: 'For each feature and relative quarter, the historical reference is the median across eligible failed banks.',
			referenceScale: 'Differences use median absolute deviation × 1.4826. Zero-scale cells fall back in order to IQR / 1.349, sample standard deviation, then the declared feature scale floor.',
			missingness: 'Null feature values do not become zeros. Each analogue reports observed, missing, and unavailable reference cells. The ranking divides the observed-cell distance by coverage so sparse matches do not receive a free advantage.',
			ranking: 'This is descriptive trajectory similarity. It is not calibrated to failure frequency and does not estimate the chance that an institution will fail.',
			controls: 'No survivor-control matching runs in the request path; the endpoint stays bounded to one historical event cohort and the latest exact histories of active institutions.'
		},
		provenance: {
			...lineage,
			source: 'FDIC BankFind Suite',
			sourceUrl: 'https://banks.data.fdic.gov/bankfind-suite',
			datasets: ['Failures & Assistance Transactions', 'Financials', 'Institutions'],
			sourceAsOf: lineage.release,
			sourceFields: Object.fromEntries(
				FAILURE_PATTERN_FEATURES.map((feature) => [feature.id, feature.sourceFields])
			) as Record<FailurePatternMetricId, string[]>
		}
	};
}
