import type { RequestHandler } from './$types';
import { getDB, queryOne } from '$lib/server/db';
import { errorResponse, jsonResponse } from '$lib/server/response';
import { parseSodLakeYear, SodLakeQueryError } from '$lib/server/sod-lake-read';

/** Provenance and checksum for one immutable R2 Parquet partition. */
export const GET: RequestHandler = async ({ platform, url }) => {
  try {
    const year = parseSodLakeYear(url.searchParams);
    const row = await queryOne<Record<string, unknown>>(
      getDB(platform),
      `SELECT dataset, partition_key, layout_version, object_key, manifest_key,
              object_sha256, source_endpoint, source_total, row_count,
              compressed_bytes, field_count, key_first, key_last,
              retrieved_at, published_at, is_current_snapshot
       FROM fdic_lake_partitions
       WHERE dataset = 'sod' AND partition_key = ?`,
      [String(year)]
    );
    return row ? jsonResponse(row) : errorResponse('SOD year has not been published to the lake', 404);
  } catch (error) {
    if (error instanceof SodLakeQueryError) return errorResponse(error.message, error.status);
    console.error(JSON.stringify({
      message: 'SOD manifest read failed',
      error: error instanceof Error ? error.message : String(error)
    }));
    return errorResponse('Failed to load the SOD manifest', 500);
  }
};
