import type { PageServerLoad } from './$types';
import type { Institution } from '$lib/types';
import { getDB, queryAll } from '$lib/server/db';

export const load: PageServerLoad = async ({ platform, url }) => {
  const db = getDB(platform);

  // Fetch top 6 banks by assets for dynamic popular comparisons
  const topBanksPromise = queryAll<Pick<Institution, 'cert' | 'name'>>(
    db,
    `SELECT cert, name FROM institutions WHERE active = 1 ORDER BY asset DESC LIMIT 6`
  ).catch(() => [] as Pick<Institution, 'cert' | 'name'>[]);

  const certsParam = url.searchParams.get('certs');
  if (!certsParam) {
    const topBanks = await topBanksPromise;
    return { prefetchedBanks: [], topBanks };
  }

  const certs = certsParam
    .split(',')
    .map((c) => parseInt(c.trim(), 10))
    .filter((c) => !isNaN(c) && c > 0)
    .slice(0, 10);

  if (certs.length === 0) {
    const topBanks = await topBanksPromise;
    return { prefetchedBanks: [], topBanks };
  }

  try {
    const placeholders = certs.map(() => '?').join(',');
    const [banks, topBanks] = await Promise.all([
      queryAll<Institution>(
        db,
        `SELECT cert, name, state, city, active, asset FROM institutions WHERE cert IN (${placeholders})`,
        certs
      ),
      topBanksPromise
    ]);
    return { prefetchedBanks: banks, topBanks };
  } catch {
    const topBanks = await topBanksPromise;
    return { prefetchedBanks: [], topBanks };
  }
};
