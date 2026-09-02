import type { PageServerLoad } from './$types';

export interface IndustryPoint { repdte: string; metrics: Record<string, number | null> }
export interface RadarContributor { cert: number; name: string; state: string; change: number; shareOfGrossMovement: number }
export interface RadarMetric {
	id: string; label: string; field: string;
	breadth: { increasing: number; decreasing: number; unchanged: number; increasingShare: number; decreasingShare: number; medianPercentChange: number };
	matchedTotals: { prior: number; current: number; change: number; percentChange: number };
	contributors: { grossMovement: number; increases: RadarContributor[]; decreases: RadarContributor[] };
}
export interface Signal {
	id: string; title: string; question: string;
	current: { value: number; unit: string }; prior: { value: number; unit: string };
	change: { absolute: number; percent: number; unit: string };
	comparison?: { value: number | null; p25: number | null; p75: number | null; benchmark: string };
	source: { fields: string[]; formula: string };
	coverage: { paired: number; populationCurrent: number; populationPrior: number };
	population: { id: string; label: string };
}
export interface MacroOverlay { seriesId: string; title: string; frequency: string; units: string; observationDate: string; value: number }

const SEGMENTS = ['all', 'community', 'regional', 'large'] as const;

export const load: PageServerLoad = async ({ fetch }) => {
	const [brief, meta, ...industry] = await Promise.all([
		fetch('/api/v2/system-brief').then((r) => (r.ok ? r.json() : null)).catch(() => null),
		fetch('/api/v1/meta').then((r) => (r.ok ? r.json() : null)).catch(() => null),
		...SEGMENTS.map((segment) => fetch(`/api/v1/industry?segment=${segment}&limit=40`).then((r) => (r.ok ? r.json() : null)).catch(() => null))
	]);
	const b = brief as null | {
		reportingPeriod: { current: string; prior: string };
		signals: Signal[];
		changeRadar: { population: { matchedInstitutions: number; currentReportingInstitutions: number; priorReportingInstitutions: number }; metrics: RadarMetric[] } | null;
		macroOverlays: { series: MacroOverlay[] } | null;
		release: string | null;
	};
	const series: Record<string, IndustryPoint[]> = {};
	SEGMENTS.forEach((segment, i) => {
		const body = industry[i] as null | { data: IndustryPoint[] };
		series[segment] = (body?.data ?? []).slice().sort((a, b) => a.repdte.localeCompare(b.repdte));
	});
	const states = ((meta as null | { states?: Array<{ state: string; count: number }> })?.states ?? []);
	return {
		period: b?.reportingPeriod ?? null,
		signals: b?.signals ?? [],
		radar: b?.changeRadar ?? null,
		macro: b?.macroOverlays?.series ?? [],
		series,
		states,
		activeCount: (meta as null | { active_count?: number })?.active_count ?? 0
	};
};
