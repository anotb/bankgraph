import type { PageServerLoad } from './$types';
import { getDB, queryAll } from '$lib/server/db';
import type { Failure } from '$lib/types';

export const load: PageServerLoad = async ({ platform }) => {
	const db = getDB(platform);

	const failures = await queryAll<Failure>(
		db,
		'SELECT * FROM failures ORDER BY fail_date DESC'
	);

	// Compute failures by year for the chart
	const byYear: Record<string, number> = {};
	for (const f of failures) {
		if (f.fail_date) {
			const year = f.fail_date.slice(0, 4);
			byYear[year] = (byYear[year] ?? 0) + 1;
		}
	}

	// Sort years
	const yearlyData = Object.entries(byYear)
		.sort(([a], [b]) => a.localeCompare(b))
		.map(([year, count]) => ({ year, count }));

	return { failures, yearlyData };
};
