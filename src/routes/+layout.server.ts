import type { LayoutServerLoad } from './$types';
import type { DatasetContext } from '$lib/types';

interface MetaResponse {
	active_count?: number;
	latest_quarter?: string | null;
	dataset?: unknown;
}

/**
 * Site-wide context comes from the Worker's own public API so the same code runs
 * in production (D1 behind the API) and in remote-data development.
 */
export const load: LayoutServerLoad = async ({ fetch, locals }) => {
	try {
		const response = await fetch('/api/v1/meta');
		if (!response.ok) throw new Error(`meta ${response.status}`);
		const meta = (await response.json()) as MetaResponse;
		return {
			activeBankCount: meta.active_count ?? 0,
			latestQuarter: meta.latest_quarter ?? null,
			dataset: (meta.dataset ?? null) as DatasetContext | null,
			liveData: locals?.liveDataRelease
				? { state: 'live' as const, reason: null, release: locals.liveDataRelease }
				: { state: 'live' as const, reason: null, release: meta.latest_quarter ?? null }
		};
	} catch {
		return {
			activeBankCount: 0,
			latestQuarter: null,
			dataset: null as DatasetContext | null,
			liveData: { state: 'unavailable' as const, reason: 'database_unavailable', release: null }
		};
	}
};
