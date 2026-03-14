import type { RequestHandler } from './$types';
import { getDB, queryOne, queryAll } from '$lib/server/db';
import { cacheWrap } from '$lib/server/cache';
import { jsonResponse, errorResponse } from '$lib/server/response';
import type { MetaResponse, PipelineState } from '$lib/types';

const ONE_HOUR = 3600;

export const GET: RequestHandler = async (event) => {
  const { platform } = event;
  const kv = platform?.env?.CACHE;

  try {
    const result = await cacheWrap<MetaResponse>(kv, 'meta:overview', ONE_HOUR, async () => {
      const db = getDB(platform);

      const [counts, quarter, pipelineRows, stateRows, tableCounts] = await Promise.all([
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
        queryAll<PipelineState>(
          db,
          'SELECT key, value, updated_at FROM pipeline_state'
        ),
        queryAll<{ state: string; count: number }>(
          db,
          `SELECT state, COUNT(*) as count
           FROM institutions
           WHERE active = 1
           GROUP BY state
           ORDER BY state`
        ),
        // Table row counts for diagnostics
        Promise.all([
          queryOne<{ cnt: number }>(db, 'SELECT COUNT(*) as cnt FROM financials').catch(() => ({ cnt: 0 })),
          queryOne<{ cnt: number }>(db, 'SELECT COUNT(*) as cnt FROM peer_stats').catch(() => ({ cnt: 0 })),
          queryOne<{ cnt: number }>(db, 'SELECT COUNT(*) as cnt FROM bank_trends').catch(() => ({ cnt: 0 })),
          queryOne<{ cnt: number }>(db, 'SELECT COUNT(*) as cnt FROM anomalies').catch(() => ({ cnt: 0 })),
          queryOne<{ cnt: number }>(db, 'SELECT COUNT(*) as cnt FROM risk_scores').catch(() => ({ cnt: 0 })),
          queryOne<{ cnt: number }>(db, 'SELECT COUNT(*) as cnt FROM failures').catch(() => ({ cnt: 0 })),
          queryOne<{ cnt: number }>(db, 'SELECT COUNT(*) as cnt FROM agg_industry').catch(() => ({ cnt: 0 })),
          queryOne<{ cnt: number }>(db, 'SELECT COUNT(*) as cnt FROM macro_series').catch(() => ({ cnt: 0 })),
          queryOne<{ cnt: number }>(db, 'SELECT COUNT(*) as cnt FROM correlations').catch(() => ({ cnt: 0 }))
        ])
      ]);

      const dataFreshness: Record<string, string> = {};
      for (const row of pipelineRows) {
        if (row.updated_at) {
          dataFreshness[row.key] = row.updated_at;
        }
      }

      const [fin, peers, trends, anomalies, risk, failures, industry, macro, corr] = tableCounts;

      return {
        bank_count: counts?.bank_count ?? 0,
        active_count: counts?.active_count ?? 0,
        latest_quarter: quarter?.latest_quarter ?? null,
        data_freshness: dataFreshness,
        states: stateRows,
        table_counts: {
          institutions: counts?.bank_count ?? 0,
          financials: fin?.cnt ?? 0,
          peer_stats: peers?.cnt ?? 0,
          bank_trends: trends?.cnt ?? 0,
          anomalies: anomalies?.cnt ?? 0,
          risk_scores: risk?.cnt ?? 0,
          failures: failures?.cnt ?? 0,
          agg_industry: industry?.cnt ?? 0,
          macro_series: macro?.cnt ?? 0,
          correlations: corr?.cnt ?? 0
        }
      };
    });

    return jsonResponse(result);
  } catch (err) {
    console.error('Failed to load meta data:', err);
    return errorResponse('Failed to load metadata', 500);
  }
};
