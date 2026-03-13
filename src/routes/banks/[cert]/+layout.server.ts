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
  const bank = await queryOne<Institution>(
    db,
    'SELECT * FROM institutions WHERE cert = ?',
    [cert]
  );

  if (!bank) {
    error(404, 'Bank not found');
  }

  // Fetch anomaly counts for header badge
  let anomalyCounts: AnomalyCounts | null = null;
  try {
    const rows = await queryAll<{ severity: string; cnt: number }>(
      db,
      `SELECT severity, COUNT(*) as cnt FROM anomalies WHERE cert = ? GROUP BY severity`,
      [cert]
    );
    if (rows.length > 0) {
      anomalyCounts = { critical: 0, warning: 0, info: 0 };
      for (const r of rows) {
        if (r.severity === 'critical') anomalyCounts.critical = r.cnt;
        else if (r.severity === 'warning') anomalyCounts.warning = r.cnt;
        else if (r.severity === 'info') anomalyCounts.info = r.cnt;
      }
    }
  } catch {
    // anomalies table may not exist yet
  }

  // Compute QoQ trend data from the last 2 quarters of financials
  let trends: Record<string, number | null> = {};
  try {
    const recentFinancials = await queryAll<{
      repdte: string;
      roa: number | null;
      roe: number | null;
      nimy: number | null;
      nclnlsr: number | null;
      rbcrwaj: number | null;
      asset: number | null;
      dep: number | null;
    }>(
      db,
      'SELECT repdte, roa, roe, nimy, nclnlsr, rbcrwaj, asset, dep FROM financials WHERE cert = ? ORDER BY repdte DESC LIMIT 2',
      [cert]
    );

    if (recentFinancials.length === 2) {
      const [current, previous] = recentFinancials;

      function qoqDelta(curr: number | null, prev: number | null): number | null {
        if (curr === null || prev === null) return null;
        return curr - prev;
      }

      function pctChange(curr: number | null, prev: number | null): number | null {
        if (curr === null || prev === null || prev === 0) return null;
        return ((curr - prev) / Math.abs(prev)) * 100;
      }

      trends = {
        roa: qoqDelta(current.roa, previous.roa),
        roe: qoqDelta(current.roe, previous.roe),
        nim: qoqDelta(current.nimy, previous.nimy),
        npl_ratio: qoqDelta(current.nclnlsr, previous.nclnlsr),
        tier1_ratio: qoqDelta(current.rbcrwaj, previous.rbcrwaj),
        total_assets: pctChange(current.asset, previous.asset),
        total_deposits: pctChange(current.dep, previous.dep),
      };
    }
  } catch {
    // financials table might not have data yet
  }

  // Fetch peer comparison for Quick Compare (ROA, ROE, NIM, Tier 1 Capital)
  let peerComparison: PeerComparisonMetric[] = [];
  try {
    if (bank.asset_tier !== null && bank.latest_repdte) {
      const peerGroup = `asset_bucket:${bank.asset_tier}`;
      const compareMetrics = [
        { metric: 'roa', label: 'ROA', format: 'percent' as const },
        { metric: 'roe', label: 'ROE', format: 'percent' as const },
        { metric: 'nimy', label: 'NIM', format: 'percent' as const },
        { metric: 'rbcrwaj', label: 'Tier 1 Capital', format: 'percent' as const }
      ];

      const peerRows = await queryAll<PeerStats>(
        db,
        `SELECT * FROM peer_stats WHERE peer_group = ? AND repdte = ? AND metric IN ('roa', 'roe', 'nimy', 'rbcrwaj')`,
        [peerGroup, bank.latest_repdte]
      );
      const peerMap = new Map<string, PeerStats>();
      for (const row of peerRows) {
        peerMap.set(row.metric, row);
      }

      // Get bank's own values for the latest quarter
      const bankFinancials = await queryOne<{ roa: number | null; roe: number | null; nimy: number | null; rbcrwaj: number | null }>(
        db,
        'SELECT roa, roe, nimy, rbcrwaj FROM financials WHERE cert = ? AND repdte = ?',
        [cert, bank.latest_repdte]
      );

      for (const cm of compareMetrics) {
        const bankValue = bankFinancials?.[cm.metric as keyof typeof bankFinancials] ?? null;
        const peer = peerMap.get(cm.metric);
        let pctile: number | null = null;
        if (bankValue !== null && peer) {
          pctile = await calcPercentile(db, bank.asset_tier!, bank.latest_repdte!, cm.metric, bankValue);
        }
        peerComparison.push({
          label: cm.label,
          metric: cm.metric,
          value: bankValue,
          peerMedian: peer?.median ?? null,
          percentile: pctile,
          format: cm.format
        });
      }
    }
  } catch {
    // peer_stats table may not exist or have data
  }

  // Fetch last 4 quarters of financials for mini history table
  let recentQuarters: QuarterSnapshot[] = [];
  try {
    recentQuarters = await queryAll<QuarterSnapshot>(
      db,
      'SELECT repdte, asset, dep, roa, roe, nimy, nclnlsr, rbcrwaj, numemp FROM financials WHERE cert = ? ORDER BY repdte DESC LIMIT 4',
      [cert]
    );
  } catch {
    // financials table might not have data
  }

  return { bank, anomalyCounts, trends, peerComparison, recentQuarters };
};
