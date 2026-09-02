import type { Financial, Institution } from '$lib/types';
import type { BankScreenFilters, PeerRecipe, WorkspaceState } from '$lib/workspace/types';
import { RESEARCH_RAW_FIELDS, previousQuarter } from './metrics';

/**
 * Everything a board needs in the browser: institution records, quarterly rows
 * per institution, and the current cohort's membership. Loaded once per
 * (institution, window), shared by every block, and prefetched a year beyond the
 * visible window so the timebar can move without a network round trip.
 */
export class BoardData {
	institutions = $state<Record<number, Institution>>({});
	rows = $state<Record<number, Financial[]>>({});
	cohort = $state<number[]>([]);
	cohortTotal = $state(0);
	cohortAsOf = $state<string | null>(null);
	cohortKey = $state('');
	pending = $state(0);
	error = $state<string | null>(null);
	latestQuarter = $state<string | null>(null);

	#rowsFrom = new Map<number, string>();
	#inflight = new Map<string, Promise<void>>();
	#fetch: typeof fetch;

	constructor(fetcher: typeof fetch = fetch) { this.#fetch = fetcher; }

	quartersFor(certs: readonly number[]): string[] {
		const set = new Set<string>();
		for (const cert of certs) for (const r of this.rows[cert] ?? []) set.add(r.repdte);
		return [...set].sort();
	}

	async #track<T>(p: Promise<T>): Promise<T> {
		this.pending += 1;
		try { return await p; } finally { this.pending -= 1; }
	}

	async ensureInstitutions(certs: readonly number[], signal?: AbortSignal): Promise<void> {
		const missing = [...new Set(certs)].filter((c) => !this.institutions[c]);
		if (!missing.length) return;
		await this.#track(Promise.all(missing.map(async (cert) => {
			const key = `inst:${cert}`;
			if (this.#inflight.has(key)) return this.#inflight.get(key);
			const p = (async () => {
				try {
					const res = await this.#fetch(`/api/v1/banks/${cert}`, { signal });
					if (!res.ok) return;
					const body = (await res.json()) as Institution & { latest_financials?: unknown };
					const { latest_financials: _ignored, ...inst } = body as Institution & { latest_financials?: unknown };
					this.institutions = { ...this.institutions, [cert]: inst as Institution };
				} catch { /* leave missing */ } finally { this.#inflight.delete(key); }
			})();
			this.#inflight.set(key, p);
			return p;
		})));
	}

	/** Load quarterly rows for institutions from `from` (YYYYMMDD) to the latest release. */
	async ensureRows(certs: readonly number[], from: string, signal?: AbortSignal): Promise<void> {
		const need = [...new Set(certs)].filter((c) => { const have = this.#rowsFrom.get(c); return !have || have > from; });
		if (!need.length) return;
		const batches: number[][] = [];
		for (let i = 0; i < need.length; i += 10) batches.push(need.slice(i, i + 10));
		const metrics = RESEARCH_RAW_FIELDS.join(',');
		await this.#track((async () => {
			// Bounded concurrency keeps a 200-bank cohort at ~20 requests, 4 at a time.
			let index = 0;
			const worker = async () => {
				while (index < batches.length) {
					const batch = batches[index++];
					const key = `rows:${batch.join(',')}:${from}`;
					if (this.#inflight.has(key)) { await this.#inflight.get(key); continue; }
					const p = (async () => {
						try {
							const res = await this.#fetch(`/api/v1/compare?certs=${batch.join(',')}&metrics=${metrics}&from=${from}`, { signal });
							if (!res.ok) { this.error = `History unavailable (HTTP ${res.status})`; return; }
							const body = (await res.json()) as { data: Record<string, Financial[]> };
							const next = { ...this.rows };
							for (const cert of batch) {
								const rows = (body.data[String(cert)] ?? []).slice().sort((a, b) => a.repdte.localeCompare(b.repdte));
								next[cert] = rows;
								this.#rowsFrom.set(cert, from);
								const last = rows.at(-1)?.repdte;
								if (last && (!this.latestQuarter || last > this.latestQuarter)) this.latestQuarter = last;
							}
							this.rows = next;
						} catch (e) {
							if ((e as Error).name !== 'AbortError') this.error = 'History unavailable';
						} finally { this.#inflight.delete(key); }
					})();
					this.#inflight.set(key, p);
					await p;
				}
			};
			await Promise.all(Array.from({ length: Math.min(4, batches.length) }, worker));
		})());
	}

	/** Resolve the cohort from the workspace's peer recipe (or screen) via the deterministic screen API. */
	async loadCohort(state: WorkspaceState, signal?: AbortSignal): Promise<void> {
		const recipe = state.peerRecipe;
		const filters: BankScreenFilters = recipe.basis === 'screen' ? state.filters : {
			query: '', states: recipe.states, assetRange: recipe.assetRange, active: recipe.active, metricConditions: recipe.metricConditions
		};
		const limit = Math.min(200, Math.max(recipe.maximumPeers || 50, 1));
		const params = new URLSearchParams();
		if (filters.query) params.set('q', filters.query.slice(0, 120));
		if (filters.states.length) params.set('state', filters.states.join(','));
		params.set('active', filters.active === 'any' ? 'any' : filters.active === 'inactive' ? 'inactive' : 'active');
		if (filters.assetRange.min != null) params.set('asset_min', String(filters.assetRange.min));
		if (filters.assetRange.max != null) params.set('asset_max', String(filters.assetRange.max));
		if (filters.metricConditions.length) params.set('conditions', JSON.stringify(filters.metricConditions.map((c) => ({ metric: c.metric, operator: c.operator, value: c.value, ...(c.operator === 'between' ? { upperValue: c.upperValue } : {}) }))));
		params.set('sort', 'assets'); params.set('order', 'desc'); params.set('limit', String(limit + state.excludedCerts.length));
		const key = params.toString();
		if (key === this.cohortKey) return;
		await this.#track((async () => {
			try {
				const res = await this.#fetch(`/api/v2/banks/screen?${key}`, { signal });
				if (!res.ok) { this.error = `Cohort unavailable (HTTP ${res.status})`; return; }
				const body = (await res.json()) as { data: Institution[]; total: number; asOf: string | null };
				const excluded = new Set(state.excludedCerts);
				const members = body.data.filter((b) => !excluded.has(b.cert)).slice(0, limit);
				const next = { ...this.institutions };
				for (const b of body.data) next[b.cert] = b;
				this.institutions = next;
				this.cohort = members.map((b) => b.cert);
				this.cohortTotal = body.total;
				this.cohortAsOf = body.asOf ?? null;
				this.cohortKey = key;
			} catch (e) {
				if ((e as Error).name !== 'AbortError') this.error = 'Cohort unavailable';
			}
		})());
	}

	/** Window start with a year of prefetch behind it so the comparison caret and YoY measures resolve locally. */
	static windowStart(state: WorkspaceState, fallbackLatest: string | null): string {
		const to = state.chartHistory.to ?? state.asOfQuarter ?? fallbackLatest ?? '20260630';
		let from = state.chartHistory.from ?? previousQuarter(to, 7);
		if (state.comparison.resolvedQuarter && state.comparison.resolvedQuarter < from) from = state.comparison.resolvedQuarter;
		return previousQuarter(from, 4);
	}
}
