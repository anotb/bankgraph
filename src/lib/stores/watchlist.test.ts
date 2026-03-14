/**
 * Tests for the watchlist store.
 *
 * Interface:
 *   - getWatchlist(): number[]
 *   - addToWatchlist(cert: number): void
 *   - removeFromWatchlist(cert: number): void
 *   - toggleWatchlist(cert: number): void
 *   - isWatched(cert: number): boolean
 *   - clearWatchlist(): void
 *
 * Persists to localStorage under 'bde-watchlist'.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock $app/environment before importing the store
vi.mock('$app/environment', () => ({ browser: true }));

let watchlistModule: typeof import('./watchlist.svelte');

// Mock localStorage
const localStorageMock = (() => {
	let store: Record<string, string> = {};
	return {
		getItem: vi.fn((key: string): string | null => store[key] ?? null),
		setItem: vi.fn((key: string, value: string) => {
			store[key] = value;
		}),
		removeItem: vi.fn((key: string) => {
			delete store[key];
		}),
		clear: vi.fn(() => {
			store = {};
		}),
		get length() {
			return Object.keys(store).length;
		},
		key: vi.fn((i: number) => Object.keys(store)[i] ?? null),
		_reset() {
			store = {};
		}
	};
})();

beforeEach(() => {
	localStorageMock._reset();
	localStorageMock.getItem.mockClear();
	localStorageMock.setItem.mockClear();
	Object.defineProperty(globalThis, 'localStorage', {
		value: localStorageMock,
		writable: true,
		configurable: true
	});
});

afterEach(() => {
	vi.resetModules();
});

async function loadWatchlist() {
	watchlistModule = await import('./watchlist.svelte');
	return watchlistModule;
}

describe('watchlist store', () => {
	describe('empty state', () => {
		it('returns an empty array when nothing is stored', async () => {
			const { getWatchlist } = await loadWatchlist();
			expect(getWatchlist()).toEqual([]);
		});

		it('isWatched returns false for any cert when empty', async () => {
			const { isWatched } = await loadWatchlist();
			expect(isWatched(12345)).toBe(false);
		});
	});

	describe('addToWatchlist', () => {
		it('adds a cert number to the watchlist', async () => {
			const { addToWatchlist, getWatchlist } = await loadWatchlist();
			addToWatchlist(12345);
			expect(getWatchlist()).toContain(12345);
		});

		it('does not add duplicates', async () => {
			const { addToWatchlist, getWatchlist } = await loadWatchlist();
			addToWatchlist(12345);
			addToWatchlist(12345);
			expect(getWatchlist().filter((c) => c === 12345)).toHaveLength(1);
		});

		it('persists to localStorage after add', async () => {
			const { addToWatchlist } = await loadWatchlist();
			addToWatchlist(99999);
			expect(localStorageMock.setItem).toHaveBeenCalled();
			const lastCall = localStorageMock.setItem.mock.calls.at(-1);
			expect(lastCall).toBeDefined();
			const stored = JSON.parse(lastCall![1]);
			expect(stored).toContain(99999);
		});
	});

	describe('removeFromWatchlist', () => {
		it('removes an existing cert number', async () => {
			const { addToWatchlist, removeFromWatchlist, getWatchlist } = await loadWatchlist();
			addToWatchlist(11111);
			addToWatchlist(22222);
			removeFromWatchlist(11111);
			expect(getWatchlist()).not.toContain(11111);
			expect(getWatchlist()).toContain(22222);
		});

		it('is a no-op for a cert not in the list', async () => {
			const { addToWatchlist, removeFromWatchlist, getWatchlist } = await loadWatchlist();
			addToWatchlist(11111);
			removeFromWatchlist(99999);
			expect(getWatchlist()).toEqual([11111]);
		});

		it('persists to localStorage after remove', async () => {
			const { addToWatchlist, removeFromWatchlist } = await loadWatchlist();
			addToWatchlist(11111);
			localStorageMock.setItem.mockClear();
			removeFromWatchlist(11111);
			expect(localStorageMock.setItem).toHaveBeenCalled();
		});
	});

	describe('toggleWatchlist', () => {
		it('adds if not present', async () => {
			const { toggleWatchlist, isWatched } = await loadWatchlist();
			toggleWatchlist(55555);
			expect(isWatched(55555)).toBe(true);
		});

		it('removes if already present', async () => {
			const { addToWatchlist, toggleWatchlist, isWatched } = await loadWatchlist();
			addToWatchlist(55555);
			toggleWatchlist(55555);
			expect(isWatched(55555)).toBe(false);
		});

		it('toggle twice returns to original state', async () => {
			const { toggleWatchlist, isWatched } = await loadWatchlist();
			toggleWatchlist(55555);
			toggleWatchlist(55555);
			expect(isWatched(55555)).toBe(false);
		});
	});

	describe('isWatched', () => {
		it('returns true for a watched cert', async () => {
			const { addToWatchlist, isWatched } = await loadWatchlist();
			addToWatchlist(77777);
			expect(isWatched(77777)).toBe(true);
		});

		it('returns false after removal', async () => {
			const { addToWatchlist, removeFromWatchlist, isWatched } = await loadWatchlist();
			addToWatchlist(77777);
			removeFromWatchlist(77777);
			expect(isWatched(77777)).toBe(false);
		});
	});

	describe('clearWatchlist', () => {
		it('removes all entries', async () => {
			const { addToWatchlist, clearWatchlist, getWatchlist } = await loadWatchlist();
			addToWatchlist(11111);
			addToWatchlist(22222);
			addToWatchlist(33333);
			clearWatchlist();
			expect(getWatchlist()).toEqual([]);
		});

		it('persists empty array to localStorage', async () => {
			const { addToWatchlist, clearWatchlist } = await loadWatchlist();
			addToWatchlist(11111);
			localStorageMock.setItem.mockClear();
			clearWatchlist();
			expect(localStorageMock.setItem).toHaveBeenCalled();
			const lastCall = localStorageMock.setItem.mock.calls.at(-1);
			const stored = JSON.parse(lastCall![1]);
			expect(stored).toEqual([]);
		});
	});

	describe('localStorage persistence', () => {
		it('reads initial state from localStorage', async () => {
			localStorageMock.setItem('bde-watchlist', JSON.stringify([33333, 44444]));
			localStorageMock.getItem.mockImplementation((key: string): string | null => {
				if (key === 'bde-watchlist') return JSON.stringify([33333, 44444]);
				return null;
			});
			const { getWatchlist } = await loadWatchlist();
			const list = getWatchlist();
			expect(list).toContain(33333);
			expect(list).toContain(44444);
		});

		it('handles corrupted localStorage gracefully', async () => {
			localStorageMock.getItem.mockReturnValue('not-valid-json{{{');
			const { getWatchlist } = await loadWatchlist();
			expect(getWatchlist()).toEqual([]);
		});

		it('handles non-array localStorage value gracefully', async () => {
			localStorageMock.getItem.mockReturnValue('"just-a-string"');
			const { getWatchlist } = await loadWatchlist();
			expect(getWatchlist()).toEqual([]);
		});
	});
});
