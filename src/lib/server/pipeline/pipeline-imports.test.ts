import { describe, it, expect } from 'vitest';

/**
 * Smoke tests: verify pipeline modules are importable without errors.
 * These catch broken imports, circular dependencies, and syntax errors.
 */

describe('pipeline module imports', () => {
	it('fdic-api exports expected functions and types', async () => {
		const mod = await import('./fdic-api');
		expect(typeof mod.delay).toBe('function');
		expect(typeof mod.fetchInstitutions).toBe('function');
		expect(typeof mod.fetchFinancialsForQuarter).toBe('function');
		expect(typeof mod.fetchLatestQuarter).toBe('function');
		expect(typeof mod.fetchLatestFinancials).toBe('function');
	});

	it('fdic-institutions exports syncInstitutions', async () => {
		const mod = await import('./fdic-institutions');
		expect(typeof mod.syncInstitutions).toBe('function');
	});

	it('fdic-financials exports syncFinancials', async () => {
		const mod = await import('./fdic-financials');
		expect(typeof mod.syncFinancials).toBe('function');
	});

	it('fdic-financials-snapshot exports syncLatestFinancials', async () => {
		const mod = await import('./fdic-financials-snapshot');
		expect(typeof mod.syncLatestFinancials).toBe('function');
	});

	it('fdic-failures exports syncFailures', async () => {
		const mod = await import('./fdic-failures');
		expect(typeof mod.syncFailures).toBe('function');
	});

	it('fred-api exports expected functions', async () => {
		const mod = await import('./fred-api');
		expect(typeof mod.fetchSeriesObservations).toBe('function');
		expect(typeof mod.fetchSeriesInfo).toBe('function');
		expect(typeof mod.delay).toBe('function');
	});

	it('fred-sync exports syncFredData', async () => {
		const mod = await import('./fred-sync');
		expect(typeof mod.syncFredData).toBe('function');
	});
});
