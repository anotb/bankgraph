import type { RequestHandler } from './$types';
import { getDB, queryOne } from '$lib/server/db';
import { cacheWrap } from '$lib/server/cache';
import { jsonResponse, errorResponse } from '$lib/server/response';
import type { Institution, Financial } from '$lib/types';

const TWENTY_FOUR_HOURS = 86400;

export const GET: RequestHandler = async (event) => {
  const { params, platform } = event;
  const certRaw = params.cert;
  const cert = parseInt(certRaw, 10);

  if (isNaN(cert) || cert < 1) {
    return errorResponse('cert must be a positive integer', 400);
  }

  const db = getDB(platform);
  const kv = platform?.env?.CACHE;
  const cacheKey = `bank:${cert}`;

  try {
    const bank = await cacheWrap<Institution | null>(kv, cacheKey, TWENTY_FOUR_HOURS, async () => {
      return queryOne<Institution>(db, 'SELECT * FROM institutions WHERE cert = ?', [cert]);
    });

    if (!bank) {
      return errorResponse('Bank not found', 404);
    }

    const finCacheKey = `bank:${cert}:latest_fin`;
    const latestFinancials = await cacheWrap<Financial | null>(kv, finCacheKey, TWENTY_FOUR_HOURS, async () => {
      return queryOne<Financial>(db, 'SELECT * FROM financials WHERE cert = ? ORDER BY repdte DESC LIMIT 1', [cert]);
    });

    return jsonResponse({ ...bank, latest_financials: latestFinancials });
  } catch (err) {
    console.error(`Failed to load bank ${cert}:`, err);
    return errorResponse('Failed to load bank data', 500);
  }
};
