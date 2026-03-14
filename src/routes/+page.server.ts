import type { PageServerLoad } from './$types';
import { getDB, queryOne, queryAll } from '$lib/server/db';

interface MetaData {
  bank_count: number;
  active_count: number;
  total_assets: number | null;
  total_deposits: number | null;
  latest_quarter: string | null;
}

interface IndustryMetrics {
  median_roa: number | null;
  median_roe: number | null;
  median_nim: number | null;
  total_assets: number | null;
  total_deposits: number | null;
  repdte: string | null;
}

interface IndustryTrendQuarter {
  repdte: string;
  metrics: Record<string, number>;
}

interface QoQDeltas {
  median_roa: number | null;
  median_roe: number | null;
  median_nim: number | null;
  total_assets: number | null;
  total_deposits: number | null;
  bank_count: number | null;
}

interface RecentAnomaly {
  cert: number;
  name: string | null;
  metric: string;
  severity: string;
  description: string | null;
  value: number | null;
  repdte: string | null;
}

interface FailureSummary {
  total_failures: number;
  recent_5yr_count: number;
  recent_failures: Array<{ cert: number; name: string | null; fail_date: string | null; state: string | null }>;
}

interface TopBank {
  cert: number;
  name: string;
  state: string | null;
  total_assets: number | null;
  total_deposits: number | null;
  roa_trend: (number | null)[];
}

const EMPTY_INDUSTRY: IndustryMetrics = {
  median_roa: null, median_roe: null, median_nim: null,
  total_assets: null, total_deposits: null, repdte: null
};

const EMPTY_META: MetaData = {
  bank_count: 0, active_count: 0,
  total_assets: null, total_deposits: null,
  latest_quarter: null
};

export const load: PageServerLoad = async ({ platform }) => {
  try {
    const db = getDB(platform);

    // Core counts + aggregates from institutions
    const [counts, quarter, assetAgg] = await Promise.all([
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
      ),
      queryOne<{ total_assets: number | null; total_deposits: number | null }>(
        db,
        'SELECT SUM(total_assets) as total_assets, SUM(total_deposits) as total_deposits FROM institutions WHERE active = 1'
      )
    ]);

    const meta: MetaData = {
      bank_count: counts?.bank_count ?? 0,
      active_count: counts?.active_count ?? 0,
      total_assets: assetAgg?.total_assets ?? null,
      total_deposits: assetAgg?.total_deposits ?? null,
      latest_quarter: quarter?.latest_quarter ?? null
    };

    // Run all remaining queries in parallel (they're independent of each other)
    const fiveYearsAgo = `${new Date().getFullYear() - 5}0101`;

    const [industryMetrics, recentAnomalies, failureSummary, topBanks, industryTrends] = await Promise.all([
      // Industry metrics from agg_industry (latest quarter)
      (async (): Promise<IndustryMetrics> => {
        try {
          const latestRepdte = await queryOne<{ repdte: string }>(
            db, 'SELECT MAX(repdte) as repdte FROM agg_industry'
          );
          if (!latestRepdte?.repdte) return { ...EMPTY_INDUSTRY };
          const aggRows = await queryAll<{ metric: string; value: number | null }>(
            db,
            'SELECT metric, value FROM agg_industry WHERE repdte = ? AND segment = ?',
            [latestRepdte.repdte, 'all']
          );
          const result: IndustryMetrics = { ...EMPTY_INDUSTRY, repdte: latestRepdte.repdte };
          for (const row of aggRows) {
            if (row.metric === 'median_roa') result.median_roa = row.value;
            else if (row.metric === 'median_roe') result.median_roe = row.value;
            else if (row.metric === 'median_nim') result.median_nim = row.value;
            else if (row.metric === 'total_assets') result.total_assets = row.value;
            else if (row.metric === 'total_deposits') result.total_deposits = row.value;
          }
          return result;
        } catch { return { ...EMPTY_INDUSTRY }; }
      })(),

      // Recent anomalies (top 5 critical/warning, one per bank)
      (async (): Promise<RecentAnomaly[]> => {
        try {
          // Fetch more rows than needed, then deduplicate in JS
          // (D1 SQLite has limited window function support)
          const raw = await queryAll<RecentAnomaly>(
            db,
            `SELECT a.cert, i.name, a.metric, a.severity, a.description, a.value, a.repdte
             FROM anomalies a
             LEFT JOIN institutions i ON a.cert = i.cert
             WHERE a.severity IN ('critical', 'warning')
             ORDER BY CASE a.severity WHEN 'critical' THEN 0 ELSE 1 END, a.repdte DESC
             LIMIT 20`
          );
          // Keep only the most severe anomaly per bank (first seen wins due to ORDER BY)
          const seen = new Set<number>();
          const deduped: RecentAnomaly[] = [];
          for (const row of raw) {
            if (seen.has(row.cert)) continue;
            seen.add(row.cert);
            deduped.push(row);
            if (deduped.length >= 5) break;
          }
          return deduped;
        } catch { return []; }
      })(),

      // Failures summary (3 sub-queries parallelized)
      (async (): Promise<FailureSummary> => {
        try {
          const [failCount, recent5yr, recentFails] = await Promise.all([
            queryOne<{ cnt: number }>(db, 'SELECT COUNT(*) as cnt FROM failures'),
            queryOne<{ cnt: number }>(
              db,
              `SELECT COUNT(*) as cnt FROM failures WHERE fail_date >= ?`,
              [fiveYearsAgo]
            ),
            queryAll<{ cert: number; name: string | null; fail_date: string | null; state: string | null }>(
              db, 'SELECT cert, name, fail_date, state FROM failures ORDER BY fail_date DESC LIMIT 5'
            )
          ]);
          return {
            total_failures: failCount?.cnt ?? 0,
            recent_5yr_count: recent5yr?.cnt ?? 0,
            recent_failures: recentFails
          };
        } catch { return { total_failures: 0, recent_5yr_count: 0, recent_failures: [] }; }
      })(),

      // Top 8 banks by total assets + ROA sparkline trends
      (async (): Promise<TopBank[]> => {
        try {
          const rawBanks = await queryAll<Omit<TopBank, 'roa_trend'>>(
            db,
            `SELECT cert, name, state, total_assets, total_deposits
             FROM institutions
             WHERE active = 1 AND total_assets IS NOT NULL
             ORDER BY total_assets DESC
             LIMIT 8`
          );
          const banks: TopBank[] = rawBanks.map(b => ({ ...b, roa_trend: [] }));

          if (banks.length > 0) {
            try {
              const certs = banks.map(b => b.cert);
              const placeholders = certs.map(() => '?').join(',');
              const roaRows = await queryAll<{ cert: number; repdte: string; roa: number | null }>(
                db,
                `SELECT cert, repdte, roa FROM (
                  SELECT cert, repdte, roa,
                    ROW_NUMBER() OVER (PARTITION BY cert ORDER BY repdte DESC) as rn
                  FROM financials
                  WHERE cert IN (${placeholders})
                ) WHERE rn <= 8
                ORDER BY cert, repdte ASC`,
                certs
              );
              const roaByCert = new Map<number, (number | null)[]>();
              for (const row of roaRows) {
                if (!roaByCert.has(row.cert)) roaByCert.set(row.cert, []);
                roaByCert.get(row.cert)!.push(row.roa);
              }
              for (const bank of banks) {
                bank.roa_trend = roaByCert.get(bank.cert) ?? [];
              }
            } catch { /* financials table may not exist yet */ }
          }
          return banks;
        } catch { return []; }
      })(),

      // Last 12 quarters of industry-wide data for trend charts + QoQ deltas
      (async (): Promise<IndustryTrendQuarter[]> => {
        try {
          const rows = await queryAll<{ repdte: string; metric: string; value: number | null }>(
            db,
            `SELECT repdte, metric, value FROM agg_industry WHERE segment = 'all' ORDER BY repdte DESC LIMIT 100`
          );
          const byQuarter = new Map<string, { repdte: string; metrics: Record<string, number> }>();
          for (const row of rows) {
            if (!byQuarter.has(row.repdte)) {
              byQuarter.set(row.repdte, { repdte: row.repdte, metrics: {} });
            }
            if (row.value !== null) {
              byQuarter.get(row.repdte)!.metrics[row.metric] = row.value;
            }
          }
          return [...byQuarter.values()].sort((a, b) => b.repdte.localeCompare(a.repdte));
        } catch { return []; }
      })()
    ]);

    // Compute QoQ deltas from the first two quarters of industryTrends
    const EMPTY_DELTAS: QoQDeltas = {
      median_roa: null, median_roe: null, median_nim: null,
      total_assets: null, total_deposits: null, bank_count: null
    };
    let deltas = EMPTY_DELTAS;
    if (industryTrends.length >= 2) {
      const curr = industryTrends[0].metrics;
      const prev = industryTrends[1].metrics;
      const delta = (key: string): number | null => {
        const c = curr[key];
        const p = prev[key];
        if (c == null || p == null || p === 0) return null;
        return ((c - p) / Math.abs(p)) * 100;
      };
      deltas = {
        median_roa: delta('median_roa'),
        median_roe: delta('median_roe'),
        median_nim: delta('median_nim'),
        total_assets: delta('total_assets'),
        total_deposits: delta('total_deposits'),
        bank_count: delta('bank_count')
      };
    }

    return { meta, industryMetrics, recentAnomalies, failureSummary, topBanks, industryTrends, deltas };
  } catch {
    // DB not available (local dev, first deploy, etc.)
    const EMPTY_DELTAS: QoQDeltas = {
      median_roa: null, median_roe: null, median_nim: null,
      total_assets: null, total_deposits: null, bank_count: null
    };
    return {
      meta: EMPTY_META,
      industryMetrics: EMPTY_INDUSTRY,
      recentAnomalies: [] as RecentAnomaly[],
      failureSummary: { total_failures: 0, recent_5yr_count: 0, recent_failures: [] } as FailureSummary,
      topBanks: [] as TopBank[],
      industryTrends: [] as IndustryTrendQuarter[],
      deltas: EMPTY_DELTAS
    };
  }
};
