import type { Financial, Institution } from '$lib/types';
import {
	RESEARCH_METRICS,
	RESEARCH_RAW_FIELDS,
	researchMetricDefinition,
	type ResearchMetric,
	type ResearchMetricDefinition
} from '$lib/research-metrics';

export { RESEARCH_METRICS, RESEARCH_RAW_FIELDS, researchMetricDefinition };
export type { ResearchMetric, ResearchMetricDefinition };

export const QUARTER_ENDS = ['0331', '0630', '0930', '1231'] as const;

export function isQuarterEnd(period: string): boolean {
	return /^\d{4}(0331|0630|0930|1231)$/.test(period);
}

export function previousQuarter(period: string, steps = 1): string {
	let year = Number(period.slice(0, 4));
	let q = QUARTER_ENDS.indexOf(period.slice(4) as (typeof QUARTER_ENDS)[number]);
	for (let i = 0; i < steps; i++) {
		if (q === 0) { year -= 1; q = 3; } else q -= 1;
	}
	return `${year}${QUARTER_ENDS[q]}`;
}

export function nextQuarter(period: string, steps = 1): string {
	let year = Number(period.slice(0, 4));
	let q = QUARTER_ENDS.indexOf(period.slice(4) as (typeof QUARTER_ENDS)[number]);
	for (let i = 0; i < steps; i++) {
		if (q === 3) { year += 1; q = 0; } else q += 1;
	}
	return `${year}${QUARTER_ENDS[q]}`;
}

export function quartersBetween(from: string, to: string): string[] {
	const out: string[] = [];
	let cur = from;
	let guard = 0;
	while (cur <= to && guard++ < 400) { out.push(cur); cur = nextQuarter(cur); }
	return out;
}

export function yearAgo(period: string): string {
	return `${Number(period.slice(0, 4)) - 1}${period.slice(4)}`;
}

/** Value of a research metric for one institution at one quarter, from its quarterly rows. */
export function metricValue(
	metric: ResearchMetric,
	rows: readonly Financial[] | undefined,
	quarter: string,
	institution?: Pick<Institution, 'num_branches'> | null
): number | null {
	const def = researchMetricDefinition(metric);
	if (def.endpointDependency === 'latest_snapshot') {
		const v = institution?.num_branches;
		return typeof v === 'number' ? v : null;
	}
	if (!rows?.length) return null;
	const row = rows.find((r) => r.repdte === quarter);
	if ('valueField' in def && def.valueField) {
		const v = row?.[def.valueField];
		return typeof v === 'number' && Number.isFinite(v) ? v : null;
	}
	if (def.derived === 'loan_growth_yoy') {
		const prior = rows.find((r) => r.repdte === yearAgo(quarter));
		const a = row?.lnlsnet, b = prior?.lnlsnet;
		if (typeof a !== 'number' || typeof b !== 'number' || !b) return null;
		return ((a - b) / Math.abs(b)) * 100;
	}
	if (def.derived === 'quarterly_net_income') {
		const q = row?.netincq;
		if (typeof q === 'number' && Number.isFinite(q)) return q;
		const ytd = row?.netinc;
		if (typeof ytd !== 'number') return null;
		if (quarter.endsWith('0331')) return ytd;
		const prior = rows.find((r) => r.repdte === previousQuarter(quarter));
		const priorYtd = prior?.netinc;
		return typeof priorYtd === 'number' ? ytd - priorYtd : null;
	}
	return null;
}

export function metricSeries(metric: ResearchMetric, rows: readonly Financial[] | undefined, quarters: readonly string[], institution?: Pick<Institution, 'num_branches'> | null): (number | null)[] {
	return quarters.map((q) => metricValue(metric, rows, q, institution));
}

export function formatMetric(metric: ResearchMetric, value: number | null | undefined, opts: { compact?: boolean } = {}): string {
	if (value == null || !Number.isFinite(value)) return '—';
	const def = researchMetricDefinition(metric);
	if (def.unit === 'usd_thousands') {
		const d = value * 1000, a = Math.abs(d), s = d < 0 ? '−' : '';
		if (a >= 1e12) return `${s}$${(a / 1e12).toFixed(opts.compact ? 1 : 2)}T`;
		if (a >= 1e9) return `${s}$${(a / 1e9).toFixed(1)}B`;
		if (a >= 1e6) return `${s}$${(a / 1e6).toFixed(1)}M`;
		return `${s}$${(a / 1e3).toFixed(0)}K`;
	}
	if (def.unit === 'percent') return `${value.toFixed(2)}%`;
	return Math.round(value).toLocaleString('en-US');
}

/** Change between two observations in the metric's declared change unit. */
export function metricChange(metric: ResearchMetric, current: number | null, prior: number | null): { value: number | null; text: string; direction: 'up' | 'down' | 'flat' | 'none'; favorable: boolean | null } {
	const def = researchMetricDefinition(metric);
	if (current == null || prior == null) return { value: null, text: '—', direction: 'none', favorable: null };
	let value: number, text: string;
	if (def.change === 'percentage_points') {
		value = current - prior;
		const bp = Math.round(value * 100);
		text = Math.abs(bp) < 100 ? `${bp > 0 ? '+' : bp < 0 ? '−' : ''}${Math.abs(bp)} bp` : `${value > 0 ? '+' : '−'}${Math.abs(value).toFixed(2)} pp`;
	} else if (def.change === 'percent_change') {
		if (!prior) return { value: null, text: '—', direction: 'none', favorable: null };
		value = ((current - prior) / Math.abs(prior)) * 100;
		text = `${value > 0 ? '+' : value < 0 ? '−' : ''}${Math.abs(value).toFixed(1)}%`;
	} else {
		value = current - prior;
		text = def.unit === 'usd_thousands' ? `${value >= 0 ? '+' : '−'}${formatMetric(metric, Math.abs(value))}` : `${value > 0 ? '+' : value < 0 ? '−' : ''}${Math.abs(Math.round(value)).toLocaleString()}`;
	}
	const direction = value > 0 ? 'up' : value < 0 ? 'down' : 'flat';
	const favorable = def.direction === 'neutral' || direction === 'flat' ? null : (direction === 'up') === (def.direction === 'higher');
	return { value, text, direction, favorable };
}

export function metricLabel(metric: string): string {
	const def = RESEARCH_METRICS.find((m) => m.id === metric);
	return def?.label ?? metric;
}
export function metricShort(metric: string): string {
	const def = RESEARCH_METRICS.find((m) => m.id === metric);
	return def?.shortLabel ?? metric;
}
