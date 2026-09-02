/**
 * Anomaly detection for bank financial metrics.
 * Implements four detection strategies:
 *   1. QoQ spike detection (absolute threshold breaches)
 *   2. Peer rarity detection (median/MAD where coverage supports it)
 *   3. Capital ratio reference-threshold breach
 *   4. Trend reversal (sign change in regression slope)
 */

import { queryAll, execute, batchInsert } from '$lib/server/db';
import { MAD_TO_STD, mad, median } from './robust-stats';

const BANK_BATCH_SIZE = 200;
const MIN_ROBUST_PEERS = 20;

const LOW_IS_ADVERSE = new Set(['roa', 'roe', 'nimy', 'rbcrwaj', 'eqv']);
const HIGH_IS_ADVERSE = new Set(['nclnlsr', 'eeffr', 'lnlsdepr']);
const CAPITAL_RATIO_METRICS = new Set(['rbcrwaj', 'rbc1rwaj', 'rbc1aaj']);

export type SignalDirection = 'adverse' | 'favorable' | 'indeterminate';
type SignalSeverity = 'critical' | 'warning' | 'info';

export function classifySignalDirection(metric: string, delta: number): SignalDirection {
  if (LOW_IS_ADVERSE.has(metric)) return delta < 0 ? 'adverse' : 'favorable';
  if (HIGH_IS_ADVERSE.has(metric)) return delta > 0 ? 'adverse' : 'favorable';
  return 'indeterminate';
}

/** Statistical rarity alone is never a critical condition. */
export function severityForStatisticalSignal(direction: SignalDirection): Exclude<SignalSeverity, 'critical'> {
  return direction === 'adverse' ? 'warning' : 'info';
}

export function isUsableMetricValue(metric: string, value: number | null | undefined): value is number {
  if (value == null || !Number.isFinite(value)) return false;
  // A zero capital ratio is commonly an inapplicable/unreported form value. This
  // dataset does not carry enough numerator/denominator applicability evidence
  // to prove it is a genuine zero.
  if (CAPITAL_RATIO_METRICS.has(metric) && value <= 0) return false;
  return true;
}

interface AnomalyRow {
  [key: string]: unknown;
  cert: number;
  repdte: string;
  metric: string;
  anomaly_type: string;
  severity: SignalSeverity;
  value: number | null;
  reference_value: number | null;
  delta: number | null;
  description: string;
}

// --- QoQ Spike Detection ---

interface SpikeThreshold {
  warning: number;
  large: number;
  /** Human-readable metric label */
  label: string;
}

const SPIKE_THRESHOLDS: Record<string, SpikeThreshold> = {
  roa: { warning: 0.30, large: 0.60, label: 'Return on Assets' },
  roe: { warning: 3.0, large: 6.0, label: 'Return on Equity' },
  nimy: { warning: 0.20, large: 0.50, label: 'Net Interest Margin' },
  nclnlsr: { warning: 1.0, large: 3.0, label: 'Non-Current Loans Ratio' },
  rbcrwaj: { warning: 2.0, large: 5.0, label: 'Total Risk-Based Capital Ratio' }
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
      if (!isUsableMetricValue(metric, curr) || !isUsableMetricValue(metric, prev)) continue;

      const delta = curr - prev;
      const change = Math.abs(delta);
      const threshold = SPIKE_THRESHOLDS[metric];
      const direction = curr > prev ? 'increased' : 'decreased';
      const signalDirection = classifySignalDirection(metric, delta);

      if (change >= threshold.warning) {
        const rarity = change >= threshold.large ? 'large' : 'unusual';
        anomalies.push({
          cert: row.cert,
          repdte,
          metric,
          anomaly_type: `qoq_${signalDirection}_movement`,
          severity: severityForStatisticalSignal(signalDirection),
          value: curr,
          reference_value: prev,
          delta,
          description: `${threshold.label} ${direction} by ${change.toFixed(2)}% QoQ; ${rarity} movement in a ${signalDirection} direction`
        });
      }
    }
  }

  return anomalies;
}

// --- Peer Outlier Detection ---

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

interface PeerStatsRow {
  peer_group: string;
  metric: string;
  mean: number;
  stddev: number;
}

export interface PeerReferenceStats {
  center: number;
  scale: number;
  count: number;
  method: 'median_mad' | 'mean_stdev';
}

export function buildPeerReferenceStats(
  peerStats: PeerStatsRow[],
  observations: Array<Record<string, number | null>>
): Map<string, PeerReferenceStats> {
  const valuesByKey = new Map<string, number[]>();
  for (const row of observations) {
    const bucket = row.asset_bucket;
    if (bucket == null) continue;
    for (const metric of PEER_METRICS) {
      const value = row[metric];
      if (!isUsableMetricValue(metric, value)) continue;
      const key = `asset_bucket:${bucket}:${metric}`;
      const values = valuesByKey.get(key) ?? [];
      values.push(value);
      valuesByKey.set(key, values);
    }
  }

  const result = new Map<string, PeerReferenceStats>();
  for (const stats of peerStats) {
    const key = `${stats.peer_group}:${stats.metric}`;
    const values = valuesByKey.get(key) ?? [];
    if (values.length >= MIN_ROBUST_PEERS) {
      const center = median(values);
      const dispersion = mad(values);
      const scale = dispersion == null ? null : dispersion * MAD_TO_STD;
      if (center != null && scale != null && scale > 0) {
        result.set(key, { center, scale, count: values.length, method: 'median_mad' });
        continue;
      }
    }

    if (Number.isFinite(stats.mean) && Number.isFinite(stats.stddev) && stats.stddev > 0) {
      result.set(key, {
        center: stats.mean,
        scale: stats.stddev,
        count: values.length,
        method: 'mean_stdev'
      });
    }
  }
  return result;
}

async function detectPeerOutliers(db: D1Database, repdte: string): Promise<AnomalyRow[]> {
  const anomalies: AnomalyRow[] = [];

  // Get peer stats for this quarter
  const [peerStats, peerObservations] = await Promise.all([
    queryAll<PeerStatsRow>(
      db,
      'SELECT peer_group, metric, mean, stddev FROM peer_stats WHERE repdte = ?',
      [repdte]
    ),
    queryAll<Record<string, number | null>>(
      db,
      `SELECT asset_bucket, ${PEER_METRICS.join(', ')}
       FROM financials WHERE repdte = ? AND asset_bucket IS NOT NULL`,
      [repdte]
    )
  ]);
  const statsMap = buildPeerReferenceStats(peerStats, peerObservations);

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
        if (!isUsableMetricValue(metric, value)) continue;

        const stats = statsMap.get(`${peerGroup}:${metric}`);
        if (!stats) continue;

        const zScore = (value - stats.center) / stats.scale;
        const absZ = Math.abs(zScore);

        // Determine if this is an adverse direction
        const isAdverse =
          (LOW_IS_ADVERSE.has(metric) && zScore < 0) ||
          (HIGH_IS_ADVERSE.has(metric) && zScore > 0);

        // Moderate rarity is actionable only in an adverse direction. Extreme
        // favorable rarity remains informational and can never be critical.
        if (absZ < 2.0) continue;
        if (absZ < 3.0 && !isAdverse) continue;

        const direction = zScore > 0 ? 'above' : 'below';
        const label = METRIC_LABELS[metric] || metric;

        const signalDirection: SignalDirection = isAdverse ? 'adverse' : 'favorable';
        const referenceLabel = stats.method === 'median_mad' ? 'peer median' : 'peer mean';
        const deviationLabel = stats.method === 'median_mad' ? 'robust deviations' : 'standard deviations';
        anomalies.push({
          cert,
          repdte,
          metric,
          anomaly_type: `peer_${signalDirection}_outlier`,
          severity: severityForStatisticalSignal(signalDirection),
          value,
          reference_value: stats.center,
          delta: zScore,
          description: `${label} is statistically ${absZ >= 3 ? 'rare' : 'unusual'} in a ${signalDirection} direction: ${absZ.toFixed(1)} ${deviationLabel} ${direction} ${referenceLabel} (${value.toFixed(2)}% vs ${stats.center.toFixed(2)}%; n=${stats.count})`
        });
      }
    }

    offset += BANK_BATCH_SIZE;
    if (banks.length < BANK_BATCH_SIZE) break;
  }

  return anomalies;
}

// --- Capital Ratio Reference Thresholds ---

interface CapitalReferenceThresholds {
  metric: string;
  well_cap: number;
  adequately_cap: number;
  label: string;
}

const CAPITAL_REFERENCE_THRESHOLDS: CapitalReferenceThresholds[] = [
  { metric: 'rbcrwaj', well_cap: 10, adequately_cap: 8, label: 'Total Risk-Based Capital' },
  { metric: 'rbc1rwaj', well_cap: 8, adequately_cap: 6, label: 'Tier 1 Risk-Based Capital' },
  { metric: 'rbc1aaj', well_cap: 5, adequately_cap: 4, label: 'Leverage Ratio' }
];

export function classifyCapitalReferenceSeverity(
  value: number | null | undefined,
  adequatelyCapitalized: number,
  wellCapitalized: number
): SignalSeverity | null {
  if (!isUsableMetricValue('rbcrwaj', value)) return null;
  if (value < adequatelyCapitalized) return 'critical';
  if (value < wellCapitalized) return 'warning';
  if (value - wellCapitalized < 1) return 'info';
  return null;
}

async function detectCapitalReferenceBreaches(db: D1Database, repdte: string): Promise<AnomalyRow[]> {
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
      for (const threshold of CAPITAL_REFERENCE_THRESHOLDS) {
        const value = bank[threshold.metric as keyof typeof bank] as number | null;
        if (!isUsableMetricValue(threshold.metric, value)) continue;
        const severity = classifyCapitalReferenceSeverity(
          value,
          threshold.adequately_cap,
          threshold.well_cap
        );
        if (severity == null) continue;

        if (value < threshold.adequately_cap) {
          anomalies.push({
            cert: bank.cert,
            repdte,
            metric: threshold.metric,
            anomaly_type: 'capital_ratio_reference_breach',
            severity,
            value,
            reference_value: threshold.adequately_cap,
            delta: value - threshold.adequately_cap,
            description: `${threshold.label} at ${value.toFixed(2)}% is below the minimum capital reference threshold of ${threshold.adequately_cap}%; verify source applicability before interpreting`
          });
        } else if (value < threshold.well_cap) {
          anomalies.push({
            cert: bank.cert,
            repdte,
            metric: threshold.metric,
            anomaly_type: 'capital_ratio_reference_breach',
            severity,
            value,
            reference_value: threshold.well_cap,
            delta: value - threshold.well_cap,
            description: `${threshold.label} at ${value.toFixed(2)}% is below the upper capital reference threshold of ${threshold.well_cap}%`
          });
        } else if (value - threshold.well_cap < 1.0) {
          const buffer = value - threshold.well_cap;
          anomalies.push({
            cert: bank.cert,
            repdte,
            metric: threshold.metric,
            anomaly_type: 'capital_ratio_reference_buffer',
            severity,
            value,
            reference_value: threshold.well_cap,
            delta: buffer,
            description: `${threshold.label} at ${value.toFixed(2)}% is ${(buffer * 100).toFixed(0)}bps above the upper capital reference threshold of ${threshold.well_cap}%`
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
    const signalDirection = classifySignalDirection(r.metric, r.curr_slope);
    const avgR2 = (r.curr_r2 + r.prev_r2) / 2;

    if (avgR2 > 0.5) {
      anomalies.push({
        cert: r.cert,
        repdte,
        metric: r.metric,
        anomaly_type: 'trend_reversal',
        severity: severityForStatisticalSignal(signalDirection),
        value: r.curr_slope,
        reference_value: r.prev_slope,
        delta: r.curr_slope - r.prev_slope,
        description: `${label} trend reversed to ${direction}, a ${signalDirection} direction (slope: ${r.prev_slope.toFixed(4)} -> ${r.curr_slope.toFixed(4)}, R²: ${avgR2.toFixed(2)})`
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
  const [spikes, peerOutliers, capitalReferenceBreaches, reversals] = await Promise.all([
    detectQoQSpikes(db, repdte),
    detectPeerOutliers(db, repdte),
    detectCapitalReferenceBreaches(db, repdte),
    detectTrendReversals(db, repdte)
  ]);

  const allAnomalies = [...spikes, ...peerOutliers, ...capitalReferenceBreaches, ...reversals];

  if (allAnomalies.length > 0) {
    // anomalies table uses AUTOINCREMENT id; we already DELETE for this quarter above,
    // so plain INSERT is fine (no upsert needed)
    await batchInsert(db, 'anomalies', allAnomalies);
  }

  return allAnomalies.length;
}
