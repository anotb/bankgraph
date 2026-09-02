import { describe, expect, it } from 'vitest';
import { deserializeWorkspaceSearchParams } from '$lib/workspace';
import { buildWorkspaceHref, workspaceMetricForSystemSignal } from './workspace-links';

describe('home workspace links', () => {
	it('carries the public question and state selection into the shared workspace', () => {
		const href = buildWorkspaceHref({
			question: 'How does banking structure vary across states?',
			states: ['NC'],
			workspaceMetrics: ['asset', 'dep'],
			from: '20211231',
			to: '20251231',
			panel: 'map'
		});
		const parsed = deserializeWorkspaceSearchParams(new URL(href, 'https://bankgraph.test').searchParams);
		expect(parsed.question).toBe('How does banking structure vary across states?');
		expect(parsed.filters.states).toEqual(['NC']);
		expect(parsed.mapSelection.states).toEqual(['NC']);
		expect(parsed.period).toEqual({ kind: 'range', from: '20211231', to: '20251231' });
		expect(parsed.activePanel).toBe('map');
	});

	it('deduplicates a focused bank and bounds visible metrics', () => {
		const href = buildWorkspaceHref({
			question: 'Compare this bank',
			cert: 26881,
			selectedCerts: [26881],
			workspaceMetrics: ['asset', 'dep', 'roa', 'nimy', 'nclnlsr', 'loanGrowth', 'asset']
		});
		const parsed = deserializeWorkspaceSearchParams(new URL(href, 'https://bankgraph.test').searchParams);
		expect(parsed.selectedCerts).toEqual([26881]);
		expect(parsed.charts[0].metrics).toHaveLength(6);
	});

	it('carries a selected observation period and asset cohort', () => {
		const href = buildWorkspaceHref({
			question: 'How did banks under $1B compare?',
			workspaceMetrics: ['roa', 'nimy'],
			quarter: '20250930',
			assetMax: 1_000_000,
			panel: 'screen'
		});
		const parsed = deserializeWorkspaceSearchParams(new URL(href, 'https://bankgraph.test').searchParams);
		expect(parsed.period).toEqual({ kind: 'quarter', quarter: '20250930' });
		expect(parsed.filters.assetRange).toEqual({ min: null, max: 1_000_000 });
		expect(parsed.peerRecipe.assetRange).toEqual({ min: null, max: 1_000_000 });
	});

	it('preserves canonical workspace metrics without hidden aliases', () => {
		const href = buildWorkspaceHref({
			question: 'Which banks have the strongest year-over-year loan growth?',
			workspaceMetrics: ['loanGrowth', 'dep'],
			panel: 'charts'
		});
		const parsed = deserializeWorkspaceSearchParams(new URL(href, 'https://bankgraph.test').searchParams);
		expect(parsed.charts[0].metrics).toEqual(['dep', 'loanGrowth']);
		expect(workspaceMetricForSystemSignal('net_loans')).toBeNull();
	});
});
