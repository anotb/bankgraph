import type { PageServerLoad } from './$types';

export interface MacroSeriesMeta {
	series_id: string; title: string; category: string; source_agency: string; source_series: string;
	cadence: 'daily' | 'weekly' | 'monthly' | 'quarterly'; units: string; observed_through: string | null;
	coverage: { start: string | null; end: string | null }; source_page_url: string;
}

/** The catalog only; observations are fetched by the page for the chosen window. */
export const load: PageServerLoad = async ({ fetch }) => {
	const macro = (await fetch('/api/v1/macro').then((r) => (r.ok ? r.json() : null)).catch(() => null)) as null | { series: MacroSeriesMeta[] };
	return { catalog: macro?.series ?? [] };
};
