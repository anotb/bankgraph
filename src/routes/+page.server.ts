import type { PageServerLoad } from './$types';
import { getDB, queryOne, queryAll } from '$lib/server/db';

interface MetaData {
  bank_count: number;
  active_count: number;
  latest_quarter: string | null;
}

interface IndustryMetrics {
  median_roa: number | null;
  median_roe: number | null;
  median_nim: number | null;
  total_assets: number | null;
  total_deposits: number | null;
}

interface RecentAnomaly {
  cert: number;
  name: string | null;
  metric: string;
  severity: string;
  description: string | null;
  value: number | null;
}

interface FailureSummary {
  total_failures: number;
  recent_failures: Array<{ cert: number; name: string | null; fail_date: string | null; state: string | null }>;
}

const EMPTY_INDUSTRY: IndustryMetrics = {
  median_roa: null, median_roe: null, median_nim: null,
  total_assets: null, total_deposits: null
};

const EMPTY_META: MetaData = { bank_count: 0, active_count: 0, latest_quarter: null };

export const load: PageServerLoad = async ({ platform }) => {
  try {
    const db = getDB(platform);

    const [counts, quarter] = await Promise.all([
      queryOne<{ bank_count: number; active_count: number }>(
        db,
        `SELECT
          COUNT(*) as bank_count,
          SUM(CASE WHEN active = 1 THEN 1 ELSE 0 END) as active_count
        FROM institutions`
      ),
      queryOne<{ latest_quarter: string | null }>(
        db,
        'SELECT MAX(latest_repdte) as latest_quarter FROM institutions'
      )
    ]);

    const meta: MetaData = {
      bank_count: counts?.bank_count ?? 0,
      active_count: counts?.active_count ?? 0,
      latest_quarter: quarter?.latest_quarter ?? null
    };

    // Industry metrics from agg_industry
    let industryMetrics: IndustryMetrics = { ...EMPTY_INDUSTRY };
    try {
      const latestRepdte = await queryOne<{ repdte: string }>(
        db, 'SELECT MAX(repdte) as repdte FROM agg_industry'
      );
      if (latestRepdte?.repdte) {
        const aggRows = await queryAll<{ metric: string; value: number | null }>(
          db,
          'SELECT metric, value FROM agg_industry WHERE repdte = ? AND segment = ?',
          [latestRepdte.repdte, 'all']
        );
        for (const row of aggRows) {
          if (row.metric === 'median_roa') industryMetrics.median_roa = row.value;
          else if (row.metric === 'median_roe') industryMetrics.median_roe = row.value;
          else if (row.metric === 'median_nim') industryMetrics.median_nim = row.value;
          else if (row.metric === 'total_assets') industryMetrics.total_assets = row.value;
          else if (row.metric === 'total_deposits') industryMetrics.total_deposits = row.value;
        }
      }
    } catch { /* agg_industry may be empty */ }

    // Recent anomalies (top 5 critical/warning)
    let recentAnomalies: RecentAnomaly[] = [];
    try {
      recentAnomalies = await queryAll<RecentAnomaly>(
        db,
        `SELECT a.cert, i.name, a.metric, a.severity, a.description, a.value
         FROM anomalies a
         LEFT JOIN institutions i ON a.cert = i.cert
         WHERE a.severity IN ('critical', 'warning')
         ORDER BY CASE a.severity WHEN 'critical' THEN 0 ELSE 1 END, a.repdte DESC
         LIMIT 5`
      );
    } catch { /* anomalies table may be empty */ }

    // Failures summary
    let failureSummary: FailureSummary = { total_failures: 0, recent_failures: [] };
    try {
      const failCount = await queryOne<{ cnt: number }>(
        db, 'SELECT COUNT(*) as cnt FROM failures'
      );
      const recentFails = await queryAll<{ cert: number; name: string | null; fail_date: string | null; state: string | null }>(
        db,
        'SELECT cert, name, fail_date, state FROM failures ORDER BY fail_date DESC LIMIT 5'
      );
      failureSummary = {
        total_failures: failCount?.cnt ?? 0,
        recent_failures: recentFails
      };
    } catch { /* failures table may be empty */ }

    return { meta, industryMetrics, recentAnomalies, failureSummary };
  } catch {
    // DB not available (local dev, first deploy, etc.)
    return {
      meta: EMPTY_META,
      industryMetrics: EMPTY_INDUSTRY,
      recentAnomalies: [] as RecentAnomaly[],
      failureSummary: { total_failures: 0, recent_failures: [] } as FailureSummary
    };
  }
};
