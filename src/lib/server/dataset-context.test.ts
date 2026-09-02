import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it, vi } from 'vitest';
import {
  buildDatasetContext,
  DATASET_FINANCIAL_SUMMARY_SQL,
  loadDatasetContext
} from './dataset-context';

const base = {
  institutionCount: 6,
  activeInstitutionCount: 6,
  institutionSourceAsOf: '20260630',
  financialSourceAsOf: '20260630',
  financialInstitutionCount: 6,
  aggregateSourceAsOf: '20260630',
  aggregateInstitutionCount: 4275,
  pageLoadedAt: '2026-08-30T16:00:00.000Z'
};

describe('buildDatasetContext', () => {
  it('keeps a recorded institution selection separate from full-period aggregates', () => {
    const context = buildDatasetContext({
      ...base,
      pipelineState: [{
        key: 'demo_fixture_mode',
        value: 'recorded',
        updated_at: '2026-08-30T15:11:21.509Z'
      }, {
        key: 'demo_fixture_recorded_at',
        value: '2026-08-30T15:11:21.509Z',
        updated_at: '2026-08-30T15:11:21.509Z'
      }]
    });

    expect(context.mode).toBe('recorded_snapshot');
    expect(context.demo_fixture_mode).toBe('recorded');
    expect(context.scopes.institutions).toMatchObject({
      kind: 'recorded_selection',
      count: 6,
      record_count: 6
    });
    expect(context.scopes.industry_aggregates).toMatchObject({
      kind: 'reported_population_aggregate',
      count: 4275
    });
    expect(context.scopes.institution_financials).toMatchObject({
      kind: 'recorded_selection',
      count: 6,
      source_as_of: '20260630'
    });
    expect(context.scopes.industry_aggregates.population).toContain(
      'not calculated from the recorded institution selection'
    );
    expect(context.retrieved_at).toBe('2026-08-30T15:11:21.509Z');
    expect(context.pipeline_stage_updated_at).toBeNull();
    expect(context.is_stale).toBe(false);
  });

  it('distinguishes a stale source period from a recent pipeline-stage run', () => {
    const context = buildDatasetContext({
      ...base,
      institutionCount: 27833,
      activeInstitutionCount: 4317,
      institutionSourceAsOf: '20251231',
      financialSourceAsOf: '20251231',
      aggregateSourceAsOf: '20251231',
      pipelineState: [{
        key: 'financials_last_sync',
        value: '20251231',
        updated_at: '2026-08-29T12:00:00.000Z'
      }]
    });

    expect(context.mode).toBe('pipeline');
    expect(context.demo_fixture_mode).toBeNull();
    expect(context.source_as_of).toBe('20251231');
    expect(context.pipeline_stage_updated_at).toBe('2026-08-29T12:00:00.000Z');
    expect(context.retrieved_at).toBeNull();
    expect(context.is_stale).toBe(true);
  });
});

function createContextDb() {
  const statements: string[] = [];
  const db = {
    prepare: vi.fn((sql: string) => {
      statements.push(sql);
      const statement = {
        bind: vi.fn(() => statement),
        all: vi.fn(async () => {
          if (sql.includes('FROM pipeline_state')) {
            return {
              results: [{
                key: 'financials_retrieved_at',
                value: '2026-08-30T12:00:00.000Z',
                updated_at: '2026-08-30T12:00:00.000Z'
              }]
            };
          }
          throw new Error(`Unexpected all query: ${sql}`);
        }),
        first: vi.fn(async () => {
          if (sql.includes('FROM published_institutions')) {
            return { institution_count: 27_833, active_count: 4_317 };
          }
          if (sql.includes('FROM release_control AS control')) {
            return { source_as_of: '20260630', institution_count: 4_275 };
          }
          throw new Error(`Unexpected first query: ${sql}`);
        })
      };
      return statement;
    })
  };
  return { db: db as unknown as D1Database, statements };
}

function createKv() {
  const stored = new Map<string, string>();
  return {
    get: vi.fn(async (key: string) => stored.get(key) ?? null),
    put: vi.fn(async (key: string, value: string) => { stored.set(key, value); })
  } as unknown as KVNamespace;
}

describe('loadDatasetContext', () => {
  it('uses singleton and primary-key lookups instead of scanning financial history', async () => {
    const sqlite = new DatabaseSync(':memory:');
    try {
      sqlite.exec(`
        CREATE TABLE release_control (
          singleton INTEGER PRIMARY KEY,
          release TEXT
        );
        CREATE TABLE agg_industry (
          repdte TEXT NOT NULL,
          segment TEXT NOT NULL,
          metric TEXT NOT NULL,
          value REAL,
          count INTEGER,
          PRIMARY KEY (repdte, segment, metric)
        ) WITHOUT ROWID;
      `);

      const plan = sqlite.prepare(`EXPLAIN QUERY PLAN ${DATASET_FINANCIAL_SUMMARY_SQL}`).all() as Array<{
        detail: string;
      }>;
      const details = plan.map((row) => row.detail).join('\n');

      expect(DATASET_FINANCIAL_SUMMARY_SQL).not.toMatch(/\bfinancials\b/i);
      expect(details).toContain('SEARCH control USING INTEGER PRIMARY KEY');
      expect(details).toContain(
        'SEARCH aggregate USING PRIMARY KEY (repdte=? AND segment=? AND metric=?)'
      );
      expect(details).not.toMatch(/SCAN aggregate|SCAN financial/i);
    } finally {
      sqlite.close();
    }
  });

  it('reuses generation-stable inputs while keeping request timestamps current', async () => {
    const { db, statements } = createContextDb();
    const kv = createKv();

    const first = await loadDatasetContext(db, {
      kv,
      generation: 'generation-a',
      pageLoadedAt: '2026-08-30T16:00:00.000Z'
    });
    const second = await loadDatasetContext(db, {
      kv,
      generation: 'generation-a',
      pageLoadedAt: '2026-08-30T16:05:00.000Z'
    });

    expect(statements).toHaveLength(3);
    expect(statements.every((sql) => !/FROM\s+(published_)?financials\b/i.test(sql))).toBe(true);
    expect(first.source_as_of).toBe('20260630');
    expect(first.scopes.institution_financials.count).toBe(4_275);
    expect(first.scopes.institutions.record_count).toBe(27_833);
    expect(first.page_loaded_at).toBe('2026-08-30T16:00:00.000Z');
    expect(second.page_loaded_at).toBe('2026-08-30T16:05:00.000Z');

    await loadDatasetContext(db, {
      kv,
      generation: 'generation-b',
      pageLoadedAt: '2026-08-30T16:10:00.000Z'
    });
    expect(statements).toHaveLength(6);
  });
});
