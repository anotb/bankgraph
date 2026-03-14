import type { PageServerLoad } from './$types';
import type { Institution } from '$lib/types';
import { getDB, queryAll } from '$lib/server/db';

export const load: PageServerLoad = async ({ platform, url }) => {
  const certsParam = url.searchParams.get('certs');
  if (!certsParam) return { prefetchedBanks: [] };

  const certs = certsParam
    .split(',')
    .map((c) => parseInt(c.trim(), 10))
    .filter((c) => !isNaN(c) && c > 0)
    .slice(0, 10);

  if (certs.length === 0) return { prefetchedBanks: [] };

  try {
    const db = getDB(platform);
    const placeholders = certs.map(() => '?').join(',');
    const banks = await queryAll<Institution>(
      db,
      `SELECT cert, name, state, city, active, asset FROM institutions WHERE cert IN (${placeholders})`,
      certs
    );
    return { prefetchedBanks: banks };
  } catch {
    return { prefetchedBanks: [] };
  }
};
