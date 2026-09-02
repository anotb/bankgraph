import { describe, expect, it, vi } from 'vitest';
import { getQuarterChangeBrief } from './quarter-change-brief';

function row(repdte: string) {
  return {
    cert: 7,
    repdte,
    asset_bucket: 4,
    asset: 1_000,
    dep: 800,
    eq: 200,
    lnlsnet: 600,
    sec: 100,
    chbal: 100,
    frepo: 0,
    trade: 0,
    ore: 0,
    bkprem: 0,
    intan: 0,
    oa: 200,
    frepp: 0,
    othbor: 0,
    subnd: 0,
    tradel: 0,
    allothl: 0,
    netinc: 10,
    nim: 20,
    nonii: 5,
    nonix: 10,
    elnatr: 1,
    netincq: 10,
    nimq: 20,
    noniiq: 5,
    nonixq: 10,
    elnatq: 1,
    iglsecq: 0,
    itaxq: 4,
    extraq: 0,
    source_retrieved_at: '2026-08-30T16:12:13.000Z'
  };
}

function mockDb(rowsByDate: Record<string, ReturnType<typeof row> | null>) {
  const calls: Array<{ sql: string; params: unknown[] }> = [];
  const db = {
    prepare(sql: string) {
      return {
        bind(...params: unknown[]) {
          calls.push({ sql, params });
          return {
            async first() {
              if (sql.includes('institutions')) return { name: 'Current Bank', city: 'Here', state: 'NY' };
              if (sql.includes('ORDER BY repdte DESC')) return rowsByDate.latest ?? null;
              return rowsByDate[String(params[1])] ?? null;
            },
            async all() {
              return { results: [] };
            }
          };
        }
      };
    }
  } as unknown as D1Database;
  return { db, calls };
}

describe('getQuarterChangeBrief', () => {
  it('uses the newest ingested row and derives its exact preceding quarter', async () => {
    const latest = row('20260630');
    const prior = { ...row('20260331'), asset: 900, dep: 700, lnlsnet: 500 };
    const before = row('20251231');
    const { db, calls } = mockDb({ latest, '20260331': prior, '20251231': before });

    const result = await getQuarterChangeBrief(db, 7, {
      minimumPeerCount: 1,
      release: '20260630',
      releaseGeneration: 'generation-42'
    });

    expect(result?.comparison).toMatchObject({
      status: 'ok',
      from: '20260331',
      to: '20260630',
      isConsecutiveQuarter: true
    });
    expect(calls.some((call) => call.params[1] === '20260331')).toBe(true);
    expect(result?.structuralContext?.status).toBe('unavailable');
    expect(result?.provenance).toMatchObject({
      source: 'FDIC BankFind Financials',
      source_as_of: '20260630',
      retrieved_at: '2026-08-30T16:12:13.000Z',
      release: '20260630',
      release_generation: 'generation-42',
      cohort_hash: expect.stringMatching(/^fnv1a32:[0-9a-f]{8}$/),
      source_fields: {
        total_assets: ['ASSET', 'CHBAL', 'FREPO', 'SEC', 'LNLSNET', 'TRADE', 'ORE', 'BKPREM', 'INTAN', 'OA'],
        loan_to_deposit: ['LNLSNET', 'DEP']
      },
      formulas: {
        loan_to_deposit: '100 × LNLSNET / DEP; change decomposed with an exact two-factor Shapley identity'
      }
    });
    expect(calls.some((call) => call.sql.includes('source_retrieved_at'))).toBe(true);
  });

  it('does not substitute an older row when the required preceding quarter is absent', async () => {
    const { db } = mockDb({ latest: row('20260630'), '20260331': null });
    const result = await getQuarterChangeBrief(db, 7);
    expect(result?.comparison.status).toBe('missing_comparison_quarter');
    expect(result?.comparison.from).toBe('20260331');
    expect(result?.bridges).toBeNull();
  });

  it('rejects an explicit nonconsecutive attribution window before querying peers', async () => {
    const { db } = mockDb({ latest: row('20260630'), '20260630': row('20260630') });
    const result = await getQuarterChangeBrief(db, 7, {
      from: '20251231',
      to: '20260630'
    });
    expect(result?.comparison.status).toBe('nonconsecutive_periods');
    expect(result?.peerContext).toBeNull();
  });
});
