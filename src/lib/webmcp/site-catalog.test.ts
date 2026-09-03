import { describe, expect, it, vi } from 'vitest';
import { validateToolDefinition } from './schema.js';
import { createSiteNavigationTool, createSiteWebMcpTools, type SiteWebMcpDependencies } from './site-catalog.js';

const executionContext = {
	signal: new AbortController().signal,
	scope: 'test-site',
	toolName: 'test'
};

function dependencies(): SiteWebMcpDependencies {
	return {
		context: () => ({ path: '/', latestQuarter: '20260630', activeBankCount: 4_238, liveDataState: 'live' }),
		searchBanks: vi.fn(async () => ({
			banks: [{ cert: 628, name: 'JPMorgan Chase Bank', city: 'Columbus', state: 'OH', totalAssets: 4_000_000_000, latestQuarter: '20260630', metrics: { loanToDeposit: 64.7 } }],
			total: 1,
			sourceMode: 'live' as const,
			asOf: '20260630',
			refreshedAt: null,
			truncated: false
		})),
		open: vi.fn(),
		appearance: () => 'light',
		setAppearance: vi.fn(() => true)
	};
}

describe('site WebMCP catalog', () => {
	it('registers a compact cross-page catalog with valid schemas', () => {
		const tools = createSiteWebMcpTools(dependencies());
		expect(tools.map((tool) => tool.name)).toEqual([
			'bankgraph.get_site_context',
			'bankgraph.search_banks',
			'bankgraph.navigate',
			'bankgraph.set_appearance'
		]);
		for (const tool of tools) expect(validateToolDefinition(tool)).toEqual([]);
	});

	it('carries a question and analytical anchors into the research board', async () => {
		const deps = dependencies();
		const navigate = createSiteNavigationTool(deps);
		const result = await navigate.controller({
			destination: 'research',
			question: 'Which banks stand out?',
			template: 'credit_stress',
			states: ['NY'],
			assetMin: 50_000_000,
			asOf: '2026Q2'
		}, executionContext);

		expect(deps.open).toHaveBeenCalledWith('/b?q=Which+banks+stand+out%3F&template=credit_stress&states=NY&asset_min=50000000&asOf=20260630');
		expect(result.data).toMatchObject({ destination: 'research' });
	});

	it('starts a new research board only when fresh or blank is requested', async () => {
		const deps = dependencies();
		const navigate = createSiteNavigationTool(deps);

		await navigate.controller({ destination: 'research' }, executionContext);
		expect(deps.open).toHaveBeenLastCalledWith('/b');

		await navigate.controller({ destination: 'research', fresh: true, question: 'Start over' }, executionContext);
		expect(deps.open).toHaveBeenLastCalledWith('/b?fresh=1&q=Start+over');

		await navigate.controller({ destination: 'research', template: 'blank' }, executionContext);
		expect(deps.open).toHaveBeenLastCalledWith('/b?fresh=1');
	});

	it('keeps bank search read-only and reports the full match count', async () => {
		const deps = dependencies();
		const search = createSiteWebMcpTools(deps).find((tool) => tool.name === 'bankgraph.search_banks');
		expect(search).toBeDefined();
		const result = await search!.controller({ query: 'JPMorgan', active: 'active', states: [], limit: 25 }, executionContext);

		expect(deps.searchBanks).toHaveBeenCalledWith(expect.objectContaining({ query: 'JPMorgan', active: 'active', limit: 25, offset: 0 }), executionContext);
		expect(result.data).toMatchObject({ total: 1, nextOffset: null, sourceMode: 'live' });
	});

	it('returns the exact value used for loan-to-deposit ranking', async () => {
		const deps = dependencies();
		const search = createSiteWebMcpTools(deps).find((tool) => tool.name === 'bankgraph.search_banks');
		const result = await search!.controller({
			query: '', active: 'active', states: [], assetMin: 10_000_000,
			sort: 'loanToDeposit', order: 'desc', limit: 10
		}, executionContext);

		expect(deps.searchBanks).toHaveBeenCalledWith(
			expect.objectContaining({ assetMin: 10_000_000, sort: 'loanToDeposit', order: 'desc' }),
			executionContext
		);
		expect(result.data).toMatchObject({
			banks: [{ cert: 628, metrics: { loanToDeposit: 64.7 } }],
			metricUnits: { loanToDeposit: 'percent' }
		});
	});

	it('requires a certificate number for bank navigation', () => {
		const navigate = createSiteNavigationTool(dependencies());
		expect(() => navigate.controller({ destination: 'bank' }, executionContext)).toThrow(/cert is required/);
	});
});
