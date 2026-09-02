import type { WorkspaceMetric } from "./workspace-data";
import { researchMetricDefinition } from "$lib/research-metrics";

export type DistributionScaleKind = "linear" | "log-size";

export interface DistributionScale {
  kind: DistributionScaleKind;
  label: string;
  explanation: string;
  transformedMin: number;
  transformedMax: number;
  nonPositiveCount: number;
  positiveFloor: number | null;
  valueMin: number | null;
  valueMax: number | null;
  spanRatio: number | null;
}

export interface DistributionScaleOptions {
  /** Smallest max/min ratio that warrants a log scale. */
  logSpanThreshold?: number;
}

export interface DistributionScalePosition {
  percent: number;
  edge: "low" | "high" | null;
  edgeLabel: "Low edge" | "High edge" | null;
  isOutsideScale: boolean;
}

export interface RelativeStanding {
  kind: "below" | "within" | "above" | "unavailable";
  countAtOrBelow: number;
  percentile: number | null;
}

export type PeerComparatorKey = string | number;

export interface PeerComparatorObservation {
  key: PeerComparatorKey;
  value: number | null | undefined;
}

export interface PeerComparatorSubject extends PeerComparatorObservation {}

export type PeerComparatorAvailability =
  "available" | "no-peer-values" | "no-subject-value";

export type PeerComparatorMembership = "member" | "off-cohort";

export type PeerComparatorRelation =
  "below" | "within" | "above" | "unavailable";

export type PeerPlacementBand =
  | "below-range"
  | "low-outlier"
  | "lower-quarter"
  | "middle-half"
  | "upper-quarter"
  | "high-outlier"
  | "above-range"
  | "unavailable";

export interface PeerDistributionSummary {
  peerCount: number;
  missingPeerCount: number;
  duplicatePeerCount: number;
  distinctValueCount: number;
  min: number | null;
  q1: number | null;
  median: number | null;
  q3: number | null;
  max: number | null;
  iqr: number | null;
  lowerOutlierFence: number | null;
  upperOutlierFence: number | null;
}

export interface PeerComparatorRank {
  /** Competition rank with the highest value first. */
  rank: number;
  peerCount: number;
  tieCount: number;
  percentile: number;
  percentileMethod: "exact-empirical-midrank";
}

export interface PeerComparatorRelativePosition {
  relation: PeerComparatorRelation;
  countBelow: number;
  countEqual: number;
  countAbove: number;
  countAtOrBelow: number;
}

export interface PeerComparatorPlacement {
  band: PeerPlacementBand;
  label:
    | "Below peer range"
    | "Low outlier"
    | "Lower quarter"
    | "Middle half"
    | "Upper quarter"
    | "High outlier"
    | "Above peer range"
    | "Not available";
  detail: string;
  edge: "low" | "high" | null;
  isOutlier: boolean;
  isOutsideRange: boolean;
}

/** Copy can be rendered unchanged in both the distribution and evidence rail. */
export interface PeerComparatorLanguage {
  membershipLabel: "Cohort member" | "Outside cohort";
  positionLabel: string;
  detail: string;
  ariaLabel: string;
}

export interface PeerComparatorResult {
  availability: PeerComparatorAvailability;
  membership: PeerComparatorMembership;
  subjectValue: number | null;
  summary: PeerDistributionSummary;
  relative: PeerComparatorRelativePosition;
  rank: PeerComparatorRank | null;
  placement: PeerComparatorPlacement;
  language: PeerComparatorLanguage;
}

function isSizeMetric(metric: WorkspaceMetric): boolean {
  const definition = researchMetricDefinition(metric);
  return (
    definition.unit === "usd_thousands" &&
    definition.change === "percent_change"
  );
}

function finite(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function transform(value: number, scale: DistributionScale): number {
  if (scale.kind === "linear") return value;
  if (value > 0) return Math.log10(value);
  return Math.log10(scale.positiveFloor ?? 1) - 1;
}

function quantile(ordered: readonly number[], fraction: number): number | null {
  if (!ordered.length) return null;
  if (ordered.length === 1) return ordered[0];
  const index = (ordered.length - 1) * fraction;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return ordered[lower];
  const weight = index - lower;
  return ordered[lower] * (1 - weight) + ordered[upper] * weight;
}

function roundedPercent(value: number): number {
  return Math.round(value * 10) / 10;
}

export function createDistributionScale(
  values: number[],
  metric: WorkspaceMetric,
  options: DistributionScaleOptions = {},
): DistributionScale {
  const finiteValues = values.filter(Number.isFinite);
  const positiveValues = finiteValues.filter((value) => value > 0);
  const valueMin = finiteValues.length ? Math.min(...finiteValues) : null;
  const valueMax = finiteValues.length ? Math.max(...finiteValues) : null;
  const allPositive =
    finiteValues.length > 0 && positiveValues.length === finiteValues.length;
  const spanRatio =
    allPositive && valueMin !== null && valueMax !== null
      ? valueMax / valueMin
      : null;
  const requestedThreshold = options.logSpanThreshold ?? 10;
  const logSpanThreshold =
    Number.isFinite(requestedThreshold) && requestedThreshold > 1
      ? requestedThreshold
      : 10;

  if (
    isSizeMetric(metric) &&
    allPositive &&
    spanRatio !== null &&
    spanRatio >= logSpanThreshold
  ) {
    const positiveFloor = valueMin;
    const transformed = finiteValues.map((value) => Math.log10(value));
    return {
      kind: "log-size",
      label: "Log size scale",
      explanation: "Equal spacing represents a tenfold change.",
      transformedMin: Math.min(...transformed),
      transformedMax: Math.max(...transformed),
      nonPositiveCount: 0,
      positiveFloor,
      valueMin,
      valueMax,
      spanRatio,
    };
  }

  return {
    kind: "linear",
    label: "Linear scale",
    explanation: "Equal spacing represents an equal change in value.",
    transformedMin: valueMin ?? 0,
    transformedMax: valueMax ?? 1,
    nonPositiveCount: finiteValues.length - positiveValues.length,
    positiveFloor: null,
    valueMin,
    valueMax,
    spanRatio,
  };
}

export function locateOnDistributionScale(
  value: number,
  scale: DistributionScale,
  inset = 6,
): DistributionScalePosition {
  const safeInset = Number.isFinite(inset)
    ? Math.max(0, Math.min(49, inset))
    : 6;
  const transformedValue = transform(value, scale);
  const span = scale.transformedMax - scale.transformedMin;
  const isBelow = scale.valueMin !== null && value < scale.valueMin;
  const isAbove = scale.valueMax !== null && value > scale.valueMax;

  if (!Number.isFinite(value) || !Number.isFinite(span) || span === 0) {
    return {
      percent: 50,
      edge: isBelow ? "low" : isAbove ? "high" : null,
      edgeLabel: isBelow ? "Low edge" : isAbove ? "High edge" : null,
      isOutsideScale: isBelow || isAbove,
    };
  }

  const position =
    safeInset +
    ((transformedValue - scale.transformedMin) / span) * (100 - safeInset * 2);
  return {
    percent: Math.max(safeInset, Math.min(100 - safeInset, position)),
    edge: isBelow ? "low" : isAbove ? "high" : null,
    edgeLabel: isBelow ? "Low edge" : isAbove ? "High edge" : null,
    isOutsideScale: isBelow || isAbove,
  };
}

export function positionOnDistributionScale(
  value: number,
  scale: DistributionScale,
  inset = 6,
): number {
  return locateOnDistributionScale(value, scale, inset).percent;
}

export function relativeStanding(
  values: number[],
  value: number,
): RelativeStanding {
  const ordered = values.filter(Number.isFinite).toSorted((a, b) => a - b);
  if (!ordered.length || !Number.isFinite(value)) {
    return { kind: "unavailable", countAtOrBelow: 0, percentile: null };
  }
  if (value < ordered[0]) {
    return { kind: "below", countAtOrBelow: 0, percentile: null };
  }
  if (value > ordered[ordered.length - 1]) {
    return {
      kind: "above",
      countAtOrBelow: ordered.length,
      percentile: null,
    };
  }
  const countAtOrBelow = ordered.filter(
    (candidate) => candidate <= value,
  ).length;
  return {
    kind: "within",
    countAtOrBelow,
    percentile: Math.round((countAtOrBelow / ordered.length) * 100),
  };
}

/** Rank by value with the highest value first. Equal values share a rank. */
export function descendingValueRank(values: number[], value: number): number {
  if (!Number.isFinite(value)) return 0;
  return (
    1 +
    values.filter(
      (candidate) => Number.isFinite(candidate) && candidate > value,
    ).length
  );
}

function emptySummary(
  missingPeerCount: number,
  duplicatePeerCount: number,
): PeerDistributionSummary {
  return {
    peerCount: 0,
    missingPeerCount,
    duplicatePeerCount,
    distinctValueCount: 0,
    min: null,
    q1: null,
    median: null,
    q3: null,
    max: null,
    iqr: null,
    lowerOutlierFence: null,
    upperOutlierFence: null,
  };
}

function unavailableRelative(): PeerComparatorRelativePosition {
  return {
    relation: "unavailable",
    countBelow: 0,
    countEqual: 0,
    countAbove: 0,
    countAtOrBelow: 0,
  };
}

function unavailablePlacement(): PeerComparatorPlacement {
  return {
    band: "unavailable",
    label: "Not available",
    detail: "Peer placement is not available.",
    edge: null,
    isOutlier: false,
    isOutsideRange: false,
  };
}

function unavailableLanguage(
  membership: PeerComparatorMembership,
  availability: Exclude<PeerComparatorAvailability, "available">,
): PeerComparatorLanguage {
  const membershipLabel =
    membership === "member" ? "Cohort member" : "Outside cohort";
  const detail =
    availability === "no-peer-values"
      ? "No peer values are available for this period."
      : "This bank has no reported value for this period.";
  return {
    membershipLabel,
    positionLabel: "Peer standing unavailable",
    detail,
    ariaLabel: `${membershipLabel}. Peer standing unavailable. ${detail}`,
  };
}

function placementFor(
  value: number,
  summary: PeerDistributionSummary,
): PeerComparatorPlacement {
  const { min, q1, q3, max, lowerOutlierFence, upperOutlierFence } = summary;
  if (
    min === null ||
    q1 === null ||
    q3 === null ||
    max === null ||
    lowerOutlierFence === null ||
    upperOutlierFence === null
  ) {
    return unavailablePlacement();
  }
  if (value < min) {
    const isOutlier = value < lowerOutlierFence;
    return {
      band: "below-range",
      label: "Below peer range",
      detail: isOutlier
        ? "Below the lowest peer value and the lower outlier fence."
        : "Below the lowest peer value.",
      edge: "low",
      isOutlier,
      isOutsideRange: true,
    };
  }
  if (value > max) {
    const isOutlier = value > upperOutlierFence;
    return {
      band: "above-range",
      label: "Above peer range",
      detail: isOutlier
        ? "Above the highest peer value and the upper outlier fence."
        : "Above the highest peer value.",
      edge: "high",
      isOutlier,
      isOutsideRange: true,
    };
  }
  if (value < lowerOutlierFence) {
    return {
      band: "low-outlier",
      label: "Low outlier",
      detail: "Below the lower outlier fence.",
      edge: "low",
      isOutlier: true,
      isOutsideRange: false,
    };
  }
  if (value > upperOutlierFence) {
    return {
      band: "high-outlier",
      label: "High outlier",
      detail: "Above the upper outlier fence.",
      edge: "high",
      isOutlier: true,
      isOutsideRange: false,
    };
  }
  if (value < q1) {
    return {
      band: "lower-quarter",
      label: "Lower quarter",
      detail: "Between the peer minimum and first quartile.",
      edge: null,
      isOutlier: false,
      isOutsideRange: false,
    };
  }
  if (value <= q3) {
    return {
      band: "middle-half",
      label: "Middle half",
      detail: "Within the middle half of peer values.",
      edge: null,
      isOutlier: false,
      isOutsideRange: false,
    };
  }
  return {
    band: "upper-quarter",
    label: "Upper quarter",
    detail: "Between the third quartile and peer maximum.",
    edge: null,
    isOutlier: false,
    isOutsideRange: false,
  };
}

/**
 * Build one bounded, deterministic description of a subject against a peer set.
 *
 * Peer keys are de-duplicated by first occurrence. A subject is a cohort member
 * only when its key is present in that de-duplicated set. Member values come from
 * the peer observation, which keeps rank and displayed cohort evidence aligned.
 */
export function createPeerComparator(
  peers: readonly PeerComparatorObservation[],
  subject: PeerComparatorSubject,
): PeerComparatorResult {
  const uniquePeers = new Map<PeerComparatorKey, number | null>();
  let duplicatePeerCount = 0;
  for (const peer of peers) {
    if (uniquePeers.has(peer.key)) {
      duplicatePeerCount += 1;
      continue;
    }
    uniquePeers.set(peer.key, finite(peer.value) ? peer.value : null);
  }

  const membership: PeerComparatorMembership = uniquePeers.has(subject.key)
    ? "member"
    : "off-cohort";
  const peerEntries = [...uniquePeers.entries()];
  const missingPeerCount = peerEntries.filter(
    ([, value]) => value === null,
  ).length;
  const values = peerEntries
    .map(([, value]) => value)
    .filter((value): value is number => value !== null)
    .toSorted((a, b) => a - b);
  const subjectValue =
    membership === "member"
      ? (uniquePeers.get(subject.key) ?? null)
      : finite(subject.value)
        ? subject.value
        : null;

  if (!values.length) {
    const summary = emptySummary(missingPeerCount, duplicatePeerCount);
    return {
      availability: "no-peer-values",
      membership,
      subjectValue,
      summary,
      relative: unavailableRelative(),
      rank: null,
      placement: unavailablePlacement(),
      language: unavailableLanguage(membership, "no-peer-values"),
    };
  }

  const q1 = quantile(values, 0.25) as number;
  const median = quantile(values, 0.5) as number;
  const q3 = quantile(values, 0.75) as number;
  const iqr = q3 - q1;
  const summary: PeerDistributionSummary = {
    peerCount: values.length,
    missingPeerCount,
    duplicatePeerCount,
    distinctValueCount: new Set(values).size,
    min: values[0],
    q1,
    median,
    q3,
    max: values.at(-1) as number,
    iqr,
    lowerOutlierFence: q1 - iqr * 1.5,
    upperOutlierFence: q3 + iqr * 1.5,
  };

  if (subjectValue === null) {
    return {
      availability: "no-subject-value",
      membership,
      subjectValue,
      summary,
      relative: unavailableRelative(),
      rank: null,
      placement: unavailablePlacement(),
      language: unavailableLanguage(membership, "no-subject-value"),
    };
  }

  const countBelow = values.filter((value) => value < subjectValue).length;
  const countEqual = values.filter((value) => value === subjectValue).length;
  const countAbove = values.length - countBelow - countEqual;
  const relation: PeerComparatorRelation =
    subjectValue < values[0]
      ? "below"
      : subjectValue > values[values.length - 1]
        ? "above"
        : "within";
  const relative: PeerComparatorRelativePosition = {
    relation,
    countBelow,
    countEqual,
    countAbove,
    countAtOrBelow: countBelow + countEqual,
  };
  const placement = placementFor(subjectValue, summary);

  if (membership === "member") {
    const rank = 1 + countAbove;
    const percentile = roundedPercent(
      ((countBelow + countEqual / 2) / values.length) * 100,
    );
    const rankResult: PeerComparatorRank = {
      rank,
      peerCount: values.length,
      tieCount: countEqual,
      percentile,
      percentileMethod: "exact-empirical-midrank",
    };
    const tieDetail =
      countEqual > 1
        ? `Highest value ranks first; tied with ${countEqual - 1} ${countEqual === 2 ? "peer" : "peers"}.`
        : "Highest value ranks first.";
    const language: PeerComparatorLanguage = {
      membershipLabel: "Cohort member",
      positionLabel: `Rank ${rank} of ${values.length}`,
      detail: tieDetail,
      ariaLabel: `Cohort member. Rank ${rank} of ${values.length}. ${tieDetail}`,
    };
    return {
      availability: "available",
      membership,
      subjectValue,
      summary,
      relative,
      rank: rankResult,
      placement,
      language,
    };
  }

  const peerLabel = values.length === 1 ? "peer" : "peers";
  const positionLabel =
    relation === "below"
      ? values.length === 1
        ? "Below the only peer"
        : `Below all ${values.length} peers`
      : relation === "above"
        ? values.length === 1
          ? "Above the only peer"
          : `Above all ${values.length} peers`
        : "Within the peer range";
  const detail =
    relation === "below"
      ? "This bank is outside the cohort. Its value is below every peer value."
      : relation === "above"
        ? "This bank is outside the cohort. Its value is above every peer value."
        : `This bank is outside the cohort. ${countBelow + countEqual} of ${values.length} ${peerLabel} ${values.length === 1 ? "is" : "are"} at or below this value.`;
  const language: PeerComparatorLanguage = {
    membershipLabel: "Outside cohort",
    positionLabel,
    detail,
    ariaLabel: `Outside cohort. ${positionLabel}. ${detail}`,
  };
  return {
    availability: "available",
    membership,
    subjectValue,
    summary,
    relative,
    rank: null,
    placement,
    language,
  };
}
