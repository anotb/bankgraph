import type { RequestHandler } from './$types';
import { cacheWrap } from '$lib/server/cache';
import { getDB } from '$lib/server/db';
import {
	analyzeFailurePatterns,
	FAILURE_PATTERN_DEFAULT_END_YEAR,
	FAILURE_PATTERN_DEFAULT_LIMIT,
	FAILURE_PATTERN_DEFAULT_QUARTERS,
	FAILURE_PATTERN_DEFAULT_START_YEAR,
	FailurePatternInputError,
	parseFailurePatternRequest,
	type FailurePatternsResponse
} from '$lib/server/analytics/failure-patterns';
import { releaseLineage, stalePageReleaseResponse } from '$lib/server/release-lineage';
import { errorResponse, jsonResponse } from '$lib/server/response';

const SIX_HOURS = 21_600;

/**
 * GET /api/v2/research/failure-patterns
 *
 * Builds an exact-quarter event study from FDIC failure records and compares
 * active institutions with the resulting pre-failure trajectories. The result
 * reports descriptive similarity, not failure probability or a forecast.
 */
export const GET: RequestHandler = async ({ platform, url, locals, request: httpRequest }) => {
	let request;
	try {
		request = parseFailurePatternRequest(url.searchParams);
	} catch (error) {
		if (error instanceof FailurePatternInputError) return errorResponse(error.message, 400);
		throw error;
	}
	const staleResponse = stalePageReleaseResponse({ locals, url, request: httpRequest });
	if (staleResponse) return staleResponse;

	try {
		const load = () => analyzeFailurePatterns(getDB(platform), request, releaseLineage(locals));
		const isDefault = request.startYear === FAILURE_PATTERN_DEFAULT_START_YEAR
			&& request.endYear === FAILURE_PATTERN_DEFAULT_END_YEAR
			&& request.quarters === FAILURE_PATTERN_DEFAULT_QUARTERS
			&& request.limit === FAILURE_PATTERN_DEFAULT_LIMIT;
		const result = isDefault
			? await cacheWrap<FailurePatternsResponse>(
				platform?.env?.CACHE,
				'analysis:failure-patterns:v1:2007:2012:8:25',
				SIX_HOURS,
				load,
				locals?.liveDataGeneration
			)
			: await load();
		return jsonResponse(result);
	} catch (error) {
		if (error instanceof FailurePatternInputError) return errorResponse(error.message, 400);
		console.error('Failed to build the failure-pattern event study:', error);
		return errorResponse('Failed to build the failure-pattern event study', 500);
	}
};
