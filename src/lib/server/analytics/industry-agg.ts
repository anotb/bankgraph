/**
 * Compute industry-level aggregate metrics across bank segments.
 * Results are written to the agg_industry table.
 */

import { queryAll, execute } from '$lib/server/db';

interface SegmentDef {
  name: string;
  where: string;
  params: unknown[];
}

const SEGMENTS: SegmentDef[] = [
  { name: 'all', where: '1=1', params: [] },
  { name: 'community', where: 'asset_bucket IN (1,2,3)', params: [] },
  { name: 'regional', where: 'asset_bucket IN (4,5)', params: [] },
  { name: 'large', where: 'asset_bucket IN (6,7)', params: [] }
];

function medianOf(sorted: number[]): number {
  if (sorted.length === 0) return 0;
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid];
  return (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Compute industry aggregates for all segments for a given quarter.
 * Returns total rows inserted.
 */
export async function computeIndustryAggregates(db: D1Database, repdte: string): Promise<number> {
  let totalInserted = 0;

  for (const seg of SEGMENTS) {
    // total_assets: SUM(asset)
    const assetRows = await queryAll<{ total: number; cnt: number }>(
      db,
      `SELECT SUM(asset) as total, COUNT(DISTINCT cert) as cnt FROM financials WHERE ${seg.where} AND repdte = ?`,
      [...seg.params, repdte]
    );
    const totalAssets = assetRows[0]?.total ?? 0;
    const bankCount = assetRows[0]?.cnt ?? 0;

    // Insert total_assets
    await execute(
      db,
      `INSERT OR REPLACE INTO agg_industry (repdte, segment, metric, value, count) VALUES (?, ?, ?, ?, ?)`,
      [repdte, seg.name, 'total_assets', totalAssets, bankCount]
    );
    totalInserted++;

    // Insert bank_count
    await execute(
      db,
      `INSERT OR REPLACE INTO agg_industry (repdte, segment, metric, value, count) VALUES (?, ?, ?, ?, ?)`,
      [repdte, seg.name, 'bank_count', bankCount, bankCount]
    );
    totalInserted++;

    // Median metrics: roa, roe, nimy, nclnlsr (NPL ratio)
    const medianMetrics = [
      { metric: 'median_roa', column: 'roa' },
      { metric: 'median_roe', column: 'roe' },
      { metric: 'median_nim', column: 'nimy' },
      { metric: 'median_npl', column: 'nclnlsr' }
    ];

    for (const mm of medianMetrics) {
      const rows = await queryAll<Record<string, number>>(
        db,
        `SELECT ${mm.column} FROM financials WHERE ${seg.where} AND repdte = ? AND ${mm.column} IS NOT NULL ORDER BY ${mm.column}`,
        [...seg.params, repdte]
      );

      const values = rows.map((r) => r[mm.column]);
      const med = values.length > 0 ? medianOf(values) : null;

      await execute(
        db,
        `INSERT OR REPLACE INTO agg_industry (repdte, segment, metric, value, count) VALUES (?, ?, ?, ?, ?)`,
        [repdte, seg.name, mm.metric, med, values.length]
      );
      totalInserted++;
    }
  }

  return totalInserted;
}
