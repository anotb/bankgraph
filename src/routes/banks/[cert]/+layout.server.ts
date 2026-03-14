import { error } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';
import type { Institution, PeerStats } from '$lib/types';
import { getDB, queryOne, queryAll } from '$lib/server/db';

interface AnomalyCounts {
  critical: number;
  warning: number;
  info: number;
}

interface PeerComparisonMetric {
  label: string;
  metric: string;
  value: number | null;
  peerMedian: number | null;
  percentile: number | null;
  format: 'percent' | 'currency';
}

interface QuarterSnapshot {
  repdte: string;
  asset: number | null;
  dep: number | null;
  roa: number | null;
  roe: number | null;
  nimy: number | null;
  nclnlsr: number | null;
  rbcrwaj: number | null;
  numemp: number | null;
}

/** Calculate percentile rank of a value within its peer group */
async function calcPercentile(
  db: D1Database,
  bucket: number,
  repdte: string,
  metric: string,
  bankValue: number
): Promise<number> {
  if (!/^[a-z_][a-z0-9_]*$/i.test(metric)) throw new Error(`Invalid metric: ${metric}`);
  const rows = await queryAll<Record<string, number>>(
    db,
    `SELECT ${metric} FROM financials WHERE asset_bucket = ? AND repdte = ? AND ${metric} IS NOT NULL ORDER BY ${metric}`,
    [bucket, repdte]
  );
  if (rows.length === 0) return 50;
  const values = rows.map((r) => r[metric]);
  const below = values.filter((v) => v < bankValue).length;
  const equal = values.filter((v) => v === bankValue).length;
  return Math.round(((below + 0.5 * equal) / values.length) * 100 * 10) / 10;
}

export const load: LayoutServerLoad = async ({ params, platform }) => {
  const cert = parseInt(params.cert, 10);
  if (isNaN(cert)) {
    error(404, 'Bank not found');
  }

  const db = getDB(platform);

  let bank: Institution;
  try {
    const result = await queryOne<Institution>(
      db,
      'SELECT * FROM institutions WHERE cert = ?',
      [cert]
    );

    if (!result) {
      error(404, 'Bank not found');
    }
    bank = result;
  } catch (err) {
    // Re-throw SvelteKit error() responses (they use a special redirect/error class)
    if (err && typeof err === 'object' && 'status' in err) throw err;
    console.error(`Failed to look up bank cert ${cert}:`, err);
    error(500, 'Unable to load bank data. Please try again later.');
  }

  // Run all post-bank queries in parallel (they only depend on `bank`, not each other)
  const [anomalyCounts, trends, peerComparison, recentQuarters] = await Promise.all([
    // Anomaly counts for header badge
    (async (): Promise<AnomalyCounts | null> => {
      try {
        const rows = await queryAll<{ severity: string; cnt: number }>(
          db,
          `SELECT severity, COUNT(*) as cnt FROM anomalies WHERE cert = ? GROUP BY severity`,
          [cert]
        );
        if (rows.length === 0) return null;
        const counts: AnomalyCounts = { critical: 0, warning: 0, info: 0 };
        for (const r of rows) {
          if (r.severity === 'critical') counts.critical = r.cnt;
          else if (r.severity === 'warning') counts.warning = r.cnt;
          else if (r.severity === 'info') counts.info = r.cnt;
        }
        return counts;
      } catch { return null; }
    })(),

    // QoQ trend data from the last 2 quarters
    (async (): Promise<Record<string, number | null>> => {
      try {
        const recentFinancials = await queryAll<{
          repdte: string; roa: number | null; roe: number | null; nimy: number | null;
          nclnlsr: number | null; rbcrwaj: number | null; asset: number | null; dep: number | null;
        }>(
          db,
          'SELECT repdte, roa, roe, nimy, nclnlsr, rbcrwaj, asset, dep FROM financials WHERE cert = ? ORDER BY repdte DESC LIMIT 2',
          [cert]
        );
        if (recentFinancials.length !== 2) return {};
        const [current, previous] = recentFinancials;

        const qoqDelta = (curr: number | null, prev: number | null): number | null =>
          curr === null || prev === null ? null : curr - prev;
        const pctChange = (curr: number | null, prev: number | null): number | null =>
          curr === null || prev === null || prev === 0 ? null : ((curr - prev) / Math.abs(prev)) * 100;

        return {
          roa: qoqDelta(current.roa, previous.roa),
          roe: qoqDelta(current.roe, previous.roe),
          nim: qoqDelta(current.nimy, previous.nimy),
          npl_ratio: qoqDelta(current.nclnlsr, previous.nclnlsr),
          tier1_ratio: qoqDelta(current.rbcrwaj, previous.rbcrwaj),
          total_assets: pctChange(current.asset, previous.asset),
          total_deposits: pctChange(current.dep, previous.dep),
        };
      } catch { return {}; }
    })(),

    // Peer comparison (ROA, ROE, NIM, Tier 1 Capital)
    (async (): Promise<PeerComparisonMetric[]> => {
      try {
        if (bank.asset_tier === null || !bank.latest_repdte) return [];
        const peerGroup = `asset_bucket:${bank.asset_tier}`;
        const compareMetrics = [
          { metric: 'roa', label: 'ROA', format: 'percent' as const },
          { metric: 'roe', label: 'ROE', format: 'percent' as const },
          { metric: 'nimy', label: 'NIM', format: 'percent' as const },
          { metric: 'rbcrwaj', label: 'Tier 1 Capital', format: 'percent' as const }
        ];

        // Fetch peer stats and bank financials in parallel
        const [peerRows, bankFinancials] = await Promise.all([
          queryAll<PeerStats>(
            db,
            `SELECT * FROM peer_stats WHERE peer_group = ? AND repdte = ? AND metric IN ('roa', 'roe', 'nimy', 'rbcrwaj')`,
            [peerGroup, bank.latest_repdte]
          ),
          queryOne<{ roa: number | null; roe: number | null; nimy: number | null; rbcrwaj: number | null }>(
            db,
            'SELECT roa, roe, nimy, rbcrwaj FROM financials WHERE cert = ? AND repdte = ?',
            [cert, bank.latest_repdte]
          )
        ]);

        const peerMap = new Map<string, PeerStats>();
        for (const row of peerRows) {
          peerMap.set(row.metric, row);
        }

        // Calculate all percentiles in parallel instead of sequentially
        const results = await Promise.all(compareMetrics.map(async (cm) => {
          const bankValue = bankFinancials?.[cm.metric as keyof typeof bankFinancials] ?? null;
          const peer = peerMap.get(cm.metric);
          let pctile: number | null = null;
          if (bankValue !== null && peer) {
            pctile = await calcPercentile(db, bank.asset_tier!, bank.latest_repdte!, cm.metric, bankValue);
          }
          return {
            label: cm.label,
            metric: cm.metric,
            value: bankValue,
            peerMedian: peer?.median ?? null,
            percentile: pctile,
            format: cm.format
          };
        }));
        return results;
      } catch { return []; }
    })(),

    // Last 4 quarters of financials
    (async (): Promise<QuarterSnapshot[]> => {
      try {
        return await queryAll<QuarterSnapshot>(
          db,
          'SELECT repdte, asset, dep, roa, roe, nimy, nclnlsr, rbcrwaj, numemp FROM financials WHERE cert = ? ORDER BY repdte DESC LIMIT 4',
          [cert]
        );
      } catch { return []; }
    })()
  ]);

  return { bank, anomalyCounts, trends, peerComparison, recentQuarters };
};
