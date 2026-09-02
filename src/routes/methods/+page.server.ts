import type { PageServerLoad } from './$types';

export interface MacroSeriesMeta { series_id: string; title: string; category: string; source_agency: string; units: string; frequency: string; source_available_from?: string | null }

export const load: PageServerLoad = async ({ fetch }) => {
	const macro = await fetch('/api/v1/macro').then((r) => (r.ok ? r.json() : null)).catch(() => null) as null | { series: MacroSeriesMeta[] };
	return { macro: macro?.series ?? [] };
};
