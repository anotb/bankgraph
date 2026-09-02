import { describe, expect, it } from 'vitest';
import {
	DEFAULT_WORKSPACE_METRICS,
	RESEARCH_METRIC_CATEGORIES,
	RESEARCH_METRICS,
	RESEARCH_RAW_FIELDS,
	WORKSPACE_VISIBLE_METRIC_LIMIT,
	canonicalResearchMetric,
	resolveResearchMetricEndpointDependencies,
	resolveResearchMetricHistoryDependencies
} from './research-metrics';

describe('research metric registry', () => {
	it('covers every analytical family while keeping the visible workspace bounded', () => {
		expect(new Set(RESEARCH_METRICS.map((metric) => metric.category))).toEqual(
			new Set(RESEARCH_METRIC_CATEGORIES)
		);
		expect(RESEARCH_METRICS.length).toBeGreaterThanOrEqual(20);
		expect(DEFAULT_WORKSPACE_METRICS).toHaveLength(WORKSPACE_VISIBLE_METRIC_LIMIT);
	});

	it('provides the requested profitability, funding, capital, and operating measures', () => {
		const ids = new Set<string>(RESEARCH_METRICS.map((metric) => metric.id));
		for (const id of ['roe', 'rbc1rwaj', 'lnlsdepr', 'netinc', 'numemp', 'offdom']) {
			expect(ids.has(id)).toBe(true);
		}
		expect(RESEARCH_RAW_FIELDS).toEqual(expect.arrayContaining(['roe', 'rbc1rwaj', 'lnlsdepr', 'netinc', 'netincq', 'numemp']));
	});

	it('canonicalizes every public alias deterministically', () => {
		expect(canonicalResearchMetric('assets')).toBe('asset');
		expect(canonicalResearchMetric('nim')).toBe('nimy');
		expect(canonicalResearchMetric('tier1Ratio')).toBe('rbc1rwaj');
		expect(canonicalResearchMetric('domesticOffices')).toBe('offdom');
		expect(canonicalResearchMetric('unknown')).toBeNull();
	});

	it('declares aggregation and endpoint semantics for every metric', () => {
		expect(RESEARCH_METRICS.every((metric) =>
			metric.aggregation === 'additive' || metric.aggregation === 'distribution_only'
		)).toBe(true);
		expect(RESEARCH_METRICS.filter((metric) => metric.aggregation === 'additive').map((metric) => metric.id))
			.toEqual(expect.arrayContaining(['asset', 'dep', 'lnlsnet', 'eq', 'netinc', 'numemp', 'offdom']));
		expect(RESEARCH_METRICS.filter((metric) => metric.aggregation === 'distribution_only').map((metric) => metric.id))
			.toEqual(expect.arrayContaining(['roa', 'nimy', 'loanGrowth', 'nclnlsr', 'rbc1rwaj']));
	});

	it('resolves exact endpoint, lookback, fallback, and latest-only dependencies', () => {
		expect(resolveResearchMetricEndpointDependencies('asset', '20260630')).toMatchObject({
			status: 'supported', requiredPeriods: ['20260630'], fallbackPeriods: [], fetchPeriods: ['20260630']
		});
		expect(resolveResearchMetricEndpointDependencies('loanGrowth', '20260630')).toMatchObject({
			status: 'supported', requiredPeriods: ['20260630', '20250630'], fallbackPeriods: [], sourceFields: ['lnlsnet']
		});
		expect(resolveResearchMetricEndpointDependencies('netinc', '20260331')).toMatchObject({
			status: 'supported', requiredPeriods: ['20260331'], fallbackPeriods: ['20251231'], sourceFields: ['netincq', 'netinc']
		});
		expect(resolveResearchMetricEndpointDependencies('offdom', '20260630')).toMatchObject({
			status: 'latest_only', fetchPeriods: []
		});
		expect(resolveResearchMetricEndpointDependencies('asset', '20260531').status).toBe('invalid_period');
	});

	it('deduplicates and sorts the history union without upgrading fallbacks to requirements', () => {
		expect(resolveResearchMetricHistoryDependencies(
			['asset', 'loanGrowth', 'netinc'], ['20260331', '20260630']
		)).toEqual({
			metrics: ['asset', 'loanGrowth', 'netinc'],
			endpoints: ['20260331', '20260630'],
			status: 'supported',
			requiredPeriods: ['20250331', '20250630', '20260331', '20260630'],
			fallbackPeriods: ['20251231', '20260331'],
			fetchPeriods: ['20250331', '20250630', '20251231', '20260331', '20260630'],
			sourceFields: ['asset', 'lnlsnet', 'netincq', 'netinc']
		});
	});
});
