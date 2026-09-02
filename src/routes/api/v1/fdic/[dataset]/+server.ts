import type { RequestHandler } from './$types';
import { getDB, queryAll, queryOne } from '$lib/server/db';
import { errorResponse, jsonResponse } from '$lib/server/response';
import { buildFDICReadPlan } from '$lib/server/fdic-read';
import {
  releaseLineage,
  stalePageReleaseResponse,
  type ReleaseFenceInput
} from '$lib/server/release-lineage';
import {
  FDICPartitionError,
  parseFDICDataset,
  type FDICDataset
} from '$lib/server/pipeline/fdic-partitioned-ingest';

interface PublicationRow {
  source_endpoint: string;
  source_total: number;
  row_count: number;
  key_first: string | null;
  key_last: string | null;
  retrieved_at: string | null;
  published_at: string;
}

async function loadPublication(
  db: D1Database,
  dataset: FDICDataset,
  partition: string,
  lineage: ReturnType<typeof releaseLineage>
): Promise<PublicationRow | null> {
  if (dataset !== 'financials') {
    return queryOne<PublicationRow>(
      db,
      `SELECT source_endpoint, source_total, row_count, key_first, key_last,
              retrieved_at, published_at
       FROM fdic_dataset_publications
       WHERE dataset = ? AND partition_key = ?`,
      [dataset, partition]
    );
  }

  // Financial history is reconciled as one canonical 1992-present release,
  // rather than publishing one fdic_dataset_publications row per quarter.
  // Resolve its partition metadata only through the elected release view and
  // the same immutable attestation/generation admitted by the request hook.
  return queryOne<PublicationRow>(
    db,
    `SELECT 'https://api.fdic.gov/banks/financials' AS source_endpoint,
            COUNT(*) AS source_total,
            COUNT(*) AS row_count,
            financial.repdte || '|' || printf('%012d', MIN(financial.cert)) AS key_first,
            financial.repdte || '|' || printf('%012d', MAX(financial.cert)) AS key_last,
            MAX(financial.source_retrieved_at) AS retrieved_at,
            attestation.attested_at AS published_at
       FROM published_financials AS financial
       JOIN release_control AS control
         ON control.singleton = 1
        AND control.state = 'ready'
        AND control.release = ?
        AND control.generation = ?
       JOIN pipeline_state AS published
         ON published.key = 'published_release'
        AND published.value = control.release
       JOIN release_attestations AS attestation
         ON attestation.release = control.release
        AND attestation.generation = control.generation
      WHERE financial.repdte = ?
        AND financial.repdte >= attestation.financial_history_start
        AND financial.repdte <= control.release
      GROUP BY financial.repdte, attestation.attested_at
     HAVING COUNT(*) > 0`,
    [lineage.release, lineage.release_generation, partition]
  );
}

/** Read one fully published FDIC partition with a hard response-size bound. */
export const GET: RequestHandler = async ({ platform, params, url, locals, request }) => {
  try {
    const dataset = parseFDICDataset(params.dataset);
    const rawPartition = url.searchParams.get('partition');
    if (!rawPartition) throw new FDICPartitionError('partition is required');
    const plan = buildFDICReadPlan(dataset, rawPartition, url.searchParams);
    const staleResponse = stalePageReleaseResponse({ locals, url, request } satisfies ReleaseFenceInput);
    if (staleResponse) return staleResponse;
    const lineage = releaseLineage(locals);
    if (!lineage.release || !lineage.release_generation) {
      return errorResponse('Published release context is unavailable', 503);
    }
    const db = getDB(platform);
    const publication = await loadPublication(db, dataset, plan.partition, lineage);
    if (!publication) return errorResponse('FDIC partition has not been published', 404);

    const [rows, count] = await Promise.all([
      queryAll<Record<string, unknown>>(db, plan.sql, [...plan.params, plan.limit, plan.offset]),
      queryOne<{ count: number }>(db, plan.countSql, plan.params)
    ]);
    return jsonResponse({
      dataset,
      partition: plan.partition,
      data: rows,
      pagination: {
        total: count?.count ?? 0,
        limit: plan.limit,
        offset: plan.offset,
        next_offset: plan.offset + rows.length < (count?.count ?? 0)
          ? plan.offset + rows.length
          : null
      },
      source: publication,
      ...lineage
    });
  } catch (error) {
    if (error instanceof FDICPartitionError) return errorResponse(error.message, error.status);
    console.error(JSON.stringify({
      message: 'fdic partition read failed',
      error: error instanceof Error ? error.message : String(error)
    }));
    return errorResponse('Failed to load FDIC partition', 500);
  }
};
