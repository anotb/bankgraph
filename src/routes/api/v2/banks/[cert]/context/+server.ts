import type { RequestHandler } from './$types';
import { getDB } from '$lib/server/db';
import { errorResponse, jsonResponse } from '$lib/server/response';
import { getBankContext } from '$lib/server/bank-context';
import { cacheWrap } from '$lib/server/cache';

const MAX_CERT = 9_999_999;

export const GET: RequestHandler = async ({ params, platform, locals }) => {
  if (!/^[1-9]\d*$/.test(params.cert)) return errorResponse('cert must be a positive integer', 400);
  const cert = Number(params.cert);
  if (!Number.isSafeInteger(cert) || cert > MAX_CERT) return errorResponse(`cert must not exceed ${MAX_CERT}`, 400);
  try {
    const context = await cacheWrap(
      platform?.env?.CACHE,
      `bank-context:${cert}`,
      43_200,
      () => getBankContext(getDB(platform), cert, locals?.liveDataGeneration ?? null),
      locals?.liveDataGeneration
    );
    return context ? jsonResponse(context) : errorResponse('Bank not found', 404);
  } catch (error) {
    console.error(`Failed to load context for cert ${cert}:`, error);
    return errorResponse('Failed to load institution context', 500);
  }
};
