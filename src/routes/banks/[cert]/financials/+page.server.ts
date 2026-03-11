import type { PageServerLoad } from './$types';
import type { Financial } from '$lib/types';
import { getDB, queryAll } from '$lib/server/db';

export const load: PageServerLoad = async ({ parent, platform }) => {
	const { bank } = await parent();
	const db = getDB(platform);

	const financials = await queryAll<Financial>(
		db,
		'SELECT * FROM financials WHERE cert = ? ORDER BY repdte ASC',
		[bank.cert]
	);

	return { financials };
};
