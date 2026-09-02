/**
 * GET /api/v1/industry/failures
 * Returns FDIC failure and assistance transactions. True failures are the default.
 *
 * Query params:
 *   type     - 'failure' (default) | 'assistance' | 'all'
 *   format   - 'json' (default) | 'csv'
 *   download - present triggers JSON download with Content-Disposition header
 *   limit    - number of rows, 1-5000 (default 100)
 *   offset   - zero-based row offset (default 0)
 */

import type { RequestHandler } from './$types';
import { getDB, queryAll, queryOne } from '$lib/server/db';
import { cacheWrap } from '$lib/server/cache';
import { jsonResponse, errorResponse } from '$lib/server/response';
import { encodeCsvRow } from '$lib/server/csv';
import {
  parseFailureRecordFilter,
  parseFailureRecordLimit,
  parseFailureRecordOffset,
  type FailureRecordFilter
} from '$lib/server/failure-records';
import type { Failure } from '$lib/types';

const SIX_HOURS = 21600;

const CSV_COLUMNS: Array<keyof Failure> = [
  'source_id',
  'name',
  'cert',
  'city',
  'state',
  'fail_date',
  'transaction_type',
  'resolution_type',
  'insurance_fund',
  'acquiring_institution',
  'cost',
  'total_assets',
  'total_deposits'
];

const CSV_HEADERS = [
  'fdic_source_id',
  'name',
  'cert',
  'city',
  'state',
  'effective_date',
  'fdic_restype',
  'fdic_restype1',
  'fdic_savr_insurance_fund',
  'fdic_bidname_acquiring_institution',
  'estimated_loss_thousands_usd',
  'total_assets_thousands_usd',
  'total_deposits_thousands_usd'
];

export const GET: RequestHandler = async ({ platform, url, locals }) => {
  let recordFilter: FailureRecordFilter;
  let limit: number;
  let offset: number;
  let format: 'json' | 'csv';
  try {
    recordFilter = parseFailureRecordFilter(url.searchParams.get('type'));
    limit = parseFailureRecordLimit(url.searchParams.get('limit'));
    offset = parseFailureRecordOffset(url.searchParams.get('offset'));
    const requestedFormat = url.searchParams.get('format') || 'json';
    if (requestedFormat !== 'json' && requestedFormat !== 'csv') {
      throw new Error('format must be one of: json, csv');
    }
    format = requestedFormat;
  } catch (err) {
    return errorResponse(err instanceof Error ? err.message : 'Invalid failures request', 400);
  }

  const kv = platform?.env?.CACHE;
  const cacheKey = `industry:failures:${recordFilter}:${limit}:${offset}`;

  try {
    const loadFailures = async (): Promise<{ data: Failure[]; total: number }> => {
      const db = getDB(platform);
      const whereClause = recordFilter === 'all'
        ? '1 = 1'
        : 'transaction_type = ?';
      const params = recordFilter === 'all' ? [] : [recordFilter.toUpperCase()];
      const [data, count] = await Promise.all([
        queryAll<Failure>(
          db,
          `SELECT * FROM failures
           WHERE ${whereClause}
           ORDER BY fail_date DESC, source_id DESC
           LIMIT ? OFFSET ?`,
          [...params, limit, offset]
        ),
        queryOne<{ count: number }>(
          db,
          `SELECT COUNT(*) AS count FROM failures WHERE ${whereClause}`,
          params
        )
      ]);

      return { data, total: count?.count ?? 0 };
    };
    // Keep only the three shared first-page views in KV. Custom limits and
    // offsets are combinatorial and remain bounded D1 reads.
    const result = limit === 100 && offset === 0
      ? await cacheWrap<{ data: Failure[]; total: number }>(kv, cacheKey, SIX_HOURS, loadFailures, locals?.liveDataGeneration)
      : await loadFailures();

    const filename = recordFilter === 'failure'
      ? 'bank_failures'
      : recordFilter === 'assistance'
        ? 'bank_assistance_transactions'
        : 'bank_failures_and_assistance';

    if (format === 'csv') {
      const rows = [
        encodeCsvRow(CSV_HEADERS),
        ...result.data.map((row) => encodeCsvRow(CSV_COLUMNS.map((col) => row[col])))
      ];
      return new Response(rows.join('\n'), {
        status: 200,
        headers: {
          'Content-Type': 'text/csv',
          'Content-Disposition': `attachment; filename="${filename}.csv"`,
          'X-Total-Count': String(result.total),
          'X-Result-Limit': String(limit),
          'X-Result-Offset': String(offset),
          'Access-Control-Allow-Origin': '*'
        }
      });
    }

    const payload = {
      data: result.data,
      type: recordFilter,
      total: result.total,
      limit,
      offset,
      source: 'FDIC BankFind Suite Failures & Assistance Transactions',
      source_fields: {
        source_id: 'ID',
        transaction_type: 'RESTYPE',
        resolution_type: 'RESTYPE1',
        insurance_fund: 'SAVR',
        acquiring_institution: 'BIDNAME',
        cost: 'COST'
      },
      units: {
        cost: 'Estimated loss, thousands of US dollars',
        total_assets: 'Thousands of US dollars',
        total_deposits: 'Thousands of US dollars'
      },
      coverage: 'Estimated-loss coverage is incomplete for FDIC-insured failures before 1986 and FSLIC-insured failures from 1934 through 1988.'
    };

    if (format === 'json' && url.searchParams.has('download')) {
      return new Response(JSON.stringify(payload, null, 2), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Content-Disposition': `attachment; filename="${filename}.json"`,
          'X-Total-Count': String(result.total),
          'Access-Control-Allow-Origin': '*'
        }
      });
    }

    return jsonResponse(payload);
  } catch (err) {
    console.error('Failed to load failures and assistance data:', err);
    return errorResponse('Failed to load failure and assistance records', 500);
  }
};
