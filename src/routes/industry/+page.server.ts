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
}

export const load: PageServerLoad = async ({ fetch }) => {
	try {
		const [metaRes, allRes, communityRes, regionalRes, largeRes] = await Promise.all([
			fetch('/api/v1/meta'),
			fetch('/api/v1/industry?segment=all&limit=1'),
			fetch('/api/v1/industry?segment=community&limit=1'),
			fetch('/api/v1/industry?segment=regional&limit=1'),
			fetch('/api/v1/industry?segment=large&limit=1')
		]);

		const meta: MetaResponse | null = metaRes.ok ? await metaRes.json() : null;
		const allSegment: IndustryData | null = allRes.ok ? await allRes.json() : null;
		const communitySegment: IndustryData | null = communityRes.ok ? await communityRes.json() : null;
		const regionalSegment: IndustryData | null = regionalRes.ok ? await regionalRes.json() : null;
		const largeSegment: IndustryData | null = largeRes.ok ? await largeRes.json() : null;

		return { meta, allSegment, communitySegment, regionalSegment, largeSegment };
	} catch {
		return {
			meta: null,
			allSegment: null,
			communitySegment: null,
			regionalSegment: null,
			largeSegment: null
		};
	}
};
