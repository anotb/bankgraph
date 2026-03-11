/**
 * Sync latest-quarter financial snapshot from FDIC into D1.
 * Discovers the most recent REPDTE, then pages through all financials
 * for that quarter and updates the institutions table.
 */

import { execute } from '$lib/server/db';
import { fetchLatestQuarter, fetchFinancialsForQuarter, delay } from './fdic-api';

const PAGE_SIZE = 10_000;
const BATCH_UPDATE_SIZE = 50;
const DELAY_BETWEEN_PAGES_MS = 100;

/**
 * Batch-update institutions with financial snapshot data.
 * Uses D1's batch API to run multiple UPDATE statements in one round-trip.
 */
async function batchUpdateFinancials(
  db: D1Database,
  rows: Array<{
    cert: number;
    repdte: string;
    roa: number | null;
    roe: number | null;
    nim: number | null;
    npl_ratio: number | null;
    tier1_ratio: number | null;
  }>
): Promise<void> {
  if (rows.length === 0) return;

  const sql = `UPDATE institutions SET latest_repdte = ?, latest_roa = ?, latest_roe = ?, latest_nim = ?, latest_npl_ratio = ?, latest_tier1_ratio = ? WHERE cert = ?`;

  for (let i = 0; i < rows.length; i += BATCH_UPDATE_SIZE) {
    const chunk = rows.slice(i, i + BATCH_UPDATE_SIZE);
    const statements = chunk.map((row) =>
      db
        .prepare(sql)
        .bind(row.repdte, row.roa, row.roe, row.nim, row.npl_ratio, row.tier1_ratio, row.cert)
    );
    await db.batch(statements);
  }
}

/**
 * Sync latest quarter financial snapshot into D1 institutions table.
 * Returns the number of institutions updated.
 */
export async function syncLatestFinancials(db: D1Database): Promise<number> {
  console.log('Discovering latest reporting quarter...');
  const latestQuarter = await fetchLatestQuarter();

  if (!latestQuarter) {
    console.log('No financials data found in FDIC API');
    return 0;
  }

  console.log(`Latest quarter: ${latestQuarter}`);

  let offset = 0;
  let totalUpdated = 0;

  while (true) {
    console.log(`Fetching financials for ${latestQuarter} offset=${offset}`);
    const response = await fetchFinancialsForQuarter(latestQuarter, offset, PAGE_SIZE);

    if (response.data.length === 0) break;

    const rows = response.data.map((item) => {
      const d = item.data;
      return {
        cert: Number(d.CERT),
        repdte: String(d.REPDTE ?? latestQuarter),
        roa: d.ROA != null ? Number(d.ROA) : null,
        roe: d.ROE != null ? Number(d.ROE) : null,
        nim: d.NIMY != null ? Number(d.NIMY) : null,
        npl_ratio: d.NCLNLSR != null ? Number(d.NCLNLSR) : null,
        tier1_ratio: d.RBCRWAJ != null ? Number(d.RBCRWAJ) : null
      };
    });

    await batchUpdateFinancials(db, rows);
    totalUpdated += rows.length;

    console.log(`Updated ${totalUpdated} financials so far`);

    if (response.data.length < PAGE_SIZE) break;

    offset += PAGE_SIZE;
    await delay(DELAY_BETWEEN_PAGES_MS);
  }

  // Update pipeline_state
  const now = new Date().toISOString();
  await execute(
    db,
    `INSERT OR REPLACE INTO pipeline_state (key, value, updated_at) VALUES (?, ?, ?)`,
    ['financials_last_sync', latestQuarter, now]
  );
  await execute(
    db,
    `INSERT OR REPLACE INTO pipeline_state (key, value, updated_at) VALUES (?, ?, ?)`,
    ['financials_count', String(totalUpdated), now]
  );

  console.log(`Financial snapshot sync complete: ${totalUpdated} rows for quarter ${latestQuarter}`);
  return totalUpdated;
}
