import type { RequestHandler } from './$types';
import { getDB, queryOne } from '$lib/server/db';
import { cacheWrap } from '$lib/server/cache';
import { jsonResponse, errorResponse } from '$lib/server/response';
import type { Institution, Financial, BankDetailResponse } from '$lib/types';
import { releaseLineage, stalePageReleaseResponse } from '$lib/server/release-lineage';

const TWENTY_FOUR_HOURS = 86400;
const MAX_CERT = 9_999_999;

export const GET: RequestHandler = async (event) => {
  const { params, platform, locals, url, request } = event;
  if (!/^[1-9]\d*$/.test(params.cert)) {
    return errorResponse('cert must be a positive integer', 400);
  }
  const cert = Number(params.cert);
  if (!Number.isSafeInteger(cert) || cert > MAX_CERT) {
    return errorResponse(`cert must not exceed ${MAX_CERT}`, 400);
  }
  const staleResponse = stalePageReleaseResponse({ locals, url, request });
  if (staleResponse) return staleResponse;

  const db = getDB(platform);
  const kv = platform?.env?.CACHE;
  const cacheKey = `bank:${cert}`;

  try {
    const bank = await cacheWrap<Institution | null>(kv, cacheKey, TWENTY_FOUR_HOURS, async () => {
      return queryOne<Institution>(db, 'SELECT * FROM published_institutions WHERE cert = ?', [cert]);
    }, locals?.liveDataGeneration);

    if (!bank) {
      return errorResponse('Bank not found', 404);
    }

    const finCacheKey = `bank:${cert}:latest_fin`;
    const latestFinancials = await cacheWrap<Financial | null>(kv, finCacheKey, TWENTY_FOUR_HOURS, async () => {
      return queryOne<Financial>(db, 'SELECT * FROM published_financials WHERE cert = ? ORDER BY repdte DESC LIMIT 1', [cert]);
    }, locals?.liveDataGeneration);

    return jsonResponse({
      ...bank,
      latest_financials: latestFinancials,
      ...releaseLineage(locals)
    } satisfies BankDetailResponse);
  } catch (err) {
    console.error(`Failed to load bank ${cert}:`, err);
    return errorResponse('Failed to load bank data', 500);
  }
};
