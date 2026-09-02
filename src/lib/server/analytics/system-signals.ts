/**
 * Recurring, deterministic banking-system signals.
 *
 * This module turns institution-quarter FDIC rows into a bounded set of
 * auditable questions. It describes levels and movements; it never assigns a
 * cause. All comparisons use exact calendar-adjacent quarters.
 */

import { mad, median } from './robust-stats';
import { isConsecutiveQuarter, previousQuarterDate } from './change-attribution';
import { deriveCohortTransition, type CohortTransitionMetricSummary } from '$lib/analytics/cohort-transition';
import type { ResearchMetric } from '$lib/research-metrics';
import type { ReleaseLineage } from '$lib/types';

export const SYSTEM_SIGNAL_VERSION = 'bankgraph-system-signals-v2';
export const SYSTEM_CHANGE_RADAR_VERSION = 'bankgraph-system-change-radar-v1';
export const MAX_SYSTEM_SIGNALS = 14;
const MAX_CHANGE_RADAR_CONTRIBUTORS = 5;
const MIN_COHORT_SIZE = 15;
const MAD_SCALE = 1.4826;
const FDIC_RELEASE_LAG_DAYS = 55;

export type SystemSignalKind = 'level' | 'movement' | 'data_event';
export type SignalDirection = 'higher' | 'lower' | 'flat' | 'data_gap';
export type DirectionInterpretation = 'favorable' | 'adverse' | 'neutral' | 'not_assessed';
export type SignalUnit = 'usd_thousands' | 'percent' | 'percentage_points' | 'institutions';

export interface SystemFinancialRow {
	cert: number;
	repdte: string;
	name: string | null;
	state: string | null;
	asset_bucket: number | null;
	asset: number | null;
	dep: number | null;
	lnlsnet: number | null;
	netinc: number | null;
	netincq: number | null;
	nimy: number | null;
	nclnlsr: number | null;
	rbcrwaj: number | null;
}

export type SystemChangeRadarMetricId = 'total_assets' | 'total_deposits' | 'net_loans';

export interface SystemChangeRadarContributor {
	cert: number;
	name: string;
	state: string | null;
	change: number;
	shareOfGrossMovement: number;
}

export interface SystemChangeRadarMetric {
	id: SystemChangeRadarMetricId;
	label: string;
	field: 'ASSET' | 'DEP' | 'LNLSNET';
	unit: 'usd_thousands';
	population: {
		eligible: number;
		percentChangeEligible: number;
	};
	breadth: {
		increasing: number;
		decreasing: number;
		unchanged: number;
		increasingShare: number;
		decreasingShare: number;
		unchangedShare: number;
		medianPercentChange: number | null;
	};
	matchedTotals: {
		prior: number;
		current: number;
		change: number;
		percentChange: number | null;
	};
	contributors: {
		method: 'share_of_gross_absolute_matched_bank_change';
		grossMovement: number;
		limitPerDirection: typeof MAX_CHANGE_RADAR_CONTRIBUTORS;
		increases: SystemChangeRadarContributor[];
		decreases: SystemChangeRadarContributor[];
	};
}

export interface SystemChangeRadar {
	version: typeof SYSTEM_CHANGE_RADAR_VERSION;
	period: { current: string; prior: string };
	population: {
		definition: 'same_institution_reporting_exact_consecutive_quarters';
		currentReportingInstitutions: number;
		priorReportingInstitutions: number;
		matchedInstitutions: number;
		entriesAndExits: 'excluded_from_breadth_and_contributors';
	};
	metrics: SystemChangeRadarMetric[];
	source: {
		dataset: 'FDIC BankFind Financials';
		grain: 'institution_quarter';
		monetaryUnit: 'usd_thousands';
		method: string;
	};
}

export interface MacroOverlay {
	seriesId: string;
	title: string | null;
	frequency: string | null;
	units: string | null;
	observationDate: string;
	value: number;
}

export interface SignalCoverage {
	populationCurrent: number;
	populationPrior: number;
	availableCurrent: number;
	availablePrior: number;
	paired: number;
	ratio: number;
	minimumCohortSize: number | null;
	status: 'complete' | 'partial' | 'insufficient';
}

export interface SystemSignal {
	id: string;
	rank: number;
	kind: SystemSignalKind;
	metric: string;
	population: {
		id: string;
		label: string;
		filters: Record<string, string | number | boolean>;
	};
	title: string;
	question: string;
	current: { value: number | null; unit: SignalUnit };
	prior: { value: number | null; unit: SignalUnit };
	change: { absolute: number | null; percent: number | null; unit: SignalUnit };
	comparison: {
		benchmark: string;
		value: number | null;
		unit: SignalUnit;
		p25: number | null;
		p75: number | null;
	};
	materiality: {
		band: 'small' | 'moderate' | 'large' | 'not_assessed';
		method: 'absolute_and_relative_change_v1' | 'not_assessed';
	};
	rarity: {
		band: 'typical' | 'notable' | 'unusual' | 'not_assessed';
		method: 'robust_z_mad' | 'zero_dispersion' | 'not_assessed';
		robustZ: number | null;
		percentile: number | null;
	};
	direction: {
		movement: SignalDirection;
		interpretation: DirectionInterpretation;
	};
	period: { current: string; prior: string | null; comparison: 'consecutive_quarter' | 'current_level' };
	source: {
		dataset: 'FDIC BankFind Financials';
		fields: string[];
		formula: string;
		version: typeof SYSTEM_SIGNAL_VERSION;
	};
	coverage: SignalCoverage;
}

export interface SystemBrief {
	status: 'complete' | 'partial' | 'unavailable';
	generatedAt: string;
	reportingPeriod: {
		current: string | null;
		prior: string | null;
		expectedPrior: string | null;
		expectedLatest: string;
		isStale: boolean;
	};
	signals: SystemSignal[];
	changeRadar: SystemChangeRadar | null;
	macroOverlays: {
		status: 'available' | 'partial' | 'unavailable';
		usage: 'context_only_no_causal_inference';
		series: MacroOverlay[];
	};
	warnings: string[];
	methodology: {
		version: typeof SYSTEM_SIGNAL_VERSION;
		grain: 'institution_quarter';
		movementJoin: 'same_institution_exact_consecutive_calendar_quarter';
		cohortPolicy: 'opening_quarter_size_bucket_or_current_master_state';
		causality: 'not_inferred';
	};
}

export type SystemBriefResponse = SystemBrief & ReleaseLineage;

export interface DeriveSystemBriefInput {
	currentRepdte: string | null;
	rows: SystemFinancialRow[];
	macroOverlays?: MacroOverlay[] | null;
	now?: Date;
}

interface Distribution {
	median: number | null;
	p25: number | null;
	p75: number | null;
	mad: number | null;
}

interface SignalSpec {
	id: string;
	rank: number;
	kind: SystemSignalKind;
	metric: string;
	title: string;
	question: string;
	populationId?: string;
	populationLabel?: string;
	populationFilters?: Record<string, string | number | boolean>;
	current: number | null;
	prior: number | null;
	unit: SignalUnit;
	changeUnit?: SignalUnit;
	benchmark: string;
	benchmarkValue: number | null;
	comparisonUnit?: SignalUnit;
	distribution?: number[];
	fields: string[];
	formula: string;
	coverage: SignalCoverage;
	interpretation?: (direction: SignalDirection) => DirectionInterpretation;
}

function finite(value: number | null | undefined): value is number {
	return typeof value === 'number' && Number.isFinite(value);
}

function quantile(values: number[], q: number): number | null {
	if (values.length === 0) return null;
	const sorted = [...values].sort((a, b) => a - b);
	const index = (sorted.length - 1) * q;
	const lower = Math.floor(index);
	const fraction = index - lower;
	return sorted[lower + 1] === undefined
		? sorted[lower]
		: sorted[lower] + fraction * (sorted[lower + 1] - sorted[lower]);
}

function distribution(values: number[]): Distribution {
	return {
		median: median(values),
		p25: quantile(values, 0.25),
		p75: quantile(values, 0.75),
		mad: mad(values)
	};
}

function percentChange(from: number, to: number): number | null {
	return from === 0 ? null : ((to - from) / Math.abs(from)) * 100;
}

function directionFor(change: number | null, scale: number): SignalDirection {
	if (change === null) return 'data_gap';
	if (Math.abs(change) <= scale * 1e-9) return 'flat';
	return change > 0 ? 'higher' : 'lower';
}

function defaultInterpretation(): DirectionInterpretation {
	return 'not_assessed';
}

function rarityFor(value: number | null, values: number[]): SystemSignal['rarity'] {
	if (value === null || values.length < 3) {
		return { band: 'not_assessed', method: 'not_assessed', robustZ: null, percentile: null };
	}
	const stats = distribution(values);
	const percentile = (values.filter((candidate) => candidate <= value).length / values.length) * 100;
	if (stats.median === null || stats.mad === null || stats.mad === 0) {
		return { band: 'typical', method: 'zero_dispersion', robustZ: null, percentile };
	}
	const robustZ = (value - stats.median) / (stats.mad * MAD_SCALE);
	const magnitude = Math.abs(robustZ);
	return {
		band: magnitude >= 2 ? 'unusual' : magnitude >= 1 ? 'notable' : 'typical',
		method: 'robust_z_mad',
		robustZ,
		percentile
	};
}

function materialityFor(unit: SignalUnit, absolute: number | null, pct: number | null): SystemSignal['materiality'] {
	if (absolute === null) return { band: 'not_assessed', method: 'not_assessed' };
	let magnitude: number;
	let moderate: number;
	let large: number;
	if (unit === 'percentage_points') {
		magnitude = Math.abs(absolute);
		moderate = 0.05;
		large = 0.25;
	} else {
		magnitude = Math.abs(pct ?? 0);
		moderate = 0.25;
		large = 1;
	}
	return {
		band: magnitude >= large ? 'large' : magnitude >= moderate ? 'moderate' : 'small',
		method: 'absolute_and_relative_change_v1'
	};
}

function coverageFor(
	currentRows: SystemFinancialRow[],
	priorRows: SystemFinancialRow[],
	currentAvailable: number,
	priorAvailable: number,
	paired: number,
	minimumCohortSize: number | null = null,
	requirePaired = true
): SignalCoverage {
	const currentDenominator = Math.max(currentRows.length, 1);
	const priorDenominator = Math.max(priorRows.length, 1);
	const ratio = currentAvailable / currentDenominator;
	const priorRatio = priorAvailable / priorDenominator;
	const pairedDenominator = Math.max(Math.min(currentAvailable, priorAvailable), 1);
	const pairedRatio = paired / pairedDenominator;
	const sufficientCohort = minimumCohortSize === null || paired >= minimumCohortSize;
	const completePeriods = ratio >= 0.95
		&& priorRows.length > 0
		&& priorRatio >= 0.95
		&& (!requirePaired || pairedRatio >= 0.95);
	return {
		populationCurrent: currentRows.length,
		populationPrior: priorRows.length,
		availableCurrent: currentAvailable,
		availablePrior: priorAvailable,
		paired,
		ratio,
		minimumCohortSize,
		status: completePeriods && sufficientCohort ? 'complete' : sufficientCohort ? 'partial' : 'insufficient'
	};
}

function buildSignal(spec: SignalSpec, currentRepdte: string, priorRepdte: string | null): SystemSignal {
	const absolute = spec.current !== null && spec.prior !== null ? spec.current - spec.prior : null;
	const pct = spec.current !== null && spec.prior !== null ? percentChange(spec.prior, spec.current) : null;
	const movement = directionFor(absolute, Math.max(Math.abs(spec.prior ?? 0), 1));
	const dist = distribution(spec.distribution ?? []);
	const changeUnit = spec.changeUnit ?? spec.unit;
	const comparableMovement = changeUnit === 'percentage_points' ? absolute : pct;
	return {
		id: spec.id,
		rank: spec.rank,
		kind: spec.kind,
		metric: spec.metric,
		population: {
			id: spec.populationId ?? 'fdic_reporting_institutions',
			label: spec.populationLabel ?? 'FDIC-insured institutions reporting in each period',
			filters: spec.populationFilters ?? { reportingBasis: 'domestic_office_consolidated' }
		},
		title: spec.title,
		question: spec.question,
		current: { value: spec.current, unit: spec.unit },
		prior: { value: spec.prior, unit: spec.unit },
		change: { absolute, percent: pct, unit: changeUnit },
		comparison: {
			benchmark: spec.benchmark,
			value: spec.benchmarkValue,
			unit: spec.comparisonUnit ?? (changeUnit === 'percentage_points' ? 'percentage_points' : 'percent'),
			p25: dist.p25,
			p75: dist.p75
		},
		materiality: spec.kind === 'data_event'
			? { band: 'not_assessed', method: 'not_assessed' }
			: materialityFor(changeUnit, absolute, pct),
		rarity: spec.kind === 'data_event'
			? { band: 'not_assessed', method: 'not_assessed', robustZ: null, percentile: null }
			: rarityFor(comparableMovement, spec.distribution ?? []),
		direction: {
			movement: spec.kind === 'data_event' && spec.coverage.status !== 'complete' ? 'data_gap' : movement,
			interpretation: (spec.interpretation ?? defaultInterpretation)(movement)
		},
		period: {
			current: currentRepdte,
			prior: priorRepdte,
			comparison: spec.kind === 'level' && spec.prior === null ? 'current_level' : 'consecutive_quarter'
		},
		source: {
			dataset: 'FDIC BankFind Financials',
			fields: spec.fields,
			formula: spec.formula,
			version: SYSTEM_SIGNAL_VERSION
		},
		coverage: spec.coverage
	};
}

function values(rows: SystemFinancialRow[], key: keyof SystemFinancialRow): number[] {
	return rows.map((row) => row[key]).filter((value): value is number => finite(value as number | null));
}

function sum(rows: SystemFinancialRow[], key: keyof SystemFinancialRow): number | null {
	const usable = values(rows, key);
	return usable.length === 0 ? null : usable.reduce((total, value) => total + value, 0);
}

function pairedMovements(
	currentRows: SystemFinancialRow[],
	priorByCert: Map<number, SystemFinancialRow>,
	key: keyof SystemFinancialRow,
	mode: 'percent' | 'points'
): number[] {
	const result: number[] = [];
	for (const current of currentRows) {
		const prior = priorByCert.get(current.cert);
		const from = prior?.[key];
		const to = current[key];
		if (!finite(from as number | null) || !finite(to as number | null)) continue;
		const movement = mode === 'percent'
			? percentChange(from as number, to as number)
			: (to as number) - (from as number);
		if (movement !== null) result.push(movement);
	}
	return result;
}

interface ChangeRadarSpec {
	id: SystemChangeRadarMetricId;
	label: string;
	key: Extract<ResearchMetric, 'asset' | 'dep' | 'lnlsnet'>;
	field: SystemChangeRadarMetric['field'];
}

const CHANGE_RADAR_SPECS: readonly ChangeRadarSpec[] = [
	{ id: 'total_assets', label: 'Total assets', key: 'asset', field: 'ASSET' },
	{ id: 'total_deposits', label: 'Total deposits', key: 'dep', field: 'DEP' },
	{ id: 'net_loans', label: 'Net loans and leases', key: 'lnlsnet', field: 'LNLSNET' }
];

function deriveChangeRadarMetric(
	spec: ChangeRadarSpec,
	metric: CohortTransitionMetricSummary
): SystemChangeRadarMetric {
	const totals = metric.additiveMatchedTotals!;
	const contributor = (observation: typeof metric.topMovers.increases[number]): SystemChangeRadarContributor => ({
		cert: observation.id as number,
		name: observation.name,
		state: observation.state,
		change: observation.change,
		shareOfGrossMovement: observation.shareOfGrossMovement
	});

	return {
		id: spec.id,
		label: spec.label,
		field: spec.field,
		unit: 'usd_thousands',
		population: {
			eligible: metric.coverage.paired,
			percentChangeEligible: metric.coverage.primaryChangeEligible
		},
		breadth: {
			increasing: metric.breadth.increasing,
			decreasing: metric.breadth.decreasing,
			unchanged: metric.breadth.unchanged,
			increasingShare: metric.breadth.increasingShare,
			decreasingShare: metric.breadth.decreasingShare,
			unchangedShare: metric.breadth.unchangedShare,
			medianPercentChange: metric.distribution.primaryChange.median
		},
		matchedTotals: {
			prior: totals.opening,
			current: totals.closing,
			change: totals.change,
			percentChange: totals.percentChange
		},
		contributors: {
			method: 'share_of_gross_absolute_matched_bank_change',
			grossMovement: metric.movement.grossAbsolute,
			limitPerDirection: MAX_CHANGE_RADAR_CONTRIBUTORS,
			increases: metric.topMovers.increases.map(contributor),
			decreases: metric.topMovers.decreases.map(contributor)
		}
	};
}

function deriveChangeRadar(
	currentRows: SystemFinancialRow[],
	priorRows: SystemFinancialRow[],
	priorByCert: Map<number, SystemFinancialRow>,
	currentRepdte: string,
	priorRepdte: string
): SystemChangeRadar {
	const matchedInstitutions = new Set(
		currentRows.filter((row) => priorByCert.has(row.cert)).map((row) => row.cert)
	).size;
	const transition = deriveCohortTransition({
		openingPeriod: priorRepdte,
		closingPeriod: currentRepdte,
		metrics: CHANGE_RADAR_SPECS.map((spec) => spec.key),
		topLimit: MAX_CHANGE_RADAR_CONTRIBUTORS,
		entities: currentRows.map((current) => {
			const prior = priorByCert.get(current.cert);
			return {
				id: current.cert,
				name: current.name?.trim() || `FDIC certificate ${current.cert}`,
				state: current.state,
				rows: [
					...(prior ? [{
						period: priorRepdte,
						values: { asset: prior.asset, dep: prior.dep, lnlsnet: prior.lnlsnet }
					}] : []),
					{
						period: currentRepdte,
						values: { asset: current.asset, dep: current.dep, lnlsnet: current.lnlsnet }
					}
				]
			};
		})
	});
	return {
		version: SYSTEM_CHANGE_RADAR_VERSION,
		period: { current: currentRepdte, prior: priorRepdte },
		population: {
			definition: 'same_institution_reporting_exact_consecutive_quarters',
			currentReportingInstitutions: new Set(currentRows.map((row) => row.cert)).size,
			priorReportingInstitutions: new Set(priorRows.map((row) => row.cert)).size,
			matchedInstitutions,
			entriesAndExits: 'excluded_from_breadth_and_contributors'
		},
		metrics: CHANGE_RADAR_SPECS.map((spec, index) => deriveChangeRadarMetric(spec, transition.metrics[index])),
		source: {
			dataset: 'FDIC BankFind Financials',
			grain: 'institution_quarter',
			monetaryUnit: 'usd_thousands',
			method: 'For each metric, match CERT across exact consecutive quarter ends and require both values. Breadth counts the sign of each raw-dollar change. The median uses bank-level percent changes where the opening value is nonzero. Contributors rank raw-dollar changes by direction; contribution share uses the sum of absolute changes across the matched metric population.'
		}
	};
}

export function resolveSystemQuarterFlow(
	row: SystemFinancialRow,
	prior: SystemFinancialRow | null
): { value: number | null; method: 'reported_single_quarter' | 'reported_ytd_first_quarter' | 'derived_consecutive_ytd' | 'unavailable' } {
	if (finite(row.netincq)) return { value: row.netincq, method: 'reported_single_quarter' };
	if (!finite(row.netinc)) return { value: null, method: 'unavailable' };
	if (row.repdte.endsWith('0331')) return { value: row.netinc, method: 'reported_ytd_first_quarter' };
	if (!prior || !isConsecutiveQuarter(prior.repdte, row.repdte)) {
		return { value: null, method: 'unavailable' };
	}
	if (prior.repdte.slice(0, 4) !== row.repdte.slice(0, 4) || !finite(prior.netinc)) {
		return { value: null, method: 'unavailable' };
	}
	return { value: row.netinc - prior.netinc, method: 'derived_consecutive_ytd' };
}

function aggregateSignal(input: {
	id: string;
	rank: number;
	metric: string;
	title: string;
	question: string;
	key: keyof SystemFinancialRow;
	fields: string[];
	currentRows: SystemFinancialRow[];
	priorRows: SystemFinancialRow[];
	priorByCert: Map<number, SystemFinancialRow>;
	currentRepdte: string;
	priorRepdte: string;
}): SystemSignal {
	const availableCurrent = values(input.currentRows, input.key).length;
	const availablePrior = values(input.priorRows, input.key).length;
	const pairs = input.currentRows.flatMap((current) => {
		const prior = input.priorByCert.get(current.cert);
		const currentValue = current[input.key];
		const priorValue = prior?.[input.key];
		return finite(currentValue as number | null) && finite(priorValue as number | null)
			? [{ current: currentValue as number, prior: priorValue as number }]
			: [];
	});
	const movements = pairedMovements(input.currentRows, input.priorByCert, input.key, 'percent');
	return buildSignal({
		id: input.id,
		rank: input.rank,
		kind: 'movement',
		metric: input.metric,
		title: input.title,
		question: input.question,
		current: pairs.length ? pairs.reduce((total, pair) => total + pair.current, 0) : null,
		prior: pairs.length ? pairs.reduce((total, pair) => total + pair.prior, 0) : null,
		unit: 'usd_thousands',
		comparisonUnit: 'percent',
		benchmark: 'median matched-institution quarter-over-quarter change',
		benchmarkValue: median(movements),
		distribution: movements,
		fields: input.fields,
		formula: `SUM(${input.fields[0]}) across institutions with a non-null value in both exact quarters; movement = (matched current - matched prior) / ABS(matched prior) × 100`,
		coverage: coverageFor(
			input.currentRows,
			input.priorRows,
			availableCurrent,
			availablePrior,
			pairs.length
		)
	}, input.currentRepdte, input.priorRepdte);
}

function medianSignal(input: {
	id: string;
	rank: number;
	metric: string;
	title: string;
	question: string;
	key: keyof SystemFinancialRow;
	field: string;
	currentRows: SystemFinancialRow[];
	priorRows: SystemFinancialRow[];
	priorByCert: Map<number, SystemFinancialRow>;
	currentRepdte: string;
	priorRepdte: string;
	interpretation?: (direction: SignalDirection) => DirectionInterpretation;
}): SystemSignal {
	const currentValues = values(input.currentRows, input.key);
	const priorValues = values(input.priorRows, input.key);
	const movements = pairedMovements(input.currentRows, input.priorByCert, input.key, 'points');
	return buildSignal({
		id: input.id,
		rank: input.rank,
		kind: 'movement',
		metric: input.metric,
		title: input.title,
		question: input.question,
		current: median(currentValues),
		prior: median(priorValues),
		unit: 'percent',
		changeUnit: 'percentage_points',
		comparisonUnit: 'percentage_points',
		benchmark: 'median matched-institution point change',
		benchmarkValue: median(movements),
		distribution: movements,
		fields: [input.field],
		formula: `MEDIAN(${input.field}) by reporting period; movement uses exact matched-institution consecutive-quarter observations`,
		coverage: coverageFor(
			input.currentRows,
			input.priorRows,
			currentValues.length,
			priorValues.length,
			movements.length
		),
		interpretation: input.interpretation
	}, input.currentRepdte, input.priorRepdte);
}

interface CohortAggregate {
	id: string;
	label: string;
	count: number;
	current: number;
	prior: number;
	movement: number;
}

function cohortAggregates(
	currentRows: SystemFinancialRow[],
	priorByCert: Map<number, SystemFinancialRow>,
	cohort: (current: SystemFinancialRow, prior: SystemFinancialRow) => { id: string; label: string } | null
): CohortAggregate[] {
	const groups = new Map<string, { label: string; count: number; current: number; prior: number }>();
	for (const current of currentRows) {
		const prior = priorByCert.get(current.cert);
		if (!prior || !finite(current.asset) || !finite(prior.asset)) continue;
		const definition = cohort(current, prior);
		if (!definition) continue;
		const entry = groups.get(definition.id) ?? { label: definition.label, count: 0, current: 0, prior: 0 };
		entry.count++;
		entry.current += current.asset;
		entry.prior += prior.asset;
		groups.set(definition.id, entry);
	}
	return [...groups.entries()]
		.map(([id, entry]) => ({
			id,
			...entry,
			movement: percentChange(entry.prior, entry.current)
		}))
		.filter((entry): entry is CohortAggregate => entry.movement !== null && entry.count >= MIN_COHORT_SIZE);
}

function unusualCohortSignal(input: {
	id: string;
	rank: number;
	metric: string;
	title: (cohort: CohortAggregate) => string;
	question: string;
	cohorts: CohortAggregate[];
	systemMovement: number | null;
	currentRepdte: string;
	priorRepdte: string;
	currentRows: SystemFinancialRow[];
	priorRows: SystemFinancialRow[];
	filterKey: 'state' | 'openingAssetBucket';
}): SystemSignal | null {
	if (input.cohorts.length === 0) return null;
	const baseline = input.systemMovement ?? median(input.cohorts.map((cohort) => cohort.movement)) ?? 0;
	const selected = [...input.cohorts].sort(
		(a, b) => Math.abs(b.movement - baseline) - Math.abs(a.movement - baseline) || b.count - a.count
	)[0];
	const cohortMovements = input.cohorts.map((cohort) => cohort.movement);
	return buildSignal({
		id: input.id,
		rank: input.rank,
		kind: 'movement',
		metric: input.metric,
		title: input.title(selected),
		question: input.question,
		populationId: `${input.filterKey}:${selected.id}`,
		populationLabel: `${selected.label} reporting cohort`,
		populationFilters: { [input.filterKey]: selected.id, minimumInstitutions: MIN_COHORT_SIZE },
		current: selected.current,
		prior: selected.prior,
		unit: 'usd_thousands',
		comparisonUnit: 'percent',
		benchmark: 'total-system asset change',
		benchmarkValue: input.systemMovement,
		distribution: cohortMovements,
		fields: ['ASSET', input.filterKey === 'state' ? 'STALP' : 'ASSET_BUCKET'],
		formula: `SUM(ASSET) for cohorts with at least ${MIN_COHORT_SIZE} matched institutions; size cohort is frozen at the opening quarter`,
		coverage: {
			...coverageFor(input.currentRows, input.priorRows, selected.count, selected.count, selected.count, MIN_COHORT_SIZE),
			populationCurrent: selected.count,
			populationPrior: selected.count,
			availableCurrent: selected.count,
			availablePrior: selected.count,
			ratio: 1,
			status: selected.count >= MIN_COHORT_SIZE ? 'complete' : 'insufficient'
		}
	}, input.currentRepdte, input.priorRepdte);
}

function bucketLabel(bucket: number): string {
	return ({
		1: 'under $100M',
		2: '$100M–$300M',
		3: '$300M–$1B',
		4: '$1B–$10B',
		5: '$10B–$50B',
		6: '$50B–$250B',
		7: 'over $250B'
	} as Record<number, string>)[bucket] ?? `asset bucket ${bucket}`;
}

function formatQuarterEnd(date: Date): string {
	return `${date.getUTCFullYear()}${String(date.getUTCMonth() + 1).padStart(2, '0')}${String(date.getUTCDate()).padStart(2, '0')}`;
}

/** Latest quarter whose normal FDIC release window has elapsed. */
export function expectedSystemReportingPeriod(now: Date): string {
	for (let year = now.getUTCFullYear(); year >= now.getUTCFullYear() - 2; year--) {
		for (let quarter = 4; quarter >= 1; quarter--) {
			const end = new Date(Date.UTC(year, quarter * 3, 0));
			const expectedAt = new Date(end.getTime() + FDIC_RELEASE_LAG_DAYS * 86_400_000);
			if (expectedAt <= now) return formatQuarterEnd(end);
		}
	}
	throw new Error('Unable to determine expected FDIC reporting period');
}

export function deriveSystemBrief(input: DeriveSystemBriefInput): SystemBrief {
	const now = input.now ?? new Date();
	const expectedLatest = expectedSystemReportingPeriod(now);
	const warnings: string[] = [];
	const currentRepdte = input.currentRepdte;
	if (!currentRepdte) {
		return {
			status: 'unavailable',
			generatedAt: now.toISOString(),
			reportingPeriod: { current: null, prior: null, expectedPrior: null, expectedLatest, isStale: true },
			signals: [],
			changeRadar: null,
			macroOverlays: {
				status: input.macroOverlays?.length ? 'available' : 'unavailable',
				usage: 'context_only_no_causal_inference',
				series: input.macroOverlays ?? []
			},
			warnings: ['No published FDIC financial reporting period is available.'],
			methodology: {
				version: SYSTEM_SIGNAL_VERSION,
				grain: 'institution_quarter',
				movementJoin: 'same_institution_exact_consecutive_calendar_quarter',
				cohortPolicy: 'opening_quarter_size_bucket_or_current_master_state',
				causality: 'not_inferred'
			}
		};
	}

	const expectedPrior = previousQuarterDate(currentRepdte);
	const currentRows = input.rows.filter((row) => row.repdte === currentRepdte);
	const priorRows = expectedPrior ? input.rows.filter((row) => row.repdte === expectedPrior) : [];
	const hasExactPrior = expectedPrior !== null && priorRows.length > 0;
	const priorRepdte = hasExactPrior ? expectedPrior : null;
	const beforePriorDate = priorRepdte ? previousQuarterDate(priorRepdte) : null;
	const beforePriorByCert = new Map(
		input.rows.filter((row) => row.repdte === beforePriorDate).map((row) => [row.cert, row])
	);
	const priorByCert = new Map(priorRows.map((row) => [row.cert, row]));
	const signals: SystemSignal[] = [];
	const changeRadar = hasExactPrior && priorRepdte
		? deriveChangeRadar(currentRows, priorRows, priorByCert, currentRepdte, priorRepdte)
		: null;

	if (currentRows.length === 0) warnings.push(`No financial rows were found for ${currentRepdte}.`);
	if (!hasExactPrior) warnings.push(`The exact prior calendar quarter ${expectedPrior ?? 'unknown'} is unavailable; movement signals are withheld.`);
	const isStale = currentRepdte < expectedLatest;
	if (isStale) warnings.push(`Latest data is ${currentRepdte}; ${expectedLatest} is the latest quarter expected after the normal FDIC reporting lag.`);

	if (hasExactPrior && priorRepdte) {
		const aggregateSpecs = [
			{ id: 'system-assets', rank: 10, metric: 'total_assets', title: 'Assets among paired reporters', question: 'How did reported assets change among institutions present in both quarters?', key: 'asset' as const, fields: ['ASSET'] },
			{ id: 'system-loans', rank: 20, metric: 'net_loans', title: 'Net loans and leases among paired reporters', question: 'How did reported net loans and leases change among institutions present in both quarters?', key: 'lnlsnet' as const, fields: ['LNLSNET'] },
			{ id: 'system-deposits', rank: 30, metric: 'total_deposits', title: 'Deposits among paired reporters', question: 'How did reported deposits change among institutions present in both quarters?', key: 'dep' as const, fields: ['DEP'] }
		];
		for (const spec of aggregateSpecs) {
			signals.push(aggregateSignal({ ...spec, currentRows, priorRows, priorByCert, currentRepdte, priorRepdte }));
		}

		const currentAssets = sum(currentRows, 'asset');
		const priorAssets = sum(priorRows, 'asset');
		const currentLoans = sum(currentRows, 'lnlsnet');
		const priorLoans = sum(priorRows, 'lnlsnet');
		const currentDeposits = sum(currentRows, 'dep');
		const priorDeposits = sum(priorRows, 'dep');
		const loanShares = currentRows.flatMap((row) => finite(row.asset) && row.asset !== 0 && finite(row.lnlsnet) ? [100 * row.lnlsnet / row.asset] : []);
		const priorLoanShares = priorRows.flatMap((row) => finite(row.asset) && row.asset !== 0 && finite(row.lnlsnet) ? [100 * row.lnlsnet / row.asset] : []);
		const shareMovements = pairedMovements(
			currentRows.map((row) => ({ ...row, lnlsnet: finite(row.asset) && row.asset !== 0 && finite(row.lnlsnet) ? 100 * row.lnlsnet / row.asset : null })),
			new Map(priorRows.map((row) => [row.cert, { ...row, lnlsnet: finite(row.asset) && row.asset !== 0 && finite(row.lnlsnet) ? 100 * row.lnlsnet / row.asset : null }])),
			'lnlsnet',
			'points'
		);
		signals.push(buildSignal({
			id: 'loan-mix', rank: 40, kind: 'movement', metric: 'loans_to_assets',
			title: 'Loans as a share of assets', question: 'How much of the system balance sheet is in loans?',
			current: currentAssets && currentLoans !== null ? 100 * currentLoans / currentAssets : null,
			prior: priorAssets && priorLoans !== null ? 100 * priorLoans / priorAssets : null,
			unit: 'percent', changeUnit: 'percentage_points', comparisonUnit: 'percentage_points', benchmark: 'median matched-institution point change',
			benchmarkValue: median(shareMovements), distribution: shareMovements,
			fields: ['LNLSNET', 'ASSET'], formula: '100 × SUM(LNLSNET) / SUM(ASSET); matched-bank distribution uses each bank ratio',
			coverage: coverageFor(currentRows, priorRows, loanShares.length, priorLoanShares.length, shareMovements.length)
		}, currentRepdte, priorRepdte));

		const depositShares = currentRows.flatMap((row) => finite(row.asset) && row.asset !== 0 && finite(row.dep) ? [100 * row.dep / row.asset] : []);
		const priorDepositShares = priorRows.flatMap((row) => finite(row.asset) && row.asset !== 0 && finite(row.dep) ? [100 * row.dep / row.asset] : []);
		const depositShareMovements = pairedMovements(
			currentRows.map((row) => ({ ...row, dep: finite(row.asset) && row.asset !== 0 && finite(row.dep) ? 100 * row.dep / row.asset : null })),
			new Map(priorRows.map((row) => [row.cert, { ...row, dep: finite(row.asset) && row.asset !== 0 && finite(row.dep) ? 100 * row.dep / row.asset : null }])),
			'dep', 'points'
		);
		signals.push(buildSignal({
			id: 'deposit-funding-mix', rank: 50, kind: 'movement', metric: 'deposits_to_assets',
			title: 'Deposits as a share of assets', question: 'How much of bank assets are funded by deposits?',
			current: currentAssets && currentDeposits !== null ? 100 * currentDeposits / currentAssets : null,
			prior: priorAssets && priorDeposits !== null ? 100 * priorDeposits / priorAssets : null,
			unit: 'percent', changeUnit: 'percentage_points', comparisonUnit: 'percentage_points', benchmark: 'median matched-institution point change',
			benchmarkValue: median(depositShareMovements), distribution: depositShareMovements,
			fields: ['DEP', 'ASSET'], formula: '100 × SUM(DEP) / SUM(ASSET); matched-bank distribution uses each bank ratio',
			coverage: coverageFor(currentRows, priorRows, depositShares.length, priorDepositShares.length, depositShareMovements.length)
		}, currentRepdte, priorRepdte));

		const currentFlows = new Map<number, number>();
		const priorFlows = new Map<number, number>();
		for (const row of currentRows) {
			const resolved = resolveSystemQuarterFlow(row, priorByCert.get(row.cert) ?? null);
			if (resolved.value !== null) currentFlows.set(row.cert, resolved.value);
		}
		for (const row of priorRows) {
			const resolved = resolveSystemQuarterFlow(row, beforePriorByCert.get(row.cert) ?? null);
			if (resolved.value !== null) priorFlows.set(row.cert, resolved.value);
		}
		const pairedFlowCerts = [...currentFlows.keys()].filter((cert) => priorFlows.has(cert));
		const currentEarnings = pairedFlowCerts.reduce((total, cert) => total + currentFlows.get(cert)!, 0);
		const priorEarnings = pairedFlowCerts.reduce((total, cert) => total + priorFlows.get(cert)!, 0);
		const earningsMovements = pairedFlowCerts.flatMap((cert) => {
			const movement = percentChange(priorFlows.get(cert)!, currentFlows.get(cert)!);
			return movement === null ? [] : [movement];
		});
		signals.push(buildSignal({
			id: 'quarterly-earnings', rank: 60, kind: 'movement', metric: 'quarterly_net_income',
			title: 'Quarterly net income', question: 'How did quarterly bank earnings move?',
			populationId: 'valid_quarterly_earnings_pair',
			populationLabel: 'Institutions with valid quarterly earnings in both periods',
			populationFilters: { exactConsecutiveQuarter: true, pairedObservations: true },
			current: pairedFlowCerts.length ? currentEarnings : null,
			prior: pairedFlowCerts.length ? priorEarnings : null,
			unit: 'usd_thousands', comparisonUnit: 'percent', benchmark: 'median matched-institution earnings change',
			benchmarkValue: median(earningsMovements), distribution: earningsMovements,
			fields: ['NETINCQ', 'NETINC'],
			formula: 'SUM(NETINCQ); fallback NETINC(YTD current) - NETINC(YTD exact prior) only within the same calendar year',
			coverage: coverageFor(currentRows, priorRows, currentFlows.size, priorFlows.size, pairedFlowCerts.length)
		}, currentRepdte, priorRepdte));

		signals.push(medianSignal({
			id: 'median-nim', rank: 70, metric: 'net_interest_margin', title: 'Typical net interest margin',
			question: "How is the typical bank's net interest margin changing?", key: 'nimy', field: 'NIMY',
			currentRows, priorRows, priorByCert, currentRepdte, priorRepdte
		}));
		signals.push(medianSignal({
			id: 'median-asset-quality', rank: 80, metric: 'noncurrent_loans_ratio', title: 'Typical noncurrent-loan ratio',
			question: 'Are noncurrent loan ratios moving?', key: 'nclnlsr', field: 'NCLNLSR',
			currentRows, priorRows, priorByCert, currentRepdte, priorRepdte,
			interpretation: (direction) => direction === 'higher' ? 'adverse' : direction === 'lower' ? 'favorable' : direction === 'flat' ? 'neutral' : 'not_assessed'
		}));
		signals.push(medianSignal({
			id: 'median-capital', rank: 90, metric: 'total_risk_based_capital_ratio', title: 'Typical reported capital ratio',
			question: 'How is reported risk-based capital changing?', key: 'rbcrwaj', field: 'RBCRWAJ',
			currentRows, priorRows, priorByCert, currentRepdte, priorRepdte,
			interpretation: (direction) => direction === 'higher' ? 'favorable' : direction === 'lower' ? 'adverse' : direction === 'flat' ? 'neutral' : 'not_assessed'
		}));

		const currentCount = currentRows.length;
		const priorCount = priorRows.length;
		signals.push(buildSignal({
			id: 'institution-count', rank: 100, kind: 'movement', metric: 'reporting_institution_count',
			title: 'Reporting institution count', question: 'How many institutions reported this quarter?',
			current: currentCount, prior: priorCount, unit: 'institutions', comparisonUnit: 'institutions',
			benchmark: 'prior-quarter reporting count', benchmarkValue: priorCount, distribution: [],
			fields: ['CERT', 'REPDTE'], formula: 'COUNT(DISTINCT CERT) by exact reporting period',
			coverage: coverageFor(currentRows, priorRows, currentCount, priorCount, Math.min(currentCount, priorCount), null, false)
		}, currentRepdte, priorRepdte));

		const systemAssetMovement = currentAssets !== null && priorAssets !== null ? percentChange(priorAssets, currentAssets) : null;
		const stateSignal = unusualCohortSignal({
			id: 'geography-asset-movement', rank: 110, metric: 'state_asset_growth',
			title: (cohort) => `${cohort.label} bank assets`,
			question: 'Where are reported bank balance sheets changing differently from the system?',
			cohorts: cohortAggregates(currentRows, priorByCert, (current) => current.state ? { id: current.state, label: current.state } : null),
			systemMovement: systemAssetMovement, currentRepdte, priorRepdte, currentRows, priorRows, filterKey: 'state'
		});
		if (stateSignal) signals.push(stateSignal);
		else warnings.push(`No state cohort met the ${MIN_COHORT_SIZE}-institution minimum for a geography signal.`);

		const sizeSignal = unusualCohortSignal({
			id: 'size-cohort-asset-movement', rank: 120, metric: 'size_cohort_asset_growth',
			title: (cohort) => `${cohort.label} bank assets`,
			question: 'Which size cohort is moving differently from the banking system?',
			cohorts: cohortAggregates(currentRows, priorByCert, (_current, prior) => finite(prior.asset_bucket) ? { id: String(prior.asset_bucket), label: bucketLabel(prior.asset_bucket) } : null),
			systemMovement: systemAssetMovement, currentRepdte, priorRepdte, currentRows, priorRows, filterKey: 'openingAssetBucket'
		});
		if (sizeSignal) signals.push(sizeSignal);
		else warnings.push(`No opening-quarter size cohort met the ${MIN_COHORT_SIZE}-institution minimum.`);
	}

	const currentCoreRows = currentRows.filter((row) => finite(row.asset) && finite(row.dep));
	const rowCoverage = currentRows.length ? currentCoreRows.length / currentRows.length : 0;
	signals.push(buildSignal({
		id: 'reporting-coverage', rank: 130, kind: 'data_event', metric: 'core_field_coverage',
		title: 'Latest-quarter reporting coverage', question: 'How complete is the latest reporting quarter?',
		current: rowCoverage * 100,
		prior: priorRows.length ? (priorRows.filter((row) => finite(row.asset) && finite(row.dep)).length / priorRows.length) * 100 : null,
		unit: 'percent', changeUnit: 'percentage_points', comparisonUnit: 'percent', benchmark: 'complete core-field coverage', benchmarkValue: 100, distribution: [],
		fields: ['CERT', 'REPDTE', 'ASSET', 'DEP'], formula: 'Rows with non-null ASSET and DEP / all rows in the reporting period × 100',
		coverage: coverageFor(currentRows, priorRows, currentCoreRows.length, priorRows.filter((row) => finite(row.asset) && finite(row.dep)).length, 0, null, false)
	}, currentRepdte, priorRepdte));

	const macroSeries = input.macroOverlays ?? [];
	if (macroSeries.length === 0) warnings.push('Direct-agency macro overlays are unavailable; bank signals remain valid without macro context.');
	const hasPartialSignal = signals.some((signal) => signal.coverage.status !== 'complete');
	const partial = !hasExactPrior || isStale || hasPartialSignal;

	return {
		status: currentRows.length === 0 ? 'unavailable' : partial ? 'partial' : 'complete',
		generatedAt: now.toISOString(),
		reportingPeriod: { current: currentRepdte, prior: priorRepdte, expectedPrior, expectedLatest, isStale },
		signals: signals.sort((a, b) => a.rank - b.rank).slice(0, MAX_SYSTEM_SIGNALS),
		changeRadar,
		macroOverlays: {
			status: macroSeries.length >= 3 ? 'available' : macroSeries.length > 0 ? 'partial' : 'unavailable',
			usage: 'context_only_no_causal_inference',
			series: macroSeries.slice(0, 6)
		},
		warnings,
		methodology: {
			version: SYSTEM_SIGNAL_VERSION,
			grain: 'institution_quarter',
			movementJoin: 'same_institution_exact_consecutive_calendar_quarter',
			cohortPolicy: 'opening_quarter_size_bucket_or_current_master_state',
			causality: 'not_inferred'
		}
	};
}
