import type { PageServerLoad } from './$types';
import { error } from '@sveltejs/kit';
import type { Institution } from '$lib/types';

export const load: PageServerLoad = async ({ fetch, params }) => {
	const cert = Number(params.cert);
	if (!Number.isSafeInteger(cert) || cert <= 0) throw error(404, 'Unknown certificate');
	const [bankRes, ready] = await Promise.all([
		fetch(`/api/v1/banks/${cert}`),
		fetch('/api/v1/ready').then((r) => r.json()).catch(() => null) as Promise<{ liveData?: { release?: string | null }; checks?: { publicationState?: { generation?: string | null } } } | null>
	]);
	if (bankRes.status === 404) throw error(404, 'No institution with that FDIC certificate');
	if (!bankRes.ok) throw error(503, 'Institution data is temporarily unavailable');
	const body = (await bankRes.json()) as Institution & { latest_financials?: Record<string, number | null> | null };
	const { latest_financials, ...institution } = body;
	return {
		cert,
		institution: institution as Institution,
		latest: latest_financials ?? null,
		release: ready?.liveData?.release ?? null,
		releaseGeneration: ready?.checks?.publicationState?.generation ?? null,
		pageLoadedAt: new Date().toISOString()
	};
};
