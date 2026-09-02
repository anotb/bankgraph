import { describe, expect, it } from 'vitest';
import { buildBulkUpsertPlan } from './index';

describe('bulkUpsert', () => {
  it('packs wide row groups into one JSON parameter per D1 statement', async () => {
    const rows = Array.from({ length: 401 }, (_, index) => ({
      cert: index + 1,
      repdte: '20241231',
      source_run_id: 'run-1',
      source_retrieved_at: '2026-08-30T12:00:00.000Z'
    }));

    const result = buildBulkUpsertPlan('financials', rows, ['cert', 'repdte']);

    expect(result.payloads).toHaveLength(3);
    expect(result.sql).toContain('FROM json_each(?)');
    expect(result.sql).toContain('ON CONFLICT(cert, repdte) DO UPDATE');
    expect(JSON.parse(result.payloads[0])).toHaveLength(200);
  });

  it('rejects inconsistent row shapes before preparing SQL', async () => {
    expect(() => buildBulkUpsertPlan(
      'financials',
      [{ cert: 1, repdte: '20241231' }, { cert: 2 }],
      ['cert', 'repdte']
    )).toThrow('identical columns');
  });
});
