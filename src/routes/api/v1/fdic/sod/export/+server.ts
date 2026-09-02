import type { RequestHandler } from './$types';
import { getDB, queryOne } from '$lib/server/db';
import { errorResponse } from '$lib/server/response';
import { parseSodLakeYear, SodLakeQueryError } from '$lib/server/sod-lake-read';

interface LakeObject {
  object_key: string;
  object_sha256: string;
  compressed_bytes: number;
}

function resolvedRange(range: R2Range | undefined, size: number): { header: string; length: number } | null {
  if (!range) return null;
  if ('suffix' in range) {
    const length = Math.min(range.suffix, size);
    return { header: `bytes ${size - length}-${size - 1}/${size}`, length };
  }
  const offset = range.offset ?? 0;
  const length = Math.min(range.length ?? size - offset, size - offset);
  return { header: `bytes ${offset}-${offset + length - 1}/${size}`, length };
}

async function registeredObject(platform: App.Platform | undefined, year: number): Promise<LakeObject | null> {
  return queryOne<LakeObject>(
    getDB(platform),
    `SELECT object_key, object_sha256, compressed_bytes
     FROM fdic_lake_partitions
     WHERE dataset = 'sod' AND partition_key = ?`,
    [String(year)]
  );
}

async function serve(event: Parameters<RequestHandler>[0], includeBody: boolean): Promise<Response> {
  try {
    const year = parseSodLakeYear(event.url.searchParams);
    const registered = await registeredObject(event.platform, year);
    if (!registered) return errorResponse('SOD year has not been published to the lake', 404);
    const bucket = event.platform?.env?.EXPORTS;
    if (!bucket) return errorResponse('R2 export binding is not available', 503);
    const head = await bucket.head(registered.object_key);
    if (!head || head.size !== registered.compressed_bytes) {
      return errorResponse('The registered SOD export is unavailable', 503);
    }
    const headers = new Headers({
      'Content-Type': 'application/vnd.apache.parquet',
      'Content-Disposition': `attachment; filename="fdic-sod-${year}.parquet"`,
      'Access-Control-Allow-Origin': '*',
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'public, max-age=3600',
      'ETag': head.httpEtag,
      'X-Checksum-SHA256': registered.object_sha256
    });
    if (event.request.headers.get('if-none-match') === head.httpEtag) {
      return new Response(null, { status: 304, headers });
    }
    if (!includeBody) {
      headers.set('Content-Length', String(head.size));
      return new Response(null, { headers });
    }
    const object = await bucket.get(registered.object_key, { range: event.request.headers });
    if (!object) return errorResponse('The registered SOD export is unavailable', 503);
    const range = resolvedRange(object.range, head.size);
    if (range) headers.set('Content-Range', range.header);
    headers.set('Content-Length', String(range?.length ?? head.size));
    return new Response(object.body, { status: range ? 206 : 200, headers });
  } catch (error) {
    if (error instanceof SodLakeQueryError) return errorResponse(error.message, error.status);
    console.error(JSON.stringify({
      message: 'SOD Parquet export failed',
      error: error instanceof Error ? error.message : String(error)
    }));
    return errorResponse('Failed to load the SOD export', 500);
  }
}

/** Stream exactly one registered year; arbitrary R2 keys are never accepted. */
export const GET: RequestHandler = (event) => serve(event, true);
export const HEAD: RequestHandler = (event) => serve(event, false);
