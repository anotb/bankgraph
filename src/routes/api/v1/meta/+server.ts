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

      const [counts, quarter, pipelineRows, stateRows] = await Promise.all([
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
        )
      ]);

      const dataFreshness: Record<string, string> = {};
      for (const row of pipelineRows) {
        if (row.updated_at) {
          dataFreshness[row.key] = row.updated_at;
        }
      }

      return {
        bank_count: counts?.bank_count ?? 0,
        active_count: counts?.active_count ?? 0,
        latest_quarter: quarter?.latest_quarter ?? null,
        data_freshness: dataFreshness,
        states: stateRows
      };
    });

    return jsonResponse(result);
  } catch (err) {
    console.error('Failed to load meta data:', err);
    return errorResponse('Failed to load metadata', 500);
  }
};
