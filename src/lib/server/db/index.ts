/**
 * D1 database helpers for SvelteKit + Cloudflare Workers.
 *
 * Usage in a +server.ts or +page.server.ts:
 *   const db = getDB(platform);
 *   const rows = await queryAll<Institution>(db, 'SELECT * FROM institutions WHERE state = ?', ['CA']);
 */

const BATCH_CHUNK_SIZE = 50;
const BULK_ROWS_PER_STATEMENT = 200;

function safeIdentifier(identifier: string): string {
  if (!/^[a-z_][a-z0-9_]*$/i.test(identifier)) {
    throw new Error(`Unsafe SQL identifier: ${identifier}`);
  }
  return identifier;
}

/**
 * Extract D1 database binding from the SvelteKit platform object.
 * Throws if platform or DB binding is unavailable (e.g. running outside Workers).
 */
export function getDB(platform: App.Platform | undefined): D1Database {
  if (!platform?.env?.DB) {
    throw new Error('D1 database binding not available. Are you running on Cloudflare Workers?');
  }
  return platform.env.DB;
}

/** Query a single row. Returns null if no rows match. */
export async function queryOne<T>(
  db: D1Database,
  sql: string,
  params: unknown[] = []
): Promise<T | null> {
  const result = await db.prepare(sql).bind(...params).first<T>();
  return result ?? null;
}

/** Query all matching rows. Returns empty array if none match. */
export async function queryAll<T>(
  db: D1Database,
  sql: string,
  params: unknown[] = []
): Promise<T[]> {
  const { results } = await db.prepare(sql).bind(...params).all<T>();
  return results ?? [];
}

/** Execute a statement (INSERT, UPDATE, DELETE). Returns D1Result with meta. */
export async function execute(
  db: D1Database,
  sql: string,
  params: unknown[] = []
): Promise<D1Result> {
  return db.prepare(sql).bind(...params).run();
}

/**
 * Batch insert rows into a table using D1's batch API.
 * When primaryKeys are provided, uses ON CONFLICT ... DO UPDATE SET for proper upsert
 * (preserves columns not included in the insert). Falls back to INSERT OR REPLACE
 * when no primaryKeys are given.
 * Chunks into groups of 50 statements per batch to stay within D1 limits.
 */
export async function batchInsert(
  db: D1Database,
  table: string,
  rows: Record<string, unknown>[],
  primaryKeys?: string[]
): Promise<void> {
  if (rows.length === 0) return;

  const columns = Object.keys(rows[0]);
  const placeholders = columns.map(() => '?').join(', ');

  let sql: string;
  if (primaryKeys && primaryKeys.length > 0) {
    const updateCols = columns.filter((c) => !primaryKeys.includes(c));
    const updateSet = updateCols.map((c) => `${c}=excluded.${c}`).join(', ');
    sql = `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${placeholders}) ON CONFLICT(${primaryKeys.join(', ')}) DO UPDATE SET ${updateSet}`;
  } else {
    sql = `INSERT OR REPLACE INTO ${table} (${columns.join(', ')}) VALUES (${placeholders})`;
  }

  for (let i = 0; i < rows.length; i += BATCH_CHUNK_SIZE) {
    const chunk = rows.slice(i, i + BATCH_CHUNK_SIZE);
    const statements = chunk.map((row) => {
      const values = columns.map((col) => row[col] ?? null);
      return db.prepare(sql).bind(...values);
    });
    await db.batch(statements);
  }
}

/**
 * Upsert rows using JSON1 so a group of rows consumes one bound parameter and
 * one D1 query. This remains compact even for wide tables such as financials,
 * where a conventional multi-value INSERT would hit SQLite's variable limit
 * after only one row. Identifiers are validated and values remain bound data.
 */
export async function bulkUpsert(
  db: D1Database,
  table: string,
  rows: Record<string, unknown>[],
  primaryKeys: string[]
): Promise<{ rows: number; statements: number }> {
  const plan = buildBulkUpsertPlan(table, rows, primaryKeys);
  if (plan.payloads.length === 0) return { rows: 0, statements: 0 };
  const statements = plan.payloads.map((payload) => db.prepare(plan.sql).bind(payload));

  for (let start = 0; start < statements.length; start += BATCH_CHUNK_SIZE) {
    await db.batch(statements.slice(start, start + BATCH_CHUNK_SIZE));
  }
  return { rows: rows.length, statements: statements.length };
}

export function buildBulkUpsertPlan(
  table: string,
  rows: Record<string, unknown>[],
  primaryKeys: string[]
): { sql: string; payloads: string[] } {
  if (rows.length === 0) return { sql: '', payloads: [] };
  if (primaryKeys.length === 0) throw new Error('bulkUpsert requires a natural key');

  const safeTable = safeIdentifier(table);
  const columns = Object.keys(rows[0]).map(safeIdentifier);
  const keys = primaryKeys.map(safeIdentifier);
  if (!keys.every((key) => columns.includes(key))) {
    throw new Error('Every primary key must be present in the upsert rows');
  }
  for (const row of rows) {
    if (Object.keys(row).length !== columns.length || !columns.every((column) => column in row)) {
      throw new Error('All bulkUpsert rows must have identical columns');
    }
  }

  const updateColumns = columns.filter((column) => !keys.includes(column));
  const updateSql = updateColumns.length > 0
    ? ` DO UPDATE SET ${updateColumns.map((column) => `${column}=excluded.${column}`).join(', ')}`
    : ' DO NOTHING';
  const payloads: string[] = [];
  const selectSql = columns
    .map((column) => `json_extract(value, '$.${column}')`)
    .join(', ');
  const sql = `INSERT INTO ${safeTable} (${columns.join(', ')}) SELECT ${selectSql} FROM json_each(?) WHERE json_type(value) = 'object' ON CONFLICT(${keys.join(', ')})${updateSql}`;

  for (let start = 0; start < rows.length; start += BULK_ROWS_PER_STATEMENT) {
    const group = rows.slice(start, start + BULK_ROWS_PER_STATEMENT);
    const payload = group.map((row) =>
      Object.fromEntries(columns.map((column) => [column, row[column] ?? null]))
    );
    payloads.push(JSON.stringify(payload));
  }
  return { sql, payloads };
}
