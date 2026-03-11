/**
 * Anomaly detection for bank financial metrics.
 * Implements four detection strategies:
 *   1. QoQ spike detection (absolute threshold breaches)
 *   2. Peer outlier detection (z-score vs peer group)
 *   3. PCA threshold breach (regulatory capital thresholds)
 *   4. Trend reversal (sign change in regression slope)
 */

import { queryAll, execute, batchInsert } from '$lib/server/db';

const BANK_BATCH_SIZE = 200;

interface AnomalyRow {
  [key: string]: unknown;
  cert: number;
  repdte: string;
  metric: string;
  anomaly_type: string;
  severity: string;
  value: number | null;
  reference_value: number | null;
  delta: number | null;
  description: string;
}

// --- QoQ Spike Detection ---

interface SpikeThreshold {
  warning: number;
  critical: number;
  /** Human-readable metric label */
  label: string;
}

const SPIKE_THRESHOLDS: Record<string, SpikeThreshold> = {
  roa: { warning: 0.30, critical: 0.60, label: 'Return on Assets' },
  roe: { warning: 3.0, critical: 6.0, label: 'Return on Equity' },
  nimy: { warning: 0.20, critical: 0.50, label: 'Net Interest Margin' },
  nclnlsr: { warning: 1.0, critical: 3.0, label: 'Non-Current Loans Ratio' },
  rbcrwaj: { warning: 2.0, critical: 5.0, label: 'Total Risk-Based Capital Ratio' }
};

async function detectQoQSpikes(db: D1Database, repdte: string): Promise<AnomalyRow[]> {
  const anomalies: AnomalyRow[] = [];

  // Get the previous quarter date
  const prevQ = await queryAll<{ repdte: string }>(
    db,
    'SELECT DISTINCT repdte FROM financials WHERE repdte < ? ORDER BY repdte DESC LIMIT 1',
    [repdte]
  );
  if (prevQ.length === 0) return anomalies;
  const prevRepdte = prevQ[0].repdte;

  const metrics = Object.keys(SPIKE_THRESHOLDS);
  const metricCols = metrics.join(', ');

  // Join current and previous quarter for all banks
  const rows = await queryAll<Record<string, number>>(
    db,
    `SELECT c.cert, ${metrics.map((m) => `c.${m} AS curr_${m}, p.${m} AS prev_${m}`).join(', ')}
     FROM financials c
     JOIN financials p ON c.cert = p.cert AND p.repdte = ?
     WHERE c.repdte = ?`,
    [prevRepdte, repdte]
  );

  for (const row of rows) {
    for (const metric of metrics) {
      const curr = row[`curr_${metric}`];
      const prev = row[`prev_${metric}`];
      if (curr == null || prev == null) continue;

      const change = Math.abs(curr - prev);
      const threshold = SPIKE_THRESHOLDS[metric];
      const direction = curr > prev ? 'increased' : 'decreased';

      if (change >= threshold.critical) {
        anomalies.push({
          cert: row.cert,
          repdte,
          metric,
          anomaly_type: 'qoq_spike',
          severity: 'critical',
          value: curr,
          reference_value: prev,
          delta: curr - prev,
          description: `${threshold.label} ${direction} by ${change.toFixed(2)}% QoQ (critical threshold: ${threshold.critical}%)`
        });
      } else if (change >= threshold.warning) {
        anomalies.push({
          cert: row.cert,
          repdte,
          metric,
          anomaly_type: 'qoq_spike',
          severity: 'warning',
          value: curr,
          reference_value: prev,
          delta: curr - prev,
          description: `${threshold.label} ${direction} by ${change.toFixed(2)}% QoQ (warning threshold: ${threshold.warning}%)`
        });
      }
    }
  }

  return anomalies;
}

// --- Peer Outlier Detection ---

/** Metrics where a low value is adverse (flag low outliers more aggressively) */
const LOW_IS_ADVERSE = new Set(['roa', 'roe', 'nimy', 'rbcrwaj', 'eqv']);
/** Metrics where a high value is adverse */
const HIGH_IS_ADVERSE = new Set(['nclnlsr', 'eeffr', 'lnlsdepr']);

const PEER_METRICS = ['roa', 'roe', 'nimy', 'eeffr', 'nclnlsr', 'rbcrwaj', 'lnlsdepr', 'eqv'] as const;

const METRIC_LABELS: Record<string, string> = {
  roa: 'Return on Assets',
  roe: 'Return on Equity',
  nimy: 'Net Interest Margin',
  eeffr: 'Efficiency Ratio',
  nclnlsr: 'Non-Current Loans Ratio',
  rbcrwaj: 'Total Risk-Based Capital Ratio',
  lnlsdepr: 'Loans-to-Deposits Ratio',
  eqv: 'Equity-to-Assets Ratio'
};

async function detectPeerOutliers(db: D1Database, repdte: string): Promise<AnomalyRow[]> {
  const anomalies: AnomalyRow[] = [];

  // Get peer stats for this quarter
  const peerStats = await queryAll<{
    peer_group: string;
    metric: string;
    mean: number;
    stddev: number;
  }>(
    db,
    'SELECT peer_group, metric, mean, stddev FROM peer_stats WHERE repdte = ? AND stddev > 0',
    [repdte]
  );

  // Index by peer_group:metric
  const statsMap = new Map<string, { mean: number; stddev: number }>();
  for (const ps of peerStats) {
    statsMap.set(`${ps.peer_group}:${ps.metric}`, { mean: ps.mean, stddev: ps.stddev });
  }

  // Process banks in batches
  let offset = 0;
  while (true) {
    const banks = await queryAll<Record<string, number | null>>(
      db,
      `SELECT cert, asset_bucket, ${PEER_METRICS.join(', ')}
       FROM financials WHERE repdte = ? AND asset_bucket IS NOT NULL
       ORDER BY cert LIMIT ? OFFSET ?`,
      [repdte, BANK_BATCH_SIZE, offset]
    );

    if (banks.length === 0) break;

    for (const bank of banks) {
      const cert = bank.cert as number;
      const bucket = bank.asset_bucket as number;
      const peerGroup = `asset_bucket:${bucket}`;

      for (const metric of PEER_METRICS) {
        const value = bank[metric];
        if (value == null) continue;

        const stats = statsMap.get(`${peerGroup}:${metric}`);
        if (!stats) continue;

        const zScore = (value - stats.mean) / stats.stddev;
        const absZ = Math.abs(zScore);

        // Determine if this is an adverse direction
        const isAdverse =
          (LOW_IS_ADVERSE.has(metric) && zScore < 0) ||
          (HIGH_IS_ADVERSE.has(metric) && zScore > 0);

        // Only flag if in adverse direction or extreme outlier
        if (absZ < 2.0) continue;
        if (absZ < 2.0 && !isAdverse) continue;

        const direction = zScore > 0 ? 'above' : 'below';
        const label = METRIC_LABELS[metric] || metric;

        if (absZ >= 3.0) {
          anomalies.push({
            cert,
            repdte,
            metric,
            anomaly_type: 'peer_outlier',
            severity: 'critical',
            value,
            reference_value: stats.mean,
            delta: zScore,
            description: `${label} is ${absZ.toFixed(1)} std devs ${direction} peer mean (${value.toFixed(2)}% vs peer ${stats.mean.toFixed(2)}%)`
          });
        } else {
          anomalies.push({
            cert,
            repdte,
            metric,
            anomaly_type: 'peer_outlier',
            severity: 'warning',
            value,
            reference_value: stats.mean,
            delta: zScore,
            description: `${label} is ${absZ.toFixed(1)} std devs ${direction} peer mean (${value.toFixed(2)}% vs peer ${stats.mean.toFixed(2)}%)`
          });
        }
      }
    }

    offset += BANK_BATCH_SIZE;
    if (banks.length < BANK_BATCH_SIZE) break;
  }

  return anomalies;
}

// --- PCA Threshold Breach ---

interface PCAThresholds {
  metric: string;
  well_cap: number;
  adequately_cap: number;
  label: string;
}

const PCA_THRESHOLDS: PCAThresholds[] = [
  { metric: 'rbcrwaj', well_cap: 10, adequately_cap: 8, label: 'Total Risk-Based Capital' },
  { metric: 'rbc1rwaj', well_cap: 8, adequately_cap: 6, label: 'Tier 1 Risk-Based Capital' },
  { metric: 'rbc1aaj', well_cap: 5, adequately_cap: 4, label: 'Leverage Ratio' }
];

async function detectPCABreaches(db: D1Database, repdte: string): Promise<AnomalyRow[]> {
  const anomalies: AnomalyRow[] = [];

  let offset = 0;
  while (true) {
    const banks = await queryAll<{
      cert: number;
      rbcrwaj: number | null;
      rbc1rwaj: number | null;
      rbc1aaj: number | null;
    }>(
      db,
      `SELECT cert, rbcrwaj, rbc1rwaj, rbc1aaj
       FROM financials WHERE repdte = ?
       ORDER BY cert LIMIT ? OFFSET ?`,
      [repdte, BANK_BATCH_SIZE, offset]
    );

    if (banks.length === 0) break;

    for (const bank of banks) {
      for (const pca of PCA_THRESHOLDS) {
        const value = bank[pca.metric as keyof typeof bank] as number | null;
        if (value == null) continue;

        if (value < pca.adequately_cap) {
          // Undercapitalized
          anomalies.push({
            cert: bank.cert,
            repdte,
            metric: pca.metric,
            anomaly_type: 'pca_breach',
            severity: 'critical',
            value,
            reference_value: pca.adequately_cap,
            delta: value - pca.adequately_cap,
            description: `${pca.label} at ${value.toFixed(2)}% is below adequately-capitalized threshold of ${pca.adequately_cap}%`
          });
        } else if (value < pca.well_cap) {
          // Below well-capitalized
          anomalies.push({
            cert: bank.cert,
            repdte,
            metric: pca.metric,
            anomaly_type: 'pca_breach',
            severity: 'critical',
            value,
            reference_value: pca.well_cap,
            delta: value - pca.well_cap,
            description: `${pca.label} at ${value.toFixed(2)}% is below well-capitalized threshold of ${pca.well_cap}%`
          });
        } else if (value - pca.well_cap < 1.0) {
          // Within 100bps of well-capitalized threshold
          const buffer = value - pca.well_cap;
          anomalies.push({
            cert: bank.cert,
            repdte,
            metric: pca.metric,
            anomaly_type: 'pca_breach',
            severity: 'warning',
            value,
            reference_value: pca.well_cap,
            delta: buffer,
            description: `${pca.label} at ${value.toFixed(2)}% is only ${(buffer * 100).toFixed(0)}bps above well-capitalized threshold of ${pca.well_cap}%`
          });
        }
      }
    }

    offset += BANK_BATCH_SIZE;
    if (banks.length < BANK_BATCH_SIZE) break;
  }

  return anomalies;
}

// --- Trend Reversal Detection ---

async function detectTrendReversals(db: D1Database, repdte: string): Promise<AnomalyRow[]> {
  const anomalies: AnomalyRow[] = [];

  // Get the previous quarter
  const prevQ = await queryAll<{ repdte: string }>(
    db,
    'SELECT DISTINCT repdte FROM bank_trends WHERE repdte < ? ORDER BY repdte DESC LIMIT 1',
    [repdte]
  );
  if (prevQ.length === 0) return anomalies;
  const prevRepdte = prevQ[0].repdte;

  // Find trends where slope changed sign and r_squared is meaningful
  const reversals = await queryAll<{
    cert: number;
    metric: string;
    curr_slope: number;
    prev_slope: number;
    curr_r2: number;
    prev_r2: number;
  }>(
    db,
    `SELECT c.cert, c.metric,
            c.trend_slope AS curr_slope, p.trend_slope AS prev_slope,
            c.trend_r_squared AS curr_r2, p.trend_r_squared AS prev_r2
     FROM bank_trends c
     JOIN bank_trends p ON c.cert = p.cert AND c.metric = p.metric AND p.repdte = ?
     WHERE c.repdte = ?
       AND c.trend_slope IS NOT NULL AND p.trend_slope IS NOT NULL
       AND ((c.trend_slope > 0 AND p.trend_slope < 0) OR (c.trend_slope < 0 AND p.trend_slope > 0))`,
    [prevRepdte, repdte]
  );

  for (const r of reversals) {
    const label = METRIC_LABELS[r.metric] || r.metric;
    const direction = r.curr_slope > 0 ? 'upward' : 'downward';
    const avgR2 = (r.curr_r2 + r.prev_r2) / 2;

    if (avgR2 > 0.5) {
      anomalies.push({
        cert: r.cert,
        repdte,
        metric: r.metric,
        anomaly_type: 'trend_reversal',
        severity: 'warning',
        value: r.curr_slope,
        reference_value: r.prev_slope,
        delta: r.curr_slope - r.prev_slope,
        description: `${label} trend reversed to ${direction} (slope: ${r.prev_slope.toFixed(4)} -> ${r.curr_slope.toFixed(4)}, R²: ${avgR2.toFixed(2)})`
      });
    } else if (avgR2 > 0.3) {
      anomalies.push({
        cert: r.cert,
        repdte,
        metric: r.metric,
        anomaly_type: 'trend_reversal',
        severity: 'info',
        value: r.curr_slope,
        reference_value: r.prev_slope,
        delta: r.curr_slope - r.prev_slope,
        description: `${label} trend may be reversing ${direction} (slope: ${r.prev_slope.toFixed(4)} -> ${r.curr_slope.toFixed(4)}, R²: ${avgR2.toFixed(2)})`
      });
    }
  }

  return anomalies;
}

// --- Main Entry Point ---

/**
 * Run all anomaly detection for a given quarter.
 * Clears existing anomalies for this quarter first, then runs all 4 detectors.
 * Returns total anomalies inserted.
 */
export async function detectAnomalies(db: D1Database, repdte: string): Promise<number> {
  // Clear previous anomalies for this quarter
  await execute(db, 'DELETE FROM anomalies WHERE repdte = ?', [repdte]);

  // Run all detection strategies
  const [spikes, peerOutliers, pcaBreaches, reversals] = await Promise.all([
    detectQoQSpikes(db, repdte),
    detectPeerOutliers(db, repdte),
    detectPCABreaches(db, repdte),
    detectTrendReversals(db, repdte)
  ]);

  const allAnomalies = [...spikes, ...peerOutliers, ...pcaBreaches, ...reversals];

  if (allAnomalies.length > 0) {
    await batchInsert(db, 'anomalies', allAnomalies);
  }

  return allAnomalies.length;
}
