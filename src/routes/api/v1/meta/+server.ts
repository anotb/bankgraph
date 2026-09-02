import type { RequestHandler } from './$types';
import { getDB, queryOne, queryAll } from '$lib/server/db';
import { cacheWrap } from '$lib/server/cache';
import { jsonResponse, errorResponse } from '$lib/server/response';
import type { MetaResponse } from '$lib/types';
import { loadDatasetContext } from '$lib/server/dataset-context';
import { loadPublicPipelineState } from '$lib/server/public-pipeline-state';

const ONE_HOUR = 3600;

export const GET: RequestHandler = async (event) => {
  const { platform, locals } = event;
  const kv = platform?.env?.CACHE;

  try {
    const result = await cacheWrap<MetaResponse>(kv, 'meta:overview:v3', ONE_HOUR, async () => {
      const db = getDB(platform);

      const [counts, quarter, pipelineRows, stateRows, tableCounts, dataset] = await Promise.all([
        queryOne<{ bank_count: number; active_count: number }>(
          db,
          `SELECT
            COUNT(*) as bank_count,
            SUM(CASE WHEN active = 1 THEN 1 ELSE 0 END) as active_count
          FROM published_institutions`
        ),
        queryOne<{ latest_quarter: string | null }>(
          db,
          'SELECT MAX(latest_repdte) as latest_quarter FROM published_institutions'
        ),
        loadPublicPipelineState(db),
        queryAll<{ state: string; count: number }>(
          db,
          `SELECT state, COUNT(*) as count
           FROM published_institutions
           WHERE active = 1
           GROUP BY state
           ORDER BY state`
        ),
        // Table row counts for diagnostics
        Promise.all([
          queryOne<{ cnt: number }>(db, 'SELECT COUNT(*) as cnt FROM published_financials').catch(() => ({ cnt: 0 })),
          queryOne<{ cnt: number }>(db, 'SELECT COUNT(*) as cnt FROM published_peer_stats').catch(() => ({ cnt: 0 })),
          queryOne<{ cnt: number }>(db, 'SELECT COUNT(*) as cnt FROM published_bank_trends').catch(() => ({ cnt: 0 })),
          queryOne<{ cnt: number }>(db, 'SELECT COUNT(*) as cnt FROM published_anomalies').catch(() => ({ cnt: 0 })),
          queryOne<{ cnt: number }>(db, 'SELECT COUNT(*) as cnt FROM published_risk_scores').catch(() => ({ cnt: 0 })),
          queryOne<{ failures: number; assistance_transactions: number; failure_and_assistance_records: number }>(
            db,
            `SELECT
              COALESCE(SUM(CASE WHEN transaction_type = 'FAILURE' THEN 1 ELSE 0 END), 0) as failures,
              COALESCE(SUM(CASE WHEN transaction_type = 'ASSISTANCE' THEN 1 ELSE 0 END), 0) as assistance_transactions,
              COUNT(*) as failure_and_assistance_records
             FROM failures`
          ).catch(() => ({ failures: 0, assistance_transactions: 0, failure_and_assistance_records: 0 })),
          queryOne<{ cnt: number }>(db, 'SELECT COUNT(*) as cnt FROM published_agg_industry').catch(() => ({ cnt: 0 })),
          queryOne<{ cnt: number }>(db, 'SELECT COUNT(*) as cnt FROM macro_observations').catch(() => ({ cnt: 0 })),
          queryOne<{ cnt: number }>(db, 'SELECT COUNT(*) as cnt FROM macro_correlations').catch(() => ({ cnt: 0 }))
        ]),
        loadDatasetContext(db, {
          kv,
          generation: locals?.liveDataGeneration
        })
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
        pipeline_stage_updated_at: dataFreshness,
        dataset,
        states: stateRows,
        table_counts: {
          institutions: counts?.bank_count ?? 0,
          financials: fin?.cnt ?? 0,
          peer_stats: peers?.cnt ?? 0,
          bank_trends: trends?.cnt ?? 0,
          anomalies: anomalies?.cnt ?? 0,
          risk_scores: risk?.cnt ?? 0,
          failures: failures?.failures ?? 0,
          assistance_transactions: failures?.assistance_transactions ?? 0,
          failure_and_assistance_records: failures?.failure_and_assistance_records ?? 0,
          agg_industry: industry?.cnt ?? 0,
          macro_observations: macro?.cnt ?? 0,
          macro_correlations: corr?.cnt ?? 0
        }
      };
    }, locals?.liveDataGeneration);

    return jsonResponse({
      ...result,
      dataset: {
        ...result.dataset,
        page_loaded_at: new Date().toISOString()
      }
    });
  } catch (err) {
    console.error('Failed to load meta data:', err);
    return errorResponse('Failed to load metadata', 500);
  }
};
