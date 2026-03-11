import { error } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';
import type { Institution } from '$lib/types';
import { getDB, queryOne } from '$lib/server/db';

export const load: LayoutServerLoad = async ({ params, platform }) => {
  const cert = parseInt(params.cert, 10);
  if (isNaN(cert)) {
    error(404, 'Bank not found');
  }

  const db = getDB(platform);
  const bank = await queryOne<Institution>(
    db,
    'SELECT * FROM institutions WHERE cert = ?',
    [cert]
  );

  if (!bank) {
    error(404, 'Bank not found');
  }

  return { bank };
};
