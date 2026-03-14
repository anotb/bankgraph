import type { LayoutServerLoad } from './$types';
import { getDB, queryOne } from '$lib/server/db';

export const load: LayoutServerLoad = async ({ platform }) => {
  try {
    const db = getDB(platform);
    const [countRow, quarterRow] = await Promise.all([
      queryOne<{ cnt: number }>(
        db,
        'SELECT COUNT(*) as cnt FROM institutions WHERE active = 1'
      ),
      queryOne<{ latest_quarter: string | null }>(
        db,
        'SELECT MAX(latest_repdte) as latest_quarter FROM institutions'
      )
    ]);
    return {
      activeBankCount: countRow?.cnt ?? 0,
      latestQuarter: quarterRow?.latest_quarter ?? null
    };
  } catch {
    return { activeBankCount: 0, latestQuarter: null };
  }
};
