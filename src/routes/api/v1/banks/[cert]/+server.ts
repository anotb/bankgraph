import type { RequestHandler } from './$types';
import { getDB, queryOne } from '$lib/server/db';
import { cacheWrap } from '$lib/server/cache';
import type { Institution } from '$lib/types';

const TWENTY_FOUR_HOURS = 86400;

function corsJson(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*'
    }
  });
}

export const GET: RequestHandler = async (event) => {
  const { params, platform } = event;
  const certRaw = params.cert;
  const cert = parseInt(certRaw, 10);

  if (isNaN(cert) || cert < 1) {
    return corsJson({ error: 'cert must be a positive integer' }, 400);
  }

  const kv = platform?.env?.CACHE;
  const cacheKey = `bank:${cert}`;

  const bank = await cacheWrap<Institution | null>(kv, cacheKey, TWENTY_FOUR_HOURS, async () => {
    const db = getDB(platform);
    return queryOne<Institution>(db, 'SELECT * FROM institutions WHERE cert = ?', [cert]);
  });

  if (!bank) {
    return corsJson({ error: 'Bank not found' }, 404);
  }

  return corsJson(bank);
};
