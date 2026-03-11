import type { PageServerLoad } from './$types';
import { getDB, queryOne } from '$lib/server/db';

interface MetaData {
  bank_count: number;
  active_count: number;
  latest_quarter: string | null;
}

export const load: PageServerLoad = async ({ platform }) => {
  try {
    const db = getDB(platform);

    const [counts, quarter] = await Promise.all([
      queryOne<{ bank_count: number; active_count: number }>(
        db,
        `SELECT
          COUNT(*) as bank_count,
          SUM(CASE WHEN active = 1 THEN 1 ELSE 0 END) as active_count
        FROM institutions`
      ),
      queryOne<{ latest_quarter: string | null }>(
        db,
        'SELECT MAX(latest_repdte) as latest_quarter FROM institutions'
      )
    ]);

    return {
      meta: {
        bank_count: counts?.bank_count ?? 0,
        active_count: counts?.active_count ?? 0,
        latest_quarter: quarter?.latest_quarter ?? null
      } satisfies MetaData
    };
  } catch {
    // DB not available (local dev, first deploy, etc.)
    return {
      meta: {
        bank_count: 0,
        active_count: 0,
        latest_quarter: null
      } satisfies MetaData
    };
  }
};
