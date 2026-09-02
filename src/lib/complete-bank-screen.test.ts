import { describe, expect, it, vi } from 'vitest';
import {
	fetchCompleteBankScreen,
	fetchInitialBankScreen,
	type BankScreenPage
} from './complete-bank-screen';

function page(data: number[], total: number): BankScreenPage<number> {
	return { data, total, truncated: data.length < total, asOf: '20260630' };
}

describe('fetchCompleteBankScreen', () => {
	it('loads one bounded browser page while preserving the authoritative total', async () => {
		const fetchPage = vi.fn(async (_query: string, _signal: AbortSignal) => page([1, 2], 5));
		const progress = vi.fn();
		const result = await fetchInitialBankScreen({
			query: 'active=active&limit=2&sort=assets&offset=40',
			pageSize: 2,
			signal: new AbortController().signal,
			fetchPage,
			onProgress: progress
		});

		expect(result).toEqual(page([1, 2], 5));
		expect(fetchPage).toHaveBeenCalledOnce();
		expect(fetchPage.mock.calls[0]?.[0]).toBe('active=active&limit=2&sort=assets');
		expect(progress).toHaveBeenLastCalledWith({ loaded: 2, total: 5 });
	});

	it('loads and orders every bounded page in a complete screen', async () => {
		const pages = new Map([
			[0, page([1, 2], 5)],
			[2, page([3, 4], 5)],
			[4, page([5], 5)]
		]);
		const progress = vi.fn();
		const result = await fetchCompleteBankScreen({
			query: 'active=active&limit=2&sort=assets',
			pageSize: 2,
			signal: new AbortController().signal,
			fetchPage: async (query) => pages.get(Number(new URLSearchParams(query).get('offset') ?? 0))!,
			onProgress: progress
		});

		expect(result).toEqual(page([1, 2, 3, 4, 5], 5));
		expect(result.truncated).toBe(false);
		expect(progress).toHaveBeenLastCalledWith({ loaded: 5, total: 5 });
	});

	it('rejects a result set that changes between pages', async () => {
		await expect(fetchCompleteBankScreen({
			query: 'active=active&limit=2',
			pageSize: 2,
			signal: new AbortController().signal,
			fetchPage: async (query) => Number(new URLSearchParams(query).get('offset') ?? 0) === 0
				? page([1, 2], 3)
				: page([3], 4)
		})).rejects.toThrow('changed while its result pages were loading');
	});
});
