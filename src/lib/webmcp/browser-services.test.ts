import { describe, expect, it, vi } from 'vitest';
import { createBrowserBankSearch } from './browser-services.js';

const signal = new AbortController().signal;

describe('createBrowserBankSearch', () => {
	it('uses one bounded v2 screen request with conditions and API as-of metadata', async () => {
		const fetcher = vi.fn(async (input: string | URL | Request) => {
			const url = new URL(String(input), 'https://bankgraph.test');
			expect(url.pathname).toBe('/api/v2/banks/screen');
			expect(url.searchParams.get('active')).toBe('any');
			expect(url.searchParams.get('limit')).toBe('50');
			expect(url.searchParams.get('offset')).toBe('12');
			expect(url.searchParams.get('expected_release_generation')).toBe('release-17');
			expect(JSON.parse(url.searchParams.get('conditions') ?? '[]')).toEqual([
				{ metric: 'roa', operator: 'gte', value: 1, upperValue: null }
			]);
			return new Response(JSON.stringify({
				data: [
					{ cert: 1, name: 'Former Bank', state: 'NC', city: 'Durham', total_assets: 20_000, latest_roa: 1.1, latest_repdte: '20240930' },
					{ cert: 2, name: 'Active Bank', state: 'NC', city: 'Raleigh', total_assets: 10_000, latest_roa: 1.4, latest_repdte: '20251231' }
				],
				total: 2,
				asOf: '20251231',
				truncated: false
			}), { status: 200, headers: { 'content-type': 'application/json' } });
		});
		const search = createBrowserBankSearch({
			fetch: fetcher as typeof fetch,
			getAsOf: () => '2025Q4',
			getReleaseGeneration: () => 'release-17'
		});
		const result = await search({
			query: '', states: ['NC'], active: 'any', assetMin: null, assetMax: null,
			conditions: [{ metric: 'roa', operator: 'gte', value: 1, upperValue: null }],
			sort: 'roa', order: 'desc', limit: 50, offset: 12
		}, { signal, scope: 'test', toolName: 'search' });

		expect(fetcher).toHaveBeenCalledTimes(1);
		expect(result).toMatchObject({ total: 2, sourceMode: 'live', asOf: '20251231', truncated: false });
		expect(result.banks.map((bank) => bank.cert)).toEqual([1, 2]);
		expect(result.banks.map((bank) => bank.metrics?.roa)).toEqual([1.1, 1.4]);
	});

	it('reports a release mismatch as a reloadable stale-page error', async () => {
		const fetcher = vi.fn(async () => new Response(JSON.stringify({
			error: 'stale_page_release',
			release_generation: 'release-18'
		}), { status: 409, headers: { 'content-type': 'application/json' } }));
		const search = createBrowserBankSearch({
			fetch: fetcher as typeof fetch,
			getReleaseGeneration: () => 'release-17'
		});

		await expect(search({
			query: '', states: [], active: 'active', assetMin: null, assetMax: null,
			conditions: [], sort: 'assets', order: 'desc', limit: 5
		}, { signal, scope: 'test', toolName: 'search' }))
			.rejects.toMatchObject({ code: 'stale_page_release', retryable: true });
	});

	it('passes the browser execution signal and rejects non-success responses', async () => {
		const fetcher = vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
			expect(init?.signal).toBe(signal);
			return new Response('unavailable', { status: 503 });
		});
		const search = createBrowserBankSearch({ fetch: fetcher as typeof fetch });
		await expect(search({
			query: 'x', states: [], active: 'active', assetMin: null, assetMax: null,
			conditions: [], sort: 'assets', order: 'desc', limit: 5
		}, { signal, scope: 'test', toolName: 'search' }))
			.rejects.toThrow('HTTP 503');
	});
});
