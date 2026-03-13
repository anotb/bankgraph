import type { PageServerLoad } from './$types';
import type { MetaResponse } from '$lib/types';
import { getDB, queryAll, queryOne } from '$lib/server/db';

interface IndustryQuarter {
	repdte: string;
	metrics: Record<string, number>;
}

interface IndustryData {
	segment: string;
	data: IndustryQuarter[];
}

interface AssetTierRow {
	asset_tier: number;
	bank_count: number;
	total_assets: number;
	total_deposits: number;
	avg_assets: number;
}

interface StateRow {
	state: string;
	bank_count: number;
	total_assets: number;
}

interface RegulatorRow {
	regulator: string;
	bank_count: number;
}

interface SegmentStatsRow {
	segment: string;
	bank_count: number;
	total_assets: number;
	total_deposits: number;
	avg_assets: number;
}

interface RecentFailure {
	cert: number;
	name: string | null;
	city: string | null;
	state: string | null;
	fail_date: string | null;
	total_assets: number | null;
}

export interface IndustryPageData {
	meta: MetaResponse | null;
	allSegment: IndustryData | null;
	communitySegment: IndustryData | null;
	regionalSegment: IndustryData | null;
	largeSegment: IndustryData | null;
	failureCount: number;
	recentFailures: RecentFailure[];
	assetTiers: AssetTierRow[];
	topStates: StateRow[];
	regulators: RegulatorRow[];
	segmentStats: SegmentStatsRow[];
}

export const load: PageServerLoad = async ({ fetch, platform }) => {
	// Defaults for when DB queries fail
	const emptyResult: IndustryPageData = {
		meta: null,
		allSegment: null,
		communitySegment: null,
		regionalSegment: null,
		largeSegment: null,
		failureCount: 0,
		recentFailures: [],
		assetTiers: [],
		topStates: [],
		regulators: [],
		segmentStats: []
	};

	try {
		const db = getDB(platform);

		// Fetch agg_industry data (may be empty) and institution-derived stats in parallel
		const [
			metaRes,
			allRes, communityRes, regionalRes, largeRes,
			assetTiers,
			topStates,
			regulators,
			segmentStats
		] = await Promise.all([
			fetch('/api/v1/meta'),
			fetch('/api/v1/industry?segment=all&limit=20'),
			fetch('/api/v1/industry?segment=community&limit=20'),
			fetch('/api/v1/industry?segment=regional&limit=20'),
			fetch('/api/v1/industry?segment=large&limit=20'),
			// Asset distribution by tier from institutions table
			queryAll<AssetTierRow>(db, `
				SELECT
					asset_tier,
					COUNT(*) as bank_count,
					COALESCE(SUM(total_assets), 0) as total_assets,
					COALESCE(SUM(total_deposits), 0) as total_deposits,
					COALESCE(AVG(total_assets), 0) as avg_assets
				FROM institutions
				WHERE active = 1 AND asset_tier IS NOT NULL
				GROUP BY asset_tier
				ORDER BY asset_tier
			`),
			// Top 10 states by bank count
			queryAll<StateRow>(db, `
				SELECT
					state,
					COUNT(*) as bank_count,
					COALESCE(SUM(total_assets), 0) as total_assets
				FROM institutions
				WHERE active = 1 AND state IS NOT NULL
				GROUP BY state
				ORDER BY bank_count DESC
				LIMIT 10
			`),
			// Regulator distribution
			queryAll<RegulatorRow>(db, `
				SELECT
					regulator,
					COUNT(*) as bank_count
				FROM institutions
				WHERE active = 1 AND regulator IS NOT NULL
				GROUP BY regulator
				ORDER BY bank_count DESC
			`),
			// Segment stats (community / mid-size / regional / large)
			queryAll<SegmentStatsRow>(db, `
				SELECT
					CASE
						WHEN asset_tier IN (1, 2, 3) THEN 'Community'
						WHEN asset_tier IN (4, 5) THEN 'Regional'
						WHEN asset_tier IN (6, 7) THEN 'Large'
					END as segment,
					COUNT(*) as bank_count,
					COALESCE(SUM(total_assets), 0) as total_assets,
					COALESCE(SUM(total_deposits), 0) as total_deposits,
					COALESCE(AVG(total_assets), 0) as avg_assets
				FROM institutions
				WHERE active = 1 AND asset_tier IS NOT NULL
				GROUP BY segment
				ORDER BY MIN(asset_tier)
			`)
		]);

		const meta: MetaResponse | null = metaRes.ok ? await metaRes.json() : null;
		const allSegment: IndustryData | null = allRes.ok ? await allRes.json() : null;
		const communitySegment: IndustryData | null = communityRes.ok ? await communityRes.json() : null;
		const regionalSegment: IndustryData | null = regionalRes.ok ? await regionalRes.json() : null;
		const largeSegment: IndustryData | null = largeRes.ok ? await largeRes.json() : null;

		// Failure count + recent failures
		let failureCount = 0;
		let recentFailures: RecentFailure[] = [];
		try {
			const result = await queryOne<{ cnt: number }>(db, 'SELECT COUNT(*) as cnt FROM failures');
			failureCount = result?.cnt ?? 0;

			recentFailures = await queryAll<RecentFailure>(
				db,
				`SELECT cert, name, city, state, fail_date, total_assets
				 FROM failures
				 ORDER BY fail_date DESC
				 LIMIT 5`
			);
		} catch { /* table may not exist */ }

		return {
			meta,
			allSegment, communitySegment, regionalSegment, largeSegment,
			failureCount,
			recentFailures,
			assetTiers,
			topStates,
			regulators,
			segmentStats
		};
	} catch {
		return emptyResult;
	}
};
