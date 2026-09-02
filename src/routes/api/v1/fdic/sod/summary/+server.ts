import type { RequestHandler } from './$types';
import { encodeCsvRow } from '$lib/server/csv';
import { getDB, queryAll, queryOne } from '$lib/server/db';
import { errorResponse, jsonResponse } from '$lib/server/response';
import {
  buildSodAggregatePlan,
  SodLakeQueryError
} from '$lib/server/sod-lake-read';

interface LakeSource {
  object_key: string;
  manifest_key: string;
  object_sha256: string;
  source_endpoint: string;
  source_total: number;
  row_count: number;
  compressed_bytes: number;
  retrieved_at: string;
  published_at: string;
}

/** Small state/year, county/year, or bank/year branch aggregates from D1. */
export const GET: RequestHandler = async ({ platform, url }) => {
  try {
    const plan = buildSodAggregatePlan(url.searchParams);
    const db = getDB(platform);
    const [data, count, source] = await Promise.all([
      queryAll<Record<string, unknown>>(db, plan.sql, plan.params),
      queryOne<{ count: number }>(db, plan.countSql, plan.countParams),
      queryOne<LakeSource>(
        db,
        `SELECT object_key, manifest_key, object_sha256, source_endpoint,
                source_total, row_count, compressed_bytes, retrieved_at, published_at
         FROM fdic_lake_partitions
         WHERE dataset = 'sod' AND partition_key = ?`,
        [String(plan.year)]
      )
    ]);
    if (!source) return errorResponse('SOD year has not been published to the lake', 404);

    if (plan.format === 'csv') {
      const headers = data.length > 0 ? Object.keys(data[0]) : [];
      const body = [
        encodeCsvRow(headers),
        ...data.map((row) => encodeCsvRow(headers.map((header) => row[header])))
      ].join('\n');
      return new Response(body, {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="fdic-sod-${plan.level}-${plan.year}.csv"`,
          'Access-Control-Allow-Origin': '*',
          'Cache-Control': 'public, max-age=3600',
          'X-Source-SHA256': source.object_sha256
        }
      });
    }

    const total = count?.count ?? 0;
    return jsonResponse({
      dataset: 'sod',
      level: plan.level,
      year: plan.year,
      data,
      pagination: {
        total,
        limit: plan.limit,
        offset: plan.offset,
        next_offset: plan.offset + data.length < total ? plan.offset + data.length : null
      },
      source
    });
  } catch (error) {
    if (error instanceof SodLakeQueryError) return errorResponse(error.message, error.status);
    console.error(JSON.stringify({
      message: 'SOD aggregate read failed',
      error: error instanceof Error ? error.message : String(error)
    }));
    return errorResponse('Failed to load SOD aggregates', 500);
  }
};
