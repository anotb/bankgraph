import type { PageServerLoad } from './$types';
import { getDB, queryOne, queryAll } from '$lib/server/db';
import { generateNarrative, type NarrativeMover } from '$lib/utils/narrative.js';

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

interface StateDistribution {
  state: string;
  bank_count: number;
  total_assets: number | null;
}

interface MacroSnapshot {
  fedfunds: { value: number; date: string } | null;
  dgs10: { value: number; date: string } | null;
  dgs2: { value: number; date: string } | null;
}

export interface MoverEntry {
  cert: number;
  name: string;
  state: string | null;
  total_assets: number | null;
  curr: number;
  prev: number;
  delta_bps: number;
  roa_trend: (number | null)[];
}

interface MoversBoard {
  up: MoverEntry[];
  down: MoverEntry[];
  improved: number;
  deteriorated: number;
}

const EMPTY_INDUSTRY: IndustryMetrics = {
  median_roa: null, median_roe: null, median_nim: null,
  total_assets: null, total_deposits: null, repdte: null
};

const EMPTY_META: MetaData = {
  bank_count: 0, active_count: 0,
  latest_quarter: null
};

const EMPTY_DELTAS: QoQDeltas = {
  median_roa: null, median_roe: null, median_nim: null,
  total_assets: null, total_deposits: null, bank_count: null
};

export const load: PageServerLoad = async ({ platform }) => {
  try {
    const db = getDB(platform);

    // Core counts from institutions. Industry-wide asset/deposit totals come from
    // the pre-aggregated agg_industry table (see industryMetrics below), so we don't
    // re-SUM the institutions table here.
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

    const fiveYearsAgo = `${new Date().getFullYear() - 5}0101`;

    const [
      industryMetrics,
      recentAnomalies,
      failureSummary,
      topBanks,
      industryTrends,
      stateDistribution,
      anomalyCounts,
      movers,
      macroSnapshot
    ] = await Promise.all([
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
          const raw = await queryAll<RecentAnomaly>(
            db,
            `SELECT a.cert, i.name, a.metric, a.severity, a.description, a.value, a.repdte
             FROM anomalies a
             LEFT JOIN institutions i ON a.cert = i.cert
             WHERE a.severity IN ('critical', 'warning')
             ORDER BY CASE a.severity WHEN 'critical' THEN 0 ELSE 1 END, a.repdte DESC
             LIMIT 20`
          );
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

      // Failures summary
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

      // Last 12 quarters of industry-wide data
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
      })(),

      // State distribution
      (async (): Promise<StateDistribution[]> => {
        try {
          return await queryAll<StateDistribution>(
            db,
            `SELECT state, COUNT(*) as bank_count, SUM(total_assets) as total_assets
             FROM institutions
             WHERE active = 1 AND state IS NOT NULL
             GROUP BY state
             ORDER BY bank_count DESC`
          );
        } catch { return []; }
      })(),

      // Anomaly severity counts at the most recent quarter — DISTINCT banks per severity
      (async (): Promise<{ critical: number; warning: number }> => {
        try {
          const rows = await queryAll<{ severity: string; cnt: number }>(
            db,
            `SELECT a.severity, COUNT(DISTINCT a.cert) as cnt
             FROM anomalies a
             JOIN institutions i ON i.cert = a.cert AND i.active = 1
             WHERE a.repdte = (SELECT MAX(repdte) FROM anomalies)
             GROUP BY a.severity`
          );
          let critical = 0, warning = 0;
          for (const r of rows) {
            if (r.severity === 'critical') critical = r.cnt;
            else if (r.severity === 'warning') warning = r.cnt;
          }
          return { critical, warning };
        } catch { return { critical: 0, warning: 0 }; }
      })(),

      // Movers board: top 5 up + top 5 down by ROA QoQ change, plus aggregate counts.
      // Uses self-join on financials with the "previous filing per cert" pattern.
      (async (): Promise<MoversBoard> => {
        const empty: MoversBoard = { up: [], down: [], improved: 0, deteriorated: 0 };
        try {
          const latest = await queryOne<{ repdte: string | null }>(
            db, `SELECT MAX(repdte) as repdte FROM financials`
          );
          if (!latest?.repdte) return empty;

          // All banks > $500M assets that have data in both latest and prior quarter
          const rows = await queryAll<{
            cert: number; name: string; state: string | null;
            total_assets: number | null;
            curr: number; prev: number;
          }>(
            db,
            `SELECT i.cert, i.name, i.state, i.total_assets,
                    f1.roa as curr, f2.roa as prev
             FROM financials f1
             JOIN financials f2 ON f1.cert = f2.cert
             JOIN institutions i ON i.cert = f1.cert
             WHERE f1.repdte = ?
               AND f2.repdte = (
                 SELECT MAX(repdte) FROM financials WHERE cert = f1.cert AND repdte < f1.repdte
               )
               AND f1.roa IS NOT NULL AND f2.roa IS NOT NULL
               AND i.active = 1
               AND i.total_assets > 500000`,
            [latest.repdte]
          );

          let improved = 0, deteriorated = 0;
          const enriched = rows.map(r => {
            const delta_bps = Math.round((r.curr - r.prev) * 100);
            if (delta_bps > 0) improved++;
            else if (delta_bps < 0) deteriorated++;
            return { ...r, delta_bps };
          });

          const up = enriched
            .filter(r => r.delta_bps > 0)
            .sort((a, b) => b.delta_bps - a.delta_bps)
            .slice(0, 5);
          const down = enriched
            .filter(r => r.delta_bps < 0)
            .sort((a, b) => a.delta_bps - b.delta_bps)
            .slice(0, 5);

          // Pull 6-quarter ROA sparklines for the 10 banks shown
          const featured = [...up, ...down];
          const sparkByCert = new Map<number, (number | null)[]>();
          if (featured.length > 0) {
            const certs = featured.map(r => r.cert);
            const placeholders = certs.map(() => '?').join(',');
            const sparkRows = await queryAll<{ cert: number; repdte: string; roa: number | null }>(
              db,
              `SELECT cert, repdte, roa FROM (
                SELECT cert, repdte, roa,
                  ROW_NUMBER() OVER (PARTITION BY cert ORDER BY repdte DESC) as rn
                FROM financials
                WHERE cert IN (${placeholders})
              ) WHERE rn <= 6 ORDER BY cert, repdte ASC`,
              certs
            );
            for (const row of sparkRows) {
              if (!sparkByCert.has(row.cert)) sparkByCert.set(row.cert, []);
              sparkByCert.get(row.cert)!.push(row.roa);
            }
          }

          const attach = (r: typeof enriched[number]): MoverEntry => ({
            cert: r.cert,
            name: r.name,
            state: r.state,
            total_assets: r.total_assets,
            curr: r.curr,
            prev: r.prev,
            delta_bps: r.delta_bps,
            roa_trend: sparkByCert.get(r.cert) ?? []
          });

          return {
            up: up.map(attach),
            down: down.map(attach),
            improved,
            deteriorated
          };
        } catch { return empty; }
      })(),

      // Macro snapshot (latest values for headline rates — fails gracefully if FRED hasn't synced)
      (async (): Promise<MacroSnapshot> => {
        const snap: MacroSnapshot = { fedfunds: null, dgs10: null, dgs2: null };
        try {
          for (const id of ['FEDFUNDS', 'DGS10', 'DGS2'] as const) {
            const row = await queryOne<{ value: number | null; date: string }>(
              db,
              `SELECT value, date FROM macro_data WHERE series_id = ? AND value IS NOT NULL ORDER BY date DESC LIMIT 1`,
              [id]
            );
            if (row && row.value != null) {
              const key = id.toLowerCase() as 'fedfunds' | 'dgs10' | 'dgs2';
              snap[key] = { value: row.value, date: row.date };
            }
          }
        } catch { /* macro table may not exist */ }
        return snap;
      })()
    ]);

    // QoQ deltas from first two industry trend quarters.
    // `deltas` = relative % change (used for the hero chip + dollar aggregates).
    // `rateDeltasBps` = absolute basis-point change for the rate metrics (used by the narrative).
    let deltas = EMPTY_DELTAS;
    let rateDeltasBps = { median_roa: null as number | null, median_roe: null as number | null, median_nim: null as number | null };
    if (industryTrends.length >= 2) {
      const curr = industryTrends[0].metrics;
      const prev = industryTrends[1].metrics;
      const relDelta = (key: string): number | null => {
        const c = curr[key];
        const p = prev[key];
        if (c == null || p == null || p === 0) return null;
        return ((c - p) / Math.abs(p)) * 100;
      };
      const bpsDelta = (key: string): number | null => {
        const c = curr[key];
        const p = prev[key];
        if (c == null || p == null) return null;
        return Math.round((c - p) * 100); // metric is in %, so pct-point × 100 = bps
      };
      deltas = {
        median_roa: relDelta('median_roa'),
        median_roe: relDelta('median_roe'),
        median_nim: relDelta('median_nim'),
        total_assets: relDelta('total_assets'),
        total_deposits: relDelta('total_deposits'),
        bank_count: relDelta('bank_count')
      };
      rateDeltasBps = {
        median_roa: bpsDelta('median_roa'),
        median_roe: bpsDelta('median_roe'),
        median_nim: bpsDelta('median_nim')
      };
    }

    // Top mover: derive from the movers board (biggest absolute ROA swing) — no extra query.
    const moverPool = [...movers.up, ...movers.down]
      .sort((a, b) => Math.abs(b.delta_bps) - Math.abs(a.delta_bps));
    const topMover: NarrativeMover | null = moverPool.length > 0 && Math.abs(moverPool[0].delta_bps) >= 10
      ? {
          cert: moverPool[0].cert,
          name: moverPool[0].name,
          metric: 'roa',
          current: moverPool[0].curr,
          delta_bps: moverPool[0].delta_bps
        }
      : null;

    // Programmatic narrative
    const narrative = generateNarrative({
      latestQuarter: meta.latest_quarter,
      metrics: {
        median_roa: industryMetrics.median_roa,
        median_roe: industryMetrics.median_roe,
        median_nim: industryMetrics.median_nim
      },
      rateDeltasBps,
      assetsDeltaPct: deltas.total_assets,
      depositsDeltaPct: deltas.total_deposits,
      recent5yrFailures: failureSummary.recent_5yr_count,
      topMover
    });

    return {
      meta,
      industryMetrics,
      recentAnomalies,
      failureSummary,
      topBanks,
      industryTrends,
      deltas,
      stateDistribution,
      anomalyCounts,
      topMover,
      macroSnapshot,
      narrative,
      movers
    };
  } catch {
    return {
      meta: EMPTY_META,
      industryMetrics: EMPTY_INDUSTRY,
      recentAnomalies: [] as RecentAnomaly[],
      failureSummary: { total_failures: 0, recent_5yr_count: 0, recent_failures: [] } as FailureSummary,
      topBanks: [] as TopBank[],
      industryTrends: [] as IndustryTrendQuarter[],
      deltas: EMPTY_DELTAS,
      stateDistribution: [] as StateDistribution[],
      anomalyCounts: { critical: 0, warning: 0 },
      topMover: null as NarrativeMover | null,
      macroSnapshot: { fedfunds: null, dgs10: null, dgs2: null } as MacroSnapshot,
      narrative: [] as string[],
      movers: { up: [], down: [], improved: 0, deteriorated: 0 } as MoversBoard
    };
  }
};
