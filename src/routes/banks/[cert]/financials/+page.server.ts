import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import type { Financial } from '$lib/types';
import { getDB, queryAll } from '$lib/server/db';

export const load: PageServerLoad = async ({ parent, platform }) => {
	const { bank } = await parent();
	const db = getDB(platform);

	try {
		const financials = await queryAll<Financial>(
			db,
			'SELECT * FROM (SELECT * FROM financials WHERE cert = ? ORDER BY repdte DESC LIMIT 80) ORDER BY repdte ASC',
			[bank.cert]
		);

		return { financials };
	} catch (err) {
		console.error(`Failed to load financials for cert ${bank.cert}:`, err);
		throw error(500, 'Failed to load financial data. Please try again later.');
	}
};
