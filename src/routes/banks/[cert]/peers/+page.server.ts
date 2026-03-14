import type { PageServerLoad } from './$types';
import type { PeerComparison, PeerStats, PercentileHistoryPoint } from '$lib/types';
import { getDB, queryAll } from '$lib/server/db';

const HISTORY_METRICS = ['roa', 'roe', 'nimy', 'rbcrwaj'] as const;

/**
 * Estimate a bank's percentile from peer_stats quantile breakpoints.
 * Uses linear interpolation between known quantiles (p10, p25, p50, p75, p90).
 * Avoids expensive full-table scans needed for exact computation.
 */
function estimatePercentile(bankValue: number, stats: PeerStats): number {
	const breakpoints = [
		{ pct: 0, val: stats.min_val },
		{ pct: 10, val: stats.p10 },
		{ pct: 25, val: stats.p25 },
		{ pct: 50, val: stats.median },
		{ pct: 75, val: stats.p75 },
		{ pct: 90, val: stats.p90 },
		{ pct: 100, val: stats.max_val }
	].filter((b) => b.val !== null) as { pct: number; val: number }[];

	if (breakpoints.length < 2) return 50;

	// Below minimum
	if (bankValue <= breakpoints[0].val) return breakpoints[0].pct;
	// Above maximum
	if (bankValue >= breakpoints[breakpoints.length - 1].val)
		return breakpoints[breakpoints.length - 1].pct;

	// Find surrounding breakpoints and interpolate
	for (let i = 0; i < breakpoints.length - 1; i++) {
		const lo = breakpoints[i];
		const hi = breakpoints[i + 1];
		if (bankValue >= lo.val && bankValue <= hi.val) {
			if (hi.val === lo.val) return (lo.pct + hi.pct) / 2;
			const frac = (bankValue - lo.val) / (hi.val - lo.val);
			return Math.round((lo.pct + frac * (hi.pct - lo.pct)) * 10) / 10;
		}
	}

	return 50;
}

export const load: PageServerLoad = async ({ parent, fetch, platform }) => {
	const { bank } = await parent();

	// Fetch current-quarter peer comparison (existing behavior)
	const peersPromise = (async (): Promise<PeerComparison | null> => {
		try {
			const res = await fetch(
				`/api/v1/banks/${bank.cert}/peers?metrics=roa,roe,nimy,eeffr,nclnlsr,rbcrwaj,lnlsdepr`
			);
			if (!res.ok) return null;
			return await res.json();
		} catch {
			return null;
		}
	})();

	// Fetch percentile history for last 8 quarters
	const historyPromise = (async (): Promise<PercentileHistoryPoint[]> => {
		try {
			if (bank.asset_tier === null) return [];
			const db = getDB(platform);
			const peerGroup = `asset_bucket:${bank.asset_tier}`;

			// Get last 8 quarters of this bank's financials
			const bankRows = await queryAll<Record<string, number | null> & { repdte: string }>(
				db,
				`SELECT repdte, ${HISTORY_METRICS.join(', ')}
				 FROM financials WHERE cert = ? ORDER BY repdte DESC LIMIT 8`,
				[bank.cert]
			);

			if (bankRows.length === 0) return [];

			// Get peer_stats for matching quarters and metrics
			const repdates = bankRows.map((r) => r.repdte);
			const peerRows = await queryAll<PeerStats>(
				db,
				`SELECT * FROM peer_stats
				 WHERE peer_group = ?
				   AND repdte IN (${repdates.map(() => '?').join(',')})
				   AND metric IN (${HISTORY_METRICS.map(() => '?').join(',')})`,
				[peerGroup, ...repdates, ...HISTORY_METRICS]
			);

			// Index peer stats by repdte+metric
			const peerMap = new Map<string, PeerStats>();
			for (const row of peerRows) {
				peerMap.set(`${row.repdte}:${row.metric}`, row);
			}

			// Compute percentile for each quarter+metric
			const points: PercentileHistoryPoint[] = [];
			for (const bankRow of bankRows) {
				for (const metric of HISTORY_METRICS) {
					const bankValue = bankRow[metric];
					if (bankValue === null || bankValue === undefined) continue;

					const stats = peerMap.get(`${bankRow.repdte}:${metric}`);
					if (!stats) continue;

					const pctile = estimatePercentile(bankValue, stats);
					points.push({
						repdte: bankRow.repdte,
						metric,
						percentile: pctile
					});
				}
			}

			return points;
		} catch {
			return [];
		}
	})();

	const [peers, percentileHistory] = await Promise.all([peersPromise, historyPromise]);

	return { peers, percentileHistory };
};
