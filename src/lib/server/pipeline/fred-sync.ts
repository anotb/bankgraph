/**
 * FRED data sync pipeline.
 * Fetches macro series from FRED and stores in D1.
 */

import { queryOne, execute, batchInsert } from '$lib/server/db';
import { fetchSeriesObservations, fetchSeriesInfo, delay } from './fred-api';

/** Series to sync, organized by category */
const SERIES_BY_CATEGORY: Record<string, string[]> = {
  rates: ['FEDFUNDS', 'DFF', 'DGS10', 'DGS2', 'DGS30', 'T10Y2Y', 'MORTGAGE30US'],
  economy: ['UNRATE', 'GDP', 'CPIAUCSL', 'USREC'],
  banking: ['TOTBKCR', 'TLAACBW027SBOG', 'DRCCLACBS', 'DRSFRMACBS']
};

const DELAY_BETWEEN_SERIES_MS = 200;

export interface FredSyncResult {
  series: number;
  observations: number;
}

/**
 * Sync all configured FRED series into D1.
 * For each series: fetch metadata, check last observation, fetch new data, insert.
 */
export async function syncFredData(
  db: D1Database,
  apiKey: string
): Promise<FredSyncResult> {
  let totalSeries = 0;
  let totalObservations = 0;

  for (const [category, seriesIds] of Object.entries(SERIES_BY_CATEGORY)) {
    for (const seriesId of seriesIds) {
      try {
        console.log(`Syncing FRED series: ${seriesId} (${category})`);

        // Fetch and store series metadata
        const info = await fetchSeriesInfo(apiKey, seriesId);
        await execute(
          db,
          `INSERT OR REPLACE INTO fred_series (series_id, title, frequency, units, category)
           VALUES (?, ?, ?, ?, ?)`,
          [seriesId, info.title, info.frequency, info.units, category]
        );

        // Check last observation date for incremental sync
        const lastObs = await queryOne<{ date: string }>(
          db,
          `SELECT date FROM macro_data WHERE series_id = ? ORDER BY date DESC LIMIT 1`,
          [seriesId]
        );

        // Fetch observations (all if first run, or from last date)
        const observations = await fetchSeriesObservations(
          apiKey,
          seriesId,
          lastObs?.date ?? undefined
        );

        if (observations.length > 0) {
          // Batch insert into macro_data
          const rows = observations.map((obs) => ({
            series_id: seriesId,
            date: obs.date,
            value: obs.value
          }));
          await batchInsert(db, 'macro_data', rows);
        }

        totalSeries++;
        totalObservations += observations.length;
        console.log(`  ${seriesId}: ${observations.length} observations`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`  Failed to sync ${seriesId}: ${msg}`);
      }

      // Rate limit delay between series
      await delay(DELAY_BETWEEN_SERIES_MS);
    }
  }

  // Update pipeline state
  const now = new Date().toISOString();
  await execute(
    db,
    `INSERT OR REPLACE INTO pipeline_state (key, value, updated_at) VALUES (?, ?, ?)`,
    ['fred_last_sync', JSON.stringify({ series: totalSeries, observations: totalObservations }), now]
  );

  console.log(`FRED sync complete: ${totalSeries} series, ${totalObservations} observations`);
  return { series: totalSeries, observations: totalObservations };
}
