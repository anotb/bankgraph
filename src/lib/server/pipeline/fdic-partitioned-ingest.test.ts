import { describe, expect, it, vi } from 'vitest';
import {
  FDICPartitionError,
  buildFDICPageUrl,
  discoverLatestAnnualYear,
  discoverLatestSODYear,
  normalizeFDICPartition,
  parseFDICPage,
  resolveFDICPartition,
  runFDICPartition,
  type FDICDataset,
  type FDICIngestStore,
  type FDICPage,
  type FDICPartitionState
} from './fdic-partitioned-ingest';

class MemoryStore implements FDICIngestStore {
  state: FDICPartitionState | null = null;
  staged = new Map<string, string>();
  publishCalls = 0;
  failCalls = 0;
  releaseCalls = 0;
  staleRows = 2;
  publicationStepsRemaining = 0;

  async begin(dataset: FDICDataset, partition: string, _endpoint: string, refresh: boolean) {
    if (!this.state || refresh || this.state.status === 'error') {
      this.state = {
        dataset,
        partitionKey: partition,
        runId: `run-${dataset}-${partition}`,
        status: 'running',
        checkpoint: 0,
        sourceTotal: null,
        rowsSeen: 0,
        keyFirst: null,
        keyLast: null,
        retrievedAt: '2026-08-30T12:00:00.000Z',
        publicationPhase: null,
        rowsMaterialized: 0
      };
      this.staged.clear();
    }
    return { state: { ...this.state }, alreadyComplete: this.state.status === 'complete' && !refresh };
  }

  async stage(_runId: string, rows: Array<{ row_key: string; row_json: string }>) {
    for (const row of rows) this.staged.set(row.row_key, row.row_json);
    return Math.ceil(rows.length / 200);
  }

  async advance(
    _state: FDICPartitionState,
    next: { checkpoint: number; sourceTotal: number; rowsSeen: number; keyFirst: string | null; keyLast: string | null }
  ) {
    if (!this.state) throw new Error('missing state');
    this.state = { ...this.state, ...next };
  }

  async publish(state: FDICPartitionState) {
    this.publishCalls++;
    if (this.staged.size !== state.sourceTotal) throw new FDICPartitionError('stage count mismatch', 502);
    if (!this.state) throw new Error('missing state');
    if (this.publicationStepsRemaining > 0) {
      this.publicationStepsRemaining--;
      this.state = {
        ...this.state,
        status: 'reconciling',
        publicationPhase: 'materialize',
        rowsMaterialized: Math.min(this.staged.size, 1_000)
      };
      return {
        done: false,
        rowsPublished: null,
        rowsDeleted: 0,
        publishedAt: null,
        publicationPhase: 'materialize' as const,
        rowsMaterialized: this.state.rowsMaterialized
      };
    }
    this.state = { ...this.state, status: 'complete' };
    return {
      done: true,
      rowsPublished: this.staged.size,
      rowsDeleted: this.staleRows,
      publishedAt: '2026-08-30T12:05:00.000Z',
      publicationPhase: 'complete' as const,
      rowsMaterialized: this.staged.size
    };
  }

  async fail(_state: FDICPartitionState) {
    this.failCalls++;
    if (this.state) this.state = { ...this.state, status: 'error' };
  }

  async release() {
    this.releaseCalls++;
  }
}

function sodRow(uninumbr: number): Record<string, unknown> {
  return {
    UNINUMBR: uninumbr,
    YEAR: 2024,
    CERT: 100 + uninumbr,
    NAMEBR: `Branch ${uninumbr}`,
    STALPBR: 'VA',
    BRNUM: uninumbr
  };
}

describe('FDIC partition parsing', () => {
  it('normalizes the supported natural partition formats', () => {
    expect(normalizeFDICPartition('financials', '2024Q3')).toBe('20240930');
    expect(normalizeFDICPartition('financials', '1992Q1')).toBe('19920331');
    expect(() => normalizeFDICPartition('financials', '1991Q4')).toThrow('begin at 1992Q1');
    expect(normalizeFDICPartition('annual-summary', '2024/si')).toBe('2024:SI');
    expect(normalizeFDICPartition('annual-summary', 'latest/si')).toBe('latest:SI');
    expect(normalizeFDICPartition('history', '2026')).toBe('2026');
    expect(() => normalizeFDICPartition('history', '2025:2026')).toThrow('Invalid year partition');
    expect(normalizeFDICPartition('sod', 'latest')).toBe('latest');
    expect(normalizeFDICPartition('locations', '08/28/2026')).toBe('2026-08-28');
  });

  it('resolves the current SOD hot-table year from the source', async () => {
    const fetcher = vi.fn(async () => Response.json({
      data: [{ data: { YEAR: 2025 } }],
      totals: { count: 1 }
    }));
    await expect(discoverLatestSODYear(fetcher as typeof fetch)).resolves.toBe(2025);
    await expect(resolveFDICPartition('sod', 'latest', fetcher as typeof fetch)).resolves.toBe('2025');
  });

  it('resolves the latest annual year independently for each charter class', async () => {
    const fetcher = vi.fn(async (input: string | URL | Request) => {
      const url = new URL(String(input));
      const charter = url.searchParams.get('filters')?.split(':')[1];
      const year = charter === 'SI' ? 2024 : 2025;
      return Response.json({
        data: [{ data: { YEAR: year, CB_SI: charter } }],
        totals: { count: 1 }
      });
    });
    await expect(discoverLatestAnnualYear('SI', fetcher as typeof fetch)).resolves.toBe(2024);
    await expect(resolveFDICPartition('annual-summary', 'latest:CB', fetcher as typeof fetch))
      .resolves.toBe('2025:CB');
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('builds a stable, bounded FDIC request for one partition', () => {
    const url = new URL(buildFDICPageUrl('annual-summary', '2024:SI', 1000));
    expect(url.pathname).toBe('/banks/summary');
    expect(url.searchParams.get('filters')).toBe('YEAR:2024 AND CB_SI:SI');
    expect(url.searchParams.get('sort_by')).toBe('STALP');
    expect(url.searchParams.get('limit')).toBe('1000');
    expect(url.searchParams.get('offset')).toBe('1000');
  });

  it('partitions history only by process year so retroactive effective years stay in scope', () => {
    const url = new URL(buildFDICPageUrl('history', '2026', 0));
    expect(url.pathname).toBe('/banks/history');
    expect(url.searchParams.get('filters')).toBe('PROCYEAR:2026');
    expect(url.searchParams.get('filters')).not.toContain('EFFYEAR');
  });

  it('requires source total fields to agree', () => {
    expect(() => parseFDICPage({ data: [], totals: { count: 2 }, meta: { total: 3 } }))
      .toThrow('total fields disagree');
  });
});

describe('runFDICPartition', () => {
  it('resumes at the saved checkpoint and reconciles only after all source rows arrive', async () => {
    const store = new MemoryStore();
    const offsets: number[] = [];
    const fetchPage = vi.fn(async (_dataset: FDICDataset, _partition: string, offset: number): Promise<FDICPage> => {
      offsets.push(offset);
      return offset === 0
        ? { total: 3, rows: [sodRow(1), sodRow(2)] }
        : { total: 3, rows: [sodRow(3)] };
    });

    const first = await runFDICPartition({ dataset: 'sod', partition: '2024', maxPages: 1, store, fetchPage });
    expect(first).toMatchObject({ done: false, checkpoint: 2, rows_seen: 2, source_total: 3 });
    expect(store.publishCalls).toBe(0);
    expect(store.releaseCalls).toBe(1);

    const second = await runFDICPartition({ dataset: 'sod', partition: '2024', maxPages: 1, store, fetchPage });
    expect(second).toMatchObject({ done: true, checkpoint: 3, rows_published: 3, rows_deleted: 2 });
    expect(second.run_id).toBe(first.run_id);
    expect(second.retrieved_at).toBe(first.retrieved_at);
    expect(offsets).toEqual([0, 2]);
    expect(store.publishCalls).toBe(1);
  });

  it('does not reconcile when the source total changes between resumed pages', async () => {
    const store = new MemoryStore();
    const firstFetch = async (): Promise<FDICPage> => ({ total: 3, rows: [sodRow(1), sodRow(2)] });
    await runFDICPartition({ dataset: 'sod', partition: '2024', store, fetchPage: firstFetch });

    await expect(runFDICPartition({
      dataset: 'sod',
      partition: '2024',
      store,
      fetchPage: async () => ({ total: 4, rows: [sodRow(3), sodRow(4)] })
    })).rejects.toThrow('source total changed');
    expect(store.publishCalls).toBe(0);
    expect(store.failCalls).toBe(1);
  });

  it('resumes bounded publication without refetching source pages', async () => {
    const store = new MemoryStore();
    store.publicationStepsRemaining = 1;
    const fetchPage = vi.fn(async (): Promise<FDICPage> => ({ total: 1, rows: [sodRow(1)] }));

    const first = await runFDICPartition({ dataset: 'sod', partition: '2024', store, fetchPage });
    expect(first).toMatchObject({
      done: false,
      status: 'reconciling',
      publication_phase: 'materialize',
      rows_materialized: 1
    });

    const second = await runFDICPartition({ dataset: 'sod', partition: '2024', store, fetchPage });
    expect(second).toMatchObject({ done: true, status: 'complete', publication_phase: 'complete' });
    expect(fetchPage).toHaveBeenCalledTimes(1);
  });

  it('preserves raw history identifiers and retroactive events without inventing mappings', async () => {
    const store = new MemoryStore();
    store.staleRows = 0;
    await runFDICPartition({
      dataset: 'history',
      partition: '2026',
      store,
      fetchPage: async () => ({
        total: 1,
        rows: [{
          ID: '06359cacef93779869d0e9d7a77c89e1',
          CERT: null,
          UNINUM: 687198,
          FI_UNINUM: 417,
          ACQ_UNINUM: 0,
          OUT_UNINUM: 0,
          INSTNAME: 'Raw institution label',
          EFFDATE: '1999-11-29T00:00:00',
          PROCDATE: '2026-08-30T00:00:00',
          EFFYEAR: '1999',
          PROCYEAR: '2026'
        }]
      })
    });
    const staged = JSON.parse([...store.staged.values()][0]) as Record<string, unknown>;
    expect(staged).toMatchObject({
      id: '06359cacef93779869d0e9d7a77c89e1',
      cert: null,
      uninum: 687198,
      fi_uninum: 417,
      acq_uninum: 0,
      out_uninum: 0,
      inst_name: 'Raw institution label',
      eff_year: 1999,
      proc_year: 2026
    });
    expect(staged).not.toHaveProperty('acq_cert');
    expect(staged).not.toHaveProperty('out_name');
  });

  it('keeps annual CB and SI rows in distinct natural-key partitions', async () => {
    const keys: string[] = [];
    for (const charter of ['CB', 'SI'] as const) {
      const store = new MemoryStore();
      await runFDICPartition({
        dataset: 'annual-summary',
        partition: `2024:${charter}`,
        store,
        fetchPage: async () => ({ total: 1, rows: [{ STALP: 'VA', YEAR: '2024', CB_SI: charter }] })
      });
      keys.push([...store.staged.keys()][0]);
    }
    expect(keys).toEqual(['2024|CB|VA', '2024|SI|VA']);
  });
});
