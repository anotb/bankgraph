import type { RequestHandler } from './$types';
import { getDB } from '$lib/server/db';
import {
	BankScreenInputError,
	commonBankScreenCacheKey,
	parseBankScreenRequest,
	screenBanks,
	type BankScreenResponse
} from '$lib/server/bank-screen';
import { cacheWrap } from '$lib/server/cache';
import { errorResponse, jsonResponse } from '$lib/server/response';
import { releaseLineage, stalePageReleaseResponse } from '$lib/server/release-lineage';

const ONE_DAY = 86_400;

/**
 * GET /api/v2/banks/screen — bounded deterministic screening over stored institution snapshots.
 * Asset and deposit inputs use FDIC USD thousands; ratio inputs use reported percent.
 * Conditions are ANDed, and any condition excludes a row when its metric is null.
 */
export const GET: RequestHandler = async ({ platform, url, locals, request: httpRequest }) => {
	let request;
	try {
		request = parseBankScreenRequest(url.searchParams);
	} catch (error) {
		if (error instanceof BankScreenInputError) return errorResponse(error.message, 400);
		throw error;
	}
	const staleResponse = stalePageReleaseResponse({ locals, url, request: httpRequest });
	if (staleResponse) return staleResponse;

	try {
		const load = () => screenBanks(getDB(platform), request, releaseLineage(locals));
		const cacheKey = commonBankScreenCacheKey(request);
		const result = cacheKey
			? await cacheWrap<BankScreenResponse>(
				platform?.env?.CACHE,
				cacheKey,
				ONE_DAY,
				load,
				locals?.liveDataGeneration
			)
			: await load();
		return jsonResponse(result);
	} catch (error) {
		if (error instanceof BankScreenInputError) return errorResponse(error.message, 400);
		console.error('Failed to screen banks:', error);
		return errorResponse('Failed to screen banks', 500);
	}
};
