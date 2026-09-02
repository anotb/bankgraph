import { describe, expect, it, vi } from 'vitest';
import { GET } from '../../routes/api/v1/compare/+server';
import { lineageHash } from '$lib/provenance';

const rows = [
  {
    cert: 20,
    repdte: '20260331',
    roa: 1.2,
    dep: 800,
    source_retrieved_at: '2026-05-01T10:00:00.000Z'
  },
  {
    cert: 10,
    repdte: '20260630',
    roa: 1.4,
    dep: 900,
    source_retrieved_at: '2026-08-01T11:30:00.000Z'
  }
];

function mockDb() {
  const calls: Array<{ sql: string; params: unknown[] }> = [];
  const prepare = vi.fn((sql: string) => ({
    bind: (...params: unknown[]) => ({
      all: async () => {
        calls.push({ sql, params });
        return { results: rows };
      }
    })
  }));
  return { db: { prepare } as unknown as D1Database, prepare, calls };
}

async function call(url: string, db: D1Database): Promise<Response> {
  const handler = GET as unknown as (event: {
    url: URL;
    platform: App.Platform;
    locals: App.Locals;
  }) => Promise<Response>;
  return handler({
    url: new URL(url),
    platform: { env: { DB: db } } as App.Platform,
    locals: { liveDataRelease: '20260630', liveDataGeneration: 'generation-42' }
  });
}

describe('GET /api/v1/compare provenance', () => {
  it('binds the response to row retrieval, publication generation, formulas, and cohort identity', async () => {
    const { db, calls } = mockDb();
    const response = await call(
      'https://bankgraph.test/api/v1/compare?certs=20,10&metrics=roa,dep&from=20250101',
      db
    );
    const body = await response.json() as Record<string, any>;

    expect(response.status).toBe(200);
    expect(body.provenance).toEqual({
      source: 'FDIC BankFind Financials',
      source_url: 'https://api.fdic.gov/banks/docs/',
      source_as_of: '20260630',
      retrieved_at: '2026-08-01T11:30:00.000Z',
      release: '20260630',
      release_generation: 'generation-42',
      source_fields: { roa: ['ROA'], dep: ['DEP'] },
      formulas: {
        roa: 'Net Income / Average Total Assets',
        dep: 'Reported FDIC field DEP'
      },
      cohort_hash: lineageHash({ certs: [10, 20] })
    });
    expect(body.data['10'][0]).not.toHaveProperty('source_retrieved_at');
    expect(calls[0].sql).toContain('source_retrieved_at');
    expect(calls).toHaveLength(1);
  });

  it('carries the same lineage inside the CSV artifact', async () => {
    const { db } = mockDb();
    const response = await call(
      'https://bankgraph.test/api/v1/compare?certs=10,20&metrics=roa,dep&from=20250101&format=csv',
      db
    );
    const csv = await response.text();
    const [header, firstRow] = csv.split('\n');

    expect(header).toContain('_source_as_of,_retrieved_at,_release,_release_generation,_cohort_hash,_source_fields,_formulas');
    expect(firstRow).toContain('20260630');
    expect(firstRow).toContain('2026-08-01T11:30:00.000Z');
    expect(firstRow).toContain('generation-42');
    expect(firstRow).toContain(lineageHash({ certs: [10, 20] }));
    expect(firstRow).toContain('Net Income / Average Total Assets');
  });

  it('rejects a stale page generation before querying comparison rows', async () => {
    const { db, prepare } = mockDb();
    const response = await call(
      'https://bankgraph.test/api/v1/compare?certs=10&expected_release_generation=generation-41',
      db
    );

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      error: 'stale_page_release',
      release: '20260630',
      release_generation: 'generation-42'
    });
    expect(prepare).not.toHaveBeenCalled();
  });
});
