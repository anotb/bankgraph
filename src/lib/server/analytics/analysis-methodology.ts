import type {
  AnomalyMethodology,
  AnomalyResponse,
  RiskMethodology,
  RiskResponse
} from '$lib/types';

export const RISK_METHOD_VERSION = 'risk-proxy-v2';
export const ANOMALY_METHOD_VERSION = 'anomaly-signals-v2';
export const RISK_COMPONENTS = ['capital', 'asset_quality', 'earnings', 'liquidity'] as const;
export const MIN_RISK_COMPOSITE_COMPONENTS = 3;

export type RiskComponent = (typeof RISK_COMPONENTS)[number];
export type RiskComponentScores = Pick<RiskResponse['scores'], RiskComponent | 'composite'>;

export function riskComponentCoverage(
  scores: RiskComponentScores
): RiskMethodology['coverage'] {
  const includedComponents = RISK_COMPONENTS.filter((component) => scores[component] != null);
  const missingComponents = RISK_COMPONENTS.filter((component) => scores[component] == null);
  const availableComponents = includedComponents.length;
  const totalComponents = RISK_COMPONENTS.length;
  const compositeStatus = availableComponents < MIN_RISK_COMPOSITE_COMPONENTS || scores.composite == null
    ? 'unavailable'
    : availableComponents === totalComponents
      ? 'complete'
      : 'partial';

  return {
    available_components: availableComponents,
    total_components: totalComponents,
    ratio: availableComponents / totalComponents,
    required_components: MIN_RISK_COMPOSITE_COMPONENTS,
    included_components: includedComponents,
    missing_components: missingComponents,
    composite_status: compositeStatus
  };
}

export interface RiskHistoryComparison {
  status: 'comparable' | 'coverage_changed' | 'insufficient_composite_history';
  coverage_signatures: string[];
  method: string;
}

export function buildRiskHistoryComparison(
  points: RiskComponentScores[]
): RiskHistoryComparison {
  const coverages = points.map(riskComponentCoverage);
  const signatures = [...new Set(coverages.map((coverage) => coverage.included_components.join('|')))];
  const hasCompositeHistory = points.length >= 2 && points.every((point) => point.composite != null);
  const status = signatures.length > 1
    ? 'coverage_changed'
    : hasCompositeHistory
      ? 'comparable'
      : 'insufficient_composite_history';

  return {
    status,
    coverage_signatures: signatures,
    method: 'Composite points are charted only when every quarter uses the same components. Peer-ranked components remain relative to their same-quarter asset cohort.'
  };
}

export function buildRiskMethodology(scores: RiskResponse['scores']): RiskMethodology {
  return {
    version: RISK_METHOD_VERSION,
    method: 'Capital uses disclosed reference thresholds. Asset quality, earnings, and liquidity use exact same-quarter empirical ranks within each FDIC-derived asset bucket; tied values share the midpoint of their cohort positions. Bankgraph calculates the composite when at least three of four components are available and renormalizes the published weights over those components. This public-data proxy is not an official PCA, supervisory, credit, or failure-risk determination.',
    peer_percentile_method: 'exact_empirical_midrank',
    peer_cohort: 'same_period_asset_bucket',
    coverage: riskComponentCoverage(scores)
  };
}

export function buildAnomalyMethodology(
  coverage: AnomalyMethodology['coverage']
): AnomalyResponse['methodology'] {
  return {
    version: ANOMALY_METHOD_VERSION,
    method: 'Direction-aware quarter changes, median/MAD peer rarity when sufficiently covered, capital reference thresholds, and trend reversals.',
    coverage
  };
}
