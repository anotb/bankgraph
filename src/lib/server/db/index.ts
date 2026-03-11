/**
 * D1 database helpers for SvelteKit + Cloudflare Workers.
 *
 * Usage in a +server.ts or +page.server.ts:
 *   const db = getDB(platform);
 *   const rows = await queryAll<Institution>(db, 'SELECT * FROM institutions WHERE state = ?', ['CA']);
 */

const BATCH_CHUNK_SIZE = 50;

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
 * Uses INSERT OR REPLACE so rows with existing PKs are updated.
 * Chunks into groups of 50 rows per statement to stay within D1 limits.
 */
export async function batchInsert(
  db: D1Database,
  table: string,
  rows: Record<string, unknown>[]
): Promise<void> {
  if (rows.length === 0) return;

  // Use the keys from the first row as the column set
  const columns = Object.keys(rows[0]);
  const placeholders = columns.map(() => '?').join(', ');
  const sql = `INSERT OR REPLACE INTO ${table} (${columns.join(', ')}) VALUES (${placeholders})`;

  for (let i = 0; i < rows.length; i += BATCH_CHUNK_SIZE) {
    const chunk = rows.slice(i, i + BATCH_CHUNK_SIZE);
    const statements = chunk.map((row) => {
      const values = columns.map((col) => row[col] ?? null);
      return db.prepare(sql).bind(...values);
    });
    await db.batch(statements);
  }
}
