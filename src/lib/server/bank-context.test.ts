import { describe, expect, it } from 'vitest';
import { getBankContext } from './bank-context';

function mockDb(options: {
  marketRows?: Array<Record<string, unknown>>;
} = {}): { db: D1Database; sql: string[] } {
  const sqlCalls: string[] = [];
  const db = {
    prepare(sql: string) {
      sqlCalls.push(sql);
      return {
        bind() {
          return {
            async first() {
              if (sql.includes('published_institutions')) return { cert: 42 };
              if (sql.includes('lake.is_current_snapshot = 1')) return {
                year: 2025,
                object_sha256: 'a'.repeat(64),
                manifest_key: 'fdic/sod/2025/manifest.json',
                lake_retrieved_at: '2026-01-01T10:00:00Z',
                source_run_id: 'sod-run-2025',
                source_retrieved_at: '2026-01-01T09:59:00Z',
                published_at: '2026-01-01T11:00:00Z'
              };
              return null;
            },
            async all() {
              if (sql.includes('FROM sod_bank_year')) return { results: [{ year: 2025, branch_count: 12, main_office_count: 1, state_count: 2, county_count: 5, total_deposits: 2_000_000, object_sha256: 'a'.repeat(64), manifest_key: 'fdic/sod/2025/manifest.json', retrieved_at: '2026-01-01T10:00:00Z' }] };
              if (sql.includes('WITH bank_markets')) return { results: options.marketRows ?? [{ cntynumb: 25, cntynamb: 'Suffolk', stalpbr: 'MA', branch_count: 4, bank_deposits: 500_000, market_deposits: 2_000_000, competing_banks: 8 }] };
              if (sql.includes('FROM annual_summary')) return { results: [
                { year: 2024, charter_type: 'CB', assets: 20_000_000, deposits: 14_000_000, loans: 9_000_000, banks: 4_000, branches: 65_000, employees: 1_700_000, source_run_id: 'annual-2024-cb', source_retrieved_at: '2026-01-03T09:00:00Z', published_at: '2026-01-03T10:00:00Z' },
                { year: 2024, charter_type: 'SI', assets: 5_000_000, deposits: 4_000_000, loans: 3_000_000, banks: 500, branches: 10_000, employees: 300_000, source_run_id: 'annual-2024-si', source_retrieved_at: '2026-01-04T09:00:00Z', published_at: '2026-01-04T10:00:00Z' }
              ] };
              if (sql.includes('FROM history_events')) return { results: [{ id: 'event-1', event_date: '20250501', change_code: 10, change_desc: 'Charter conversion', org_role: 'SURVIVOR', inst_name: 'Example Bank', source_retrieved_at: '2026-01-02' }] };
              if (sql.includes("dataset = 'history'")) return { results: [{ year_from: 1990, year_to: 2026, partitions: 37 }] };
              return { results: [] };
            }
          };
        }
      };
    }
  } as unknown as D1Database;
  return { db, sql: sqlCalls };
}

describe('getBankContext', () => {
  it('joins footprint, market-share, structure, and annual-system evidence without changing source units', async () => {
    const { db, sql } = mockDb();
    const context = await getBankContext(db, 42, 'release-2026-08-30');
    expect(context?.footprint[0]).toMatchObject({
      year: 2025,
      branches: 12,
      deposits: 2_000_000,
      source: {
        objectSha256: 'a'.repeat(64),
        manifestKey: 'fdic/sod/2025/manifest.json',
        retrievedAt: '2026-01-01T10:00:00Z'
      }
    });
    expect(context?.markets[0]).toMatchObject({ countyFips: '25025', depositShare: 25, competingBanks: 8 });
    expect(context?.structuralHistory[0]).toMatchObject({ category: 'charter', date: '20250501' });
    expect(context?.industry[0]).toEqual({
      year: 2024,
      assets: 25_000_000,
      deposits: 18_000_000,
      loans: 12_000_000,
      banks: 4_500,
      branches: 75_000,
      employees: 2_000_000,
      sources: [
        { charterType: 'CB', sourceRunId: 'annual-2024-cb', sourceRetrievedAt: '2026-01-03T09:00:00Z', publishedAt: '2026-01-03T10:00:00Z' },
        { charterType: 'SI', sourceRunId: 'annual-2024-si', sourceRetrievedAt: '2026-01-04T09:00:00Z', publishedAt: '2026-01-04T10:00:00Z' }
      ]
    });
    expect(context?.coverage).toMatchObject({ historyProcessYearFrom: 1990, historyProcessYearTo: 2026, historyPartitions: 37 });
    expect(context?.provenance).toMatchObject({
      source: 'FDIC BankFind Suite',
      monetaryUnit: 'usd_thousands',
      publicationGeneration: 'release-2026-08-30',
      sodCurrent: {
        year: 2025,
        objectSha256: 'a'.repeat(64),
        manifestKey: 'fdic/sod/2025/manifest.json',
        sourceRunId: 'sod-run-2025',
        sourceRetrievedAt: '2026-01-01T09:59:00Z'
      }
    });
    expect(sql.find((query) => query.includes('FROM annual_summary'))).toContain('LIMIT 300');
    expect(sql.find((query) => query.includes('lake.is_current_snapshot = 1'))).toContain('LIMIT 1');
  });

  it('keeps the same county code in different states as separate deposit markets', async () => {
    const { db, sql } = mockDb({
      marketRows: [
        { cntynumb: 25, cntynamb: 'Suffolk', stalpbr: 'MA', branch_count: 4, bank_deposits: 500_000, market_deposits: 2_000_000, competing_banks: 8 },
        { cntynumb: 25, cntynamb: 'Wahkiakum', stalpbr: 'WA', branch_count: 1, bank_deposits: 10_000, market_deposits: 100_000, competing_banks: 3 },
        { cntynumb: 5, cntynamb: 'Kosrae', stalpbr: 'FM', branch_count: 1, bank_deposits: 2_000, market_deposits: 20_000, competing_banks: 2 }
      ]
    });
    const context = await getBankContext(db, 42, 'release-2026-08-30');
    expect(context?.markets).toEqual([
      expect.objectContaining({ countyFips: '25025', county: 'Suffolk', state: 'MA', depositShare: 25 }),
      expect.objectContaining({ countyFips: '53025', county: 'Wahkiakum', state: 'WA', depositShare: 10 }),
      expect.objectContaining({ countyFips: '64005', county: 'Kosrae', state: 'FM', depositShare: 10 })
    ]);

    const marketQuery = sql.find((query) => query.includes('WITH bank_markets')) ?? '';
    expect(marketQuery).toContain('GROUP BY stalpbr, cntynumb');
    expect(marketQuery).toContain('bank.stalpbr = branch.stalpbr');
    expect(marketQuery).toContain('GROUP BY branch.stalpbr, branch.cntynumb');
    expect(marketQuery).toContain('total.stalpbr = bank.stalpbr');
  });
});
