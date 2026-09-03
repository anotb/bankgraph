import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ fetch, url }) => {
	let release: string | null = null;
	let releaseGeneration: string | null = null;
	try {
		const ready = (await fetch('/api/v1/ready').then((r) => r.json())) as { liveData?: { release?: string | null }; checks?: { publicationState?: { generation?: string | null } } };
		release = ready.liveData?.release ?? null;
		releaseGeneration = ready.checks?.publicationState?.generation ?? null;
	} catch { /* degraded: the board still renders */ }
	return {
		release,
		releaseGeneration,
		pageLoadedAt: new Date().toISOString(),
		launch: {
			fresh: url.searchParams.get('fresh') === '1',
			template: url.searchParams.get('template'),
			question: url.searchParams.get('q'),
			states: url.searchParams.get('states')?.split(',').filter(Boolean) ?? [],
			certs: url.searchParams.get('certs')?.split(',').map(Number).filter((n) => Number.isSafeInteger(n) && n > 0) ?? [],
			asOf: url.searchParams.get('asOf'),
			assetMin: url.searchParams.get('asset_min') ? Number(url.searchParams.get('asset_min')) : null,
			assetMax: url.searchParams.get('asset_max') ? Number(url.searchParams.get('asset_max')) : null,
			add: url.searchParams.get('add'),
			series: url.searchParams.get('series')?.split(',').filter(Boolean) ?? [],
			share: url.searchParams.has('ws')
		}
	};
};
