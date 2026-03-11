import { error } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';
import type { Institution } from '$lib/types';
import { getDB, queryOne, queryAll } from '$lib/server/db';

interface AnomalyCounts {
  critical: number;
  warning: number;
  info: number;
}

export const load: LayoutServerLoad = async ({ params, platform }) => {
  const cert = parseInt(params.cert, 10);
  if (isNaN(cert)) {
    error(404, 'Bank not found');
  }

  const db = getDB(platform);
  const bank = await queryOne<Institution>(
    db,
    'SELECT * FROM institutions WHERE cert = ?',
    [cert]
  );

  if (!bank) {
    error(404, 'Bank not found');
  }

  // Fetch anomaly counts for header badge
  let anomalyCounts: AnomalyCounts | null = null;
  try {
    const rows = await queryAll<{ severity: string; cnt: number }>(
      db,
      `SELECT severity, COUNT(*) as cnt FROM anomalies WHERE cert = ? GROUP BY severity`,
      [cert]
    );
    if (rows.length > 0) {
      anomalyCounts = { critical: 0, warning: 0, info: 0 };
      for (const r of rows) {
        if (r.severity === 'critical') anomalyCounts.critical = r.cnt;
        else if (r.severity === 'warning') anomalyCounts.warning = r.cnt;
        else if (r.severity === 'info') anomalyCounts.info = r.cnt;
      }
    }
  } catch {
    // anomalies table may not exist yet
  }

  return { bank, anomalyCounts };
};
