import type { PageServerLoad } from './$types';
import { getDB, queryAll } from '$lib/server/db';
import type { Failure } from '$lib/types';

interface CostSummary {
	totalCost: number;
	totalAssets: number;
	failureCount: number;
	failuresWithCost: number;
	avgCost: number;
	largestFailure: { name: string; cost: number; fail_date: string } | null;
	largestByAssets: { name: string; total_assets: number; fail_date: string } | null;
	costByDecade: Array<{ decade: string; cost: number; count: number }>;
}

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

	// Cost analysis
	let totalCost = 0;
	let totalAssets = 0;
	let failuresWithCost = 0;
	let largestFailure: CostSummary['largestFailure'] = null;
	let largestByAssets: CostSummary['largestByAssets'] = null;
	const costByDecadeMap: Record<string, { cost: number; count: number }> = {};

	for (const f of failures) {
		if (f.cost != null) {
			totalCost += f.cost;
			failuresWithCost++;
			if (!largestFailure || f.cost > largestFailure.cost) {
				largestFailure = { name: f.name ?? 'Unknown', cost: f.cost, fail_date: f.fail_date ?? '' };
			}
		}
		if (f.total_assets != null) {
			totalAssets += f.total_assets;
			if (!largestByAssets || f.total_assets > largestByAssets.total_assets) {
				largestByAssets = { name: f.name ?? 'Unknown', total_assets: f.total_assets, fail_date: f.fail_date ?? '' };
			}
		}
		if (f.fail_date) {
			const year = parseInt(f.fail_date.slice(0, 4), 10);
			const decade = `${Math.floor(year / 10) * 10}s`;
			if (!costByDecadeMap[decade]) costByDecadeMap[decade] = { cost: 0, count: 0 };
			costByDecadeMap[decade].count++;
			if (f.cost != null) costByDecadeMap[decade].cost += f.cost;
		}
	}

	const costByDecade = Object.entries(costByDecadeMap)
		.sort(([a], [b]) => a.localeCompare(b))
		.map(([decade, data]) => ({ decade, ...data }));

	const costSummary: CostSummary = {
		totalCost,
		totalAssets,
		failureCount: failures.length,
		failuresWithCost,
		avgCost: failuresWithCost > 0 ? totalCost / failuresWithCost : 0,
		largestFailure,
		largestByAssets,
		costByDecade
	};

	return { failures, yearlyData, costSummary };
};
