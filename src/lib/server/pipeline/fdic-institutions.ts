/**
 * Sync FDIC institution data into D1.
 * Paginates through the FDIC BankFind institutions endpoint,
 * maps fields to our schema, and batch-inserts into D1.
 */

import { batchInsert, execute } from '$lib/server/db';
import { fetchInstitutions, delay } from './fdic-api';

const PAGE_SIZE = 10_000;
const DELAY_BETWEEN_PAGES_MS = 100;

/** Compute asset tier from total_assets (in thousands of dollars) */
export function computeAssetTier(totalAssets: number | null): number | null {
  if (totalAssets == null) return null;
  if (totalAssets < 100_000) return 1;
  if (totalAssets < 300_000) return 2;
  if (totalAssets < 1_000_000) return 3;
  if (totalAssets < 10_000_000) return 4;
  if (totalAssets < 50_000_000) return 5;
  if (totalAssets < 250_000_000) return 6;
  return 7;
}

/** Map a raw FDIC record to our institution schema */
export function mapInstitution(raw: Record<string, unknown>): Record<string, unknown> {
  const totalAssets = raw.ASSET != null ? Number(raw.ASSET) : null;
  const activeValue = raw.ACTIVE != null ? (Number(raw.ACTIVE) === 1 ? 1 : 0) : 1;

  return {
    cert: Number(raw.CERT),
    rssd_id: raw.RSSDID != null ? Number(raw.RSSDID) : null,
    name: String(raw.NAME ?? ''),
    city: raw.CITY != null ? String(raw.CITY) : null,
    state: raw.STALP != null ? String(raw.STALP) : null,
    zip: raw.ZIP != null ? String(raw.ZIP) : null,
    county: raw.COUNTY != null ? String(raw.COUNTY) : null,
    charter_class: raw.CHRTAGNT != null ? String(raw.CHRTAGNT) : null,
    regulator: raw.REGAGNT != null ? String(raw.REGAGNT) : null,
    active: activeValue,
    established_date: raw.ESTYMD != null ? String(raw.ESTYMD) : null,
    insured_date: raw.INSDATE != null ? String(raw.INSDATE) : null,
    holding_company: raw.HCTMULT != null ? String(raw.HCTMULT) : null,
    hc_rssd_id: raw.RSSDHCR != null ? Number(raw.RSSDHCR) : null,
    asset_tier: computeAssetTier(totalAssets),
    total_assets: totalAssets,
    total_deposits: raw.DEP != null ? Number(raw.DEP) : null,
    num_branches: raw.OFFDOM != null ? Number(raw.OFFDOM) : null,
    num_employees: raw.NUMEMP != null ? Number(raw.NUMEMP) : null
  };
}

export interface SyncInstitutionsResult {
  inserted: number;
  updated: number;
}

/**
 * Fetch all institutions from FDIC API and upsert into D1.
 * Processes one page at a time to stay within Workers memory limits.
 */
export async function syncInstitutions(db: D1Database): Promise<SyncInstitutionsResult> {
  let offset = 0;
  let totalProcessed = 0;
  let totalCount = 0;

  console.log('Starting institution sync...');

  while (true) {
    console.log(`Fetching institutions offset=${offset} limit=${PAGE_SIZE}`);
    const response = await fetchInstitutions(offset, PAGE_SIZE);

    if (offset === 0) {
      totalCount = response.totals.count;
      console.log(`Total institutions in FDIC: ${totalCount}`);
    }

    if (response.data.length === 0) break;

    const rows = response.data.map((item) => mapInstitution(item.data));
    await batchInsert(db, 'institutions', rows, ['cert']);

    totalProcessed += rows.length;
    console.log(`Processed ${totalProcessed}/${totalCount} institutions`);

    // If we got fewer rows than the page size, we're done
    if (response.data.length < PAGE_SIZE) break;

    offset += PAGE_SIZE;
    await delay(DELAY_BETWEEN_PAGES_MS);
  }

  // Update pipeline_state
  const now = new Date().toISOString();
  await execute(
    db,
    `INSERT OR REPLACE INTO pipeline_state (key, value, updated_at) VALUES (?, ?, ?)`,
    ['institutions_last_sync', String(totalProcessed), now]
  );

  console.log(`Institution sync complete: ${totalProcessed} rows`);

  // INSERT OR REPLACE means we can't distinguish inserts from updates at the D1 level,
  // so we report totalProcessed as "inserted" (which includes updates).
  return { inserted: totalProcessed, updated: 0 };
}
