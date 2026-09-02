import type { RequestHandler } from './$types';
import { getDB, queryAll, queryOne } from '$lib/server/db';
import { errorResponse, jsonResponse } from '$lib/server/response';
import {
  buildLatestSodBranchPlan,
  SodLakeQueryError
} from '$lib/server/sod-lake-read';

interface CurrentSource {
  year: string;
  object_sha256: string;
  retrieved_at: string;
  branch_rows: number;
}

/** Selective current-branch reads for maps, bank pages, and search. */
export const GET: RequestHandler = async ({ platform, url }) => {
  try {
    const plan = buildLatestSodBranchPlan(url.searchParams);
    const db = getDB(platform);
    const source = await queryOne<CurrentSource>(
      db,
      `SELECT lake.partition_key AS year, lake.object_sha256, lake.retrieved_at,
              publication.row_count AS branch_rows
       FROM fdic_lake_partitions AS lake
       JOIN fdic_dataset_publications AS publication
         ON publication.dataset = 'sod'
        AND publication.partition_key = lake.partition_key
       WHERE lake.dataset = 'sod' AND lake.is_current_snapshot = 1`,
      []
    );
    if (!source) return errorResponse('Current SOD branch snapshot is not ready', 503);

    const lookahead = await queryAll<Record<string, unknown>>(db, plan.sql, plan.params);
    const hasMore = lookahead.length > plan.limit;
    const data = hasMore ? lookahead.slice(0, plan.limit) : lookahead;
    return jsonResponse({
      dataset: 'sod',
      snapshot_year: Number(source.year),
      data,
      pagination: {
        limit: plan.limit,
        offset: plan.offset,
        next_offset: hasMore ? plan.offset + plan.limit : null
      },
      source
    });
  } catch (error) {
    if (error instanceof SodLakeQueryError) return errorResponse(error.message, error.status);
    console.error(JSON.stringify({
      message: 'latest SOD branch read failed',
      error: error instanceof Error ? error.message : String(error)
    }));
    return errorResponse('Failed to load current branches', 500);
  }
};
