/**
 * Deterministic quarter-change attribution primitives.
 *
 * These functions do no causal inference. They reconcile reported FDIC values,
 * expose missing inputs, and calculate peer-relative movement from a cohort
 * frozen at the comparison period's opening quarter.
 */

import { compositionDefinition } from '$lib/analytics/composition';

export type NumericValue = number | null | undefined;

export interface AttributionRow {
  repdte: string;
  [key: string]: string | number | null | undefined;
}

export interface ComponentDefinition {
  key: string;
  label: string;
  sign?: 1 | -1;
}

export interface AttributionContribution {
  key: string;
  label: string;
  from: number | null;
  to: number | null;
  change: number | null;
  availability: 'reported' | 'missing';
  fromSource?: QuarterFlowMethod;
  toSource?: QuarterFlowMethod;
}

export interface AdditiveBridge {
  metric: string;
  unit: 'usd_thousands';
  from: { repdte: string; value: number | null };
  to: { repdte: string; value: number | null };
  totalChange: number | null;
  contributions: AttributionContribution[];
  residual: number | null;
  dataCoverage: number;
  attributedChangeShare: number | null;
  method: 'exact_difference_identity' | 'unavailable';
  reconciliation:
    | 'reconciled'
    | 'residual_present'
    | 'partial_inputs'
    | 'missing_total';
}

export type QuarterFlowMethod =
  | 'reported_single_quarter'
  | 'reported_ytd_first_quarter'
  | 'derived_from_consecutive_ytd'
  | 'unavailable';

export interface QuarterFlowResult {
  value: number | null;
  method: QuarterFlowMethod;
  reason: string | null;
}

export interface FlowDefinition extends ComponentDefinition {
  directKey: string;
  ytdKey: string;
}

export interface PeriodWithPrior {
  row: AttributionRow;
  previousRow?: AttributionRow | null;
}

export interface RatioAttribution {
  metric: 'loan_to_deposit';
  unit: 'percentage_points';
  from: number | null;
  to: number | null;
  totalChange: number | null;
  contributions: {
    numerator: number | null;
    denominator: number | null;
  };
  method: 'exact_two_factor_shapley' | 'unavailable';
  status: 'ok' | 'missing_input' | 'zero_denominator';
}

export interface PeerMovementRow {
  cert: number;
  assetBucket: number | null;
  fromValue: number | null;
  toValue: number | null;
}

export interface FrozenPeerMovement {
  metric: string;
  mode: 'percent_change' | 'point_change';
  fromRepdte: string;
  toRepdte: string;
  subjectMovement: number | null;
  peerMedian: number | null;
  subjectPercentile: number | null;
  peerCount: number;
  minimumPeerCount: number;
  cohort: {
    frozenAt: string;
    sourceAssetBucket: number | null;
    selectedAssetBuckets: number[];
    fallback: 'none' | 'broad_asset_band' | 'unavailable';
    subjectExcluded: true;
    requiresBothQuarters: true;
    hash: string | null;
  };
  status: 'ok' | 'insufficient_peers' | 'unavailable';
  warning: string | null;
}

const ASSET_COMPONENTS: ComponentDefinition[] = compositionDefinition('asset_mix').components
  .map((component) => ({ key: component.field, label: component.label }));

const FUNDING_COMPONENTS: ComponentDefinition[] = compositionDefinition('funding_mix').components
  .map((component) => ({ key: component.field, label: component.label }));

export const NET_INCOME_COMPONENTS: FlowDefinition[] = [
  { key: 'net_interest_income', label: 'Net interest income', directKey: 'nimq', ytdKey: 'nim', sign: 1 },
  { key: 'noninterest_income', label: 'Noninterest income', directKey: 'noniiq', ytdKey: 'nonii', sign: 1 },
  { key: 'noninterest_expense', label: 'Noninterest expense', directKey: 'nonixq', ytdKey: 'nonix', sign: -1 },
  { key: 'provision', label: 'Provision for credit losses', directKey: 'elnatq', ytdKey: 'elnatr', sign: -1 },
  { key: 'securities_gains', label: 'Securities gains or losses', directKey: 'iglsecq', ytdKey: 'iglsec', sign: 1 },
  { key: 'income_tax', label: 'Income tax expense', directKey: 'itaxq', ytdKey: 'itax', sign: -1 },
  { key: 'extraordinary_items', label: 'Extraordinary items', directKey: 'extraq', ytdKey: 'extra', sign: 1 }
];

function finite(value: NumericValue): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function signed(value: number, sign: 1 | -1 | undefined): number {
  return value * (sign ?? 1);
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function buildAdditiveBridge(
  metric: string,
  totalKey: string,
  components: ComponentDefinition[],
  from: AttributionRow,
  to: AttributionRow
): AdditiveBridge {
  const fromTotal = finite(from[totalKey] as NumericValue) ? (from[totalKey] as number) : null;
  const toTotal = finite(to[totalKey] as NumericValue) ? (to[totalKey] as number) : null;
  const totalChange = fromTotal !== null && toTotal !== null ? toTotal - fromTotal : null;

  let presentEndpoints = 0;
  let knownChange = 0;
  let absoluteKnownChange = 0;
  const contributions = components.map((component): AttributionContribution => {
    const fromValue = finite(from[component.key] as NumericValue)
      ? signed(from[component.key] as number, component.sign)
      : null;
    const toValue = finite(to[component.key] as NumericValue)
      ? signed(to[component.key] as number, component.sign)
      : null;
    if (fromValue !== null) presentEndpoints++;
    if (toValue !== null) presentEndpoints++;
    const change = fromValue !== null && toValue !== null ? toValue - fromValue : null;
    if (change !== null) {
      knownChange += change;
      absoluteKnownChange += Math.abs(change);
    }
    return {
      key: component.key,
      label: component.label,
      from: fromValue,
      to: toValue,
      change,
      availability: change === null ? 'missing' : 'reported'
    };
  });

  const dataCoverage = presentEndpoints / (components.length * 2);
  if (totalChange === null) {
    return {
      metric,
      unit: 'usd_thousands',
      from: { repdte: from.repdte, value: fromTotal },
      to: { repdte: to.repdte, value: toTotal },
      totalChange: null,
      contributions,
      residual: null,
      dataCoverage,
      attributedChangeShare: null,
      method: 'unavailable',
      reconciliation: 'missing_total'
    };
  }

  const residual = totalChange - knownChange;
  const changeMagnitude = absoluteKnownChange + Math.abs(residual);
  const attributedChangeShare = changeMagnitude === 0
    ? 1
    : clamp01(absoluteKnownChange / changeMagnitude);
  const allInputsPresent = presentEndpoints === components.length * 2;
  const tolerance = Math.max(1, Math.abs(totalChange) * 1e-10);

  return {
    metric,
    unit: 'usd_thousands',
    from: { repdte: from.repdte, value: fromTotal },
    to: { repdte: to.repdte, value: toTotal },
    totalChange,
    contributions,
    residual,
    dataCoverage,
    attributedChangeShare,
    method: 'exact_difference_identity',
    reconciliation: !allInputsPresent
      ? 'partial_inputs'
      : Math.abs(residual) <= tolerance
        ? 'reconciled'
        : 'residual_present'
  };
}

export function buildAssetBridge(from: AttributionRow, to: AttributionRow): AdditiveBridge {
  return buildAdditiveBridge('total_assets', 'asset', ASSET_COMPONENTS, from, to);
}

export function buildFundingBridge(from: AttributionRow, to: AttributionRow): AdditiveBridge {
  return buildAdditiveBridge('funding_and_equity', 'asset', FUNDING_COMPONENTS, from, to);
}

/** Return the preceding FDIC quarter-end date, or null for a malformed date. */
export function previousQuarterDate(repdte: string): string | null {
  const match = /^(\d{4})(0331|0630|0930|1231)$/.exec(repdte);
  if (!match) return null;
  const year = Number(match[1]);
  const ending = match[2];
  if (ending === '0331') return `${year - 1}1231`;
  if (ending === '0630') return `${year}0331`;
  if (ending === '0930') return `${year}0630`;
  return `${year}0930`;
}

export function isConsecutiveQuarter(fromRepdte: string, toRepdte: string): boolean {
  return previousQuarterDate(toRepdte) === fromRepdte;
}

function quarterNumber(repdte: string): number | null {
  const ending = repdte.slice(4);
  if (ending === '0331') return 1;
  if (ending === '0630') return 2;
  if (ending === '0930') return 3;
  if (ending === '1231') return 4;
  return null;
}

/**
 * Prefer an FDIC single-quarter field. Fall back to a YTD difference only when
 * the required observations are consecutive quarters in the same calendar year.
 */
export function resolveQuarterFlow(
  period: PeriodWithPrior,
  directKey: string,
  ytdKey: string
): QuarterFlowResult {
  const direct = period.row[directKey] as NumericValue;
  if (finite(direct)) {
    return { value: direct, method: 'reported_single_quarter', reason: null };
  }

  const currentYtd = period.row[ytdKey] as NumericValue;
  const quarter = quarterNumber(period.row.repdte);
  if (quarter === null) {
    return { value: null, method: 'unavailable', reason: 'invalid_reporting_date' };
  }
  if (!finite(currentYtd)) {
    return { value: null, method: 'unavailable', reason: 'missing_reported_flow' };
  }
  if (quarter === 1) {
    return { value: currentYtd, method: 'reported_ytd_first_quarter', reason: null };
  }

  const previous = period.previousRow;
  if (!previous || !isConsecutiveQuarter(previous.repdte, period.row.repdte)) {
    return { value: null, method: 'unavailable', reason: 'missing_consecutive_prior_quarter' };
  }
  if (previous.repdte.slice(0, 4) !== period.row.repdte.slice(0, 4)) {
    return { value: null, method: 'unavailable', reason: 'ytd_period_crosses_calendar_year' };
  }
  const previousYtd = previous[ytdKey] as NumericValue;
  if (!finite(previousYtd)) {
    return { value: null, method: 'unavailable', reason: 'missing_prior_ytd_flow' };
  }
  return {
    value: currentYtd - previousYtd,
    method: 'derived_from_consecutive_ytd',
    reason: null
  };
}

export function buildQuarterlyNetIncomeBridge(
  from: PeriodWithPrior,
  to: PeriodWithPrior
): AdditiveBridge {
  const fromTotal = resolveQuarterFlow(from, 'netincq', 'netinc');
  const toTotal = resolveQuarterFlow(to, 'netincq', 'netinc');
  const fromSynthetic: AttributionRow = { repdte: from.row.repdte, total: fromTotal.value };
  const toSynthetic: AttributionRow = { repdte: to.row.repdte, total: toTotal.value };
  const componentDefinitions: ComponentDefinition[] = [];
  const flowSources = new Map<string, { from: QuarterFlowMethod; to: QuarterFlowMethod }>();

  for (const definition of NET_INCOME_COMPONENTS) {
    const fromFlow = resolveQuarterFlow(from, definition.directKey, definition.ytdKey);
    const toFlow = resolveQuarterFlow(to, definition.directKey, definition.ytdKey);
    fromSynthetic[definition.key] = fromFlow.value;
    toSynthetic[definition.key] = toFlow.value;
    componentDefinitions.push({ key: definition.key, label: definition.label, sign: definition.sign });
    flowSources.set(definition.key, { from: fromFlow.method, to: toFlow.method });
  }

  const bridge = buildAdditiveBridge(
    'quarterly_net_income',
    'total',
    componentDefinitions,
    fromSynthetic,
    toSynthetic
  );
  bridge.contributions = bridge.contributions.map((contribution) => ({
    ...contribution,
    fromSource: flowSources.get(contribution.key)?.from,
    toSource: flowSources.get(contribution.key)?.to
  }));
  return bridge;
}

/** Exact symmetric Shapley decomposition for k*N/D across two observations. */
export function decomposeLoanToDeposit(
  loansFrom: NumericValue,
  loansTo: NumericValue,
  depositsFrom: NumericValue,
  depositsTo: NumericValue
): RatioAttribution {
  if (![loansFrom, loansTo, depositsFrom, depositsTo].every(finite)) {
    return {
      metric: 'loan_to_deposit',
      unit: 'percentage_points',
      from: null,
      to: null,
      totalChange: null,
      contributions: { numerator: null, denominator: null },
      method: 'unavailable',
      status: 'missing_input'
    };
  }
  const n0 = loansFrom as number;
  const n1 = loansTo as number;
  const d0 = depositsFrom as number;
  const d1 = depositsTo as number;
  if (d0 === 0 || d1 === 0) {
    return {
      metric: 'loan_to_deposit',
      unit: 'percentage_points',
      from: null,
      to: null,
      totalChange: null,
      contributions: { numerator: null, denominator: null },
      method: 'unavailable',
      status: 'zero_denominator'
    };
  }

  const scale = 100;
  const from = scale * n0 / d0;
  const to = scale * n1 / d1;
  const numerator = scale * (n1 - n0) / 2 * (1 / d0 + 1 / d1);
  const denominator = scale * (n0 + n1) / 2 * (1 / d1 - 1 / d0);

  return {
    metric: 'loan_to_deposit',
    unit: 'percentage_points',
    from,
    to,
    totalChange: to - from,
    contributions: { numerator, denominator },
    method: 'exact_two_factor_shapley',
    status: 'ok'
  };
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function stableHash(parts: Array<string | number>): string {
  const input = parts.join('|');
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `fnv1a32:${hash.toString(16).padStart(8, '0')}`;
}

function broadAssetBand(bucket: number): number[] {
  if (bucket <= 3) return [1, 2, 3];
  if (bucket <= 5) return [4, 5];
  return [6, 7];
}

function movement(from: number, to: number, mode: 'percent_change' | 'point_change'): number | null {
  if (mode === 'percent_change') return from === 0 ? null : ((to - from) / from) * 100;
  return to - from;
}

/**
 * Compare a subject movement with peers selected using only the opening
 * quarter's asset bucket. The subject is always removed, and a peer must have
 * observations in both quarters.
 */
export function buildFrozenPeerMovement(input: {
  metric: string;
  mode: 'percent_change' | 'point_change';
  fromRepdte: string;
  toRepdte: string;
  subjectCert: number;
  subjectAssetBucket: number | null;
  subjectFrom: number | null;
  subjectTo: number | null;
  rows: PeerMovementRow[];
  minimumPeerCount?: number;
}): FrozenPeerMovement {
  const minimumPeerCount = input.minimumPeerCount ?? 2;
  const unavailableCohort = {
    frozenAt: input.fromRepdte,
    sourceAssetBucket: input.subjectAssetBucket,
    selectedAssetBuckets: [] as number[],
    fallback: 'unavailable' as const,
    subjectExcluded: true as const,
    requiresBothQuarters: true as const,
    hash: null
  };
  if (
    input.subjectAssetBucket === null
    || !finite(input.subjectFrom)
    || !finite(input.subjectTo)
  ) {
    return {
      metric: input.metric,
      mode: input.mode,
      fromRepdte: input.fromRepdte,
      toRepdte: input.toRepdte,
      subjectMovement: null,
      peerMedian: null,
      subjectPercentile: null,
      peerCount: 0,
      minimumPeerCount,
      cohort: unavailableCohort,
      status: 'unavailable',
      warning: 'Subject values or opening-quarter asset bucket are missing.'
    };
  }
  const subjectMovement = movement(input.subjectFrom, input.subjectTo, input.mode);
  if (subjectMovement === null) {
    return {
      metric: input.metric,
      mode: input.mode,
      fromRepdte: input.fromRepdte,
      toRepdte: input.toRepdte,
      subjectMovement: null,
      peerMedian: null,
      subjectPercentile: null,
      peerCount: 0,
      minimumPeerCount,
      cohort: unavailableCohort,
      status: 'unavailable',
      warning: 'Percent change is undefined because the subject opening value is zero.'
    };
  }

  const usable = input.rows
    .filter((row) => row.cert !== input.subjectCert)
    .filter((row) => finite(row.fromValue) && finite(row.toValue))
    .map((row) => ({ ...row, movement: movement(row.fromValue as number, row.toValue as number, input.mode) }))
    .filter((row): row is typeof row & { movement: number } => row.movement !== null);

  const exactBuckets = [input.subjectAssetBucket];
  let selectedBuckets = exactBuckets;
  let fallback: 'none' | 'broad_asset_band' = 'none';
  let peers = usable.filter((row) => row.assetBucket === input.subjectAssetBucket);
  if (peers.length < minimumPeerCount) {
    selectedBuckets = broadAssetBand(input.subjectAssetBucket);
    fallback = 'broad_asset_band';
    peers = usable.filter((row) => row.assetBucket !== null && selectedBuckets.includes(row.assetBucket));
  }

  const movements = peers.map((row) => row.movement);
  const sortedCerts = peers.map((row) => row.cert).sort((a, b) => a - b);
  const hash = stableHash([
    'frozen-peer-v1',
    input.fromRepdte,
    input.toRepdte,
    input.metric,
    ...selectedBuckets,
    ...sortedCerts
  ]);
  const percentile = movements.length === 0
    ? null
    : (movements.filter((value) => value <= subjectMovement).length / movements.length) * 100;
  const adequate = peers.length >= minimumPeerCount;

  return {
    metric: input.metric,
    mode: input.mode,
    fromRepdte: input.fromRepdte,
    toRepdte: input.toRepdte,
    subjectMovement,
    peerMedian: median(movements),
    subjectPercentile: percentile,
    peerCount: peers.length,
    minimumPeerCount,
    cohort: {
      frozenAt: input.fromRepdte,
      sourceAssetBucket: input.subjectAssetBucket,
      selectedAssetBuckets: selectedBuckets,
      fallback,
      subjectExcluded: true,
      requiresBothQuarters: true,
      hash
    },
    status: adequate ? 'ok' : 'insufficient_peers',
    warning: adequate
      ? null
      : `Only ${peers.length} eligible peers were available; at least ${minimumPeerCount} are required.`
  };
}
