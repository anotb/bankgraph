import { browser } from '$app/environment';

const STORAGE_KEY = 'bde-watchlist';

function getInitialWatchlist(): number[] {
	if (!browser) return [];
	try {
		const stored = localStorage.getItem(STORAGE_KEY);
		if (!stored) return [];
		const parsed = JSON.parse(stored);
		if (!Array.isArray(parsed)) return [];
		return parsed.filter((v): v is number => typeof v === 'number');
	} catch {
		return [];
	}
}

let watchlist = $state<number[]>(getInitialWatchlist());

function persist(): void {
	if (!browser) return;
	localStorage.setItem(STORAGE_KEY, JSON.stringify(watchlist));
}

export function getWatchlist(): number[] {
	return watchlist;
}

export function addToWatchlist(cert: number): void {
	if (watchlist.includes(cert)) return;
	watchlist = [...watchlist, cert];
	persist();
}

export function removeFromWatchlist(cert: number): void {
	watchlist = watchlist.filter((c) => c !== cert);
	persist();
}

export function toggleWatchlist(cert: number): void {
	if (watchlist.includes(cert)) {
		removeFromWatchlist(cert);
	} else {
		addToWatchlist(cert);
	}
}

export function isWatched(cert: number): boolean {
	return watchlist.includes(cert);
}

export function clearWatchlist(): void {
	watchlist = [];
	persist();
}
