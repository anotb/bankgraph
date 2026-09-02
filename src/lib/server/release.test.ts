import { describe, expect, it, vi } from 'vitest';
import { MACRO_SERIES_BY_ID } from './pipeline/macro-sources';
import { checkPipelineRunComplete, finalizePublication, type PreparedPublication } from './release';

function runLedgerDB(rows: Array<{ stage: string; scope: string }>, manifest = 'a'.repeat(64)): D1Database {
  return {
    prepare: vi.fn((sql: string) => ({
      bind: vi.fn(() => ({
        all: vi.fn(async () => sql.includes('pipeline_run_stages') ? { results: rows } : { results: [] }),
        first: vi.fn(async () => sql.includes('fdic_coverage_manifests')
          ? { manifest_sha256: manifest }
          : null)
      }))
    }))
  } as unknown as D1Database;
}

const core = ['institutions', 'failures', 'snapshot', 'analytics', 'industry-history', 'trends', 'anomalies', 'risk', 'correlations']
  .map((stage) => ({ stage, scope: '' }));
const macros = [...MACRO_SERIES_BY_ID.keys()].map((scope) => ({ stage: 'macro', scope }));

describe('strict publication run ledger', () => {
  it('does not accept partitioned financial completion as the canonical financial stage', async () => {
    const manifest = 'a'.repeat(64);
    const rows = [
      ...core,
      ...macros,
      { stage: 'fdic-financials', scope: '19920331' },
      { stage: 'coverage-audit', scope: manifest }
    ];
    const result = await checkPipelineRunComplete(runLedgerDB(rows, manifest), 'run-1');
    expect(result.ready).toBe(false);
    expect(result.missing).toContain('stage:financials-or-financials-latest');
  });

  it('binds coverage completion to the current same-run manifest hash', async () => {
    const rows = [
      ...core,
      ...macros,
      { stage: 'financials', scope: '' },
      { stage: 'coverage-audit', scope: 'b'.repeat(64) }
    ];
    const result = await checkPipelineRunComplete(runLedgerDB(rows), 'run-1');
    expect(result.ready).toBe(false);
    expect(result.missing).toContain(`coverage-audit:${'a'.repeat(64)}`);
  });
});

describe('atomic release attestation publication', () => {
  it('writes the attestation in the same D1 batch that opens the gate', async () => {
    const statements: Array<{ sql: string; params: unknown[] }> = [];
    const db = {
      prepare: vi.fn((sql: string) => ({
        bind: vi.fn((...params: unknown[]) => {
          const statement = { sql, params };
          statements.push(statement);
          return statement;
        })
      })),
      batch: vi.fn(async (batch: unknown[]) => batch.map(() => ({ meta: { changes: 1 } })))
    } as unknown as D1Database;
    const publication: PreparedPublication = {
      repdte: '20260630',
      publishedAt: '2026-08-30T12:00:00.000Z',
      generation: 'generation-1',
      runId: 'run-1',
      coverageManifestSha256: 'a'.repeat(64),
      coverageItemCount: 167,
      financialHistoryStart: '19920331',
      financialRowCount: 1_140_484,
      alreadyReady: false
    };

    await finalizePublication(db, publication, publication.publishedAt);

    expect(db.batch).toHaveBeenCalledTimes(1);
    expect(statements).toHaveLength(5);
    expect(statements[0].sql).toContain('INSERT INTO release_attestations');
    expect(statements[0].params).toEqual(expect.arrayContaining([
      '0024', publication.coverageManifestSha256, publication.coverageItemCount,
      publication.financialHistoryStart, publication.financialRowCount,
      publication.generation, publication.runId
    ]));
    expect(statements.at(-1)?.sql).toContain("SET state = 'ready'");
		expect(statements.every(({ sql }) => sql.includes("'ready'"))).toBe(true);
  });
});
