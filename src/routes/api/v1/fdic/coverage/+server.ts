import type { RequestHandler } from './$types';
import { getDB, queryAll, queryOne } from '$lib/server/db';
import { errorResponse, jsonResponse } from '$lib/server/response';
import {
  FDICPartitionError,
  parseFDICDataset,
  type FDICDataset
} from '$lib/server/pipeline/fdic-partitioned-ingest';

interface CoverageRow {
  dataset: FDICDataset;
  partition_key: string;
  source_endpoint: string;
  source_total: number;
  row_count: number;
  key_first: string | null;
  key_last: string | null;
  period_min: string | null;
  period_max: string | null;
  retrieved_at: string;
  published_at: string;
}

/** Compact publication metadata for repeatable coverage checks. */
export const GET: RequestHandler = async ({ platform, url }) => {
  try {
    const datasetRaw = url.searchParams.get('dataset');
    const dataset = datasetRaw == null ? null : parseFDICDataset(datasetRaw);
    const limitRaw = url.searchParams.get('limit');
    const offsetRaw = url.searchParams.get('offset');
    const limit = limitRaw == null ? 100 : Number(limitRaw);
    const offset = offsetRaw == null ? 0 : Number(offsetRaw);
    if (!Number.isInteger(limit) || limit < 1 || limit > 500) {
      throw new FDICPartitionError('limit must be between 1 and 500');
    }
    if (!Number.isInteger(offset) || offset < 0 || offset > 1_000_000) {
      throw new FDICPartitionError('offset must be between 0 and 1000000');
    }
    const db = getDB(platform);
    const where = dataset == null ? '' : 'WHERE dataset = ?';
    const params = dataset == null ? [] : [dataset];
    const [rows, total] = await Promise.all([
      queryAll<CoverageRow>(
        db,
        `SELECT dataset, partition_key, source_endpoint, source_total, row_count,
                key_first, key_last, period_min, period_max, retrieved_at, published_at
         FROM fdic_dataset_publications ${where}
         ORDER BY dataset ASC, partition_key DESC LIMIT ? OFFSET ?`,
        [...params, limit, offset]
      ),
      queryOne<{ count: number }>(
        db,
        `SELECT COUNT(*) AS count FROM fdic_dataset_publications ${where}`,
        params
      )
    ]);
    return jsonResponse({
      data: rows,
      total: total?.count ?? 0,
      limit,
      offset,
      next_offset: offset + rows.length < (total?.count ?? 0) ? offset + rows.length : null
    });
  } catch (error) {
    if (error instanceof FDICPartitionError) return errorResponse(error.message, error.status);
    console.error(JSON.stringify({
      message: 'fdic coverage read failed',
      error: error instanceof Error ? error.message : String(error)
    }));
    return errorResponse('Failed to load FDIC coverage', 500);
  }
};
