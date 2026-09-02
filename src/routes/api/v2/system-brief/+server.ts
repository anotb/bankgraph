import type { RequestHandler } from './$types';
import { getDB, queryOne } from '$lib/server/db';
import { errorResponse, jsonResponse } from '$lib/server/response';
import { loadSystemBrief } from '$lib/server/analytics/system-brief-service';
import type { SystemBriefResponse } from '$lib/server/analytics/system-signals';
import { releaseLineage, stalePageReleaseResponse } from '$lib/server/release-lineage';

/**
 * GET /api/v2/system-brief
 *
 * A bounded, read-only set of recurring system-level questions derived from
 * the latest FDIC financial rows. Macro observations are context
 * only and are never treated as causal evidence.
 */
export const GET: RequestHandler = async ({ platform, locals, url, request }) => {
	const staleResponse = stalePageReleaseResponse({ locals, url, request });
	if (staleResponse) return staleResponse;
	try {
		const db = getDB(platform);
		const fixture = await queryOne<{ value: string | null }>(
			db,
			"SELECT value FROM pipeline_state WHERE key = 'demo_fixture_mode' LIMIT 1"
		);
		if (fixture?.value === 'recorded') {
			return errorResponse(
				'System brief unavailable: the recorded demo contains a selected institution slice, not a national financial-row population',
				409
			);
		}
		const brief = await loadSystemBrief(db);
		return jsonResponse({ ...brief, ...releaseLineage(locals) } satisfies SystemBriefResponse);
	} catch (error) {
		console.error('Failed to build banking-system brief:', error);
		return errorResponse('Failed to build banking-system brief', 500);
	}
};
