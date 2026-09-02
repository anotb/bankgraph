import { DatabaseSync, type StatementSync } from 'node:sqlite';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  D1FDICIngestStore,
  runFDICPartition,
  type FDICPartitionResult
} from './fdic-partitioned-ingest';

type SqlValue = string | number | bigint | Uint8Array | null;

class TestStatement {
  constructor(
    private readonly statement: StatementSync,
    private readonly params: SqlValue[] = [],
    readonly sql = ''
  ) {}

  bind(...params: unknown[]): TestStatement {
    return new TestStatement(this.statement, params as SqlValue[], this.sql);
  }

  async first<T>(): Promise<T | null> {
    return (this.statement.get(...this.params) as T | undefined) ?? null;
  }

  async all<T>(): Promise<D1Result<T>> {
    return {
      results: this.statement.all(...this.params) as T[],
      success: true,
      meta: { changes: 0 }
    } as D1Result<T>;
  }

  async run(): Promise<D1Result> {
    const result = this.statement.run(...this.params);
    return {
      success: true,
      meta: { changes: Number(result.changes) }
    } as D1Result;
  }
}

class TestD1 {
  readonly sqlite = new DatabaseSync(':memory:');
  beforeBatch: ((statements: TestStatement[]) => void) | undefined;

  prepare(sql: string): TestStatement {
    return new TestStatement(this.sqlite.prepare(sql), [], sql);
  }

  async batch(statements: D1PreparedStatement[]): Promise<D1Result[]> {
    const testStatements = statements as unknown as TestStatement[];
    this.beforeBatch?.(testStatements);
    this.sqlite.exec('BEGIN');
    try {
      const results: D1Result[] = [];
      for (const statement of testStatements) {
        results.push(await statement.run());
      }
      this.sqlite.exec('COMMIT');
      return results;
    } catch (error) {
      this.sqlite.exec('ROLLBACK');
      throw error;
    }
  }

  close(): void {
    this.sqlite.close();
  }

  asD1(): D1Database {
    return this as unknown as D1Database;
  }
}

const databases: TestD1[] = [];

afterEach(() => {
  while (databases.length > 0) databases.pop()?.close();
});

function createDatabase(): TestD1 {
  const db = new TestD1();
  databases.push(db);
  db.sqlite.exec(`
    CREATE TABLE institutions (
      cert INTEGER PRIMARY KEY,
      rssd_id INTEGER,
      name TEXT NOT NULL,
      city TEXT,
      state TEXT,
      zip TEXT,
      county TEXT,
      charter_class TEXT,
      regulator TEXT,
      active INTEGER DEFAULT 1,
      established_date TEXT,
      insured_date TEXT,
      holding_company TEXT,
      hc_rssd_id INTEGER,
      asset_tier INTEGER,
      total_assets INTEGER,
      total_deposits INTEGER,
      num_branches INTEGER,
      num_employees INTEGER,
      latest_repdte TEXT,
      latest_roa REAL,
      latest_roe REAL,
      latest_nim REAL,
      latest_npl_ratio REAL,
      latest_tier1_ratio REAL,
      source_run_id TEXT,
      source_retrieved_at TEXT,
      source_snapshot TEXT
    );
    CREATE INDEX idx_inst_source_run_cert ON institutions(source_run_id, cert);

    CREATE TABLE fdic_ingest_runs (
      run_id TEXT PRIMARY KEY,
      dataset TEXT NOT NULL,
      partition_key TEXT NOT NULL,
      source_endpoint TEXT NOT NULL,
      status TEXT NOT NULL,
      started_at TEXT NOT NULL,
      retrieved_at TEXT NOT NULL,
      completed_at TEXT,
      source_total INTEGER,
      rows_seen INTEGER NOT NULL DEFAULT 0,
      rows_published INTEGER,
      rows_deleted INTEGER NOT NULL DEFAULT 0,
      key_first TEXT,
      key_last TEXT,
      error TEXT,
      publication_phase TEXT,
      previous_run_id TEXT,
      rows_materialized INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE fdic_ingest_partitions (
      dataset TEXT NOT NULL,
      partition_key TEXT NOT NULL,
      run_id TEXT NOT NULL,
      status TEXT NOT NULL,
      checkpoint INTEGER NOT NULL DEFAULT 0,
      source_total INTEGER,
      rows_seen INTEGER NOT NULL DEFAULT 0,
      rows_deleted INTEGER NOT NULL DEFAULT 0,
      key_first TEXT,
      key_last TEXT,
      retrieved_at TEXT NOT NULL,
      published_at TEXT,
      error TEXT,
      lease_token TEXT,
      lease_expires_at TEXT,
      publication_phase TEXT,
      publication_cursor TEXT,
      previous_run_id TEXT,
      rows_materialized INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (dataset, partition_key)
    ) WITHOUT ROWID;
    CREATE TABLE fdic_ingest_stage (
      run_id TEXT NOT NULL,
      row_key TEXT NOT NULL,
      row_json TEXT NOT NULL,
      PRIMARY KEY (run_id, row_key)
    ) WITHOUT ROWID;
    CREATE TABLE fdic_dataset_publications (
      dataset TEXT NOT NULL,
      partition_key TEXT NOT NULL,
      run_id TEXT NOT NULL,
      source_endpoint TEXT NOT NULL,
      source_total INTEGER NOT NULL,
      row_count INTEGER NOT NULL,
      key_first TEXT,
      key_last TEXT,
      period_min TEXT,
      period_max TEXT,
      retrieved_at TEXT NOT NULL,
      published_at TEXT NOT NULL,
      PRIMARY KEY (dataset, partition_key)
    ) WITHOUT ROWID;
    CREATE TABLE release_control (
      singleton INTEGER PRIMARY KEY,
      state TEXT NOT NULL
    );
    INSERT INTO release_control (singleton, state) VALUES (1, 'refreshing');
  `);
  return db;
}

function paddedCert(cert: number): string {
  return String(cert).padStart(12, '0');
}

function stagedInstitution(cert: number, runId: string, snapshot: string): Record<string, unknown> {
  return {
    cert,
    rssd_id: cert + 100_000,
    name: `New Bank ${cert}`,
    city: 'Richmond',
    state: 'VA',
    zip: '23219',
    county: 'Richmond City',
    charter_class: 'SM',
    regulator: 'FDIC',
    active: 1,
    established_date: '20000101',
    insured_date: '20000101',
    holding_company: null,
    hc_rssd_id: null,
    asset_tier: 3,
    total_assets: cert * 100,
    total_deposits: cert * 80,
    num_branches: 1,
    num_employees: 10,
    source_run_id: runId,
    source_retrieved_at: '2026-08-30T19:54:12.691Z',
    source_snapshot: snapshot
  };
}

function seedResumableRun(db: TestD1): { runId: string; snapshot: string } {
  const runId = 'ed920938-fc38-4ed1-a32d-7c29f67b71d5';
  const snapshot = '2026-08-28';
  const total = 1_001;
  const insertOld = db.sqlite.prepare(`
    INSERT INTO institutions (
      cert, name, active, latest_repdte, latest_roa, source_run_id, source_snapshot
    ) VALUES (?, ?, 1, '20260630', 1.25, NULL, NULL)
  `);
  const insertStage = db.sqlite.prepare(
    'INSERT INTO fdic_ingest_stage (run_id, row_key, row_json) VALUES (?, ?, ?)'
  );
  db.sqlite.exec('BEGIN');
  for (let cert = 1; cert <= total; cert += 1) {
    insertOld.run(cert, `Old Bank ${cert}`);
  }
  for (let cert = 2; cert <= total + 1; cert += 1) {
    insertStage.run(runId, paddedCert(cert), JSON.stringify(stagedInstitution(cert, runId, snapshot)));
  }
  db.sqlite.exec('COMMIT');
  db.sqlite.prepare(`
    INSERT INTO fdic_ingest_runs (
      run_id, dataset, partition_key, source_endpoint, status, started_at,
      retrieved_at, source_total, rows_seen, key_first, key_last
    ) VALUES (?, 'institutions', ?, 'https://api.fdic.gov/banks/institutions',
      'running', ?, ?, ?, ?, ?, ?)
  `).run(
    runId,
    snapshot,
    '2026-08-30T19:54:12.691Z',
    '2026-08-30T19:54:12.691Z',
    total,
    total,
    paddedCert(2),
    paddedCert(total + 1)
  );
  db.sqlite.prepare(`
    INSERT INTO fdic_ingest_partitions (
      dataset, partition_key, run_id, status, checkpoint, source_total, rows_seen,
      key_first, key_last, retrieved_at
    ) VALUES ('institutions', ?, ?, 'running', ?, ?, ?, ?, ?, ?)
  `).run(
    snapshot,
    runId,
    total,
    total,
    total,
    paddedCert(2),
    paddedCert(total + 1),
    '2026-08-30T19:54:12.691Z'
  );
  return { runId, snapshot };
}

describe('bounded institution publication', () => {
  it('does not mutate typed rows when the partition lease is lost', async () => {
    const testDb = createDatabase();
    const { runId, snapshot } = seedResumableRun(testDb);
    testDb.beforeBatch = (statements) => {
      if (!statements[0]?.sql.includes('INSERT INTO institutions')) return;
      testDb.beforeBatch = undefined;
      testDb.sqlite.prepare(
        "UPDATE fdic_ingest_partitions SET lease_token = NULL WHERE dataset = 'institutions'"
      ).run();
    };

    await expect(runFDICPartition({
      dataset: 'institutions',
      partition: snapshot,
      store: new D1FDICIngestStore(testDb.asD1(), () => new Date('2026-08-30T20:00:00.000Z')),
      fetchPage: async () => { throw new Error('unexpected source fetch'); }
    })).rejects.toThrow('already being processed');

    expect(testDb.sqlite.prepare(
      'SELECT COUNT(*) AS count FROM institutions WHERE source_run_id = ?'
    ).get(runId)).toEqual({ count: 0 });
    expect(testDb.sqlite.prepare(
      'SELECT rows_materialized, publication_phase FROM fdic_ingest_partitions'
    ).get()).toEqual({ rows_materialized: 0, publication_phase: 'materialize' });
    expect(testDb.sqlite.prepare('SELECT COUNT(*) AS count FROM fdic_ingest_stage').get())
      .toEqual({ count: 1_001 });
    expect(testDb.sqlite.prepare('SELECT COUNT(*) AS count FROM fdic_dataset_publications').get())
      .toEqual({ count: 0 });
  });

  it('resumes a fully staged run, withholds publication, and reconciles exact keys', async () => {
    const testDb = createDatabase();
    const { runId, snapshot } = seedResumableRun(testDb);
    const db = testDb.asD1();
    const fetchPage = vi.fn(async () => {
      throw new Error('a fully staged run must not refetch the source');
    });
    const results: FDICPartitionResult[] = [];

    for (let step = 0; step < 10; step += 1) {
      const result = await runFDICPartition({
        dataset: 'institutions',
        partition: snapshot,
        store: new D1FDICIngestStore(db, () => new Date('2026-08-30T20:00:00.000Z')),
        fetchPage
      });
      results.push(result);
      const publicationCount = testDb.sqlite.prepare(
        "SELECT COUNT(*) AS count FROM fdic_dataset_publications WHERE dataset = 'institutions'"
      ).get() as { count: number };
      if (result.publication_phase !== 'cleanup-stage' && !result.done) {
        expect(publicationCount.count).toBe(0);
      }
      if (!result.done) {
        expect(testDb.sqlite.prepare('SELECT status FROM fdic_ingest_runs WHERE run_id = ?')
          .get(runId)).not.toEqual({ status: 'complete' });
      }
      expect(testDb.sqlite.prepare('SELECT state FROM release_control WHERE singleton = 1').get())
        .toEqual({ state: 'refreshing' });
      if (result.done) break;
    }

    expect(fetchPage).not.toHaveBeenCalled();
    expect(results.at(-1)).toMatchObject({
      done: true,
      status: 'complete',
      source_total: 1_001,
      rows_published: 1_001,
      rows_deleted: 1,
      publication_phase: 'complete',
      rows_materialized: 1_001
    });
    expect(results.map((result) => result.publication_phase)).toEqual([
      'materialize',
      'compare',
      'switch',
      'cleanup-stage',
      'cleanup-stage',
      'complete'
    ]);

    const typed = testDb.sqlite.prepare(`
      SELECT COUNT(*) AS count, COUNT(DISTINCT cert) AS unique_count,
             MIN(cert) AS min_cert, MAX(cert) AS max_cert,
             COUNT(DISTINCT source_run_id) AS source_runs,
             MIN(source_snapshot) AS min_snapshot, MAX(source_snapshot) AS max_snapshot
      FROM institutions
    `).get() as Record<string, number | string>;
    expect(typed).toMatchObject({
      count: 1_001,
      unique_count: 1_001,
      min_cert: 2,
      max_cert: 1_002,
      source_runs: 1,
      min_snapshot: snapshot,
      max_snapshot: snapshot
    });
    expect(testDb.sqlite.prepare('SELECT COUNT(*) AS count FROM fdic_ingest_stage').get())
      .toEqual({ count: 0 });
    expect(testDb.sqlite.prepare('SELECT latest_repdte, latest_roa FROM institutions WHERE cert = 2').get())
      .toEqual({ latest_repdte: '20260630', latest_roa: 1.25 });
    expect(testDb.sqlite.prepare('SELECT * FROM fdic_dataset_publications').get())
      .toMatchObject({
        dataset: 'institutions',
        partition_key: snapshot,
        run_id: runId,
        source_total: 1_001,
        row_count: 1_001,
        key_first: paddedCert(2),
        key_last: paddedCert(1_002)
      });
    expect(testDb.sqlite.prepare('SELECT status, rows_deleted FROM fdic_ingest_runs WHERE run_id = ?')
      .get(runId)).toEqual({ status: 'complete', rows_deleted: 1 });
  });
});
