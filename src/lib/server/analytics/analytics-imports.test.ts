import { describe, it, expect } from 'vitest';

/**
 * Smoke tests: verify analytics modules are importable without errors.
 * These catch broken imports, circular dependencies, and syntax errors.
 */

describe('analytics module imports', () => {
	it('peer-stats exports computePeerStats', async () => {
		const mod = await import('./peer-stats');
		expect(typeof mod.computePeerStats).toBe('function');
	});

	it('correlations exports pearsonCorrelation and computeCorrelations', async () => {
		const mod = await import('./correlations');
		expect(typeof mod.pearsonCorrelation).toBe('function');
		expect(typeof mod.computeCorrelations).toBe('function');
	});

	it('trends exports linearRegression and computeAllTrends', async () => {
		const mod = await import('./trends');
		expect(typeof mod.linearRegression).toBe('function');
		expect(typeof mod.computeAllTrends).toBe('function');
		expect(typeof mod.computeTrendsForBank).toBe('function');
	});

	it('risk-scores exports computeRiskScores', async () => {
		const mod = await import('./risk-scores');
		expect(typeof mod.computeRiskScores).toBe('function');
	});

	it('anomalies exports detectAnomalies', async () => {
		const mod = await import('./anomalies');
		expect(typeof mod.detectAnomalies).toBe('function');
	});

	it('industry-agg exports computeIndustryAggregates', async () => {
		const mod = await import('./industry-agg');
		expect(typeof mod.computeIndustryAggregates).toBe('function');
	});
});
