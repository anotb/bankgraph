import type { RequestHandler } from './$types';
import { getDB } from '$lib/server/db';
import { getQuarterChangeBrief } from '$lib/server/analytics/quarter-change-brief';
import { errorResponse, jsonResponse } from '$lib/server/response';
import { stalePageReleaseResponse } from '$lib/server/release-lineage';

const QUARTER_END_RE = /^\d{4}(0331|0630|0930|1231)$/;
const MAX_CERT = 9_999_999;

export const GET: RequestHandler = async ({ params, platform, url, locals, request }) => {
  if (!/^[1-9]\d*$/.test(params.cert)) {
    return errorResponse('cert must be a positive integer', 400);
  }
  const cert = Number(params.cert);
  if (!Number.isSafeInteger(cert) || cert > MAX_CERT) {
    return errorResponse(`cert must not exceed ${MAX_CERT}`, 400);
  }

  const from = url.searchParams.get('from');
  const to = url.searchParams.get('to');
  if (from && !QUARTER_END_RE.test(from)) {
    return errorResponse('from must be an FDIC quarter end in YYYYMMDD format', 400);
  }
  if (to && !QUARTER_END_RE.test(to)) {
    return errorResponse('to must be an FDIC quarter end in YYYYMMDD format', 400);
  }
  const staleResponse = stalePageReleaseResponse({ locals, url, request });
  if (staleResponse) return staleResponse;

  try {
    const result = await getQuarterChangeBrief(getDB(platform), cert, {
      from,
      to,
      release: locals?.liveDataRelease ?? null,
      releaseGeneration: locals?.liveDataGeneration ?? null
    });
    if (!result) return errorResponse('Bank not found', 404);
    const response = jsonResponse(result);
    // Quarter briefs reconcile the currently loaded rows and should never
    // survive a trailing-quarter refresh in an intermediary cache.
    response.headers.set('Cache-Control', 'no-store');
    return response;
  } catch (error) {
    console.error(`Failed to build quarter brief for cert ${cert}:`, error);
    return errorResponse('Failed to build quarter change brief', 500);
  }
};
