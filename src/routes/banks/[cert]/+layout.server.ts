import { error } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';
import type { Institution } from '$lib/types';
import { getDB, queryOne, queryAll } from '$lib/server/db';

interface AnomalyCounts {
  critical: number;
  warning: number;
  info: number;
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

  return { bank, anomalyCounts, trends };
};
