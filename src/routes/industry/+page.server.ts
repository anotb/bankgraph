import type { PageServerLoad } from './$types';
import type { MetaResponse } from '$lib/types';

interface IndustryQuarter {
	repdte: string;
	metrics: Record<string, number>;
}

interface IndustryData {
	segment: string;
	data: IndustryQuarter[];
}

export interface IndustryPageData {
	meta: MetaResponse | null;
	allSegment: IndustryData | null;
	communitySegment: IndustryData | null;
	regionalSegment: IndustryData | null;
	largeSegment: IndustryData | null;
	failureCount: number;
}

export const load: PageServerLoad = async ({ fetch, platform }) => {
	try {
		const [metaRes, allRes, communityRes, regionalRes, largeRes] = await Promise.all([
			fetch('/api/v1/meta'),
			fetch('/api/v1/industry?segment=all&limit=20'),
			fetch('/api/v1/industry?segment=community&limit=20'),
			fetch('/api/v1/industry?segment=regional&limit=20'),
			fetch('/api/v1/industry?segment=large&limit=20')
		]);

		const meta: MetaResponse | null = metaRes.ok ? await metaRes.json() : null;
		const allSegment: IndustryData | null = allRes.ok ? await allRes.json() : null;
		const communitySegment: IndustryData | null = communityRes.ok ? await communityRes.json() : null;
		const regionalSegment: IndustryData | null = regionalRes.ok ? await regionalRes.json() : null;
		const largeSegment: IndustryData | null = largeRes.ok ? await largeRes.json() : null;

		// Add failure count
		let failureCount = 0;
		try {
			const { getDB, queryOne } = await import('$lib/server/db');
			const db = getDB(platform);
			const result = await queryOne<{ cnt: number }>(db, 'SELECT COUNT(*) as cnt FROM failures');
			failureCount = result?.cnt ?? 0;
		} catch { /* table may not exist */ }

		return { meta, allSegment, communitySegment, regionalSegment, largeSegment, failureCount };
	} catch {
		return {
			meta: null,
			allSegment: null,
			communitySegment: null,
			regionalSegment: null,
			largeSegment: null,
			failureCount: 0
		};
	}
};
