import type { LayoutServerLoad } from './$types';
import { getDB, queryOne } from '$lib/server/db';

export const load: LayoutServerLoad = async ({ platform }) => {
  try {
    const db = getDB(platform);
    const row = await queryOne<{ cnt: number }>(
      db,
      'SELECT COUNT(*) as cnt FROM institutions WHERE active = 1'
    );
    return { activeBankCount: row?.cnt ?? 0 };
  } catch {
    return { activeBankCount: 0 };
  }
};
