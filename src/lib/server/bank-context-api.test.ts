import { describe, expect, it } from 'vitest';
import { GET } from '../../routes/api/v2/banks/[cert]/context/+server';

function db(): D1Database {
  return {
    prepare(sql: string) {
      return {
        bind() {
          return {
            async first() {
              if (sql.includes('published_institutions')) return { cert: 42 };
              if (sql.includes('lake.is_current_snapshot = 1')) return {
                year: 2025,
                object_sha256: 'c'.repeat(64),
                manifest_key: 'fdic/sod/2025/manifest.json',
                lake_retrieved_at: '2026-08-01T08:00:00Z',
                source_run_id: 'sod-run-2025',
                source_retrieved_at: '2026-08-01T07:55:00Z',
                published_at: '2026-08-01T09:00:00Z'
              };
              return null;
            },
            async all() {
              if (sql.includes('FROM sod_bank_year')) return { results: [{ year: 2025, branch_count: 1, main_office_count: 1, state_count: 1, county_count: 1, total_deposits: 100, object_sha256: 'c'.repeat(64), manifest_key: 'fdic/sod/2025/manifest.json', retrieved_at: '2026-08-01T08:00:00Z' }] };
              if (sql.includes('WITH bank_markets')) return { results: [] };
              if (sql.includes('FROM annual_summary')) return { results: [
                { year: 2024, charter_type: 'CB', assets: 10, deposits: 8, loans: 6, banks: 1, branches: 1, employees: 2, source_run_id: 'annual-cb', source_retrieved_at: '2026-08-02T08:00:00Z', published_at: '2026-08-02T09:00:00Z' },
                { year: 2024, charter_type: 'SI', assets: 5, deposits: 4, loans: 3, banks: 1, branches: 1, employees: 1, source_run_id: 'annual-si', source_retrieved_at: '2026-08-03T08:00:00Z', published_at: '2026-08-03T09:00:00Z' }
              ] };
              if (sql.includes("dataset = 'history'")) return { results: [{ year_from: null, year_to: null, partitions: 0 }] };
              return { results: [] };
            }
          };
        }
      };
    }
  } as unknown as D1Database;
}

describe('GET /api/v2/banks/:cert/context', () => {
  it('returns release generation and exact SOD and Annual Summary source identities', async () => {
    const handler = GET as unknown as (event: {
      params: { cert: string };
      platform: App.Platform;
      locals: App.Locals;
    }) => Promise<Response>;
    const response = await handler({
      params: { cert: '42' },
      platform: { env: { DB: db() } } as App.Platform,
      locals: { liveDataGeneration: 'release-2026-08-30' } as App.Locals
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      footprint: [{ source: { objectSha256: 'c'.repeat(64), manifestKey: 'fdic/sod/2025/manifest.json' } }],
      industry: [{ sources: [
        { charterType: 'CB', sourceRunId: 'annual-cb', sourceRetrievedAt: '2026-08-02T08:00:00Z' },
        { charterType: 'SI', sourceRunId: 'annual-si', sourceRetrievedAt: '2026-08-03T08:00:00Z' }
      ] }],
      provenance: {
        publicationGeneration: 'release-2026-08-30',
        sodCurrent: {
          objectSha256: 'c'.repeat(64),
          sourceRunId: 'sod-run-2025',
          sourceRetrievedAt: '2026-08-01T07:55:00Z'
        }
      }
    });
  });
});
