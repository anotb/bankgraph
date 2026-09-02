/**
 * GET /api/v1/compare
 * Multi-bank comparison endpoint.
 *
 * Query params:
 *   certs    - comma-separated cert numbers (max 10, required)
 *   metrics  - comma-separated metric names (default: roa,roe,nimy)
 *   from     - start date YYYYMMDD (optional)
 *   to       - end date YYYYMMDD (optional)
 */

import type { RequestHandler } from './$types';
import { getDB, queryAll } from '$lib/server/db';
import { jsonResponse, errorResponse } from '$lib/server/response';
import { encodeCsvRow } from '$lib/server/csv';
import { CompareQueryError, parseCompareQuery } from '$lib/server/compare-query';
import { fieldDefs } from '$lib/utils/field-meta.js';
import type { Financial, CompareResponse } from '$lib/types';
import {
  financialAnalysisProvenance,
  latestTimestamp,
  lineageHash
} from '$lib/provenance';
import {
  releaseLineage,
  setReleaseLineageHeaders,
  stalePageReleaseResponse
} from '$lib/server/release-lineage';

// Accept all fields defined in field-meta as valid comparison metrics
const VALID_METRICS = new Set(Object.keys(fieldDefs));

export const GET: RequestHandler = async ({ platform, url, locals, request }) => {
  let parsed;
  try {
    parsed = parseCompareQuery(url.searchParams, VALID_METRICS);
  } catch (error) {
    if (error instanceof CompareQueryError) return errorResponse(error.message, 400);
    throw error;
  }
  const staleResponse = stalePageReleaseResponse({ locals, url, request });
  if (staleResponse) return staleResponse;
  const { certs, metrics, to, format, download } = parsed;
  let { from } = parsed;

  // Default to last 20 years to avoid D1 result size limits on wide queries
  if (!from) {
    const d = new Date();
    d.setFullYear(d.getFullYear() - 20);
    from = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  }

  const sortedCerts = [...certs].sort((a, b) => a - b);

  try {
    // Comparison requests have combinatorial cert/metric/date cardinality. Keep
    // them in bounded D1 queries instead of admitting an attacker-shaped KV key.
    const db = getDB(platform);

    // Single query for all certs instead of N sequential queries
    const columns = ['cert', 'repdte', ...metrics, 'source_retrieved_at'];
    const selectFields = columns.join(', ');

    const conditions: string[] = [`cert IN (${certs.map(() => '?').join(',')})`];
    const bindParams: unknown[] = [...certs];

    if (from) {
      conditions.push('repdte >= ?');
      bindParams.push(from);
    }
    if (to) {
      conditions.push('repdte <= ?');
      bindParams.push(to);
    }

    const where = conditions.join(' AND ');
    const allRows = await queryAll<Financial & { source_retrieved_at: string | null }>(
      db,
      `SELECT ${selectFields} FROM published_financials WHERE ${where} ORDER BY cert, repdte ASC`,
      bindParams
    );

    // Group rows by cert
    const data: Record<number, Financial[]> = {};
    for (const cert of certs) {
      data[cert] = [];
    }
    for (const row of allRows) {
      if (!data[row.cert]) data[row.cert] = [];
      const { source_retrieved_at: _sourceRetrievedAt, ...financial } = row;
      data[row.cert].push(financial);
    }

    const sourceAsOf = allRows.map((row) => row.repdte).sort().at(-1) ?? null;
    const retrievedAt = latestTimestamp(allRows.map((row) => row.source_retrieved_at));
    const provenance = financialAnalysisProvenance({
      metrics,
      sourceAsOf,
      retrievedAt,
      release: locals?.liveDataRelease ?? null,
      releaseGeneration: locals?.liveDataGeneration ?? null,
      cohortHash: lineageHash({ certs: sortedCerts })
    });
    const result: CompareResponse = { certs: sortedCerts, metrics, data, provenance };

    if (format === 'csv') {
      // Flatten: one row per cert+repdte, columns = cert, repdte, metric1, metric2...
      const flatRows = result.certs.flatMap(cert =>
        (result.data[cert] ?? []).map(r => r as unknown as Record<string, unknown>)
      );

      const csvHeaders = [
        'cert', 'repdte', ...result.metrics,
        '_source_as_of', '_retrieved_at', '_release', '_release_generation',
        '_cohort_hash', '_source_fields', '_formulas'
      ];
      const provenanceValues: Record<string, unknown> = {
        _source_as_of: provenance.source_as_of,
        _retrieved_at: provenance.retrieved_at,
        _release: provenance.release,
        _release_generation: provenance.release_generation,
        _cohort_hash: provenance.cohort_hash,
        _source_fields: JSON.stringify(provenance.source_fields),
        _formulas: JSON.stringify(provenance.formulas)
      };
      const csvLines = [
        encodeCsvRow(csvHeaders),
        ...(flatRows.length ? flatRows : [{}]).map(row =>
          encodeCsvRow(csvHeaders.map(h => row[h] ?? provenanceValues[h]))
        )
      ];
      return setReleaseLineageHeaders(new Response(csvLines.join('\n'), {
        status: 200,
        headers: {
          'Content-Type': 'text/csv',
          'Content-Disposition': 'attachment; filename="comparison.csv"',
          'Access-Control-Allow-Origin': '*'
        }
      }), releaseLineage(locals));
    }

    if (format === 'json' && download) {
      return new Response(JSON.stringify(result, null, 2), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Content-Disposition': 'attachment; filename="comparison.json"',
          'Access-Control-Allow-Origin': '*'
        }
      });
    }

    return jsonResponse(result);
  } catch (err) {
    console.error('Failed to load comparison data:', err);
    return errorResponse('Failed to load comparison data', 500);
  }
};
