import {
  compareReportingQuarters,
  getWorkspaceComparisonPair,
  resolveWorkspaceComparisonQuarter,
  shiftReportingQuarter,
  trySerializeWorkspaceSearch,
  workspaceCommands,
  type BankScreenFilters,
  type CohortTrendResultSet,
  type MetricCondition,
  type PeerRecipe,
  type PinnedFinding,
  type ResultsMetadata,
  type WorkspaceChartHistory,
  type WorkspaceCommand,
  type WorkspaceCommandOptions,
  type WorkspaceCommandResult,
  type WorkspacePanel,
  type WorkspaceComparisonMode,
  type WorkspaceComparisonPair,
  type WorkspaceState,
  type CohortChangeAnalysisResult,
  type TemporalPatternAnalysisResult,
  type FinancialCompositionAnalysisResult,
  type FailurePatternAnalysisResult,
  type WorkspaceAnalysisResult,
  type AnalysisResultRef,
  type ResearchAnalysisView,
  type ResearchBoardSpan,
  createAnalysisResultRef,
  WORKSPACE_LIMITS,
} from "$lib/workspace/index.js";
import {
  BANK_SCREEN_METRICS,
  BANK_SCREEN_METRIC_RULES,
  BANK_SCREEN_TO_RESEARCH_METRIC,
  BANK_SCREEN_OPERATORS,
  BANK_SCREEN_SORTS,
  WORKSPACE_TO_BANK_SCREEN_METRIC,
  type BankScreenCondition,
  type BankScreenMetric,
  type BankScreenSort,
} from "$lib/bank-screen.js";
import {
  RESEARCH_METRICS as PRODUCT_RESEARCH_METRICS,
  RESEARCH_METRIC_IDS,
  canonicalResearchMetric,
  researchMetricDefinition,
  type ResearchMetric,
  type ResearchMetricDefinition,
} from "$lib/research-metrics.js";
import {
  arrayValue,
  booleanValue,
  cert,
  enumValue,
  finiteNumber,
  identifier,
  inputObject,
  integer,
  optionalNumber,
  optionalRevision,
  optionalString,
  reportingPeriod,
  stateCode,
  stringValue,
  unique,
  WebMcpInputError,
  WebMcpToolError,
  staleRevision,
} from "./runtime.js";
import {
  cohortIdentityKey,
  cursorOffset,
  decodeCursor,
  encodeCursor,
  pageItems,
  paginationKey,
} from "./pagination.js";
import {
  createResultEnvelope,
  MAX_WEBMCP_EXTENDED_ENVELOPE_CHARS,
} from "./envelope.js";
import type {
  TightJsonSchema,
  TightObjectSchema,
  WebMcpControllerContext,
  WebMcpDiagnosticsSnapshot,
  WebMcpToolDefinition,
} from "./types.js";
import { lineageHash, researchMetricAnalysisProvenance } from "$lib/provenance.js";
import {
  correlationInterpretationLabel,
  correlationInterpretationTier,
  MIN_CALCULABLE_CORRELATION_OBSERVATIONS,
} from "$lib/analytics/correlation-policy.js";
import type { CohortTransition } from "$lib/analytics/cohort-transition.js";
import type {
  TemporalGapPolicy,
  TemporalPatternResult,
  TemporalPatternSpec,
} from "$lib/analytics/temporal-patterns.js";
import type {
  CompositionChange,
  CompositionId,
  CompositionSnapshot,
} from "$lib/analytics/composition.js";
import type { FailurePatternsResponse } from "$lib/server/analytics/failure-patterns.js";
import {
  createResearchBoardWebMcpToolCatalog,
  type ResearchBoardWebMcpDependencies,
} from "./board-catalog.js";

const ACTIVE_VALUES = ["any", "active", "inactive"] as const;
const PEER_BASES = ["screen", "asset-range", "custom"] as const;
const PANELS = [
  "screen",
  "map",
  "bank",
  "compare",
  "peers",
  "charts",
  "findings",
] as const;
const LINKED_CHART_KINDS = ["line", "area"] as const;
const LINKED_CHART_SCALES = ["value", "index"] as const;
const FOCUS_MODES = ["keep", "set", "clear"] as const;
/** Prevent a single browser tool call from hydrating an unbounded peer-history set. */
export const WEBMCP_COHORT_ANALYSIS_LIMIT = 200;
const DEFAULT_BANK_PAGE_SIZE = 25;
const MAX_BANK_PAGE_SIZE = 50;
const SEARCH_RESULT_UNIVERSE_LIMIT = 1_000;
const DEFAULT_TREND_PAGE_SIZE = 20;
const DEFAULT_TREND_GROUP_PAGE_SIZE = 25;
const MAX_TREND_GROUP_PAGE_SIZE = 56;
const DEFAULT_RESULT_SET_PAGE_SIZE = 50;
const MAX_RESULT_SET_PAGE_SIZE = 100;
const DEFAULT_ANALYSIS_PAGE_SIZE = 25;
const MAX_ANALYSIS_PAGE_SIZE = 50;
const MAX_DISTRIBUTION_TAIL_BANKS = 10;
const CHANGE_ATTRIBUTION_RESULT_CHARS = 3_600;
const BANK_INVESTIGATION_RESULT_CHARS = MAX_WEBMCP_EXTENDED_ENVELOPE_CHARS;
const DIAGNOSTICS_RESULT_CHARS = 5_200;
export const WORKSPACE_VISIBLE_METRICS = RESEARCH_METRIC_IDS;
export type WorkspaceVisibleMetric = ResearchMetric;
export const WEBMCP_ATTRIBUTION_METRICS = [
  "asset",
  "dep",
  "roa",
  "nimy",
  "loanGrowth",
  "nclnlsr",
  "lnlsdepr",
  "netinc",
] as const;
export type WebMcpAttributionMetric =
  (typeof WEBMCP_ATTRIBUTION_METRICS)[number];
const RESEARCH_METRICS = RESEARCH_METRIC_IDS;
const RESEARCH_BOARD_SPANS = [
  "quarter",
  "half",
  "three_quarter",
  "full",
] as const satisfies readonly ResearchBoardSpan[];

type ResearchMetricAlias = Extract<ResearchMetricDefinition, { aliases: readonly string[] }>['aliases'][number];
export type WebMcpMetric = ResearchMetric | ResearchMetricAlias;
export const WEBMCP_METRICS = [...new Set(PRODUCT_RESEARCH_METRICS.flatMap((metric) => [
  metric.id,
  ...('aliases' in metric ? metric.aliases : []),
]))] as WebMcpMetric[];
export const WEBMCP_METRIC_ALIASES: Record<
  WebMcpMetric,
  WebMcpCanonicalMetric
> = Object.fromEntries(WEBMCP_METRICS.map((metric) => [metric, canonicalResearchMetric(metric)!])) as
  Record<WebMcpMetric, WebMcpCanonicalMetric>;

export const BANK_SCREEN_TO_WORKSPACE_METRIC: Readonly<Record<
  BankScreenMetric,
  WebMcpCanonicalMetric
>> = BANK_SCREEN_TO_RESEARCH_METRIC;

export const WEBMCP_ATTRIBUTION_EVIDENCE: Record<
  WebMcpAttributionMetric,
  {
    unit: "usd_thousands" | "percentage_points" | "percent_change";
    peerUnit: "percent_change" | "percentage_points" | null;
    defaultMethod: string;
    methods: readonly string[];
  }
> = {
  asset: {
    unit: "usd_thousands",
    peerUnit: "percent_change",
    defaultMethod: "reported_endpoint_difference_with_asset_identity",
    methods: [
      "reported_endpoint_difference_with_asset_identity",
      "exact_difference_identity",
    ],
  },
  dep: {
    unit: "usd_thousands",
    peerUnit: "percent_change",
    defaultMethod: "reported_endpoint_difference",
    methods: ["reported_endpoint_difference", "exact_difference_identity"],
  },
  roa: {
    unit: "percentage_points",
    peerUnit: null,
    defaultMethod: "reported_endpoint_point_difference",
    methods: ["reported_endpoint_point_difference"],
  },
  nimy: {
    unit: "percentage_points",
    peerUnit: null,
    defaultMethod: "reported_endpoint_point_difference",
    methods: ["reported_endpoint_point_difference"],
  },
  nclnlsr: {
    unit: "percentage_points",
    peerUnit: null,
    defaultMethod: "reported_endpoint_point_difference",
    methods: ["reported_endpoint_point_difference"],
  },
  loanGrowth: {
    unit: "percentage_points",
    peerUnit: "percentage_points",
    defaultMethod: "derived_year_over_year_net_loan_growth_endpoint_point_difference",
    methods: ["derived_year_over_year_net_loan_growth_endpoint_point_difference"],
  },
  lnlsdepr: {
    unit: "percentage_points",
    peerUnit: "percentage_points",
    defaultMethod: "exact_two_factor_shapley",
    methods: ["exact_two_factor_shapley", "unavailable"],
  },
  netinc: {
    unit: "usd_thousands",
    peerUnit: null,
    defaultMethod: "exact_difference_identity",
    methods: ["exact_difference_identity", "unavailable"],
  },
};

export type WebMcpCanonicalMetric = ResearchMetric;

export interface WebMcpMetricMethod {
  metric: WebMcpCanonicalMetric;
  label: string;
  unit: "usd_thousands" | "percent" | "percent_yoy" | "count";
  source: string;
  formula: string;
  frequency: "quarterly";
  limitations: readonly string[];
}

const WEBMCP_METRIC_METHOD_OVERRIDES: Partial<Record<
  WebMcpCanonicalMetric,
  WebMcpMetricMethod
>> = {
  asset: {
    metric: "asset",
    label: "Total assets",
    unit: "usd_thousands",
    source: "FDIC BankFind Financials field ASSET",
    formula: "Reported quarter-end total assets",
    frequency: "quarterly",
    limitations: ["Institution-quarter financial filing scope; values are reported in thousands of dollars."],
  },
  dep: {
    metric: "dep",
    label: "Total deposits",
    unit: "usd_thousands",
    source: "FDIC BankFind Financials field DEP",
    formula: "Reported quarter-end total deposits",
    frequency: "quarterly",
    limitations: ["Institution-quarter financial filing scope, including foreign-office deposits when present; values are in thousands of dollars."],
  },
  roa: {
    metric: "roa",
    label: "Return on assets",
    unit: "percent",
    source: "FDIC Statistics on Depository Institutions field ROA",
    formula: "FDIC-reported annualized return on average assets",
    frequency: "quarterly",
    limitations: ["Annualized ratio may reflect year-to-date income conventions and later filing revisions."],
  },
  roe: {
    metric: "roe",
    label: "Return on equity",
    unit: "percent",
    source: "FDIC Statistics on Depository Institutions field ROE",
    formula: "FDIC-reported annualized return on average equity",
    frequency: "quarterly",
    limitations: ["Annualized ratio may reflect year-to-date income conventions and later filing revisions."],
  },
  nimy: {
    metric: "nimy",
    label: "Net interest margin",
    unit: "percent",
    source: "FDIC Statistics on Depository Institutions field NIMY",
    formula: "FDIC-reported annualized net interest margin",
    frequency: "quarterly",
    limitations: ["Annualized ratio uses FDIC reporting definitions and average earning assets."],
  },
  loanGrowth: {
    metric: "loanGrowth",
    label: "Year-over-year loan growth",
    unit: "percent_yoy",
    source: "FDIC Call Report field LNLSNET",
    formula: "100 × (net loans this quarter ÷ net loans four quarters earlier − 1)",
    frequency: "quarterly",
    limitations: ["Unavailable without both quarter-end balances or when the earlier balance is zero."],
  },
  nclnlsr: {
    metric: "nclnlsr",
    label: "Noncurrent loans to loans",
    unit: "percent",
    source: "FDIC Statistics on Depository Institutions field NCLNLSR",
    formula: "FDIC-reported noncurrent loans and leases as a share of loans and leases",
    frequency: "quarterly",
    limitations: ["A bank-level credit-quality ratio; portfolio mix can affect comparisons."],
  },
  rbc1rwaj: {
    metric: "rbc1rwaj",
    label: "Tier 1 risk-based capital ratio",
    unit: "percent",
    source: "FDIC Statistics on Depository Institutions field RBC1RWAJ",
    formula: "FDIC-reported Tier 1 capital as a share of risk-weighted assets",
    frequency: "quarterly",
    limitations: ["Capital requirements and risk weights vary with portfolio composition and regulatory treatment."],
  },
  offdom: {
    metric: "offdom",
    label: "Domestic offices",
    unit: "count",
    source: "FDIC BankFind institution field OFFDOM",
    formula: "Reported count of domestic banking offices",
    frequency: "quarterly",
    limitations: ["Office counts describe the legal institution and do not measure digital distribution."],
  },
  numemp: {
    metric: "numemp",
    label: "Employees",
    unit: "count",
    source: "FDIC BankFind institution field NUMEMP",
    formula: "Reported full-time-equivalent employee count",
    frequency: "quarterly",
    limitations: ["Reporting scope and staffing structures can differ across institutions."],
  },
  lnlsdepr: {
    metric: "lnlsdepr",
    label: "Loan-to-deposit ratio",
    unit: "percent",
    source: "FDIC Statistics on Depository Institutions field LNLSDEPR",
    formula: "Net loans and leases divided by total deposits, multiplied by 100",
    frequency: "quarterly",
    limitations: ["Deposit definitions and business mix affect comparisons; unavailable when deposits are zero."],
  },
  netinc: {
    metric: "netinc",
    label: "Quarterly net income",
    unit: "usd_thousands",
    source: "FDIC Call Report single-quarter income fields, with year-to-date derivation when needed",
    formula: "Reported single-quarter net income or the exact difference between year-to-date filings",
    frequency: "quarterly",
    limitations: ["Restated filings can change derived single-quarter values."],
  },
};

export const WEBMCP_METRIC_METHODS: Record<WebMcpCanonicalMetric, WebMcpMetricMethod> =
  Object.fromEntries(PRODUCT_RESEARCH_METRICS.map((definition) => {
    const override = WEBMCP_METRIC_METHOD_OVERRIDES[definition.id];
    return [definition.id, override ?? {
      metric: definition.id,
      label: definition.label,
      unit: definition.id === "loanGrowth" ? "percent_yoy" : definition.unit,
      source: `FDIC BankFind Financials field ${definition.source}`,
      formula: definition.description,
      frequency: "quarterly",
      limitations: definition.id === "offdom"
        ? ["The workspace has the current institution snapshot, not a historical office-count series."]
        : ["Institution-quarter values follow FDIC reporting definitions and may be revised."],
    } satisfies WebMcpMetricMethod];
  })) as Record<WebMcpCanonicalMetric, WebMcpMetricMethod>;

const STRING = (
  maxLength: number,
  description?: string,
  minLength?: number,
): TightJsonSchema => ({
  type: "string",
  maxLength,
  ...(minLength === undefined ? {} : { minLength }),
  ...(description ? { description } : {}),
});
const ENUM = (
  values: readonly string[],
  description?: string,
): TightJsonSchema => ({
  type: "string",
  maxLength: Math.max(...values.map((value) => value.length)),
  enum: values,
  ...(description ? { description } : {}),
});
const NUMBER = (
  minimum: number,
  maximum: number,
  integer = false,
  description?: string,
): TightJsonSchema => ({
  type: integer ? "integer" : "number",
  minimum,
  maximum,
  ...(description ? { description } : {}),
});
const BOOLEAN: TightJsonSchema = { type: "boolean" };
const ARRAY = (
  items: TightJsonSchema,
  maxItems: number,
  minItems = 0,
): TightJsonSchema => ({
  type: "array",
  items,
  minItems,
  maxItems,
  uniqueItems: true,
});
const OBJECT = (
  properties: Record<string, TightJsonSchema>,
  required: readonly string[] = [],
): TightObjectSchema => ({
  type: "object",
  properties,
  required,
  additionalProperties: false,
});

const REVISION_SCHEMA = NUMBER(
  0,
  Number.MAX_SAFE_INTEGER,
  true,
  "Only apply if the workspace still has this revision.",
);
const CERT_SCHEMA = NUMBER(1, 99_999_999, true, "FDIC certificate number.");
const PERIOD_SCHEMA: TightJsonSchema = {
  type: "string",
  minLength: 6,
  maxLength: 8,
  pattern: "^(?:\\d{4}(?:0331|0630|0930|1231)|\\d{4}Q[1-4])$",
  description:
    "Quarter-end date YYYYMMDD or YYYYQn; quarter labels are normalized to 0331, 0630, 0930, or 1231.",
};
const VISIBLE_METRIC_SCHEMA = ENUM(
  WORKSPACE_VISIBLE_METRICS,
  "Metric available in the linked workspace.",
);
const ATTRIBUTION_METRIC_SCHEMA = ENUM(
  WEBMCP_ATTRIBUTION_METRICS,
  "Metric with a deterministic quarter bridge.",
);
const RESEARCH_METRIC_SCHEMA = ENUM(
  RESEARCH_METRICS,
  "Metric available in workspace evidence or quarter attribution.",
);
const STATE_SCHEMA = STRING(2, "Two-letter US state or territory code.", 2);
const BOARD_SPAN_SCHEMA = ENUM(
  RESEARCH_BOARD_SPANS,
  "Width on the 12-column human board: quarter (3 columns), half (6), three_quarter (9), or full (12). When omitted, existing view-dependent half/full defaults are preserved.",
);

const SEARCH_CONDITION_SCHEMA = OBJECT(
  {
    metric: ENUM(
      BANK_SCREEN_METRICS,
      "Assets and deposits use USD thousands; ratios use reported percent; offices and employees use counts.",
    ),
    operator: ENUM(BANK_SCREEN_OPERATORS),
    value: NUMBER(
      -100_000,
      100_000_000_000_000,
      false,
      "Assets and deposits use FDIC USD thousands; 10,000,000 means $10B. Ratios use reported percent.",
    ),
    upperValue: NUMBER(
      -100_000,
      100_000_000_000_000,
      false,
      "Upper bound in the selected metric's raw unit.",
    ),
  },
  ["metric", "operator", "value"],
);

const TREND_CONDITION_SCHEMA = OBJECT(
  {
    metric: VISIBLE_METRIC_SCHEMA,
    operator: ENUM(BANK_SCREEN_OPERATORS),
    value: NUMBER(
      -100_000_000,
      100_000_000,
      false,
      "Asset and deposit changes use percent change; ratio and year-over-year loan-growth changes use percentage points.",
    ),
    upperValue: NUMBER(-100_000_000, 100_000_000),
  },
  ["metric", "operator", "value"],
);

export interface WebMcpBankSummary {
  cert: number;
  name: string;
  state: string | null;
  city: string | null;
  totalAssets: number | null;
  latestQuarter: string | null;
  /** Exact latest institution values keyed by the public screen vocabulary. */
  metrics?: Partial<Record<BankScreenMetric, number | null>>;
}

export interface WebMcpBankSearchRequest {
  query: string;
  states: string[];
  active: "any" | "active" | "inactive";
  assetMin: number | null;
  assetMax: number | null;
  conditions: BankScreenCondition[];
  sort: BankScreenSort;
  order: "asc" | "desc";
  limit: number;
  /** Zero-based result offset. Used only for stable pagination over the live screen. */
  offset?: number;
}

export interface WebMcpBankSearchResult {
  banks: WebMcpBankSummary[];
  total: number;
  sourceMode: "live" | "recorded";
  asOf: string | null;
  refreshedAt: string | null;
  truncated: boolean;
}

export interface WebMcpScreenView {
  sort: BankScreenSort;
  order: "asc" | "desc";
}

export interface WebMcpChangeRequest {
  cert: number;
  metric: WebMcpAttributionMetric;
  from: string;
  to: string;
  peerRelative: boolean;
  maxComponents: number;
}

export interface WebMcpChangeResult {
  summary: string;
  components: Array<{ label: string; change: number; unit?: string }>;
  bankChange?: number | null;
  peerMedianChange?: number | null;
  peerEvidence?: {
    status: "ok" | "insufficient_peers" | "unavailable";
    cohortDefinition: string;
    cohortDefinitionHash?: string | null;
    cohortHash?: string | null;
    cohortMemberCount?: number | null;
    peerCount: number;
    minimumPeerCount: number;
    subjectPercentile: number | null;
    subjectRank: number | null;
    coverage: number | null;
    warning: string | null;
  } | null;
  unit?: "usd_thousands" | "percentage_points" | "percent_change";
  peerUnit?: "percent_change" | "percentage_points" | null;
  method?: string;
  provenance?: string;
  structuralContext?: WorkspaceStructuralContext | null;
  sourceMode: "live" | "recorded";
  asOf: string | null;
  refreshedAt: string | null;
  truncated: boolean;
}

export interface WorkspaceStructuralContext {
  status: "events_present" | "no_mapped_events" | "unavailable";
  window: { from: string; to: string };
  events: Array<{
    date: string;
    category: "merger" | "acquisition" | "closure" | "charter";
    description: string;
    changeCode: number | null;
  }>;
  caution: string | null;
  coverage: {
    processYearFrom: number | null;
    processYearTo: number | null;
    publishedPartitions: number;
    mapping: "certificate_rows_only";
  };
}

export interface WebMcpMetricHistoryRequest {
  metric: WorkspaceVisibleMetric;
  certs: number[];
  periods: number;
  endingAt: string | null;
}

export interface WebMcpMetricHistoryResult {
  periods: string[];
  series: Array<{ cert: number; name: string; values: Array<number | null> }>;
  sourceMode: "live" | "recorded";
  asOf: string | null;
  refreshedAt: string | null;
  truncated: boolean;
}

export interface WebMcpDataContext {
  sourceMode: "live" | "recorded";
  /** Latest source reporting period represented in the page data. */
  sourceAsOf?: string | null;
  /** Pipeline/API retrieval time, when known. */
  retrievedAt?: string | null;
  /** Time this browser page loaded its current dataset. */
  pageLoadedAt?: string | null;
  /** Published quarterly release elected for this response. */
  release?: string | null;
  /** Opaque D1/KV generation elected for this response. */
  releaseGeneration?: string | null;
  /** Exact member-bound identity of the current peer cohort. */
  cohortHash?: string | null;
  /** @deprecated Adapter compatibility; normalized to sourceAsOf. */
  asOf?: string | null;
  /** @deprecated Adapter compatibility; normalized to retrievedAt. */
  refreshedAt?: string | null;
}

export interface WebMcpCohortMember {
  cert: number;
  name: string;
  state: string | null;
  assetBucket: number | null;
  totalAssets: number | null;
}

export interface WebMcpCurrentCohortResult {
  members: WebMcpCohortMember[];
  definition: {
    recipe: PeerRecipe;
    excludedCerts: number[];
    screenDefinitionHash: string | null;
    screenFilters: BankScreenFilters | null;
  };
  definitionHash: string;
  /** Exact member-bound cohort identity for this source period. */
  cohortHash: string;
  coverage: {
    status: "ready" | "partial";
    memberCount: number;
    membersWithHistory: number;
    membersWithRequiredPeriods: number;
    requiredPeriods: string[];
    earliestPeriod: string | null;
    latestPeriod: string | null;
  };
  sourceMode: "live" | "recorded";
  sourceAsOf: string | null;
  retrievedAt: string | null;
}

export interface WebMcpTrendCondition {
  metric: WorkspaceVisibleMetric;
  operator: "eq" | "ne" | "gt" | "gte" | "lt" | "lte" | "between";
  value: number;
  upperValue: number | null;
}

export interface WebMcpCohortTrendRequest {
  from: string;
  to: string;
  conditions: WebMcpTrendCondition[];
  groupBy: "state" | "asset_bucket";
}

export interface WebMcpCohortTrendMatch extends WebMcpCohortMember {
  changes: Partial<Record<WorkspaceVisibleMetric, number | null>>;
}

export interface WebMcpCohortTrendResult {
  matches: WebMcpCohortTrendMatch[];
  cohortCount: number;
  comparableCount: number;
  groups: Array<{ key: string; label: string; matchingCount: number; shareOfMatches: number }>;
  changeUnits: Partial<Record<WorkspaceVisibleMetric, "percent_change" | "percentage_points" | "absolute_change">>;
  definition: WebMcpCurrentCohortResult["definition"];
  definitionHash: string;
  cohortHash: string;
  coverage: {
    status: "ready" | "partial";
    from: string;
    to: string;
    missingCount: number;
  };
  sourceMode: "live" | "recorded";
  sourceAsOf: string | null;
  retrievedAt: string | null;
}

export interface WebMcpAnalysisContext {
  definition: WebMcpCurrentCohortResult["definition"];
  definitionHash: string;
  cohortHash: string;
  sourceMode: "live" | "recorded";
  sourceAsOf: string | null;
  retrievedAt: string | null;
}

export interface WebMcpCohortChangeRequest {
  from: string;
  to: string;
  metrics: WorkspaceVisibleMetric[];
  groupBy: "none" | "state" | "asset_bucket";
}

export interface WebMcpCohortChangeResult extends WebMcpAnalysisContext {
  transition: CohortTransition;
}

export interface WebMcpTemporalPatternRequest {
  metrics: WorkspaceVisibleMetric[];
  periodWindow: { startPeriod: string; endPeriod: string } | null;
  requiredPeriods: string[];
  minimumObservations: number;
  gapPolicy: TemporalGapPolicy;
  tolerance: number;
  pattern: TemporalPatternSpec;
}

export interface WebMcpTemporalPatternResult extends WebMcpAnalysisContext {
  counts: TemporalPatternAnalysisResult["counts"];
  rows: TemporalPatternAnalysisResult["rows"];
}

export interface WebMcpFinancialCompositionRequest {
  composition: CompositionId;
  scope: "selected_bank" | "selected_banks" | "current_cohort";
  cert: number | null;
  period: string;
  compareFrom: string | null;
}

export interface WebMcpFinancialCompositionResult extends WebMcpAnalysisContext {
  scopeLabel: string;
  memberCerts: number[];
  analysis: CompositionSnapshot | CompositionChange;
}

export interface WebMcpFailurePatternRequest {
  startYear: number;
  endYear: number;
  quarters: number;
  limit: number;
}

export interface WebMcpComparisonBank {
  cert: number;
  name: string;
  state: string | null;
  values: Partial<Record<WorkspaceVisibleMetric, number | null>>;
}

export interface WebMcpCurrentComparisonResult {
  period: string | null;
  metrics: WorkspaceVisibleMetric[];
  banks: WebMcpComparisonBank[];
  sourceMode: "live" | "recorded";
  sourceAsOf: string | null;
  retrievedAt: string | null;
}

export interface WebMcpDistributionRequest {
  metric: WorkspaceVisibleMetric;
}

export interface WebMcpDistributionBank {
  cert: number;
  name: string;
  state: string | null;
  value: number;
}

export interface WebMcpPeerDistributionResult {
  metric: WorkspaceVisibleMetric;
  period: string | null;
  count: number;
  missingCount: number;
  statistics: {
    minimum: number | null;
    p25: number | null;
    median: number | null;
    p75: number | null;
    maximum: number | null;
  };
  focusedBank: (WebMcpDistributionBank & {
    percentile: number | null;
    rank: number | null;
  }) | null;
  lowest: WebMcpDistributionBank[];
  highest: WebMcpDistributionBank[];
  sourceMode: "live" | "recorded";
  sourceAsOf: string | null;
  retrievedAt: string | null;
}

export interface WebMcpMetricRelationshipRequest {
  xMetric: WorkspaceVisibleMetric;
  yMetric: WorkspaceVisibleMetric;
  maxPoints: number;
}

export interface WebMcpRelationshipPoint {
  cert: number;
  name: string;
  state: string | null;
  x: number;
  y: number;
}

export interface WebMcpMetricRelationshipResult {
  xMetric: WorkspaceVisibleMetric;
  yMetric: WorkspaceVisibleMetric;
  period: string | null;
  method: "pearson_cross_sectional_levels";
  correlation: number | null;
  cohortCount: number;
  comparableCount: number;
  points: WebMcpRelationshipPoint[];
  truncated: boolean;
  sourceMode: "live" | "recorded";
  sourceAsOf: string | null;
  retrievedAt: string | null;
}

export interface WebMcpGeographyRequest {
  metric: WorkspaceVisibleMetric;
  maxStates: number;
}

export interface WebMcpGeographyState {
  state: string;
  bankCount: number;
  totalAssets: number | null;
  metricMedian: number | null;
  metricMean: number | null;
}

export interface WebMcpGeographySummaryResult {
  metric: WorkspaceVisibleMetric;
  period: string | null;
  cohortCount: number;
  states: WebMcpGeographyState[];
  omittedStateCount: number;
  sourceMode: "live" | "recorded";
  sourceAsOf: string | null;
  retrievedAt: string | null;
}

export interface WebMcpMacroSeriesSummary {
  id: string;
  label: string;
  unit: string;
  period: string | null;
  value: number | null;
  priorPeriod: string | null;
  priorValue: number | null;
  change: number | null;
  source: string;
}

export interface WebMcpWorkspaceMacroResult {
  status: "ready" | "partial" | "unavailable";
  series: WebMcpMacroSeriesSummary[];
  sourceMode: "live" | "recorded";
  sourceAsOf: string | null;
  retrievedAt: string | null;
}

export interface PreparedWorkspaceCohort {
  results?: ResultsMetadata;
  /** Synchronous, non-throwing publication of data that was fully prepared before the workspace commit. */
  commit(): void;
}

export type WebMcpArtifactRequest =
  | {
      format: "share_link" | "workspace_json";
      revision: number;
      /** Budgeted public share state. Private note bodies are never passed to artifact services. */
      search: string;
      shareMetadata: {
        maxEncodedLength: number;
        encodedLength: number;
        findingNotesTruncated: number;
        omittedNoteCharacters: number;
        findingSourcesTruncated: number;
        omittedSourceCharacters: number;
      };
    }
  | {
      format: "bank_csv";
      revision: number;
      /** Immutable visible metric selection captured when the tool starts. */
      metrics: WorkspaceVisibleMetric[];
      /** Immutable published data generation captured when the tool starts. */
      releaseGeneration: string | null;
      certs: number[];
      filters: BankScreenFilters;
      /** Exact point-in-time analytical pair, or null until both quarters resolve. */
      comparisonPair: WorkspaceComparisonPair | null;
      /** Independent history window used by charts and longitudinal exports. */
      chartHistory: WorkspaceChartHistory;
    };

export interface WebMcpArtifactResult {
  url?: string;
  filename?: string;
  contentType?: string;
  /** Inline, bounded UTF-8 artifact content for browser-local exports. */
  content?: string;
  message?: string;
  expiresAt?: string | null;
}

export interface WorkspaceCommandTarget {
  get state(): WorkspaceState;
  execute(
    command: WorkspaceCommand,
    options?: WorkspaceCommandOptions,
  ): WorkspaceCommandResult;
  executeBatch(
    commands: readonly WorkspaceCommand[],
    options?: WorkspaceCommandOptions,
  ): WorkspaceCommandResult;
}

export interface WorkspaceWebMcpDependencies extends ResearchBoardWebMcpDependencies {
  workspace: WorkspaceCommandTarget;
  /** Must describe the adapter actually serving this page. Never label recorded fixtures live. */
  getDataContext(): WebMcpDataContext;
  searchBanks(
    request: WebMcpBankSearchRequest,
    context: WebMcpControllerContext,
  ): Promise<WebMcpBankSearchResult>;
  /** @deprecated Screen ordering now lives in workspace.state.screenView. */
  getScreenView?(): WebMcpScreenView;
  inspectChange?(
    request: WebMcpChangeRequest,
    context: WebMcpControllerContext,
  ): Promise<WebMcpChangeResult>;
  readMetricHistory?(
    request: WebMcpMetricHistoryRequest,
    context: WebMcpControllerContext,
  ): Promise<WebMcpMetricHistoryResult>;
  ensureBanksLoaded?(
    certs: number[],
    context: WebMcpControllerContext,
  ): Promise<void>;
  prepareScreen?(
    filters: BankScreenFilters,
    context: WebMcpControllerContext,
  ): Promise<PreparedWorkspaceCohort>;
  preparePeerCohort?(
    recipe: PeerRecipe,
    excludedCerts: number[],
    context: WebMcpControllerContext,
  ): Promise<PreparedWorkspaceCohort>;
  readCurrentCohort?(
    context: WebMcpControllerContext,
  ): Promise<WebMcpCurrentCohortResult>;
  analyzeCohortTrends?(
    request: WebMcpCohortTrendRequest,
    context: WebMcpControllerContext,
  ): Promise<WebMcpCohortTrendResult>;
  analyzeCohortChange?(
    request: WebMcpCohortChangeRequest,
    context: WebMcpControllerContext,
  ): Promise<WebMcpCohortChangeResult>;
  findTemporalPatterns?(
    request: WebMcpTemporalPatternRequest,
    context: WebMcpControllerContext,
  ): Promise<WebMcpTemporalPatternResult>;
  analyzeFinancialComposition?(
    request: WebMcpFinancialCompositionRequest,
    context: WebMcpControllerContext,
  ): Promise<WebMcpFinancialCompositionResult>;
  analyzeFailurePatterns?(
    request: WebMcpFailurePatternRequest,
    context: WebMcpControllerContext,
  ): Promise<FailurePatternsResponse>;
  storeAnalysisResult?(
    result: WorkspaceAnalysisResult,
    context: WebMcpControllerContext,
  ): Promise<AnalysisResultRef>;
  /** Lightweight count used to reject oversized WebMCP cohort reads before history hydration. */
  getCurrentCohortMemberCount?(): number;
  readCurrentComparison?(
    context: WebMcpControllerContext,
  ): Promise<WebMcpCurrentComparisonResult>;
  analyzePeerDistribution?(
    request: WebMcpDistributionRequest,
    context: WebMcpControllerContext,
  ): Promise<WebMcpPeerDistributionResult>;
  analyzeMetricRelationship?(
    request: WebMcpMetricRelationshipRequest,
    context: WebMcpControllerContext,
  ): Promise<WebMcpMetricRelationshipResult>;
  readGeographySummary?(
    request: WebMcpGeographyRequest,
    context: WebMcpControllerContext,
  ): Promise<WebMcpGeographySummaryResult>;
  readWorkspaceMacroContext?(
    context: WebMcpControllerContext,
  ): Promise<WebMcpWorkspaceMacroResult>;
  createArtifact?(
    request: WebMcpArtifactRequest,
    context: WebMcpControllerContext,
  ): Promise<WebMcpArtifactResult>;
  getDiagnostics?(): WebMcpDiagnosticsSnapshot;
  /** Used for a deterministic share URL when no artifact service is supplied. */
  workspacePath?: string;
  origin?: () => string;
}

export interface WorkspaceWebMcpCatalogOptions {
  /** `workspace` exposes every connected analysis capability; other pages expose read-only discovery/context. */
  page: "workspace" | "bank" | "compare" | "industry" | "other";
  /** Adds the developer-facing diagnostics tool. Product routes leave this off. */
  includeDiagnostics?: boolean;
}

function dataContext(deps: WorkspaceWebMcpDependencies): Required<WebMcpDataContext> {
  const context = deps.getDataContext();
  if (context.sourceMode !== "live" && context.sourceMode !== "recorded") {
    throw adapterContractViolation(
      "WebMCP data context must declare sourceMode live or recorded",
    );
  }
  const sourceAsOf = context.sourceAsOf ?? context.asOf ?? null;
  const retrievedAt = context.retrievedAt ?? context.refreshedAt ?? null;
  return {
    ...context,
    sourceAsOf,
    retrievedAt,
    pageLoadedAt: context.pageLoadedAt ?? null,
    release: context.release ?? sourceAsOf,
    releaseGeneration: context.releaseGeneration ?? null,
    cohortHash: context.cohortHash ?? null,
    asOf: sourceAsOf,
    refreshedAt: retrievedAt,
  };
}

function freshness(context: Required<WebMcpDataContext>) {
  return {
    sourceAsOf: context.sourceAsOf,
    retrievedAt: context.retrievedAt,
    pageLoadedAt: context.pageLoadedAt,
    release: context.release,
    releaseGeneration: context.releaseGeneration,
    cohortHash: context.cohortHash,
  };
}

function resultFreshness(
  deps: WorkspaceWebMcpDependencies,
  sourceAsOf: string | null,
  retrievedAt: string | null,
) {
  const page = dataContext(deps);
  return {
    sourceAsOf: sourceAsOf ?? page.sourceAsOf,
    retrievedAt: retrievedAt ?? page.retrievedAt,
    pageLoadedAt: page.pageLoadedAt,
    release: page.release,
    releaseGeneration: page.releaseGeneration,
    cohortHash: page.cohortHash,
  };
}

function capabilityUnavailable(capability: string, nextAction: string): WebMcpToolError {
  return new WebMcpToolError(
    "capability_unavailable",
    `${capability} is not connected on this page. ${nextAction}`,
    { capability, nextAction },
  );
}

function adapterContractViolation(message: string): WebMcpToolError {
  return new WebMcpToolError(
    "adapter_contract_violation",
    message,
    { nextAction: "Reload the workspace and retry. If the problem persists, report the tool result." },
  );
}

function requireMatchingSourceMode(
  deps: WorkspaceWebMcpDependencies,
  actual: "live" | "recorded",
  operation: string,
): void {
  const expected = dataContext(deps).sourceMode;
  if (actual !== expected) {
    throw adapterContractViolation(
      `${operation} sourceMode ${actual} does not match page sourceMode ${expected}.`,
    );
  }
}

function resultMeta(
  deps: WorkspaceWebMcpDependencies,
  state: WorkspaceState,
  changed: boolean,
): Record<string, unknown> {
  const context = dataContext(deps);
  return {
    changed,
    revision: state.revision,
    sourceMode: context.sourceMode,
    ...freshness(context),
    assetUnit: "usd_thousands",
    truncated: state.results.truncated,
  };
}

function boundedWorkspaceContext(
  state: WorkspaceState,
  source: Required<WebMcpDataContext>,
  summary: string,
  capabilities: Record<string, boolean>,
): Record<string, unknown> {
  const comparisonPair = getWorkspaceComparisonPair(state);
  const linkedChart =
    state.charts.find((chart) => chart.id === "linked-analysis") ??
    state.charts.find((chart) => chart.visible) ??
    null;
  const filters = {
    query: state.filters.query.slice(0, 96),
    states: state.filters.states.slice(0, 8),
    active: state.filters.active,
    assetMin: state.filters.assetRange.min,
    assetMax: state.filters.assetRange.max,
    conditions: state.filters.metricConditions.slice(0, 2),
  };
  let contextTruncated =
    state.question.length > 160 ||
    state.filters.query.length > filters.query.length ||
    state.filters.states.length > filters.states.length ||
    state.filters.metricConditions.length > filters.conditions.length ||
    state.mapSelection.states.length > 8;
  const data: Record<string, unknown> = {
    revision: state.revision,
    sourceMode: source.sourceMode,
    ...freshness(source),
    truncated: state.results.truncated || contextTruncated,
    question: state.question.slice(0, 160),
    depth: state.depth,
    activeMetric: state.activeMetric,
    panel: state.activePanel,
    activeBank: state.activeBank,
    selectedCerts: state.selectedCerts,
    asOfQuarter: state.asOfQuarter,
    comparisonMode: state.comparison.mode,
    comparisonPair,
    chartHistory: { ...state.chartHistory },
    filters,
    mapSelection: {
      states: state.mapSelection.states.slice(0, 8),
      certs: state.mapSelection.certs,
    },
    screenView: state.screenView,
    linkedChart: linkedChart
      ? {
          kind: linkedChart.kind,
          scale: linkedChart.scale,
          metrics: linkedChart.metrics,
          certs: linkedChart.certs,
        }
      : null,
    counts: {
      excluded: state.excludedCerts.length,
      peerConditions: state.peerRecipe.metricConditions.length,
      charts: state.charts.filter((chart) => chart.visible).length,
      findings: state.findings.length,
      watchlist: state.watchlistDesired.length,
      boardViews: state.board.blocks.length,
    },
    capabilities,
  };
  // Leave headroom for the host's request metadata inside this tool's declared extended envelope.
  // The current board is useful model context; do not squeeze it into the legacy 1,400-character
  // default used by small one-shot tools.
  const fits = () =>
    JSON.stringify(createResultEnvelope({ summary, data })).length <= MAX_WEBMCP_EXTENDED_ENVELOPE_CHARS - 512;
  while (!fits()) {
    if (filters.conditions.length) filters.conditions.pop();
    else if (filters.states.length) filters.states.pop();
    else if (filters.query.length) filters.query = filters.query.slice(0, 48);
    else if (data.linkedChart !== null) data.linkedChart = null;
    else break;
    contextTruncated = true;
    data.truncated = true;
  }
  const addIfFits = (key: string, value: unknown) => {
    data[key] = value;
    if (fits()) return;
    delete data[key];
    contextTruncated = true;
    data.truncated = true;
  };
  addIfFits("peerRecipe", {
    name: state.peerRecipe.name.slice(0, 80),
    basis: state.peerRecipe.basis,
    states: state.peerRecipe.states.slice(0, 6),
    active: state.peerRecipe.active,
    assetMin: state.peerRecipe.assetRange.min,
    assetMax: state.peerRecipe.assetRange.max,
    conditions: state.peerRecipe.metricConditions.slice(0, 2),
    minimumPeers: state.peerRecipe.minimumPeers,
    maximumPeers: state.peerRecipe.maximumPeers,
  });
  addIfFits("excludedCerts", state.excludedCerts.slice(0, 20));
  if (state.cohortTrendResult) {
    const trend = state.cohortTrendResult;
    addIfFits("cohortTrendResult", {
      id: trend.id,
      publishedRevision: trend.publishedRevision,
      from: trend.from,
      to: trend.to,
      conditions: trend.conditions,
      groupBy: trend.groupBy,
      metrics: trend.metrics,
      counts: trend.counts,
      coverage: trend.coverage,
      cohortHash: trend.cohortHash,
    });
  }
  if (state.analysisResult) {
    const analysis = state.analysisResult;
    addIfFits("analysisResult", {
      id: analysis.id,
      kind: analysis.kind,
      title: analysis.title,
      publishedRevision: analysis.publishedRevision,
      analyzedCount: analysis.population.analyzedCount,
      membershipBasis: analysis.population.membershipBasis,
      cohortHash: analysis.population.cohortHash,
    });
  }
  addIfFits("researchBoard", {
    focusedBlockId: state.board.focusedBlockId,
    orderedViews: state.board.blocks.map((block) => ({
      id: block.id,
      kind: block.kind,
      title: block.title.slice(0, 80),
      span: block.span,
      ...(block.kind === "analysis"
        ? { resultId: block.binding.resultRef.resultId, view: block.binding.view }
        : block.kind === "workspace_view"
          ? { view: block.binding.view, liveWorkspaceState: true }
          : {}),
    })),
    operations: [
      "read", "template", "history", "table", "result", "takeaway", "configure", "arrange",
      "remove", "clear", "reset_layout", "reset_research", "focus", "appearance",
    ],
  });
  addIfFits(
    "findings",
    state.findings.slice(0, 2).map(({ id, title, certs, metrics, period }) => ({
      id,
      title: title.slice(0, 80),
      certs,
      metrics,
      period,
    })),
  );
  addIfFits("watchlistDesired", state.watchlistDesired.slice(0, 10));
  if (
    state.peerRecipe.name.length > 80 ||
    state.peerRecipe.states.length > 6 ||
    state.peerRecipe.metricConditions.length > 2 ||
    state.excludedCerts.length > 20 ||
    state.findings.length > 2 ||
    state.findings.some((finding) => finding.title.length > 80) ||
    state.watchlistDesired.length > 10
  ) {
    data.truncated = true;
  }
  return data;
}

function requireRevision(
  state: WorkspaceState,
  expected: number | undefined,
): void {
  if (expected !== undefined && state.revision !== expected) {
    throw staleRevision(expected, state.revision);
  }
}

function requiredRevision(value: unknown): number {
  const revision = optionalRevision(value);
  if (revision === undefined) {
    throw new WebMcpInputError(
      "ifRevision is required; read bankgraph.get_context immediately before replacing workspace state",
    );
  }
  return revision;
}

function throwIfAborted(signal: AbortSignal): void {
  if (!signal.aborted) return;
  throw signal.reason ?? new DOMException("WebMCP operation was cancelled.", "AbortError");
}

/** Commit a validated user-level operation as one persisted revision. */
function executeSeries(
  target: WorkspaceCommandTarget,
  commands: WorkspaceCommand[],
  ifRevision?: number,
  signal?: AbortSignal,
): WorkspaceCommandResult {
  if (signal) throwIfAborted(signal);
  requireRevision(target.state, ifRevision);
  return target.executeBatch(commands, { ifRevision });
}

function parseStates(value: unknown, path: string, limit = 56): string[] {
  return unique(
    arrayValue(value, path, {
      max: limit,
      map: (item, index) => stateCode(item, `${path}[${index}]`),
    }),
    path,
  ).sort();
}

function parseCerts(value: unknown, path: string, max = 10, min = 0): number[] {
  return unique(
    arrayValue(value, path, {
      min,
      max,
      map: (item, index) => cert(item, `${path}[${index}]`),
    }),
    path,
  ).sort((a, b) => a - b);
}

function parseMetrics(
  value: unknown,
  path: string,
  max = 6,
  min = 0,
): WorkspaceVisibleMetric[] {
  return unique(
    arrayValue(value, path, {
      min,
      max,
      map: (item, index) =>
        enumValue(item, `${path}[${index}]`, WORKSPACE_VISIBLE_METRICS),
    }),
    path,
  ).sort();
}

function parseAttributionMetrics(
  value: unknown,
  path: string,
  max = 6,
  min = 2,
): WebMcpAttributionMetric[] {
  return unique(
    arrayValue(value, path, {
      min,
      max,
      map: (item, index) =>
        enumValue(item, `${path}[${index}]`, WEBMCP_ATTRIBUTION_METRICS),
    }),
    path,
  );
}

function parseResearchMetrics(value: unknown, path: string, max = 6): ResearchMetric[] {
  return unique(
    arrayValue(value, path, {
      max,
      map: (item, index) =>
        enumValue(item, `${path}[${index}]`, RESEARCH_METRICS),
    }),
    path,
  ).sort();
}

function visibleMetricsFromState(state: WorkspaceState): WorkspaceVisibleMetric[] {
  const linkedChart =
    state.charts.find((chart) => chart.id === "linked-analysis") ??
    state.charts.find((chart) => chart.visible) ??
    null;
  const candidates = [
    ...(linkedChart?.metrics ?? []),
    ...(state.activeMetric ? [state.activeMetric] : []),
  ];
  const metrics = [...new Set(
    candidates.flatMap((metric) => {
      const canonical = canonicalResearchMetric(metric);
      return canonical ? [canonical] : [];
    }),
  )].slice(0, 6);
  return metrics.length ? metrics : ["asset"];
}

function preferredVisibleMetric(
  state: WorkspaceState,
  value: unknown,
  path = "metric",
): WorkspaceVisibleMetric {
  if (value !== undefined) {
    return enumValue(value, path, WORKSPACE_VISIBLE_METRICS);
  }
  const active = canonicalResearchMetric(state.activeMetric ?? "");
  return active ?? visibleMetricsFromState(state)[0];
}

function requireBoundedCurrentCohort(deps: WorkspaceWebMcpDependencies): void {
  const count = deps.getCurrentCohortMemberCount?.();
  if (count === undefined) return;
  if (!Number.isSafeInteger(count) || count < 0) {
    throw adapterContractViolation(
      "Current cohort member count must be a nonnegative integer.",
    );
  }
  if (count > WEBMCP_COHORT_ANALYSIS_LIMIT) {
    throw new WebMcpToolError(
      "cohort_analysis_limit",
      `This cohort has ${count} banks. WebMCP history analysis is limited to ${WEBMCP_COHORT_ANALYSIS_LIMIT} banks per workspace to keep the result responsive. Narrow the cohort and retry.`,
      {
        cohortCount: count,
        maximum: WEBMCP_COHORT_ANALYSIS_LIMIT,
        nextAction: "Narrow the peer recipe by state, asset range, or metric condition, then retry.",
      },
    );
  }
}

function optionalResultNumber(
  value: unknown,
  path: string,
  minimum = -1e15,
  maximum = 1e15,
): number | null {
  return value === null || value === undefined
    ? null
    : finiteNumber(value, path, minimum, maximum);
}

function boundedDistributionBank(
  value: WebMcpDistributionBank,
  path: string,
): WebMcpDistributionBank {
  return {
    cert: cert(value.cert, `${path}.cert`),
    name: stringValue(value.name, `${path}.name`, { min: 1, max: 200 }),
    state: value.state === null ? null : stateCode(value.state, `${path}.state`),
    value: finiteNumber(value.value, `${path}.value`, -1e15, 1e15),
  };
}

function parseSearchConditions(
  value: unknown,
  path: string,
): BankScreenCondition[] {
  return arrayValue(value, path, {
    max: 12,
    map(item, index) {
      const itemPath = `${path}[${index}]`;
      const source = inputObject(
        item,
        ["metric", "operator", "value", "upperValue"],
        itemPath,
      );
      const metric = enumValue(
        source.metric,
        `${itemPath}.metric`,
        BANK_SCREEN_METRICS,
      );
      const operator = enumValue(
        source.operator,
        `${itemPath}.operator`,
        BANK_SCREEN_OPERATORS,
      );
      const rules = BANK_SCREEN_METRIC_RULES[metric];
      const conditionValue = finiteNumber(
        source.value,
        `${itemPath}.value`,
        rules.minimum,
        rules.maximum,
      );
      const upperValue =
        optionalNumber(
          source.upperValue,
          `${itemPath}.upperValue`,
          rules.minimum,
          rules.maximum,
        ) ?? null;
      if (rules.integer && !Number.isSafeInteger(conditionValue)) {
        throw new WebMcpInputError(
          `${itemPath}.value must be an integer for ${metric}`,
        );
      }
      if (
        rules.integer &&
        upperValue !== null &&
        !Number.isSafeInteger(upperValue)
      ) {
        throw new WebMcpInputError(
          `${itemPath}.upperValue must be an integer for ${metric}`,
        );
      }
      if (operator === "between" && upperValue === null) {
        throw new WebMcpInputError(
          `${itemPath}.upperValue is required for between`,
        );
      }
      if (operator !== "between" && upperValue !== null) {
        throw new WebMcpInputError(
          `${itemPath}.upperValue is only valid for between`,
        );
      }
      if (upperValue !== null && conditionValue > upperValue) {
        throw new WebMcpInputError(
          `${itemPath}.value must not exceed upperValue`,
        );
      }
      return { metric, operator, value: conditionValue, upperValue };
    },
  });
}

function parseTrendConditions(
  value: unknown,
  path: string,
): WebMcpTrendCondition[] {
  return arrayValue(value, path, {
    min: 1,
    max: 6,
    map(item, index) {
      const itemPath = `${path}[${index}]`;
      const source = inputObject(
        item,
        ["metric", "operator", "value", "upperValue"],
        itemPath,
      );
      const operator = enumValue(
        source.operator,
        `${itemPath}.operator`,
        BANK_SCREEN_OPERATORS,
      );
      const condition: WebMcpTrendCondition = {
        metric: enumValue(
          source.metric,
          `${itemPath}.metric`,
          WORKSPACE_VISIBLE_METRICS,
        ),
        operator,
        value: finiteNumber(source.value, `${itemPath}.value`, -1e8, 1e8),
        upperValue:
          optionalNumber(source.upperValue, `${itemPath}.upperValue`, -1e8, 1e8) ?? null,
      };
      if (operator === "between" && condition.upperValue === null) {
        throw new WebMcpInputError(`${itemPath}.upperValue is required for between`);
      }
      if (operator !== "between" && condition.upperValue !== null) {
        throw new WebMcpInputError(`${itemPath}.upperValue is only valid for between`);
      }
      if (condition.upperValue !== null && condition.value > condition.upperValue) {
        throw new WebMcpInputError(`${itemPath}.value must not exceed upperValue`);
      }
      return condition;
    },
  });
}

function parseTemporalPattern(source: Record<string, unknown>): TemporalPatternSpec {
  const kind = enumValue(source.pattern, "pattern", [
    "direction_count",
    "consecutive_streak",
    "cumulative_change",
    "change_acceleration",
    "threshold_cross",
  ] as const);
  if (kind === "direction_count") {
    return {
      kind,
      direction: enumValue(source.direction, "direction", ["increase", "decrease"] as const),
      atLeast: integer(source.atLeast, "atLeast", 1, 159),
    };
  }
  if (kind === "consecutive_streak") {
    return {
      kind,
      direction: enumValue(source.direction, "direction", ["increase", "decrease"] as const),
      minimumIntervals: integer(source.minimumIntervals, "minimumIntervals", 1, 159),
    };
  }
  if (kind === "cumulative_change") {
    return {
      kind,
      operator: enumValue(source.operator, "operator", ["gt", "gte", "lt", "lte", "eq"] as const),
      threshold: finiteNumber(source.threshold, "threshold", -1e12, 1e12),
    };
  }
  if (kind === "change_acceleration") {
    return {
      kind,
      direction: enumValue(source.direction, "direction", ["accelerating", "decelerating"] as const),
      atLeast: integer(source.atLeast, "atLeast", 1, 158),
    };
  }
  return {
    kind,
    direction: enumValue(source.direction, "direction", ["above", "below"] as const),
    threshold: finiteNumber(source.threshold, "threshold", -1e12, 1e12),
  };
}

function validateAnalysisContext(
  deps: WorkspaceWebMcpDependencies,
  result: WebMcpAnalysisContext,
  label: string,
): void {
  requireMatchingSourceMode(deps, result.sourceMode, label);
  if (paginationKey(result.definition) !== result.definitionHash) {
    throw adapterContractViolation(`${label} definition must match definitionHash.`);
  }
  stringValue(result.cohortHash, `${label}.cohortHash`, { min: 1, max: 128 });
}

function materializedPopulation(
  result: WebMcpAnalysisContext,
  analyzedCount: number,
  membershipBasis: "current_workspace_members" | "current_selected_banks" | "current_selected_bank" = "current_workspace_members",
) {
  return {
    membershipBasis,
    analyzedCount,
    definitionHash: result.definitionHash,
    cohortHash: result.cohortHash,
    peerRecipe: result.definition.recipe,
    excludedCount: result.definition.excludedCerts.length,
  };
}

async function analysisResultRef(
  deps: WorkspaceWebMcpDependencies,
  result: WorkspaceAnalysisResult,
  context: WebMcpControllerContext,
): Promise<AnalysisResultRef> {
  return deps.storeAnalysisResult
    ? deps.storeAnalysisResult(result, context)
    : createAnalysisResultRef(result);
}

function analysisBoardBlock(
  result: WorkspaceAnalysisResult,
  ref: AnalysisResultRef,
  source: Record<string, unknown>,
  defaultView: ResearchAnalysisView,
) {
  const view = source.boardView === undefined
    ? defaultView
    : stringValue(source.boardView, "boardView", { min: 1, max: 32 }) as ResearchAnalysisView;
  const defaultSpan = ["both", "small_multiples", "timeline", "exact_table"].includes(view)
    ? "full" as const
    : "half" as const;
  return {
    id: source.boardBlockId === undefined
      ? `analysis-${result.id}`.slice(0, 64)
      : identifier(source.boardBlockId, "boardBlockId"),
    kind: "analysis" as const,
    title: source.boardTitle === undefined
      ? result.title
      : stringValue(source.boardTitle, "boardTitle", { min: 1, max: 160 }),
    span: source.boardSpan === undefined
      ? defaultSpan
      : enumValue(source.boardSpan, "boardSpan", RESEARCH_BOARD_SPANS),
    binding: {
      resultRef: ref,
      view,
    },
  };
}

function workspaceConditionsFromScreen(
  value: unknown,
  path: string,
): MetricCondition[] {
  return parseSearchConditions(value, path).map((condition) => ({
    ...condition,
    metric: BANK_SCREEN_TO_WORKSPACE_METRIC[condition.metric],
  }));
}

function searchEvidenceMetrics(request: WebMcpBankSearchRequest): {
  metrics: BankScreenMetric[];
  truncated: boolean;
} {
  const requested = [
    ...new Set<BankScreenMetric>([
      ...(request.sort === "name" ? [] : [request.sort]),
      ...request.conditions.map((condition) => condition.metric),
    ]),
  ];
  return { metrics: requested.slice(0, 4), truncated: requested.length > 4 };
}

function fitsExtendedEnvelope(summary: string, data: unknown): boolean {
  return createResultEnvelope(
    { summary, data },
    MAX_WEBMCP_EXTENDED_ENVELOPE_CHARS,
  ).ok;
}

function searchMetricValue(
  value: unknown,
  metric: BankScreenMetric,
  path: string,
): number | null {
  if (value === null || value === undefined) return null;
  const rules = BANK_SCREEN_METRIC_RULES[metric];
  const parsed = finiteNumber(value, path, rules.minimum, rules.maximum);
  if (rules.integer && !Number.isSafeInteger(parsed)) {
    throw adapterContractViolation(`${path} must be an integer for ${metric}.`);
  }
  return parsed;
}

function signedFixed(value: number, suffix: string): string {
  const sign = value > 0 ? "+" : value < 0 ? "−" : "";
  return `${sign}${Math.abs(value).toFixed(2)}${suffix}`;
}

function usdThousands(value: number): string {
  const sign = value > 0 ? "+" : value < 0 ? "−" : "";
  const dollars = Math.abs(value) * 1_000;
  const scale =
    dollars >= 1e12
      ? { divisor: 1e12, suffix: "T" }
      : dollars >= 1e9
        ? { divisor: 1e9, suffix: "B" }
        : dollars >= 1e6
          ? { divisor: 1e6, suffix: "M" }
          : { divisor: 1e3, suffix: "K" };
  return `${sign}$${(dollars / scale.divisor).toFixed(2)}${scale.suffix}`;
}

function attributionValue(
  value: number,
  unit: "usd_thousands" | "percentage_points" | "percent_change",
): string {
  if (unit === "usd_thousands") return usdThousands(value);
  if (unit === "percentage_points") return signedFixed(value, " pp");
  return signedFixed(value, "%");
}

function quarterName(period: string): string {
  const suffix = period.slice(4);
  const quarter =
    suffix === "0331"
      ? "Q1"
      : suffix === "0630"
        ? "Q2"
        : suffix === "0930"
          ? "Q3"
          : "Q4";
  return `${quarter} ${period.slice(0, 4)}`;
}

function attributionSummary(
  request: WebMcpChangeRequest,
  result: WebMcpChangeResult,
  evidence: (typeof WEBMCP_ATTRIBUTION_EVIDENCE)[WebMcpAttributionMetric],
): string {
  const label = WEBMCP_METRIC_METHODS[request.metric].label.toLowerCase();
  const structure = result.structuralContext?.status === "events_present"
    ? ` FDIC structure history maps ${result.structuralContext.events.length} structural ${result.structuralContext.events.length === 1 ? "event" : "events"} to this certificate inside the window; treat the endpoints as a changing institution perimeter.`
    : result.structuralContext?.status === "unavailable"
      ? " Published FDIC structure history was unavailable for this check."
      : "";
  if (result.bankChange === null || result.bankChange === undefined) {
    return `FDIC ${request.cert} ${label} change was unavailable from ${quarterName(request.from)} to ${quarterName(request.to)}.${structure}`;
  }
  const change = attributionValue(result.bankChange, evidence.unit);
  const peer =
    result.peerMedianChange === null ||
    result.peerMedianChange === undefined ||
    evidence.peerUnit === null
      ? ""
      : ` Peer median change: ${attributionValue(result.peerMedianChange, evidence.peerUnit)}.`;
  return `FDIC ${request.cert} ${label} changed by ${change} from ${quarterName(request.from)} to ${quarterName(request.to)}.${peer}${structure}`;
}

function boundedArtifactResult(value: unknown): WebMcpArtifactResult {
  const source = inputObject(
    value,
    ["url", "filename", "contentType", "content", "message", "expiresAt"],
    "artifact",
  );
  const url = optionalString(source.url, "artifact.url", { max: 6_800 });
  const filename = optionalString(source.filename, "artifact.filename", {
    max: 240,
  });
  const contentType = optionalString(
    source.contentType,
    "artifact.contentType",
    { max: 120 },
  );
  const content = optionalString(source.content, "artifact.content", {
    max: 6_500,
    trim: false,
  });
  const message = optionalString(source.message, "artifact.message", {
    max: 320,
  });
  const expiresAt =
    source.expiresAt === null
      ? null
      : optionalString(source.expiresAt, "artifact.expiresAt", { max: 80 });
  if (!url && !filename && !content && !message) {
    throw adapterContractViolation(
      "Export service must return a URL, filename, or completion message.",
    );
  }
  return {
    ...(url ? { url } : {}),
    ...(filename ? { filename } : {}),
    ...(contentType ? { contentType } : {}),
    ...(content ? { content } : {}),
    ...(message ? { message } : {}),
    ...(expiresAt === undefined ? {} : { expiresAt }),
  };
}

interface ComparisonPeriodInput {
  asOfQuarter: string;
  comparison: {
    mode: WorkspaceComparisonMode;
    rangeStartQuarter: string | null;
    customQuarter: string | null;
  };
  chartHistory: WorkspaceChartHistory | null;
}

function comparisonPeriodFromInput(
  source: Record<string, unknown>,
): ComparisonPeriodInput {
  const asOfQuarter = reportingPeriod(source.asOfQuarter, "asOfQuarter");
  const mode = enumValue(source.comparisonMode, "comparisonMode", [
    "prior-quarter",
    "year-ago",
    "range-start",
    "custom",
  ] as const);
  const rangeStartQuarter = source.rangeStartQuarter === undefined
    ? null
    : reportingPeriod(source.rangeStartQuarter, "rangeStartQuarter");
  const customQuarter = source.customQuarter === undefined
    ? null
    : reportingPeriod(source.customQuarter, "customQuarter");
  if (mode === "range-start" && rangeStartQuarter === null) {
    throw new WebMcpInputError(
      "rangeStartQuarter is required when comparisonMode is range-start",
    );
  }
  if (mode !== "range-start" && rangeStartQuarter !== null) {
    throw new WebMcpInputError(
      "rangeStartQuarter is only valid when comparisonMode is range-start",
    );
  }
  if (mode === "custom" && customQuarter === null) {
    throw new WebMcpInputError(
      "customQuarter is required when comparisonMode is custom",
    );
  }
  if (mode !== "custom" && customQuarter !== null) {
    throw new WebMcpInputError(
      "customQuarter is only valid when comparisonMode is custom",
    );
  }
  const comparison = { mode, rangeStartQuarter, customQuarter };
  if (resolveWorkspaceComparisonQuarter(asOfQuarter, comparison) === null) {
    throw new WebMcpInputError(
      "The comparison quarter must be earlier than asOfQuarter",
    );
  }

  const historyMode = source.historyMode === undefined
    ? "keep"
    : enumValue(source.historyMode, "historyMode", [
        "keep",
        "set",
        "clear",
      ] as const);
  const hasHistoryBoundary =
    source.historyFrom !== undefined || source.historyTo !== undefined;
  if (historyMode !== "set" && hasHistoryBoundary) {
    throw new WebMcpInputError(
      "historyFrom and historyTo are only valid when historyMode is set",
    );
  }
  let chartHistory: WorkspaceChartHistory | null = null;
  if (historyMode === "clear") {
    chartHistory = { from: null, to: null };
  } else if (historyMode === "set") {
    if (source.historyFrom === undefined || source.historyTo === undefined) {
      throw new WebMcpInputError(
        "historyFrom and historyTo are required when historyMode is set",
      );
    }
    const from = reportingPeriod(source.historyFrom, "historyFrom");
    const to = reportingPeriod(source.historyTo, "historyTo");
    if ((compareReportingQuarters(from, to) ?? 1) > 0) {
      throw new WebMcpInputError("historyFrom must not be after historyTo");
    }
    chartHistory = { from, to };
  }
  return { asOfQuarter, comparison, chartHistory };
}

function readOnlyTool(
  definition: Omit<WebMcpToolDefinition, "annotations">,
  untrustedContentHint = true,
): WebMcpToolDefinition {
  return {
    ...definition,
    annotations: { readOnlyHint: true, untrustedContentHint },
  };
}

function mutationTool(
  definition: Omit<WebMcpToolDefinition, "annotations">,
): WebMcpToolDefinition {
  return {
    ...definition,
    annotations: { readOnlyHint: false, untrustedContentHint: true },
  };
}

export function createWorkspaceWebMcpToolCatalog(
  deps: WorkspaceWebMcpDependencies,
): Record<string, WebMcpToolDefinition> {
  const getContext = readOnlyTool({
    name: "bankgraph.get_context",
    title: "Read the current Bankgraph board context",
    description:
      "Read the current page, screen, selected banks, exact comparison pair, chart history, peer cohort, takeaways, watchlist intent, board presentation, data date, and revisions. Use this before editing and after a person changes the board.",
    maxResultChars: MAX_WEBMCP_EXTENDED_ENVELOPE_CHARS,
    inputSchema: OBJECT({}),
    controller: async (input, context) => {
      inputObject(input, []);
      const state = deps.workspace.state;
      const source = dataContext(deps);
      const summary = `Workspace revision ${state.revision}; ${state.selectedCerts.length} banks selected.`;
      const boardPresentation = deps.getBoardPresentation?.();
      const data = boundedWorkspaceContext(state, source, summary, {
        changeAttribution: Boolean(deps.inspectChange),
        metricHistory: Boolean(deps.readMetricHistory),
        currentScreen: true,
        currentCohort: Boolean(deps.readCurrentCohort),
        cohortTrends: Boolean(deps.analyzeCohortTrends),
        cohortChange: Boolean(deps.analyzeCohortChange),
        temporalPatterns: Boolean(deps.findTemporalPatterns),
        financialComposition: Boolean(deps.analyzeFinancialComposition),
        failurePatterns: Boolean(deps.analyzeFailurePatterns),
        currentComparison: Boolean(deps.readCurrentComparison),
        peerDistribution: Boolean(deps.analyzePeerDistribution),
        metricRelationship: Boolean(deps.analyzeMetricRelationship),
        geographySummary: Boolean(deps.readGeographySummary),
        macroContext: Boolean(deps.readWorkspaceMacroContext),
        artifactExport: Boolean(deps.createArtifact),
      });
      if (boardPresentation) {
        data.boardPresentation = {
          presentationRevision: boardPresentation.presentationRevision,
          theme: boardPresentation.theme,
          timeAxis: boardPresentation.timeAxis,
          pinnedTimebar: boardPresentation.pinnedTimebar,
          pendingViewCount: boardPresentation.pendingViewCount,
          strips: boardPresentation.strips,
        };
      }
      return {
        summary,
        data,
      };
    },
  });

  const searchBanks = readOnlyTool({
    name: "bankgraph.search_banks",
    title: "Search US banks",
    description:
      "Preview stored FDIC institutions without changing the workspace. Screen by name, state, activity, assets, and latest metrics. Returns 25 complete bank records by default and up to 50; a page shrinks only when needed to stay inside the serialized result budget. Pass nextCursor unchanged to traverse up to the first 1,000 ranked matches.",
    maxResultChars: MAX_WEBMCP_EXTENDED_ENVELOPE_CHARS,
    inputSchema: OBJECT(
      {
        query: STRING(120),
        states: ARRAY(STATE_SCHEMA, 10),
        active: ENUM(ACTIVE_VALUES),
        assetMin: NUMBER(
          0,
          100_000_000_000_000,
          false,
          "Minimum total assets in FDIC USD thousands; 10,000,000 means $10B.",
        ),
        assetMax: NUMBER(
          0,
          100_000_000_000_000,
          false,
          "Maximum total assets in FDIC USD thousands; 10,000,000 means $10B.",
        ),
        conditions: ARRAY(SEARCH_CONDITION_SCHEMA, 12),
        sort: ENUM(BANK_SCREEN_SORTS),
        order: ENUM(["asc", "desc"]),
        limit: NUMBER(1, MAX_BANK_PAGE_SIZE, true, "Complete bank records requested for this page; defaults to 25."),
        cursor: STRING(128, "Opaque nextCursor from the previous page."),
      },
      ["query", "states", "active"],
    ),
    controller: async (input, context) => {
      const source = inputObject(input, [
        "query",
        "states",
        "active",
        "assetMin",
        "assetMax",
        "conditions",
        "sort",
        "order",
        "limit",
        "cursor",
      ]);
      const assetMin =
        optionalNumber(source.assetMin, "assetMin", 0, 1e14) ?? null;
      const assetMax =
        optionalNumber(source.assetMax, "assetMax", 0, 1e14) ?? null;
      if (assetMin !== null && assetMax !== null && assetMin > assetMax) {
        throw new WebMcpInputError("assetMin must not exceed assetMax");
      }
      const pageSize = source.limit === undefined
        ? DEFAULT_BANK_PAGE_SIZE
        : integer(source.limit, "limit", 1, MAX_BANK_PAGE_SIZE);
      const requestBase = {
        query: stringValue(source.query, "query", { max: 120 }),
        states: parseStates(source.states, "states", 10),
        active: enumValue(source.active, "active", ACTIVE_VALUES),
        assetMin,
        assetMax,
        conditions:
          source.conditions === undefined
            ? []
            : parseSearchConditions(source.conditions, "conditions"),
        sort:
          source.sort === undefined
            ? "assets"
            : enumValue(source.sort, "sort", BANK_SCREEN_SORTS),
        order:
          source.order === undefined
            ? "desc"
            : enumValue(source.order, "order", ["asc", "desc"] as const),
      };
      const key = paginationKey(requestBase);
      const offset = decodeCursor(source.cursor, "bank_search", key, SEARCH_RESULT_UNIVERSE_LIMIT);
      const request: WebMcpBankSearchRequest = {
        ...requestBase,
        limit: pageSize,
        offset,
      };
      const result = await deps.searchBanks(request, context);
      requireMatchingSourceMode(deps, result.sourceMode, "Bank search");
      const evidence = searchEvidenceMetrics(request);
      const metricUnits = Object.fromEntries(
        evidence.metrics.map((metric) => [
          metric,
          BANK_SCREEN_METRIC_RULES[metric].unit,
        ]),
      );
      const validatedBanks = result.banks.slice(0, request.limit).map((bank, index) => ({
        cert: cert(bank.cert, `result.banks[${index}].cert`),
        name: stringValue(bank.name, `result.banks[${index}].name`, {
          min: 1,
          max: 200,
        }),
        state:
          bank.state === null
            ? null
            : stateCode(bank.state, `result.banks[${index}].state`),
        city:
          bank.city === null
            ? null
            : stringValue(bank.city, `result.banks[${index}].city`, {
                max: 120,
              }),
        totalAssets: searchMetricValue(
          bank.totalAssets,
          "assets",
          `result.banks[${index}].totalAssets`,
        ),
        latestQuarter: bank.latestQuarter,
        metrics: Object.fromEntries(
          evidence.metrics.map((metric) => [
            metric,
            searchMetricValue(
              bank.metrics?.[metric],
              metric,
              `result.banks[${index}].metrics.${metric}`,
            ),
          ]),
        ),
      }));
      const matching = integer(result.total, "result.total", 0, Number.MAX_SAFE_INTEGER);
      const resultSetCount = Math.min(matching, SEARCH_RESULT_UNIVERSE_LIMIT);
      let fittedPageSize = pageSize;
      while (true) {
        const pageBanks = validatedBanks.slice(0, fittedPageSize);
        const nextOffset = offset + pageBanks.length;
        const hasMore = nextOffset < resultSetCount;
        const pagination = {
          offset,
          pageSize: fittedPageSize,
          returnedCount: pageBanks.length,
          totalCount: resultSetCount,
          omittedCount: Math.max(0, resultSetCount - nextOffset),
          hasMore,
          nextCursor: hasMore ? encodeCursor("bank_search", key, nextOffset) : null,
        };
        const summary = `${matching} matching banks; this page returns ${pageBanks.length} complete records at offset ${offset}.`;
        const data = {
          banks: pageBanks,
          counts: {
            matching,
            resultSet: resultSetCount,
            returned: pagination.returnedCount,
            omitted: pagination.omittedCount,
          },
          pagination,
          sourceMode: result.sourceMode,
          ...resultFreshness(deps, result.asOf, result.refreshedAt),
          sourceScope: {
            provider: "FDIC BankFind",
            dataset: "institutions",
            basis: "latest values stored for each institution",
            balanceFields: ["ASSET", "DEP"],
          },
          assetUnit: "usd_thousands",
          metricUnits,
          metricFieldsTruncated: evidence.truncated,
          sourceHasMore: result.truncated || matching > result.banks.length,
          omittedMetricFields: evidence.truncated,
        };
        if (fittedPageSize === 1 || fitsExtendedEnvelope(summary, data)) {
          return { summary, data };
        }
        fittedPageSize -= 1;
      }
    },
  });

  const readCurrentScreen = readOnlyTool({
    name: "bankgraph.read_current_screen",
    title: "Read the current bank screen",
    description:
      "Read the exact current screen recipe and its ranked bank records without changing the workspace. Returns 25 complete records by default and up to 50, shrinking a page only when its serialized payload requires it. Each cursor is bound to the workspace revision, full filter definition, result revision, and visible ordering.",
    inputSchema: OBJECT({
      pageSize: NUMBER(1, MAX_BANK_PAGE_SIZE, true, "Complete bank records requested for this page; defaults to 25."),
      cursor: STRING(128, "Opaque nextCursor from the previous page."),
    }),
    maxResultChars: MAX_WEBMCP_EXTENDED_ENVELOPE_CHARS,
    controller: async (input, context) => {
      const source = inputObject(input, ["pageSize", "cursor"]);
      const pageSize = source.pageSize === undefined
        ? DEFAULT_BANK_PAGE_SIZE
        : integer(source.pageSize, "pageSize", 1, MAX_BANK_PAGE_SIZE);
      const state = deps.workspace.state;
      const screenView = state.screenView;
      const sort = enumValue(screenView.sort, "screenView.sort", BANK_SCREEN_SORTS);
      const order = enumValue(screenView.order, "screenView.order", ["asc", "desc"] as const);
      const definition = {
        filters: {
          query: state.filters.query,
          states: [...state.filters.states],
          active: state.filters.active,
          assetMin: state.filters.assetRange.min,
          assetMax: state.filters.assetRange.max,
          conditions: state.filters.metricConditions.map((condition) => ({ ...condition })),
        },
        sort,
        order,
      };
      const definitionHash = paginationKey({
        revision: state.revision,
        definition,
        results: state.results,
      });
      const requestedOffset = cursorOffset(source.cursor, "current_screen", 100_000);
      const conditions: BankScreenCondition[] = state.filters.metricConditions.map((condition, index) => {
        const metric = WORKSPACE_TO_BANK_SCREEN_METRIC[condition.metric];
        if (!metric) {
          throw adapterContractViolation(
            `Current screen condition ${index} uses unsupported latest-institution metric ${condition.metric}.`,
          );
        }
        return { ...condition, metric };
      });
      const result = await deps.searchBanks({
        query: state.filters.query,
        states: [...state.filters.states],
        active: state.filters.active,
        assetMin: state.filters.assetRange.min,
        assetMax: state.filters.assetRange.max,
        conditions,
        sort,
        order,
        limit: pageSize,
        offset: requestedOffset,
      }, context);
      throwIfAborted(context.signal);
      if (deps.workspace.state.revision !== state.revision) {
        throw staleRevision(state.revision, deps.workspace.state.revision);
      }
      const currentView = deps.workspace.state.screenView;
      if (currentView.sort !== sort || currentView.order !== order) {
        throw new WebMcpToolError(
          "stale_screen_definition",
          "The visible screen ordering changed while the page was being read. Read bankgraph.read_current_screen again without a cursor.",
          { nextAction: "bankgraph.read_current_screen" },
          true,
        );
      }
      requireMatchingSourceMode(deps, result.sourceMode, "Current screen");
      const matching = integer(result.total, "result.total", 0, Number.MAX_SAFE_INTEGER);
      const resultSetHash = paginationKey({
        definitionHash,
        sourceMode: result.sourceMode,
        sourceAsOf: result.asOf,
        matching,
      });
      const offset = decodeCursor(source.cursor, "current_screen", resultSetHash, matching);
      if (!Array.isArray(result.banks) || result.banks.length > pageSize) {
        throw adapterContractViolation(`Current screen must return at most ${pageSize} bank records.`);
      }
      if (offset > matching || (offset < matching && result.banks.length === 0)) {
        throw adapterContractViolation("Current screen pagination did not make progress within the matching result set.");
      }
      const seen = new Set<number>();
      const banks = result.banks.map((bank, index) => {
        const bankCert = cert(bank.cert, `result.banks[${index}].cert`);
        if (seen.has(bankCert)) {
          throw adapterContractViolation(`Current screen returned certificate ${bankCert} twice on one page.`);
        }
        seen.add(bankCert);
        if (!bank.metrics || typeof bank.metrics !== "object" || Array.isArray(bank.metrics)) {
          throw adapterContractViolation(`Current screen bank ${bankCert} is missing its metric record.`);
        }
        const missingMetric = BANK_SCREEN_METRICS.find((metric) =>
          !Object.prototype.hasOwnProperty.call(bank.metrics, metric)
        );
        if (missingMetric) {
          throw adapterContractViolation(
            `Current screen bank ${bankCert} is missing metric ${missingMetric}.`,
          );
        }
        return {
          cert: bankCert,
          name: stringValue(bank.name, `result.banks[${index}].name`, { min: 1, max: 200 }),
          state: bank.state === null ? null : stateCode(bank.state, `result.banks[${index}].state`),
          city: bank.city === null
            ? null
            : stringValue(bank.city, `result.banks[${index}].city`, { max: 120 }),
          latestQuarter: bank.latestQuarter === null
            ? null
            : reportingPeriod(bank.latestQuarter, `result.banks[${index}].latestQuarter`),
          metrics: Object.fromEntries(BANK_SCREEN_METRICS.map((metric) => [
            metric,
            searchMetricValue(
              bank.metrics?.[metric],
              metric,
              `result.banks[${index}].metrics.${metric}`,
            ),
          ])),
        };
      });
      let fittedCount = banks.length;
      while (true) {
        const pageBanks = banks.slice(0, fittedCount);
        const nextOffset = offset + pageBanks.length;
        const hasMore = nextOffset < matching;
        const summary = `${matching} banks match the current screen; this page returns ${pageBanks.length} complete records from offset ${offset}.`;
        const data = {
          workspaceRevision: state.revision,
          definitionHash,
          resultSetHash,
          definition,
          banks: pageBanks,
          counts: {
            matching,
            returned: pageBanks.length,
            remaining: Math.max(0, matching - nextOffset),
          },
          pagination: {
            offset,
            pageSize: fittedCount < banks.length ? fittedCount : pageSize,
            returnedCount: pageBanks.length,
            totalCount: matching,
            omittedCount: Math.max(0, matching - nextOffset),
            hasMore,
            nextCursor: hasMore
              ? encodeCursor("current_screen", resultSetHash, nextOffset)
              : null,
          },
          sourceMode: result.sourceMode,
          ...resultFreshness(deps, result.asOf, result.refreshedAt),
          sourceScope: {
            provider: "FDIC BankFind",
            dataset: "institutions",
            basis: "latest values stored for each institution",
          },
          metricUnits: Object.fromEntries(
            BANK_SCREEN_METRICS.map((metric) => [metric, BANK_SCREEN_METRIC_RULES[metric].unit]),
          ),
        };
        if (fittedCount <= 1 || fitsExtendedEnvelope(summary, data)) {
          return { summary, data };
        }
        fittedCount -= 1;
      }
    },
  });

  const configureScreen = mutationTool({
    name: "bankgraph.configure_screen",
    title: "Configure the current bank screen",
    description:
      "Replace the visible question, bank-screen recipe, and result ordering. Read bankgraph.get_context first and pass its revision as ifRevision. Conditions use AND and exclude missing values. Assets and deposits use FDIC USD thousands: 10,000,000 means $10 billion.",
    inputSchema: OBJECT(
      {
        question: STRING(1_000),
        query: STRING(200),
        states: ARRAY(STATE_SCHEMA, 56),
        active: ENUM(ACTIVE_VALUES),
        assetMin: NUMBER(
          0,
          1e14,
          false,
          "Minimum total assets in FDIC USD thousands; 10,000,000 means $10B.",
        ),
        assetMax: NUMBER(
          0,
          1e14,
          false,
          "Maximum total assets in FDIC USD thousands; 10,000,000 means $10B.",
        ),
        conditions: ARRAY(SEARCH_CONDITION_SCHEMA, 12),
        sort: ENUM(BANK_SCREEN_SORTS),
        order: ENUM(["asc", "desc"]),
        ifRevision: REVISION_SCHEMA,
      },
      ["question", "query", "states", "active", "conditions", "ifRevision"],
    ),
    controller: async (input, context) => {
      const source = inputObject(input, [
        "question",
        "query",
        "states",
        "active",
        "assetMin",
        "assetMax",
        "conditions",
        "sort",
        "order",
        "ifRevision",
      ]);
      const assetMin =
        optionalNumber(source.assetMin, "assetMin", 0, 1e14) ?? null;
      const assetMax =
        optionalNumber(source.assetMax, "assetMax", 0, 1e14) ?? null;
      if (assetMin !== null && assetMax !== null && assetMin > assetMax)
        throw new WebMcpInputError("assetMin must not exceed assetMax");
      const filters: BankScreenFilters = {
        query: stringValue(source.query, "query", { max: 200 }),
        states: parseStates(source.states, "states"),
        assetRange: { min: assetMin, max: assetMax },
        active: enumValue(source.active, "active", ACTIVE_VALUES),
        metricConditions: workspaceConditionsFromScreen(
          source.conditions,
          "conditions",
        ),
      };
      const screenView = {
        sort:
          source.sort === undefined
            ? deps.workspace.state.screenView.sort
            : enumValue(source.sort, "sort", BANK_SCREEN_SORTS),
        order:
          source.order === undefined
            ? deps.workspace.state.screenView.order
            : enumValue(source.order, "order", ["asc", "desc"] as const),
      };
      const commitRevision = requiredRevision(source.ifRevision);
      requireRevision(deps.workspace.state, commitRevision);
      const prepared = await deps.prepareScreen?.(filters, context);
      throwIfAborted(context.signal);
      requireRevision(deps.workspace.state, commitRevision);
      const commands = [
        workspaceCommands.setQuestion(
          stringValue(source.question, "question", {
            max: 1_000,
            trim: false,
          }),
        ),
        workspaceCommands.setFilters(filters),
        workspaceCommands.setScreenView(screenView),
        ...(prepared?.results
          ? [workspaceCommands.setResults(prepared.results)]
          : []),
      ];
      const result = executeSeries(
        deps.workspace,
        commands,
        commitRevision,
        context.signal,
      );
      prepared?.commit();
      return {
        summary: result.changed
          ? "Screen recipe updated."
          : "Screen recipe already matched.",
        data: {
          ...resultMeta(deps, result.state, result.changed),
          screenView: result.state.screenView,
        },
      };
    },
  });

  const configureComparison = mutationTool({
    name: "bankgraph.configure_comparison",
    title: "Edit the bank comparison",
    description:
      "Change only the requested part of the live comparison and preserve everything else. Use bankMode add or remove for spoken follow-ups such as ‘add Citi’; replace is the default when certs are supplied. Metrics, dates, chart style, and focus are independently optional. Read bankgraph.get_context once after a person changes the board, then pass its revision.",
    inputSchema: {
      ...OBJECT({
        certs: ARRAY(CERT_SCHEMA, WORKSPACE_LIMITS.selectedBanks, 1),
        bankMode: ENUM(
          ["keep", "replace", "add", "remove"],
          "How certs change the current banks. When omitted, supplied certs replace the selection; omitted certs keep it.",
        ),
        metrics: ARRAY(VISIBLE_METRIC_SCHEMA, 6, 1),
        metricMode: ENUM(
          ["keep", "replace", "add", "remove"],
          "How metrics change the current measures. When omitted, supplied metrics replace them; omitted metrics keep them.",
        ),
        asOfQuarter: PERIOD_SCHEMA,
        comparisonMode: ENUM(
          ["prior-quarter", "year-ago", "range-start", "custom"],
          "Basis for the exact quarter compared with asOfQuarter.",
        ),
        rangeStartQuarter: PERIOD_SCHEMA,
        customQuarter: PERIOD_SCHEMA,
        historyMode: ENUM(
          ["keep", "set", "clear"],
          "Keep the chart window, replace it with historyFrom/historyTo, or clear it.",
        ),
        historyFrom: PERIOD_SCHEMA,
        historyTo: PERIOD_SCHEMA,
        focusMode: ENUM(FOCUS_MODES),
        activeCert: CERT_SCHEMA,
        chartKind: ENUM(LINKED_CHART_KINDS),
        chartScale: ENUM(LINKED_CHART_SCALES),
        ifRevision: REVISION_SCHEMA,
      }, ["ifRevision"]),
      minProperties: 2,
    },
    controller: async (input, context) => {
      const source = inputObject(input, [
        "certs",
        "bankMode",
        "metrics",
        "metricMode",
        "asOfQuarter",
        "comparisonMode",
        "rangeStartQuarter",
        "customQuarter",
        "historyMode",
        "historyFrom",
        "historyTo",
        "focusMode",
        "activeCert",
        "chartKind",
        "chartScale",
        "ifRevision",
      ]);
      const current = deps.workspace.state;
      const currentChart = current.charts.find((chart) => chart.id === "linked-analysis");
      const requestedCerts = source.certs === undefined
        ? null
        : parseCerts(source.certs, "certs", WORKSPACE_LIMITS.selectedBanks, 1);
      const bankMode = source.bankMode === undefined
        ? (requestedCerts ? "replace" : "keep")
        : enumValue(source.bankMode, "bankMode", ["keep", "replace", "add", "remove"] as const);
      if (bankMode === "keep" && requestedCerts) {
        throw new WebMcpInputError("certs must be omitted when bankMode is keep");
      }
      if (bankMode !== "keep" && !requestedCerts) {
        throw new WebMcpInputError(`certs are required when bankMode is ${bankMode}`);
      }
      const certs = bankMode === "keep"
        ? [...current.selectedCerts]
        : bankMode === "replace"
          ? [...requestedCerts!]
          : bankMode === "add"
            ? [...new Set([...current.selectedCerts, ...requestedCerts!])]
            : current.selectedCerts.filter((item) => !requestedCerts!.includes(item));
      if (certs.length > WORKSPACE_LIMITS.selectedBanks) {
        throw new WebMcpInputError(
          `A comparison supports ${WORKSPACE_LIMITS.selectedBanks} selected banks. Remove a bank before adding another.`,
        );
      }
      if (!certs.length) {
        throw new WebMcpInputError(
          "A comparison must contain at least one bank; use bankgraph.reset_research_board to start over",
        );
      }

      const requestedMetrics = source.metrics === undefined
        ? null
        : parseMetrics(source.metrics, "metrics", 6, 1);
      const metricMode = source.metricMode === undefined
        ? (requestedMetrics ? "replace" : "keep")
        : enumValue(source.metricMode, "metricMode", ["keep", "replace", "add", "remove"] as const);
      if (metricMode === "keep" && requestedMetrics) {
        throw new WebMcpInputError("metrics must be omitted when metricMode is keep");
      }
      if (metricMode !== "keep" && !requestedMetrics) {
        throw new WebMcpInputError(`metrics are required when metricMode is ${metricMode}`);
      }
      const currentMetrics = parseMetrics(
        currentChart?.metrics?.length
          ? currentChart.metrics
          : current.activeMetric
            ? [current.activeMetric]
            : ["asset"],
        "currentMetrics",
        6,
        1,
      );
      const metrics = metricMode === "keep"
        ? currentMetrics
        : metricMode === "replace"
          ? [...requestedMetrics!]
          : metricMode === "add"
            ? [...new Set([...currentMetrics, ...requestedMetrics!])].slice(0, 6)
            : currentMetrics.filter((item) => !requestedMetrics!.includes(item));
      if (!metrics.length) {
        throw new WebMcpInputError("A comparison must contain at least one measure");
      }

      const focusMode = source.focusMode === undefined
        ? (source.activeCert === undefined ? "keep" : "set")
        : enumValue(source.focusMode, "focusMode", FOCUS_MODES);
      if (focusMode === "set" && source.activeCert === undefined)
        throw new WebMcpInputError(
          "activeCert is required when focusMode is set",
        );
      if (focusMode !== "set" && source.activeCert !== undefined)
        throw new WebMcpInputError(
          "activeCert is only valid when focusMode is set",
        );
      const activeCert =
        focusMode === "set" ? cert(source.activeCert, "activeCert") : null;
      if (activeCert !== null && !certs.includes(activeCert))
        throw new WebMcpInputError("activeCert must appear in certs");

      const asOfQuarter = source.asOfQuarter ?? current.asOfQuarter ?? dataContext(deps).sourceAsOf;
      if (asOfQuarter == null) {
        throw new WebMcpInputError(
          "asOfQuarter is required because this page has no published reporting period",
        );
      }
      const comparisonMode = source.comparisonMode === undefined
        ? current.comparison.mode
        : enumValue(source.comparisonMode, "comparisonMode", ["prior-quarter", "year-ago", "range-start", "custom"] as const);
      const rangeStartQuarter = source.rangeStartQuarter ?? (comparisonMode === "range-start"
        ? current.comparison.rangeStartQuarter ?? current.chartHistory.from ?? current.comparison.resolvedQuarter
        : undefined);
      const customQuarter = source.customQuarter ?? (comparisonMode === "custom"
        ? current.comparison.customQuarter ?? current.comparison.resolvedQuarter
        : undefined);
      const periodInput = comparisonPeriodFromInput({
        asOfQuarter,
        comparisonMode,
        ...(rangeStartQuarter == null ? {} : { rangeStartQuarter }),
        ...(customQuarter == null ? {} : { customQuarter }),
        ...(source.historyMode === undefined ? {} : { historyMode: source.historyMode }),
        ...(source.historyFrom === undefined ? {} : { historyFrom: source.historyFrom }),
        ...(source.historyTo === undefined ? {} : { historyTo: source.historyTo }),
      });
      const currentKind = currentChart?.kind;
      const currentScale = currentChart?.scale;
      const chart = {
        id: "linked-analysis",
        title: currentChart?.title ?? "Linked bank analysis",
        kind: source.chartKind === undefined && currentKind && LINKED_CHART_KINDS.includes(currentKind as (typeof LINKED_CHART_KINDS)[number])
          ? currentKind as (typeof LINKED_CHART_KINDS)[number]
          : source.chartKind === undefined
            ? "line" as const
            : enumValue(source.chartKind, "chartKind", LINKED_CHART_KINDS),
        metrics,
        certs,
        scale: source.chartScale === undefined && currentScale && LINKED_CHART_SCALES.includes(currentScale as (typeof LINKED_CHART_SCALES)[number])
          ? currentScale as (typeof LINKED_CHART_SCALES)[number]
          : source.chartScale === undefined
            ? "value" as const
            : enumValue(source.chartScale, "chartScale", LINKED_CHART_SCALES),
        stacked: false,
        visible: true,
      };
      const commitRevision = requiredRevision(source.ifRevision);
      requireRevision(deps.workspace.state, commitRevision);
      await deps.ensureBanksLoaded?.(certs, context);
      throwIfAborted(context.signal);
      requireRevision(deps.workspace.state, commitRevision);
      const removedFromExclusions = deps.workspace.state.excludedCerts.filter(
        (excludedCert) => certs.includes(excludedCert),
      );
      const commands: WorkspaceCommand[] = [
        ...(removedFromExclusions.length > 0
          ? [workspaceCommands.setExcludedCerts(
              deps.workspace.state.excludedCerts.filter(
                (excludedCert) => !certs.includes(excludedCert),
              ),
            )]
          : []),
        workspaceCommands.setSelectedCerts(certs),
        workspaceCommands.setAsOfQuarter(periodInput.asOfQuarter),
        workspaceCommands.setComparison(periodInput.comparison),
        ...(periodInput.chartHistory === null
          ? []
          : [workspaceCommands.setChartHistory(periodInput.chartHistory)]),
        workspaceCommands.upsertChart(chart),
      ];
      if (focusMode !== "keep") {
        commands.push(workspaceCommands.setActiveBank(activeCert));
      } else if (current.activeBank !== null && !certs.includes(current.activeBank)) {
        commands.push(workspaceCommands.setActiveBank(certs[0] ?? null));
      }
      const result = executeSeries(
        deps.workspace,
        commands,
        commitRevision,
        context.signal,
      );
      return {
        summary: result.changed
          ? "Comparison updated in the workspace."
          : "Comparison already matched.",
        data: {
          ...resultMeta(deps, result.state, result.changed),
          removedFromExclusions,
          asOfQuarter: result.state.asOfQuarter,
          comparisonMode: result.state.comparison.mode,
          comparisonPair: getWorkspaceComparisonPair(result.state),
          chartHistory: { ...result.state.chartHistory },
          selectedCerts: [...result.state.selectedCerts],
          metrics: [...metrics],
          bankMode,
          metricMode,
        },
      };
    },
  });

  const configureView = mutationTool({
    name: "bankgraph.configure_view",
    title: "Change the linked analysis view",
    description:
      "Patch one or more linked-view fields while preserving omitted fields: Guided or Pro depth, the active metric, the visible panel, or map selection. Read bankgraph.get_context first and pass its revision as ifRevision.",
    inputSchema: {
      ...OBJECT({
        panel: ENUM(PANELS),
        depth: ENUM(["guided", "pro"]),
        metricFocusMode: ENUM(FOCUS_MODES),
        activeMetric: VISIBLE_METRIC_SCHEMA,
        mapStates: ARRAY(STATE_SCHEMA, 56),
        mapCerts: ARRAY(CERT_SCHEMA, 10),
        ifRevision: REVISION_SCHEMA,
      }, ["ifRevision"]),
      minProperties: 2,
      maxProperties: 7,
    },
    controller: async (input, context) => {
      const source = inputObject(input, [
        "panel",
        "depth",
        "metricFocusMode",
        "activeMetric",
        "mapStates",
        "mapCerts",
        "ifRevision",
      ]);
      const hasViewChange = [
        "panel",
        "depth",
        "metricFocusMode",
        "mapStates",
        "mapCerts",
      ].some((field) => source[field] !== undefined);
      if (!hasViewChange) {
        throw new WebMcpInputError(
          "at least one of panel, depth, metricFocusMode, mapStates, or mapCerts is required",
        );
      }
      const desiredPanel =
        source.panel === undefined
          ? undefined
          : enumValue<WorkspacePanel>(source.panel, "panel", PANELS);
      const desiredDepth =
        source.depth === undefined
          ? undefined
          : enumValue(source.depth, "depth", ["guided", "pro"] as const);
      const metricFocusMode =
        source.metricFocusMode === undefined
          ? undefined
          : enumValue(source.metricFocusMode, "metricFocusMode", FOCUS_MODES);
      if (metricFocusMode === "set" && source.activeMetric === undefined) {
        throw new WebMcpInputError(
          "activeMetric is required when metricFocusMode is set",
        );
      }
      if (metricFocusMode !== "set" && source.activeMetric !== undefined) {
        throw new WebMcpInputError(
          "activeMetric is only valid when metricFocusMode is set",
        );
      }
      const desiredActiveMetric = metricFocusMode === "set"
        ? enumValue(
            source.activeMetric,
            "activeMetric",
            WORKSPACE_VISIBLE_METRICS,
          )
        : null;
      const commitRevision = requiredRevision(source.ifRevision);
      requireRevision(deps.workspace.state, commitRevision);
      const commands: WorkspaceCommand[] = [];
      if (desiredPanel !== undefined)
        commands.push(workspaceCommands.setActivePanel(desiredPanel));
      if (desiredDepth !== undefined)
        commands.push(workspaceCommands.setDepth(desiredDepth));
      if (metricFocusMode !== undefined && metricFocusMode !== "keep") {
        commands.push(
          workspaceCommands.setActiveMetric(
            metricFocusMode === "clear"
              ? null
              : desiredActiveMetric,
          ),
        );
      }
      if (source.mapStates !== undefined || source.mapCerts !== undefined) {
        commands.push(workspaceCommands.setMapSelection({
          states: source.mapStates === undefined
            ? deps.workspace.state.mapSelection.states
            : parseStates(source.mapStates, "mapStates"),
          certs: source.mapCerts === undefined
            ? deps.workspace.state.mapSelection.certs
            : parseCerts(source.mapCerts, "mapCerts"),
        }));
      }
      const result = executeSeries(
        deps.workspace,
        commands,
        commitRevision,
        context.signal,
      );
      return {
        summary: result.changed ? "View updated." : "View already matched.",
        data: {
          ...resultMeta(deps, result.state, result.changed),
          depth: result.state.depth,
          activeMetric: result.state.activeMetric,
        },
      };
    },
  });

  const setPeerCohort = mutationTool({
    name: "bankgraph.set_peer_cohort",
    title: "Define the peer cohort",
    description:
      "Replace the peer cohort recipe and exact exclusion list used by the comparison. Read bankgraph.get_context first and pass its revision as ifRevision. Latest-metric conditions use the same deterministic vocabulary and units as bank search.",
    inputSchema: OBJECT(
      {
        name: STRING(120),
        basis: ENUM(PEER_BASES),
        states: ARRAY(STATE_SCHEMA, 56),
        active: ENUM(ACTIVE_VALUES),
        assetMin: NUMBER(
          0,
          1e14,
          false,
          "Minimum total assets in FDIC USD thousands; 10,000,000 means $10B.",
        ),
        assetMax: NUMBER(
          0,
          1e14,
          false,
          "Maximum total assets in FDIC USD thousands; 10,000,000 means $10B.",
        ),
        conditions: ARRAY(SEARCH_CONDITION_SCHEMA, 12),
        excludedCerts: ARRAY(CERT_SCHEMA, 250),
        minimumPeers: NUMBER(0, WEBMCP_COHORT_ANALYSIS_LIMIT, true),
        maximumPeers: NUMBER(
          0,
          WEBMCP_COHORT_ANALYSIS_LIMIT,
          true,
          `WebMCP peer analyses support at most ${WEBMCP_COHORT_ANALYSIS_LIMIT} banks per workspace.`,
        ),
        ifRevision: REVISION_SCHEMA,
      },
      [
        "name",
        "basis",
        "states",
        "active",
        "conditions",
        "excludedCerts",
        "minimumPeers",
        "maximumPeers",
        "ifRevision",
      ],
    ),
    controller: async (input, context) => {
      const source = inputObject(input, [
        "name",
        "basis",
        "states",
        "active",
        "assetMin",
        "assetMax",
        "conditions",
        "excludedCerts",
        "minimumPeers",
        "maximumPeers",
        "ifRevision",
      ]);
      const assetMin =
        optionalNumber(source.assetMin, "assetMin", 0, 1e14) ?? null;
      const assetMax =
        optionalNumber(source.assetMax, "assetMax", 0, 1e14) ?? null;
      const minimumPeers = integer(
        source.minimumPeers,
        "minimumPeers",
        0,
        WEBMCP_COHORT_ANALYSIS_LIMIT,
      );
      const maximumPeers = integer(
        source.maximumPeers,
        "maximumPeers",
        0,
        WEBMCP_COHORT_ANALYSIS_LIMIT,
      );
      if (assetMin !== null && assetMax !== null && assetMin > assetMax)
        throw new WebMcpInputError("assetMin must not exceed assetMax");
      if (minimumPeers > maximumPeers)
        throw new WebMcpInputError("minimumPeers must not exceed maximumPeers");
      const recipe: PeerRecipe = {
        name: stringValue(source.name, "name", { max: 120 }),
        basis: enumValue(source.basis, "basis", PEER_BASES),
        states: parseStates(source.states, "states"),
        assetRange: { min: assetMin, max: assetMax },
        active: enumValue(source.active, "active", ACTIVE_VALUES),
        metricConditions: workspaceConditionsFromScreen(
          source.conditions,
          "conditions",
        ),
        minimumPeers,
        maximumPeers,
      };
      const excludedCerts = parseCerts(
        source.excludedCerts,
        "excludedCerts",
        250,
      );
      const commitRevision = requiredRevision(source.ifRevision);
      requireRevision(deps.workspace.state, commitRevision);
      const prepared = await deps.preparePeerCohort?.(
        recipe,
        excludedCerts,
        context,
      );
      throwIfAborted(context.signal);
      requireRevision(deps.workspace.state, commitRevision);
      const result = executeSeries(
        deps.workspace,
        [
          workspaceCommands.setPeerRecipe(recipe),
          workspaceCommands.setExcludedCerts(excludedCerts),
        ],
        commitRevision,
        context.signal,
      );
      prepared?.commit();
      return {
        summary: result.changed
          ? "Peer cohort updated."
          : "Peer cohort already matched.",
        data: {
          ...resultMeta(deps, result.state, result.changed),
          excludedCount: result.state.excludedCerts.length,
        },
      };
    },
  });

  const readCurrentCohort = readOnlyTool({
    name: "bankgraph.read_current_cohort",
    title: "Read the current peer cohort",
    description:
      "Read the exact peer-cohort definition and complete member records. Returns 25 complete records by default and up to 50, shrinking only when required by the serialized result budget. Counts, coverage, freshness, and the cursor remain tied to the exact definition.",
    maxResultChars: MAX_WEBMCP_EXTENDED_ENVELOPE_CHARS,
    inputSchema: OBJECT({
      section: ENUM([
        "members", "states", "conditions", "excluded_certs", "screen_states", "screen_conditions",
      ]),
      pageSize: NUMBER(1, MAX_BANK_PAGE_SIZE, true, "Complete records requested in the selected section; defaults to 25."),
      cursor: STRING(128, "Opaque nextCursor from the previous page."),
    }),
    controller: async (input, context) => {
      const source = inputObject(input, ["section", "pageSize", "cursor"]);
      if (!deps.readCurrentCohort) {
        throw capabilityUnavailable(
          "Current cohort",
          "Open the analysis workspace and retry.",
        );
      }
      requireBoundedCurrentCohort(deps);
      const section = source.section === undefined
        ? "members"
        : enumValue(
            source.section,
            "section",
            [
              "members", "states", "conditions", "excluded_certs", "screen_states", "screen_conditions",
            ] as const,
          );
      const pageSize = source.pageSize === undefined
        ? DEFAULT_BANK_PAGE_SIZE
        : integer(source.pageSize, "pageSize", 1, MAX_BANK_PAGE_SIZE);
      const result = await deps.readCurrentCohort(context);
      throwIfAborted(context.signal);
      requireMatchingSourceMode(deps, result.sourceMode, "Current cohort");
      if (!result.definition || typeof result.definition !== "object" || Array.isArray(result.definition)) {
        throw adapterContractViolation("Current cohort definition must be an object.");
      }
      const expectedHash = paginationKey(result.definition);
      if (result.definitionHash !== expectedHash) {
        throw adapterContractViolation("Current cohort definitionHash does not match its definition.");
      }
      if (!Array.isArray(result.members) || result.members.length > WEBMCP_COHORT_ANALYSIS_LIMIT) {
        throw adapterContractViolation(
          `Current cohort must return at most ${WEBMCP_COHORT_ANALYSIS_LIMIT} members.`,
        );
      }
      const seen = new Set<number>();
      const members = result.members.map((member, index) => {
        const memberCert = cert(member.cert, `result.members[${index}].cert`);
        if (seen.has(memberCert)) {
          throw adapterContractViolation(`Current cohort returned certificate ${memberCert} twice.`);
        }
        seen.add(memberCert);
        return {
          cert: memberCert,
          name: stringValue(member.name, `result.members[${index}].name`, { min: 1, max: 200 }),
          state: member.state === null ? null : stateCode(member.state, `result.members[${index}].state`),
          assetBucket: member.assetBucket === null
            ? null
            : integer(member.assetBucket, `result.members[${index}].assetBucket`, 0, 100),
          totalAssets: member.totalAssets === null
            ? null
            : finiteNumber(member.totalAssets, `result.members[${index}].totalAssets`, 0, 1e15),
        };
      });
      const expectedCohortHash = cohortIdentityKey({
        definitionHash: result.definitionHash,
        memberCerts: members.map((member) => member.cert),
        sourceAsOf: result.sourceAsOf,
        releaseGeneration: dataContext(deps).releaseGeneration,
      });
      if (result.cohortHash !== expectedCohortHash) {
        throw adapterContractViolation(
          "Current cohort cohortHash does not match its exact members, definition, and source period.",
        );
      }
      const coverage = result.coverage;
      const coverageMemberCount = integer(
        coverage.memberCount,
        "result.coverage.memberCount",
        0,
        WEBMCP_COHORT_ANALYSIS_LIMIT,
      );
      const membersWithHistory = integer(
        coverage.membersWithHistory,
        "result.coverage.membersWithHistory",
        0,
        coverageMemberCount,
      );
      const membersWithRequiredPeriods = integer(
        coverage.membersWithRequiredPeriods,
        "result.coverage.membersWithRequiredPeriods",
        0,
        coverageMemberCount,
      );
      const requiredPeriods = coverage.requiredPeriods.map((period, index) =>
        reportingPeriod(period, `result.coverage.requiredPeriods[${index}]`),
      );
      if (coverageMemberCount !== members.length) {
        throw adapterContractViolation(
          "Current cohort coverage memberCount must match returned members.",
        );
      }
      if (
        coverage.status === "ready" &&
        membersWithRequiredPeriods !== coverageMemberCount
      ) {
        throw adapterContractViolation(
          "Current cohort cannot report ready until every member has every required period.",
        );
      }
      const definition = result.definition;
      if (!definition.recipe || typeof definition.recipe !== "object" || Array.isArray(definition.recipe)) {
        throw adapterContractViolation("Current cohort recipe must be an object.");
      }
      const states = definition.recipe.states.map((state, index) =>
        stateCode(state, `result.definition.recipe.states[${index}]`),
      );
      const conditions = definition.recipe.metricConditions.map((condition, index) => ({
        metric: enumValue(
          condition.metric,
          `result.definition.recipe.metricConditions[${index}].metric`,
          [...new Set(Object.values(BANK_SCREEN_TO_WORKSPACE_METRIC))],
        ),
        operator: enumValue(
          condition.operator,
          `result.definition.recipe.metricConditions[${index}].operator`,
          BANK_SCREEN_OPERATORS,
        ),
        value: finiteNumber(
          condition.value,
          `result.definition.recipe.metricConditions[${index}].value`,
          -1e15,
          1e15,
        ),
        upperValue: condition.upperValue,
      }));
      const excludedCerts = parseCerts(
        definition.excludedCerts,
        "result.definition.excludedCerts",
        250,
      );
      const screenStates = definition.screenFilters?.states.map((state, index) =>
        stateCode(state, `result.definition.screenFilters.states[${index}]`),
      ) ?? [];
      const screenConditions = definition.screenFilters?.metricConditions ?? [];
      const sectionItems: unknown[] = section === "members"
        ? members
        : section === "states"
          ? states
          : section === "conditions"
            ? conditions
            : section === "excluded_certs"
              ? excludedCerts
              : section === "screen_states"
                ? screenStates
                : screenConditions;
      const key = paginationKey({
        cohortHash: result.cohortHash,
        sourceAsOf: result.sourceAsOf,
        section,
      });
      const offset = decodeCursor(source.cursor, "current_cohort", key, sectionItems.length);
      const shared = {
        definition: {
          name: definition.recipe.name,
          basis: definition.recipe.basis,
          active: definition.recipe.active,
          assetMin: definition.recipe.assetRange.min,
          assetMax: definition.recipe.assetRange.max,
          minimumPeers: definition.recipe.minimumPeers,
          maximumPeers: definition.recipe.maximumPeers,
          screenDefinitionHash: definition.screenDefinitionHash,
          screen: definition.screenFilters
            ? {
                query: definition.screenFilters.query,
                active: definition.screenFilters.active,
                assetMin: definition.screenFilters.assetRange.min,
                assetMax: definition.screenFilters.assetRange.max,
              }
            : null,
          counts: {
            states: states.length,
            conditions: conditions.length,
            excludedCerts: excludedCerts.length,
            screenStates: screenStates.length,
            screenConditions: screenConditions.length,
          },
        },
        definitionHash: result.definitionHash,
        section,
      };
      let fittedPageSize = pageSize;
      while (true) {
        const page = pageItems(sectionItems, {
          scope: "current_cohort",
          key,
          offset,
          pageSize: fittedPageSize,
        });
        const summary = `The current peer cohort has ${members.length} members; this ${section} page returns ${page.items.length} complete records.`;
        const data = {
          ...shared,
          ...(section === "members"
            ? { members: page.items }
            : section === "states"
              ? { states: page.items }
              : section === "conditions"
                ? { conditions: page.items }
                : section === "excluded_certs"
                  ? { excludedCerts: page.items }
                  : section === "screen_states"
                    ? { screenStates: page.items }
                    : { screenConditions: page.items }),
          pagination: page.pagination,
          counts: {
            cohort: members.length,
            returned: page.pagination.returnedCount,
            omitted: page.pagination.omittedCount,
            withHistory: membersWithHistory,
            withRequiredPeriods: membersWithRequiredPeriods,
          },
          coverage: {
            ...coverage,
            memberCount: coverageMemberCount,
            membersWithHistory,
            membersWithRequiredPeriods,
            requiredPeriods,
          },
          sourceMode: result.sourceMode,
          ...resultFreshness(deps, result.sourceAsOf, result.retrievedAt),
          cohortHash: result.cohortHash,
        };
        if (fittedPageSize === 1 || fitsExtendedEnvelope(summary, data)) {
          return { summary, data };
        }
        fittedPageSize -= 1;
      }
    },
  });

  const analyzeCohortTrends = mutationTool({
    name: "bankgraph.analyze_cohort_trends",
    title: "Analyze trends in the current cohort",
    description:
      "Find current peer-cohort members whose exact changes satisfy one to six conditions, summarize concentration by state or opening asset bucket, and publish the complete bounded result into the visible shared workspace. The response defaults to 20 matching banks and 25 groups, supports up to 50 banks and 56 groups, and shrinks only when its serialized payload requires it. Read bankgraph.get_context first and pass its revision as ifRevision.",
    maxResultChars: MAX_WEBMCP_EXTENDED_ENVELOPE_CHARS,
    inputSchema: OBJECT(
      {
        from: PERIOD_SCHEMA,
        to: PERIOD_SCHEMA,
        conditions: ARRAY(TREND_CONDITION_SCHEMA, 6, 1),
        groupBy: ENUM(["state", "asset_bucket"]),
        pageSize: NUMBER(1, MAX_BANK_PAGE_SIZE, true, "Complete matching-bank records requested; defaults to 20."),
        cursor: STRING(128, "Opaque nextCursor from the previous page."),
        groupPageSize: NUMBER(1, MAX_TREND_GROUP_PAGE_SIZE, true, "Complete concentration groups requested; defaults to 25."),
        groupCursor: STRING(128, "Opaque group nextCursor from the previous page."),
        ifRevision: REVISION_SCHEMA,
      },
      ["from", "to", "conditions", "groupBy", "ifRevision"],
    ),
    controller: async (input, context) => {
      const source = inputObject(input, [
        "from", "to", "conditions", "groupBy", "pageSize", "cursor", "groupPageSize", "groupCursor", "ifRevision",
      ]);
      if (!deps.analyzeCohortTrends) {
        throw capabilityUnavailable(
          "Cohort trend analysis",
          "Open the analysis workspace and retry.",
        );
      }
      requireBoundedCurrentCohort(deps);
      const commitRevision = requiredRevision(source.ifRevision);
      requireRevision(deps.workspace.state, commitRevision);
      const request: WebMcpCohortTrendRequest = {
        from: reportingPeriod(source.from, "from"),
        to: reportingPeriod(source.to, "to"),
        conditions: parseTrendConditions(source.conditions, "conditions"),
        groupBy: enumValue(source.groupBy, "groupBy", ["state", "asset_bucket"] as const),
      };
      if (request.from >= request.to) {
        throw new WebMcpInputError("from must be earlier than to");
      }
      const pageSize = source.pageSize === undefined
        ? DEFAULT_TREND_PAGE_SIZE
        : integer(source.pageSize, "pageSize", 1, MAX_BANK_PAGE_SIZE);
      const groupPageSize = source.groupPageSize === undefined
        ? DEFAULT_TREND_GROUP_PAGE_SIZE
        : integer(source.groupPageSize, "groupPageSize", 1, MAX_TREND_GROUP_PAGE_SIZE);
      const result = await deps.analyzeCohortTrends(request, context);
      throwIfAborted(context.signal);
      requireRevision(deps.workspace.state, commitRevision);
      requireMatchingSourceMode(deps, result.sourceMode, "Cohort trend analysis");
      const cohortCount = integer(
        result.cohortCount,
        "result.cohortCount",
        0,
        WEBMCP_COHORT_ANALYSIS_LIMIT,
      );
      const comparableCount = integer(
        result.comparableCount,
        "result.comparableCount",
        0,
        cohortCount,
      );
      if (!Array.isArray(result.matches) || result.matches.length > WEBMCP_COHORT_ANALYSIS_LIMIT) {
        throw adapterContractViolation(
          `Cohort trend analysis must return at most ${WEBMCP_COHORT_ANALYSIS_LIMIT} matches.`,
        );
      }
      const requestedMetrics = [...new Set(request.conditions.map((condition) => condition.metric))];
      const expectedUnits = Object.fromEntries(
        requestedMetrics.map((metric) => [
          metric,
          researchMetricDefinition(metric).change,
        ]),
      );
      for (const metric of requestedMetrics) {
        if (result.changeUnits[metric] !== expectedUnits[metric]) {
          throw adapterContractViolation(
            `Cohort trend unit ${result.changeUnits[metric] ?? "missing"} is invalid for ${metric}.`,
          );
        }
      }
      const seen = new Set<number>();
      const matches = result.matches.map((member, index) => {
        const memberCert = cert(member.cert, `result.matches[${index}].cert`);
        if (seen.has(memberCert)) {
          throw adapterContractViolation(`Cohort trends returned certificate ${memberCert} twice.`);
        }
        seen.add(memberCert);
        return {
          cert: memberCert,
          name: stringValue(member.name, `result.matches[${index}].name`, { min: 1, max: 200 }),
          state: member.state === null ? null : stateCode(member.state, `result.matches[${index}].state`),
          assetBucket: member.assetBucket === null
            ? null
            : integer(member.assetBucket, `result.matches[${index}].assetBucket`, 0, 100),
          totalAssets: member.totalAssets === null
            ? null
            : finiteNumber(member.totalAssets, `result.matches[${index}].totalAssets`, 0, 1e15),
          changes: Object.fromEntries(requestedMetrics.map((metric) => {
            const value = member.changes[metric];
            return [metric, value === null || value === undefined
              ? null
              : finiteNumber(value, `result.matches[${index}].changes.${metric}`, -1e8, 1e8)];
          })),
        };
      });
      const cohortHash = stringValue(
        result.cohortHash,
        "result.cohortHash",
        { min: 1, max: 128 },
      );
      const definitionHash = stringValue(
        result.definitionHash,
        "result.definitionHash",
        { min: 1, max: 128 },
      );
      if (
        !result.definition ||
        typeof result.definition !== "object" ||
        Array.isArray(result.definition) ||
        paginationKey(result.definition) !== definitionHash
      ) {
        throw adapterContractViolation(
          "Cohort trend definition must match its definitionHash.",
        );
      }
      const coverage = {
        status: enumValue(
          result.coverage.status,
          "result.coverage.status",
          ["ready", "partial"] as const,
        ),
        from: reportingPeriod(result.coverage.from, "result.coverage.from"),
        to: reportingPeriod(result.coverage.to, "result.coverage.to"),
        missingCount: integer(
          result.coverage.missingCount,
          "result.coverage.missingCount",
          0,
          cohortCount,
        ),
      };
      if (coverage.from !== request.from || coverage.to !== request.to) {
        throw adapterContractViolation(
          "Cohort trend coverage periods must match the requested periods.",
        );
      }
      if (coverage.missingCount !== cohortCount - comparableCount) {
        throw adapterContractViolation(
          "Cohort trend missingCount must equal cohortCount minus comparableCount.",
        );
      }
      const key = paginationKey({ request, cohortHash });
      const offset = decodeCursor(source.cursor, "cohort_trends", key, matches.length);
      if (!Array.isArray(result.groups) || result.groups.length > 100) {
        throw adapterContractViolation("Cohort trend analysis must return at most 100 groups.");
      }
      const groupValues = result.groups.map((group, index) => ({
        key: stringValue(group.key, `result.groups[${index}].key`, { min: 1, max: 80 }),
        label: stringValue(group.label, `result.groups[${index}].label`, { min: 1, max: 120 }),
        matchingCount: integer(
          group.matchingCount,
          `result.groups[${index}].matchingCount`,
          0,
          cohortCount,
        ),
        shareOfMatches: finiteNumber(
          group.shareOfMatches,
          `result.groups[${index}].shareOfMatches`,
          0,
          1,
        ),
      }));
      const groupOffset = decodeCursor(
        source.groupCursor,
        "cohort_trend_groups",
        key,
        groupValues.length,
      );
      const invocationContext = dataContext(deps);
      const resultId = `trend-${lineageHash({
        request,
        cohortHash,
        definitionHash,
        sourceAsOf: result.sourceAsOf,
        releaseGeneration: invocationContext.releaseGeneration,
      }).slice("fnv1a32:".length)}`;
      const existing = deps.workspace.state.cohortTrendResult;
      const sameResult = existing?.id === resultId;
      const materialized: CohortTrendResultSet = {
        id: resultId,
        basedOnRevision: sameResult ? existing.basedOnRevision : commitRevision,
        publishedRevision: sameResult ? existing.publishedRevision : commitRevision + 1,
        from: request.from,
        to: request.to,
        conditions: request.conditions,
        groupBy: request.groupBy,
        metrics: requestedMetrics,
        changeUnits: expectedUnits,
        rows: matches,
        groups: groupValues,
        counts: {
          cohort: cohortCount,
          comparable: comparableCount,
          matching: matches.length,
        },
        coverage: {
          status: coverage.status,
          missingCount: coverage.missingCount,
        },
        peerRecipe: result.definition.recipe,
        excludedCount: result.definition.excludedCerts.length,
        definitionHash,
        cohortHash,
        sourceMode: result.sourceMode,
        sourceAsOf: result.sourceAsOf,
        retrievedAt: result.retrievedAt,
        release: invocationContext.release,
        releaseGeneration: invocationContext.releaseGeneration,
      };
      const commit = executeSeries(
        deps.workspace,
        [
          workspaceCommands.setAnalysisResult(null),
          workspaceCommands.setCohortTrendResult(materialized),
        ],
        commitRevision,
        context.signal,
      );
      let fittedPageSize = pageSize;
      let fittedGroupPageSize = groupPageSize;
      while (true) {
        const page = pageItems(matches, {
          scope: "cohort_trends",
          key,
          offset,
          pageSize: fittedPageSize,
        });
        const groupPage = pageItems(groupValues, {
          scope: "cohort_trend_groups",
          key,
          offset: groupOffset,
          pageSize: fittedGroupPageSize,
        });
        const summary = `${matches.length} of ${comparableCount} comparable cohort members match; the visible workspace now holds the complete result and this tool page returns ${page.items.length}.`;
        const data = {
          from: request.from,
          to: request.to,
          conditions: request.conditions,
          groupBy: request.groupBy,
          matches: page.items,
          pagination: page.pagination,
          counts: {
            cohort: cohortCount,
            comparable: comparableCount,
            matching: matches.length,
            returned: page.pagination.returnedCount,
            omitted: page.pagination.omittedCount,
          },
          groups: groupPage.items,
          groupPagination: groupPage.pagination,
          groupCounts: {
            total: groupValues.length,
            returned: groupPage.pagination.returnedCount,
            omitted: groupPage.pagination.omittedCount,
          },
          changeUnits: expectedUnits,
          definitionHash,
          coverage,
          sourceMode: result.sourceMode,
          ...resultFreshness(deps, result.sourceAsOf, result.retrievedAt),
          cohortHash,
          workspace: {
            changed: commit.changed,
            revision: commit.state.revision,
            resultId,
            resultRevision: materialized.publishedRevision,
            visibleRows: matches.length,
          },
          nextActions: [
            { tool: "bankgraph.build_board_from_result", input: { resultId, rankMetric: requestedMetrics[0], direction: "highest", bankCount: 8, boardMode: "replace" } },
            { tool: "bankgraph.read_result_set", input: { resultId } },
          ],
        };
        if (
          (fittedPageSize === 1 && fittedGroupPageSize === 1) ||
          fitsExtendedEnvelope(summary, data)
        ) {
          return { summary, data };
        }
        const rowChars = JSON.stringify(page.items).length;
        const groupChars = JSON.stringify(groupPage.items).length;
        if (fittedPageSize > 1 && (fittedGroupPageSize === 1 || rowChars >= groupChars)) {
          fittedPageSize -= 1;
        } else {
          fittedGroupPageSize -= 1;
        }
      }
    },
  });

  const readResultSet = readOnlyTool({
    name: "bankgraph.read_result_set",
    title: "Read a materialized workspace result",
    description:
      "Read the exact rows, concentration groups, definition, coverage, and lineage of the current visible cohort result without rerunning the analysis. Pass the stable resultId returned by bankgraph.analyze_cohort_trends. Pages default to 50 complete records, accept up to 100, and automatically shrink to the largest complete page that fits the serialized result budget.",
    maxResultChars: MAX_WEBMCP_EXTENDED_ENVELOPE_CHARS,
    inputSchema: OBJECT(
      {
        resultId: STRING(64, "Stable resultId returned by the analysis tool.", 1),
        section: ENUM(["rows", "groups"]),
        pageSize: NUMBER(1, MAX_RESULT_SET_PAGE_SIZE, true, "Complete result records requested; defaults to 50."),
        cursor: STRING(128, "Opaque nextCursor from the previous result-set page."),
      },
      ["resultId"],
    ),
    controller: async (input) => {
      const source = inputObject(input, ["resultId", "section", "pageSize", "cursor"]);
      const resultId = identifier(source.resultId, "resultId");
      const section = source.section === undefined
        ? "rows"
        : enumValue(source.section, "section", ["rows", "groups"] as const);
      const requestedPageSize = source.pageSize === undefined
        ? DEFAULT_RESULT_SET_PAGE_SIZE
        : integer(source.pageSize, "pageSize", 1, MAX_RESULT_SET_PAGE_SIZE);
      const state = deps.workspace.state;
      const result = state.cohortTrendResult;
      if (!result || result.id !== resultId) {
        throw new WebMcpToolError(
          "result_set_not_found",
          result
            ? `Result ${resultId} is no longer current. The visible workspace now holds ${result.id}.`
            : `Result ${resultId} is no longer present in the visible workspace.`,
          {
            requestedResultId: resultId,
            currentResultId: result?.id ?? null,
            nextAction: "Read bankgraph.get_context, or run bankgraph.analyze_cohort_trends again.",
          },
        );
      }
      const items: readonly (
        | CohortTrendResultSet["rows"][number]
        | CohortTrendResultSet["groups"][number]
      )[] = section === "rows" ? result.rows : result.groups;
      const key = paginationKey({
        resultId,
        resultRevision: result.publishedRevision,
        section,
      });
      const offset = decodeCursor(source.cursor, `result_set_${section}`, key, items.length);
      const summary = `${result.id}: ${result.counts.matching} matching banks; reading ${section}.`;
      const shared = {
        resultId: result.id,
        resultRevision: result.publishedRevision,
        basedOnRevision: result.basedOnRevision,
        workspaceRevision: state.revision,
        section,
        periods: { from: result.from, to: result.to },
        definition: {
          conditions: result.conditions,
          groupBy: result.groupBy,
          peerRecipe: result.peerRecipe,
          excludedCount: result.excludedCount,
          definitionHash: result.definitionHash,
          cohortHash: result.cohortHash,
        },
        metrics: result.metrics,
        changeUnits: result.changeUnits,
        counts: result.counts,
        coverage: result.coverage,
        lineage: {
          sourceMode: result.sourceMode,
          sourceAsOf: result.sourceAsOf,
          retrievedAt: result.retrievedAt,
          release: result.release,
          releaseGeneration: result.releaseGeneration,
        },
      };
      let pageSize = requestedPageSize;
      while (true) {
        const page = pageItems(items, {
          scope: `result_set_${section}`,
          key,
          offset,
          pageSize,
        });
        const data = {
          ...shared,
          ...(section === "rows" ? { rows: page.items } : { groups: page.items }),
          pagination: page.pagination,
        };
        if (
          pageSize === 1 ||
          fitsExtendedEnvelope(summary, data)
        ) {
          return { summary, data };
        }
        pageSize -= 1;
      }
    },
  });

  const buildBoardFromResult = mutationTool({
    name: "bankgraph.build_board_from_result",
    title: "Build a board from measure-defined results",
    description:
      "Turn the matching banks from the current bankgraph.analyze_cohort_trends result into the selected banks on a comparison board. The original cohort remains the benchmark. Rank the matches by any measure used in the result, choose up to 10 banks, and optionally replace the board with exact values, histories, a peer distribution, and a relationship view. Use this after a multi-period measure screen when the bank names were not known in advance. Read bankgraph.get_context first and pass its revision as ifRevision.",
		maxResultChars: MAX_WEBMCP_EXTENDED_ENVELOPE_CHARS,
    inputSchema: OBJECT(
      {
        resultId: STRING(64, "Stable resultId returned by bankgraph.analyze_cohort_trends.", 1),
        rankMetric: VISIBLE_METRIC_SCHEMA,
        direction: ENUM(["highest", "lowest"]),
        bankCount: NUMBER(1, 10, true, "Number of matching banks to place on the board."),
        metrics: ARRAY(VISIBLE_METRIC_SCHEMA, 6, 1),
        question: STRING(1_000, "Optional board title or research question."),
        boardMode: ENUM(["replace", "keep"], "Replace the current views with a comparison board, or keep its views."),
        ifRevision: REVISION_SCHEMA,
      },
      ["resultId", "rankMetric", "direction", "bankCount", "boardMode", "ifRevision"],
    ),
    controller: async (input, context) => {
      const source = inputObject(input, [
        "resultId", "rankMetric", "direction", "bankCount", "metrics", "question", "boardMode", "ifRevision",
      ]);
      const resultId = identifier(source.resultId, "resultId");
      const rankMetric = enumValue(source.rankMetric, "rankMetric", WORKSPACE_VISIBLE_METRICS);
      const direction = enumValue(source.direction, "direction", ["highest", "lowest"] as const);
      const bankCount = integer(source.bankCount, "bankCount", 1, 10);
      const boardMode = enumValue(source.boardMode, "boardMode", ["replace", "keep"] as const);
      const commitRevision = requiredRevision(source.ifRevision);
      requireRevision(deps.workspace.state, commitRevision);
      const result = deps.workspace.state.cohortTrendResult;
      if (!result || result.id !== resultId) {
        throw new WebMcpToolError(
          "result_set_not_found",
          result
            ? `Result ${resultId} is no longer current. The visible workspace now holds ${result.id}.`
            : `Result ${resultId} is no longer present in the visible workspace.`,
          { requestedResultId: resultId, currentResultId: result?.id ?? null },
        );
      }
      if (!result.metrics.includes(rankMetric)) {
        throw new WebMcpInputError(`rankMetric must be one of the measures in this result: ${result.metrics.join(", ")}`);
      }
      const ranked = result.rows
        .flatMap((row) => {
          const value = row.changes[rankMetric];
          return value == null ? [] : [{ ...row, value }];
        })
        .sort((left, right) => {
          const byValue = direction === "highest" ? right.value - left.value : left.value - right.value;
          return byValue || (right.totalAssets ?? 0) - (left.totalAssets ?? 0) || left.cert - right.cert;
        });
      const selected = ranked.slice(0, bankCount);
      if (!selected.length) {
        throw new WebMcpToolError("empty_result_set", `Result ${resultId} has no comparable ${rankMetric} values.`, { resultId, rankMetric });
      }
      const certs = selected.map((row) => row.cert);
      const requestedMetrics = source.metrics === undefined
        ? result.metrics.slice(0, 6) as WorkspaceVisibleMetric[]
        : parseMetrics(source.metrics, "metrics", 6, 1);
      const metrics = [rankMetric, ...requestedMetrics.filter((metric) => metric !== rankMetric)].slice(0, 6);
      await deps.ensureBanksLoaded?.(certs, context);
      throwIfAborted(context.signal);
      requireRevision(deps.workspace.state, commitRevision);
      const commands: WorkspaceCommand[] = [
        workspaceCommands.setSelectedCerts(certs),
        workspaceCommands.setActiveBank(certs[0]),
        workspaceCommands.setAsOfQuarter(result.to),
        workspaceCommands.setComparison({ mode: "custom", rangeStartQuarter: result.from, customQuarter: result.from }),
        workspaceCommands.setChartHistory({ from: result.from, to: result.to }),
        workspaceCommands.setActiveMetric(rankMetric),
        workspaceCommands.upsertChart({ id: "linked-analysis", title: "Banks selected from the measure screen", kind: "line", metrics, certs, scale: "value", stacked: false, visible: true }),
      ];
      if (source.question !== undefined) {
        commands.unshift(workspaceCommands.setQuestion(stringValue(source.question, "question", { max: 1_000, trim: false })));
      }
      const committed = executeSeries(deps.workspace, commands, commitRevision, context.signal);
      const board = boardMode === "replace" && deps.applyBoardTemplate
        ? await deps.applyBoardTemplate({
            templateId: "peer_comparison",
            mode: "replace",
            focus: false,
            sortMetric: rankMetric,
            sortBasis: "change",
            sortDirection: direction === "highest" ? "desc" : "asc",
          }, context)
        : { changed: false, blockIds: [] as string[] };
      return {
        summary: `${selected.length} matching bank${selected.length === 1 ? "" : "s"} now form the visible answer set; the original ${result.counts.cohort}-bank cohort remains the benchmark.`,
        data: {
          changed: committed.changed || board.changed,
          revision: deps.workspace.state.revision,
          resultId,
          ranking: { metric: rankMetric, unit: result.changeUnits[rankMetric], direction },
          selectedBanks: selected.map(({ cert, name, state, totalAssets, value }) => ({ cert, name, state, totalAssets, value })),
          metrics,
          comparison: { from: result.from, to: result.to },
          benchmark: { cohortCount: result.counts.cohort, comparableCount: result.counts.comparable, matchingCount: result.counts.matching },
          board: { mode: boardMode, blockIds: board.blockIds },
          ...dataContext(deps),
        },
      };
    },
  });

  const rankCohortOnBoard = mutationTool({
    name: "bankgraph.rank_cohort_on_board",
    title: "Rank a cohort by a measure and build a board",
    description:
      "Rank the current cohort by one reported measure, select up to 10 banks from either tail, and optionally replace the board with exact values, histories, a peer distribution, and a relationship view. Use this for questions such as which banks have the highest loan-to-deposit ratio when bank names are not known in advance. The full cohort remains the benchmark behind the selected answer set. Read bankgraph.get_context first and pass its revision as ifRevision.",
    inputSchema: OBJECT(
      {
        metric: VISIBLE_METRIC_SCHEMA,
        direction: ENUM(["highest", "lowest"]),
        bankCount: NUMBER(1, 10, true, "Number of ranked banks to place on the board."),
        metrics: ARRAY(VISIBLE_METRIC_SCHEMA, 6, 1),
        question: STRING(1_000, "Optional board title or research question."),
        boardMode: ENUM(["replace", "keep"], "Replace the current views with a comparison board, or keep its views."),
        ifRevision: REVISION_SCHEMA,
      },
      ["metric", "direction", "bankCount", "boardMode", "ifRevision"],
    ),
    controller: async (input, context) => {
      const source = inputObject(input, ["metric", "direction", "bankCount", "metrics", "question", "boardMode", "ifRevision"]);
      if (!deps.analyzePeerDistribution) throw capabilityUnavailable("Cohort ranking", "Open the analysis workspace and retry.");
      requireBoundedCurrentCohort(deps);
      const metric = enumValue(source.metric, "metric", WORKSPACE_VISIBLE_METRICS);
      const direction = enumValue(source.direction, "direction", ["highest", "lowest"] as const);
      const bankCount = integer(source.bankCount, "bankCount", 1, 10);
      const boardMode = enumValue(source.boardMode, "boardMode", ["replace", "keep"] as const);
      const commitRevision = requiredRevision(source.ifRevision);
      requireRevision(deps.workspace.state, commitRevision);
      const distribution = await deps.analyzePeerDistribution({ metric }, context);
      throwIfAborted(context.signal);
      requireRevision(deps.workspace.state, commitRevision);
      requireMatchingSourceMode(deps, distribution.sourceMode, "Cohort ranking");
      const tail = direction === "highest" ? distribution.highest : distribution.lowest;
      const selected = tail.slice(0, bankCount).map((bank, index) => boundedDistributionBank(bank, `result.${direction}[${index}]`));
      if (!selected.length) throw new WebMcpToolError("empty_cohort", `The current cohort has no comparable ${metric} values.`, { metric });
      const certs = selected.map((bank) => bank.cert);
      const requestedMetrics = source.metrics === undefined ? visibleMetricsFromState(deps.workspace.state) : parseMetrics(source.metrics, "metrics", 6, 1);
      const metrics = [metric, ...requestedMetrics.filter((item) => item !== metric)].slice(0, 6);
      await deps.ensureBanksLoaded?.(certs, context);
      throwIfAborted(context.signal);
      requireRevision(deps.workspace.state, commitRevision);
      const commands: WorkspaceCommand[] = [
        workspaceCommands.setSelectedCerts(certs),
        workspaceCommands.setActiveBank(certs[0]),
        workspaceCommands.setActiveMetric(metric),
        workspaceCommands.upsertChart({ id: "linked-analysis", title: `Banks ranked by ${researchMetricDefinition(metric).label}`, kind: "line", metrics, certs, scale: "value", stacked: false, visible: true }),
      ];
      if (source.question !== undefined) {
        commands.unshift(workspaceCommands.setQuestion(stringValue(source.question, "question", { max: 1_000, trim: false })));
      }
      const committed = executeSeries(deps.workspace, commands, commitRevision, context.signal);
      const board = boardMode === "replace" && deps.applyBoardTemplate
        ? await deps.applyBoardTemplate({ templateId: "peer_comparison", mode: "replace", focus: false }, context)
        : { changed: false, blockIds: [] as string[] };
      return {
        summary: `${selected.length} bank${selected.length === 1 ? "" : "s"} from the ${direction} end of the cohort now form the visible answer set.`,
        data: {
          changed: committed.changed || board.changed,
          revision: deps.workspace.state.revision,
          metric,
          unit: WEBMCP_METRIC_METHODS[metric].unit,
          direction,
          period: distribution.period,
          selectedBanks: selected,
          metrics,
          benchmark: { cohortCount: distribution.count, missingCount: distribution.missingCount, statistics: distribution.statistics },
          board: { mode: boardMode, blockIds: board.blockIds },
          ...dataContext(deps),
        },
      };
    },
  });

  const analyzeCohortChange = mutationTool({
    name: "bankgraph.analyze_cohort_change",
    title: "Explain change across the current cohort",
    description:
      "Compare one to six canonical measures across any two reporting quarters for the current workspace cohort. Publishes per-measure coverage, breadth, distributions, matched totals where addition is valid, gross movement, concentration, movers, and optional group movement into the visible workspace. Membership is held fixed across both quarters. boardSpan accepts quarter, half, three-quarter, or full; omission keeps current defaults. Read bankgraph.get_context first and pass its revision as ifRevision.",
    maxResultChars: MAX_WEBMCP_EXTENDED_ENVELOPE_CHARS,
    inputSchema: OBJECT({
      from: PERIOD_SCHEMA,
      to: PERIOD_SCHEMA,
      metrics: ARRAY(VISIBLE_METRIC_SCHEMA, 6, 1),
      groupBy: ENUM(["none", "state", "asset_bucket"]),
      groupPageSize: NUMBER(1, MAX_ANALYSIS_PAGE_SIZE, true, "Groups requested in this response; defaults to 25."),
      groupCursor: STRING(128, "Opaque group cursor from the previous response."),
      boardBlockId: STRING(64, "Stable visible board view ID."),
      boardTitle: STRING(160, "Visible board view title."),
      boardView: ENUM(["summary", "breadth", "distribution", "movers", "waterfall", "exact_table"]),
      boardSpan: BOARD_SPAN_SCHEMA,
      boardFocus: BOOLEAN,
      ifRevision: REVISION_SCHEMA,
    }, ["from", "to", "metrics", "ifRevision"]),
    controller: async (input, context) => {
      const source = inputObject(input, ["from", "to", "metrics", "groupBy", "groupPageSize", "groupCursor", "boardBlockId", "boardTitle", "boardView", "boardSpan", "boardFocus", "ifRevision"]);
      if (!deps.analyzeCohortChange) throw capabilityUnavailable("Cohort change analysis", "Open the research workspace and retry.");
      requireBoundedCurrentCohort(deps);
      const commitRevision = requiredRevision(source.ifRevision);
      requireRevision(deps.workspace.state, commitRevision);
      const request: WebMcpCohortChangeRequest = {
        from: reportingPeriod(source.from, "from"),
        to: reportingPeriod(source.to, "to"),
        metrics: parseMetrics(source.metrics, "metrics", 6, 1),
        groupBy: source.groupBy === undefined ? "none" : enumValue(source.groupBy, "groupBy", ["none", "state", "asset_bucket"] as const),
      };
      if (request.from >= request.to) throw new WebMcpInputError("from must be earlier than to");
      const result = await deps.analyzeCohortChange(request, context);
      throwIfAborted(context.signal);
      requireRevision(deps.workspace.state, commitRevision);
      validateAnalysisContext(deps, result, "Cohort change analysis");
      const analyzedCount = integer(result.transition.cohort.count, "result.transition.cohort.count", 0, WEBMCP_COHORT_ANALYSIS_LIMIT);
      const invocationContext = dataContext(deps);
      const resultId = `change-${lineageHash({ request, cohortHash: result.cohortHash, releaseGeneration: invocationContext.releaseGeneration }).slice("fnv1a32:".length)}`;
      const existing = deps.workspace.state.analysisResult;
      const sameResult = existing?.id === resultId;
      const materialized: CohortChangeAnalysisResult = {
        id: resultId,
        kind: "cohort_change",
        basedOnRevision: sameResult ? existing.basedOnRevision : commitRevision,
        publishedRevision: sameResult ? existing.publishedRevision : commitRevision + 1,
        title: `${request.metrics.length === 1 ? researchMetricDefinition(request.metrics[0]).label : `${request.metrics.length} measures`} · ${quarterName(request.from)} to ${quarterName(request.to)}`,
        spec: request,
        population: materializedPopulation(result, analyzedCount),
        lineage: {
          sourceMode: result.sourceMode,
          sourceAsOf: result.sourceAsOf,
          retrievedAt: result.retrievedAt,
          release: invocationContext.release,
          releaseGeneration: invocationContext.releaseGeneration,
        },
        transition: result.transition,
      };
      const ref = await analysisResultRef(deps, materialized, context);
      requireRevision(deps.workspace.state, commitRevision);
      const block = analysisBoardBlock(materialized, ref, source, "breadth");
      const commands: WorkspaceCommand[] = [
		workspaceCommands.setCohortTrendResult(null),
        workspaceCommands.setAnalysisResult(materialized),
        workspaceCommands.upsertBoardBlock(block),
      ];
      if (source.boardFocus !== false) commands.push(workspaceCommands.focusBoardBlock(block.id));
      const commit = executeSeries(deps.workspace, commands, commitRevision, context.signal);
      const groups = result.transition.groups;
      const pageSize = source.groupPageSize === undefined ? DEFAULT_ANALYSIS_PAGE_SIZE : integer(source.groupPageSize, "groupPageSize", 1, MAX_ANALYSIS_PAGE_SIZE);
      const key = paginationKey({ resultId, section: "groups" });
      const offset = decodeCursor(source.groupCursor, "analysis_groups", key, groups.length);
      let fittedPageSize = pageSize;
      while (true) {
        const page = pageItems(groups, { scope: "analysis_groups", key, offset, pageSize: fittedPageSize });
        const summary = `${analyzedCount} current workspace members analyzed across ${request.metrics.length} measures from ${quarterName(request.from)} to ${quarterName(request.to)}.`;
        const data = {
          resultId,
          kind: materialized.kind,
          periods: result.transition.period,
          membershipBasis: materialized.population.membershipBasis,
          analyzedCount,
          metrics: result.transition.metrics,
          groups: page.items,
          groupPagination: page.pagination,
          workspace: { changed: commit.changed, revision: commit.state.revision, resultRevision: materialized.publishedRevision },
          board: { blockId: block.id, view: block.binding.view, span: block.span, visible: true },
          lineage: materialized.lineage,
          nextAction: { tool: "bankgraph.read_analysis_result", input: { resultId } },
        };
        if (fittedPageSize === 1 || fitsExtendedEnvelope(summary, data)) return { summary, data };
        fittedPageSize -= 1;
      }
    },
  });

  const findTemporalPatterns = mutationTool({
    name: "bankgraph.find_temporal_patterns",
    title: "Find multi-quarter patterns",
    description:
      "Apply one declared multi-quarter predicate to one to three canonical measures for every current workspace cohort member. Supports k-of-n direction, streaks, cumulative change, acceleration or deceleration, and threshold crossings. Publishes matches with exact periods, coverage, trigger quarters, and bounded series. boardSpan accepts quarter, half, three-quarter, or full; omission keeps current defaults. Read bankgraph.get_context first and pass its revision as ifRevision.",
    maxResultChars: MAX_WEBMCP_EXTENDED_ENVELOPE_CHARS,
    inputSchema: OBJECT({
      metrics: ARRAY(VISIBLE_METRIC_SCHEMA, 3, 1),
      startPeriod: PERIOD_SCHEMA,
      endPeriod: PERIOD_SCHEMA,
      requiredPeriods: ARRAY(PERIOD_SCHEMA, 40, 2),
      pattern: ENUM(["direction_count", "consecutive_streak", "cumulative_change", "change_acceleration", "threshold_cross"]),
      direction: ENUM(["increase", "decrease", "accelerating", "decelerating", "above", "below"]),
      atLeast: NUMBER(1, 159, true),
      minimumIntervals: NUMBER(1, 159, true),
      operator: ENUM(["gt", "gte", "lt", "lte", "eq"]),
      threshold: NUMBER(-1e12, 1e12),
      minimumObservations: NUMBER(2, 160, true),
      gapPolicy: ENUM(["require_complete", "allow_missing"]),
      tolerance: NUMBER(0, 1e9),
      pageSize: NUMBER(1, MAX_ANALYSIS_PAGE_SIZE, true, "Matched banks requested; defaults to 25."),
      cursor: STRING(128, "Opaque matched-bank cursor from the previous response."),
      boardBlockId: STRING(64, "Stable visible board view ID."),
      boardTitle: STRING(160, "Visible board view title."),
      boardView: ENUM(["summary", "matched_banks", "small_multiples", "timeline", "exact_table"]),
      boardSpan: BOARD_SPAN_SCHEMA,
      ifRevision: REVISION_SCHEMA,
    }, ["metrics", "pattern", "ifRevision"]),
    controller: async (input, context) => {
      const source = inputObject(input, [
        "metrics", "startPeriod", "endPeriod", "requiredPeriods", "pattern", "direction", "atLeast", "minimumIntervals", "operator", "threshold", "minimumObservations", "gapPolicy", "tolerance", "pageSize", "cursor", "boardBlockId", "boardTitle", "boardView", "boardSpan", "ifRevision",
      ]);
      if (!deps.findTemporalPatterns) throw capabilityUnavailable("Temporal pattern analysis", "Open the research workspace and retry.");
      requireBoundedCurrentCohort(deps);
      const commitRevision = requiredRevision(source.ifRevision);
      requireRevision(deps.workspace.state, commitRevision);
      const hasWindow = source.startPeriod !== undefined || source.endPeriod !== undefined;
      const hasRequired = source.requiredPeriods !== undefined;
      if (hasWindow === hasRequired) throw new WebMcpInputError("provide either startPeriod and endPeriod, or requiredPeriods");
      if (hasWindow && (source.startPeriod === undefined || source.endPeriod === undefined)) {
        throw new WebMcpInputError("startPeriod and endPeriod are both required for a period window");
      }
      const requiredPeriods = hasRequired
        ? unique(arrayValue(source.requiredPeriods, "requiredPeriods", { min: 2, max: 40, map: (item, index) => reportingPeriod(item, `requiredPeriods[${index}]`) }), "requiredPeriods").sort()
        : [];
      const periodWindow = hasWindow
        ? { startPeriod: reportingPeriod(source.startPeriod, "startPeriod"), endPeriod: reportingPeriod(source.endPeriod, "endPeriod") }
        : null;
      if (periodWindow && periodWindow.startPeriod >= periodWindow.endPeriod) throw new WebMcpInputError("startPeriod must be earlier than endPeriod");
      const quarterDistance = periodWindow
        ? compareReportingQuarters(periodWindow.endPeriod, periodWindow.startPeriod)
        : null;
      const periodCount = periodWindow && quarterDistance !== null
        ? quarterDistance + 1
        : requiredPeriods.length;
      const request: WebMcpTemporalPatternRequest = {
        metrics: parseMetrics(source.metrics, "metrics", 3, 1),
        periodWindow,
        requiredPeriods,
        minimumObservations: source.minimumObservations === undefined ? Math.min(periodCount, 4) : integer(source.minimumObservations, "minimumObservations", 2, 160),
        gapPolicy: source.gapPolicy === undefined ? "require_complete" : enumValue(source.gapPolicy, "gapPolicy", ["require_complete", "allow_missing"] as const),
        tolerance: source.tolerance === undefined ? 0 : finiteNumber(source.tolerance, "tolerance", 0, 1e9),
        pattern: parseTemporalPattern(source),
      };
      const result = await deps.findTemporalPatterns(request, context);
      throwIfAborted(context.signal);
      requireRevision(deps.workspace.state, commitRevision);
      validateAnalysisContext(deps, result, "Temporal pattern analysis");
      const counts = result.counts;
      const analyzedCount = integer(counts.cohort, "result.counts.cohort", 0, WEBMCP_COHORT_ANALYSIS_LIMIT);
      if (counts.matched + counts.notMatched + counts.insufficientData !== analyzedCount || result.rows.length !== counts.matched) {
        throw adapterContractViolation("Temporal pattern counts must partition the cohort and rows must contain every match.");
      }
      const invocationContext = dataContext(deps);
      const resultId = `pattern-${lineageHash({ request, cohortHash: result.cohortHash, releaseGeneration: invocationContext.releaseGeneration }).slice("fnv1a32:".length)}`;
      const existing = deps.workspace.state.analysisResult;
      const sameResult = existing?.id === resultId;
      const materialized: TemporalPatternAnalysisResult = {
        id: resultId,
        kind: "temporal_pattern",
        basedOnRevision: sameResult ? existing.basedOnRevision : commitRevision,
        publishedRevision: sameResult ? existing.publishedRevision : commitRevision + 1,
        title: `${request.metrics.length === 1 ? researchMetricDefinition(request.metrics[0]).label : `${request.metrics.length} measures`} · multi-quarter pattern`,
        spec: request,
        counts,
        rows: result.rows,
        population: materializedPopulation(result, analyzedCount),
        lineage: {
          sourceMode: result.sourceMode,
          sourceAsOf: result.sourceAsOf,
          retrievedAt: result.retrievedAt,
          release: invocationContext.release,
          releaseGeneration: invocationContext.releaseGeneration,
        },
      };
      const ref = await analysisResultRef(deps, materialized, context);
      requireRevision(deps.workspace.state, commitRevision);
      const block = analysisBoardBlock(materialized, ref, source, "matched_banks");
      const commands: WorkspaceCommand[] = [
		workspaceCommands.setCohortTrendResult(null),
        workspaceCommands.setAnalysisResult(materialized),
        workspaceCommands.upsertBoardBlock(block),
      ];
      if (source.boardFocus !== false) commands.push(workspaceCommands.focusBoardBlock(block.id));
      const commit = executeSeries(deps.workspace, commands, commitRevision, context.signal);
      const pageSize = source.pageSize === undefined ? DEFAULT_ANALYSIS_PAGE_SIZE : integer(source.pageSize, "pageSize", 1, MAX_ANALYSIS_PAGE_SIZE);
      const key = paginationKey({ resultId, section: "rows" });
      const offset = decodeCursor(source.cursor, "analysis_rows", key, result.rows.length);
      let fittedPageSize = pageSize;
      while (true) {
        const page = pageItems(result.rows, { scope: "analysis_rows", key, offset, pageSize: fittedPageSize });
        const summary = `${counts.matched} of ${analyzedCount} current workspace members match the declared pattern; ${counts.insufficientData} lack enough exact observations.`;
        const data = {
          resultId,
          kind: materialized.kind,
          spec: request,
          membershipBasis: materialized.population.membershipBasis,
          counts,
          rows: page.items,
          pagination: page.pagination,
          workspace: { changed: commit.changed, revision: commit.state.revision, resultRevision: materialized.publishedRevision },
          board: { blockId: block.id, view: block.binding.view, span: block.span, visible: true },
          lineage: materialized.lineage,
          nextAction: { tool: "bankgraph.read_analysis_result", input: { resultId, section: "rows" } },
        };
        if (fittedPageSize === 1 || fitsExtendedEnvelope(summary, data)) return { summary, data };
        fittedPageSize -= 1;
      }
    },
  });

  const analyzeFinancialComposition = mutationTool({
    name: "bankgraph.analyze_financial_composition",
    title: "Analyze financial composition",
    description:
      "Analyze asset, funding, or loan mix for one selected bank, all selected banks, or the current workspace cohort. Uses ratios of sums over the same complete reporters, shows the loan-basis residual, and can compare quarters on a matched-reporter basis. Publishes the exact composition. boardSpan accepts quarter, half, three-quarter, or full; omission keeps current defaults. Read bankgraph.get_context first and pass its revision as ifRevision.",
    maxResultChars: MAX_WEBMCP_EXTENDED_ENVELOPE_CHARS,
    inputSchema: OBJECT({
      composition: ENUM(["asset_mix", "funding_mix", "loan_mix"]),
      scope: ENUM(["selected_bank", "selected_banks", "current_cohort"]),
      cert: CERT_SCHEMA,
      period: PERIOD_SCHEMA,
      compareFrom: PERIOD_SCHEMA,
      boardBlockId: STRING(64, "Stable visible board view ID."),
      boardTitle: STRING(160, "Visible board view title."),
      boardView: ENUM(["summary", "stacked_composition", "change_waterfall", "exact_table"]),
      boardSpan: BOARD_SPAN_SCHEMA,
      boardFocus: BOOLEAN,
      ifRevision: REVISION_SCHEMA,
    }, ["composition", "scope", "period", "ifRevision"]),
    controller: async (input, context) => {
      const source = inputObject(input, ["composition", "scope", "cert", "period", "compareFrom", "boardBlockId", "boardTitle", "boardView", "boardSpan", "boardFocus", "ifRevision"]);
      if (!deps.analyzeFinancialComposition) throw capabilityUnavailable("Financial composition analysis", "Open the research workspace and retry.");
      requireBoundedCurrentCohort(deps);
      const commitRevision = requiredRevision(source.ifRevision);
      requireRevision(deps.workspace.state, commitRevision);
      const scope = enumValue(source.scope, "scope", ["selected_bank", "selected_banks", "current_cohort"] as const);
      const request: WebMcpFinancialCompositionRequest = {
        composition: enumValue(source.composition, "composition", ["asset_mix", "funding_mix", "loan_mix"] as const),
        scope,
        cert: source.cert === undefined ? null : cert(source.cert, "cert"),
        period: reportingPeriod(source.period, "period"),
        compareFrom: source.compareFrom === undefined ? null : reportingPeriod(source.compareFrom, "compareFrom"),
      };
      if (scope === "selected_bank" && request.cert === null) throw new WebMcpInputError("cert is required for selected_bank scope");
      if (scope !== "selected_bank" && request.cert !== null) throw new WebMcpInputError("cert is only valid for selected_bank scope");
      if (request.compareFrom !== null && request.compareFrom >= request.period) throw new WebMcpInputError("compareFrom must be earlier than period");
      const result = await deps.analyzeFinancialComposition(request, context);
      throwIfAborted(context.signal);
      requireRevision(deps.workspace.state, commitRevision);
      validateAnalysisContext(deps, result, "Financial composition analysis");
      const analyzedCount = integer(result.memberCerts.length, "result.memberCerts.length", 0, WEBMCP_COHORT_ANALYSIS_LIMIT);
      const invocationContext = dataContext(deps);
      const resultId = `mix-${lineageHash({ request, certs: result.memberCerts, cohortHash: result.cohortHash, releaseGeneration: invocationContext.releaseGeneration }).slice("fnv1a32:".length)}`;
      const existing = deps.workspace.state.analysisResult;
      const sameResult = existing?.id === resultId;
      const materialized: FinancialCompositionAnalysisResult = {
        id: resultId,
        kind: "financial_composition",
        basedOnRevision: sameResult ? existing.basedOnRevision : commitRevision,
        publishedRevision: sameResult ? existing.publishedRevision : commitRevision + 1,
        title: `${result.analysis.label} · ${result.scopeLabel}`,
        spec: request,
        scopeLabel: result.scopeLabel,
        memberCerts: result.memberCerts,
        analysis: result.analysis,
        population: materializedPopulation(
          result,
          analyzedCount,
          request.scope === "selected_bank" ? "current_selected_bank" : request.scope === "selected_banks" ? "current_selected_banks" : "current_workspace_members",
        ),
        lineage: {
          sourceMode: result.sourceMode,
          sourceAsOf: result.sourceAsOf,
          retrievedAt: result.retrievedAt,
          release: invocationContext.release,
          releaseGeneration: invocationContext.releaseGeneration,
        },
      };
      const ref = await analysisResultRef(deps, materialized, context);
      requireRevision(deps.workspace.state, commitRevision);
      const block = analysisBoardBlock(materialized, ref, source, "stacked_composition");
      const commands: WorkspaceCommand[] = [
		workspaceCommands.setCohortTrendResult(null),
        workspaceCommands.setAnalysisResult(materialized),
        workspaceCommands.upsertBoardBlock(block),
      ];
      if (source.boardFocus !== false) commands.push(workspaceCommands.focusBoardBlock(block.id));
      const commit = executeSeries(deps.workspace, commands, commitRevision, context.signal);
      const summary = `${result.analysis.label} analyzed for ${result.scopeLabel} at ${quarterName(request.period)}${request.compareFrom ? ` versus ${quarterName(request.compareFrom)}` : ""}.`;
      return {
        summary,
        data: {
          resultId,
          kind: materialized.kind,
          scope: { type: request.scope, label: result.scopeLabel, memberCount: analyzedCount, certs: result.memberCerts.slice(0, 10) },
          analysis: result.analysis,
          membershipBasis: materialized.population.membershipBasis,
          workspace: { changed: commit.changed, revision: commit.state.revision, resultRevision: materialized.publishedRevision },
          board: { blockId: block.id, view: block.binding.view, span: block.span, visible: true },
          lineage: materialized.lineage,
          nextAction: { tool: "bankgraph.read_analysis_result", input: { resultId, section: "components" } },
        },
      };
    },
  });

  const analyzeFailurePatterns = mutationTool({
    name: "bankgraph.analyze_failure_patterns",
    title: "Compare historical failure trajectories",
    description:
      "Build an exact-quarter event study for FDIC-reported failures, then rank the full eligible active-bank universe by descriptive trajectory similarity. The limit controls only returned analogues. This reusable visible view does not estimate failure probability or forecast. boardSpan accepts quarter, half, three-quarter, or full; omission keeps current defaults. Read bankgraph.get_context first and pass its revision as ifRevision.",
    maxResultChars: MAX_WEBMCP_EXTENDED_ENVELOPE_CHARS,
    inputSchema: OBJECT({
      startYear: NUMBER(1934, 2099, true),
      endYear: NUMBER(1934, 2099, true),
      quarters: NUMBER(4, 12, true),
      limit: NUMBER(1, 100, true),
      boardBlockId: STRING(64, "Stable visible board view ID."),
      boardTitle: STRING(160, "Visible board view title."),
      boardView: ENUM(["both", "event_study", "analogues"]),
      boardSpan: BOARD_SPAN_SCHEMA,
      boardFocus: BOOLEAN,
      ifRevision: REVISION_SCHEMA,
    }, ["ifRevision"]),
    controller: async (input, context) => {
      const source = inputObject(input, ["startYear", "endYear", "quarters", "limit", "boardBlockId", "boardTitle", "boardView", "boardSpan", "boardFocus", "ifRevision"]);
      if (!deps.analyzeFailurePatterns) throw capabilityUnavailable("Historical trajectory analysis", "Open the research workspace and retry.");
      const commitRevision = requiredRevision(source.ifRevision);
      requireRevision(deps.workspace.state, commitRevision);
      const request: WebMcpFailurePatternRequest = {
        startYear: source.startYear === undefined ? 2007 : integer(source.startYear, "startYear", 1934, 2099),
        endYear: source.endYear === undefined ? 2012 : integer(source.endYear, "endYear", 1934, 2099),
        quarters: source.quarters === undefined ? 8 : integer(source.quarters, "quarters", 4, 12),
        limit: source.limit === undefined ? 25 : integer(source.limit, "limit", 1, 100),
      };
      if (request.startYear > request.endYear) throw new WebMcpInputError("startYear must not exceed endYear");
      if (request.endYear - request.startYear + 1 > 20) throw new WebMcpInputError("failure-year span must not exceed 20 years");
      const result = await deps.analyzeFailurePatterns(request, context);
      throwIfAborted(context.signal);
      requireRevision(deps.workspace.state, commitRevision);
      if (result.analysis !== "historical_failure_pattern_and_current_similarity") {
        throw adapterContractViolation("Historical trajectory analysis returned an unexpected analysis kind.");
      }
      const invocationContext = dataContext(deps);
      const definitionHash = paginationKey({ request, transactionType: "FAILURE" });
      const cohortHash = paginationKey({
        definitionHash,
        historicalExact: result.historicalCohort.withExactQuarterHistory,
        activeExact: result.currentAnalogues.withExactQuarterHistory,
        asOf: result.currentAnalogues.asOf,
        releaseGeneration: result.provenance.release_generation,
      });
      const resultId = `failure-${lineageHash({ definitionHash, cohortHash }).slice("fnv1a32:".length)}`;
      const materialized: FailurePatternAnalysisResult = {
        id: resultId,
        kind: "failure_pattern",
        basedOnRevision: commitRevision,
        publishedRevision: commitRevision + 1,
        title: `Bank trajectories before failure · ${request.startYear}–${request.endYear}`,
        spec: request,
        result,
        population: {
          membershipBasis: "published_failure_and_active_universe",
          analyzedCount: result.currentAnalogues.withExactQuarterHistory,
          definitionHash,
          cohortHash,
          peerRecipe: null,
          excludedCount: Math.max(0, result.currentAnalogues.activeInstitutionsWithFinancialRows - result.currentAnalogues.withExactQuarterHistory),
        },
        lineage: {
          sourceMode: invocationContext.sourceMode,
          sourceAsOf: result.provenance.sourceAsOf,
          retrievedAt: invocationContext.retrievedAt,
          release: result.provenance.release,
          releaseGeneration: result.provenance.release_generation,
        },
      };
      const ref = await analysisResultRef(deps, materialized, context);
      requireRevision(deps.workspace.state, commitRevision);
      const block = analysisBoardBlock(materialized, ref, source, "both");
      const commands: WorkspaceCommand[] = [
		workspaceCommands.setCohortTrendResult(null),
        workspaceCommands.setAnalysisResult(materialized),
        workspaceCommands.upsertBoardBlock(block),
      ];
      if (source.boardFocus !== false) commands.push(workspaceCommands.focusBoardBlock(block.id));
      const commit = executeSeries(deps.workspace, commands, commitRevision, context.signal);
      const summary = `${result.historicalCohort.withExactQuarterHistory} historical failures define the ${request.quarters}-quarter reference; ${result.currentAnalogues.withExactQuarterHistory} eligible active banks were ranked and ${result.currentAnalogues.returned} are shown.`;
      return {
        summary,
        data: {
          resultId,
          kind: materialized.kind,
          semantics: result.semantics,
          historicalCohort: {
            withExactQuarterHistory: result.historicalCohort.withExactQuarterHistory,
            sourceFailureRecords: result.historicalCohort.sourceFailureRecords,
          },
          currentAnalogues: {
            asOf: result.currentAnalogues.asOf,
            eligibleUniverse: result.currentAnalogues.withExactQuarterHistory,
            returned: result.currentAnalogues.returned,
          },
          board: { blockId: block.id, view: block.binding.view, span: block.span, visible: true },
          workspace: { changed: commit.changed, revision: commit.state.revision },
          lineage: materialized.lineage,
          nextActions: [
            { tool: "bankgraph.read_board_block", input: { blockId: block.id, section: "series" } },
            { tool: "bankgraph.publish_result_view", purpose: "Place the event study and analogue ranking as separate views without recomputing.", input: { resultId, view: block.binding.view === "event_study" ? "analogues" : "event_study" } },
          ],
        },
      };
    },
  });

  const readAnalysisResult = readOnlyTool({
    name: "bankgraph.read_analysis_result",
    title: "Read the visible high-level analysis",
    description:
      "Page through the exact visible cohort-change, temporal-pattern, or financial-composition result without rerunning it. Use the stable resultId returned by the analysis tool. Pages default to 25 complete records and accept up to 50, shrinking only when required by the serialized result budget.",
    maxResultChars: MAX_WEBMCP_EXTENDED_ENVELOPE_CHARS,
    inputSchema: OBJECT({
      resultId: STRING(64, "Stable result ID returned by a high-level analysis.", 1),
      section: ENUM(["metrics", "groups", "movers", "rows", "components"]),
      pageSize: NUMBER(1, MAX_ANALYSIS_PAGE_SIZE, true, "Complete records requested; defaults to 25."),
      cursor: STRING(128, "Opaque cursor from the previous page."),
    }, ["resultId"]),
    controller: async (input) => {
      const source = inputObject(input, ["resultId", "section", "pageSize", "cursor"]);
      const resultId = identifier(source.resultId, "resultId");
      const result = deps.workspace.state.analysisResult;
      if (!result || result.id !== resultId) {
        throw new WebMcpToolError(
          "analysis_result_not_found",
          result ? `Result ${resultId} is no longer current. The workspace now holds ${result.id}.` : `Result ${resultId} is no longer present in the workspace.`,
          { requestedResultId: resultId, currentResultId: result?.id ?? null, nextAction: "bankgraph.get_context" },
        );
      }
      if (result.kind === "failure_pattern") {
        throw new WebMcpInputError("Read failure-pattern sections through bankgraph.read_board_block.");
      }
      const defaultSection = result.kind === "cohort_change" ? "metrics" : result.kind === "temporal_pattern" ? "rows" : "components";
      const section = source.section === undefined ? defaultSection : enumValue(source.section, "section", ["metrics", "groups", "movers", "rows", "components"] as const);
      let items: readonly unknown[];
      if (result.kind === "cohort_change") {
        if (section === "metrics") items = result.transition.metrics;
        else if (section === "groups") items = result.transition.groups;
        else if (section === "movers") items = result.transition.metrics.flatMap((metric) => [
          ...metric.topMovers.increases.map((bank) => ({ metric: metric.metric, direction: "increase", interpretation: metric.topMovers.interpretation, ...bank })),
          ...metric.topMovers.decreases.map((bank) => ({ metric: metric.metric, direction: "decrease", interpretation: metric.topMovers.interpretation, ...bank })),
        ]);
        else throw new WebMcpInputError(`section ${section} is not available for a cohort-change result`);
      } else if (result.kind === "temporal_pattern") {
        if (section !== "rows") throw new WebMcpInputError(`section ${section} is not available for a temporal-pattern result`);
        items = result.rows;
      } else {
        if (section !== "components") throw new WebMcpInputError(`section ${section} is not available for a financial-composition result`);
        items = [...result.analysis.components, result.analysis.residual];
      }
      const requestedPageSize = source.pageSize === undefined ? DEFAULT_ANALYSIS_PAGE_SIZE : integer(source.pageSize, "pageSize", 1, MAX_ANALYSIS_PAGE_SIZE);
      const key = paginationKey({ resultId, resultRevision: result.publishedRevision, section });
      const offset = decodeCursor(source.cursor, `analysis_result_${section}`, key, items.length);
      const shared = {
        resultId,
        kind: result.kind,
        title: result.title,
        resultRevision: result.publishedRevision,
        basedOnRevision: result.basedOnRevision,
        workspaceRevision: deps.workspace.state.revision,
        section,
        spec: result.spec,
        population: result.population,
        lineage: result.lineage,
      };
      let pageSize = requestedPageSize;
      while (true) {
        const page = pageItems(items, { scope: `analysis_result_${section}`, key, offset, pageSize });
        const summary = `${result.title}; reading ${section}.`;
        const data = { ...shared, items: page.items, pagination: page.pagination };
        if (pageSize === 1 || fitsExtendedEnvelope(summary, data)) return { summary, data };
        pageSize -= 1;
      }
    },
  });

  const readCurrentComparison = readOnlyTool({
    name: "bankgraph.read_current_comparison",
    title: "Read the current bank comparison",
    description:
      `Read the selected banks and visible measures at the workspace period. Returns at most ${WORKSPACE_LIMITS.selectedBanks} banks and six measures, with reported nulls preserved and the elected data release attached.`,
    maxResultChars: MAX_WEBMCP_EXTENDED_ENVELOPE_CHARS,
    inputSchema: OBJECT({}),
    controller: async (input, context) => {
      inputObject(input, []);
      if (!deps.readCurrentComparison) {
        throw capabilityUnavailable(
          "Current comparison",
          "Open the analysis workspace and retry.",
        );
      }
      const result = await deps.readCurrentComparison(context);
      throwIfAborted(context.signal);
      requireMatchingSourceMode(deps, result.sourceMode, "Current comparison");
      const metrics = parseMetrics(result.metrics, "result.metrics", 6, 1);
      const expectedMetrics = visibleMetricsFromState(deps.workspace.state).toSorted();
      if (JSON.stringify(metrics) !== JSON.stringify(expectedMetrics)) {
        throw adapterContractViolation(
          "Current comparison metrics do not match the visible workspace measures.",
        );
      }
      if (!Array.isArray(result.banks) || result.banks.length > WORKSPACE_LIMITS.selectedBanks) {
        throw adapterContractViolation(`Current comparison must return at most ${WORKSPACE_LIMITS.selectedBanks} banks.`);
      }
      const selected = new Set(deps.workspace.state.selectedCerts);
      const seen = new Set<number>();
      const banks = result.banks.map((bank, index) => {
        const bankCert = cert(bank.cert, `result.banks[${index}].cert`);
        if (!selected.has(bankCert)) {
          throw adapterContractViolation(
            `Current comparison returned unselected certificate ${bankCert}.`,
          );
        }
        if (seen.has(bankCert)) {
          throw adapterContractViolation(
            `Current comparison returned certificate ${bankCert} twice.`,
          );
        }
        seen.add(bankCert);
        return {
          cert: bankCert,
          name: stringValue(bank.name, `result.banks[${index}].name`, {
            min: 1,
            max: 200,
          }),
          state:
            bank.state === null
              ? null
              : stateCode(bank.state, `result.banks[${index}].state`),
          values: Object.fromEntries(
            metrics.map((metric) => [
              metric,
              optionalResultNumber(
                bank.values[metric],
                `result.banks[${index}].values.${metric}`,
              ),
            ]),
          ),
        };
      });
      const period =
        result.period === null
          ? null
          : reportingPeriod(result.period, "result.period");
      return {
        summary: `${banks.length} selected banks compared across ${metrics.length} measures${period ? ` for ${quarterName(period)}` : ""}.`,
        data: {
          period,
          metrics,
          metricUnits: Object.fromEntries(
            metrics.map((metric) => [metric, WEBMCP_METRIC_METHODS[metric].unit]),
          ),
          banks,
          counts: {
            selected: deps.workspace.state.selectedCerts.length,
            returned: banks.length,
            missing: Math.max(0, deps.workspace.state.selectedCerts.length - banks.length),
          },
          sourceMode: result.sourceMode,
          ...resultFreshness(deps, result.sourceAsOf, result.retrievedAt),
          truncated: false,
        },
      };
    },
  });

  const analyzePeerDistribution = readOnlyTool({
    name: "bankgraph.analyze_peer_distribution",
    title: "Analyze the peer distribution",
    description:
      "Read the current cohort distribution for one reported measure. Returns quartiles, the focused bank's rank when available, and up to 10 exact banks from each tail.",
    maxResultChars: MAX_WEBMCP_EXTENDED_ENVELOPE_CHARS,
    inputSchema: OBJECT({ metric: VISIBLE_METRIC_SCHEMA }),
    controller: async (input, context) => {
      const source = inputObject(input, ["metric"]);
      if (!deps.analyzePeerDistribution) {
        throw capabilityUnavailable(
          "Peer distribution",
          "Open the analysis workspace and retry.",
        );
      }
      requireBoundedCurrentCohort(deps);
      const metric = preferredVisibleMetric(deps.workspace.state, source.metric);
      const result = await deps.analyzePeerDistribution({ metric }, context);
      throwIfAborted(context.signal);
      requireMatchingSourceMode(deps, result.sourceMode, "Peer distribution");
      if (result.metric !== metric) {
        throw adapterContractViolation(
          `Peer distribution returned ${result.metric} for requested metric ${metric}.`,
        );
      }
      const count = integer(
        result.count,
        "result.count",
        0,
        WEBMCP_COHORT_ANALYSIS_LIMIT,
      );
      const missingCount = integer(
        result.missingCount,
        "result.missingCount",
        0,
        WEBMCP_COHORT_ANALYSIS_LIMIT,
      );
      if (result.lowest.length > MAX_DISTRIBUTION_TAIL_BANKS || result.highest.length > MAX_DISTRIBUTION_TAIL_BANKS) {
        throw adapterContractViolation(
          `Peer distribution may return at most ${MAX_DISTRIBUTION_TAIL_BANKS} banks in each tail.`,
        );
      }
      const lowest = result.lowest.map((bank, index) =>
        boundedDistributionBank(bank, `result.lowest[${index}]`),
      );
      const highest = result.highest.map((bank, index) =>
        boundedDistributionBank(bank, `result.highest[${index}]`),
      );
      const focusedBank = result.focusedBank
        ? {
            ...boundedDistributionBank(result.focusedBank, "result.focusedBank"),
            percentile: optionalResultNumber(
              result.focusedBank.percentile,
              "result.focusedBank.percentile",
              0,
              100,
            ),
            rank:
              result.focusedBank.rank === null
                ? null
                : integer(result.focusedBank.rank, "result.focusedBank.rank", 1, Math.max(1, count)),
          }
        : null;
      const period =
        result.period === null
          ? null
          : reportingPeriod(result.period, "result.period");
      const statistics = {
        minimum: optionalResultNumber(result.statistics.minimum, "result.statistics.minimum"),
        p25: optionalResultNumber(result.statistics.p25, "result.statistics.p25"),
        median: optionalResultNumber(result.statistics.median, "result.statistics.median"),
        p75: optionalResultNumber(result.statistics.p75, "result.statistics.p75"),
        maximum: optionalResultNumber(result.statistics.maximum, "result.statistics.maximum"),
      };
      const orderedStatistics = [
        statistics.minimum,
        statistics.p25,
        statistics.median,
        statistics.p75,
        statistics.maximum,
      ].filter((value): value is number => value !== null);
      if (orderedStatistics.some((value, index) => index > 0 && value < orderedStatistics[index - 1])) {
        throw adapterContractViolation(
          "Peer distribution statistics must be ordered from minimum through maximum.",
        );
      }
      const returnedTailBanks = new Set([
        ...lowest.map((bank) => bank.cert),
        ...highest.map((bank) => bank.cert),
      ]).size;
      return {
        summary: `${count} cohort banks have ${WEBMCP_METRIC_METHODS[metric].label.toLowerCase()} for the selected period; ${missingCount} are missing.`,
        data: {
          metric,
          unit: WEBMCP_METRIC_METHODS[metric].unit,
          period,
          count,
          missingCount,
          statistics,
          focusedBank,
          lowest,
          highest,
          tailCounts: {
            lowest: lowest.length,
            highest: highest.length,
            uniqueBanks: returnedTailBanks,
          },
          sourceMode: result.sourceMode,
          ...resultFreshness(deps, result.sourceAsOf, result.retrievedAt),
          truncated: returnedTailBanks < count,
        },
      };
    },
  });

  const analyzeMetricRelationship = readOnlyTool({
    name: "bankgraph.analyze_metric_relationship",
    title: "Analyze a peer metric relationship",
    description:
      "Measure the cross-sectional relationship between two reported measures in the current cohort. Returns exact sample counts, up to 100 bank points, Pearson correlation from two nonconstant pairs, and an interpretation tier; it does not claim causation. Points shrink only when required by the serialized result budget.",
    maxResultChars: MAX_WEBMCP_EXTENDED_ENVELOPE_CHARS,
    inputSchema: OBJECT({
      xMetric: VISIBLE_METRIC_SCHEMA,
      yMetric: VISIBLE_METRIC_SCHEMA,
      maxPoints: NUMBER(1, 100, true, "Exact bank points to return; defaults to 100."),
    }),
    controller: async (input, context) => {
      const source = inputObject(input, ["xMetric", "yMetric", "maxPoints"]);
      if (!deps.analyzeMetricRelationship) {
        throw capabilityUnavailable(
          "Metric relationship",
          "Open the analysis workspace and retry.",
        );
      }
      requireBoundedCurrentCohort(deps);
      const preferred = visibleMetricsFromState(deps.workspace.state);
      const relationshipChart = deps.workspace.state.charts.find(
        (chart) => chart.id === "peer-relationship",
      );
      const chartMetrics = (relationshipChart?.metrics ?? [])
        .map((metric) => canonicalResearchMetric(metric))
        .filter((metric): metric is WorkspaceVisibleMetric => metric !== null);
      const xMetric = source.xMetric === undefined
        ? chartMetrics[0] ?? preferred[0]
        : enumValue(source.xMetric, "xMetric", WORKSPACE_VISIBLE_METRICS);
      const yMetric = source.yMetric === undefined
        ? chartMetrics.find((metric) => metric !== xMetric) ??
          preferred.find((metric) => metric !== xMetric)
        : enumValue(source.yMetric, "yMetric", WORKSPACE_VISIBLE_METRICS);
      if (!yMetric) {
        throw new WebMcpInputError(
          "yMetric is required when the workspace has only one visible measure",
        );
      }
      if (xMetric === yMetric) {
        throw new WebMcpInputError("xMetric and yMetric must be different");
      }
      const maxPoints = source.maxPoints === undefined
        ? 100
        : integer(source.maxPoints, "maxPoints", 1, 100);
      const result = await deps.analyzeMetricRelationship(
        { xMetric, yMetric, maxPoints },
        context,
      );
      throwIfAborted(context.signal);
      requireMatchingSourceMode(deps, result.sourceMode, "Metric relationship");
      if (result.xMetric !== xMetric || result.yMetric !== yMetric) {
        throw adapterContractViolation(
          "Metric relationship returned different axes from the request.",
        );
      }
      if (result.method !== "pearson_cross_sectional_levels") {
        throw adapterContractViolation(
          "Metric relationship must use pearson_cross_sectional_levels.",
        );
      }
      const cohortCount = integer(
        result.cohortCount,
        "result.cohortCount",
        0,
        WEBMCP_COHORT_ANALYSIS_LIMIT,
      );
      const comparableCount = integer(
        result.comparableCount,
        "result.comparableCount",
        0,
        cohortCount,
      );
      if (!Array.isArray(result.points) || result.points.length > maxPoints) {
        throw adapterContractViolation(
          `Metric relationship must return at most ${maxPoints} points.`,
        );
      }
      if (result.points.length > comparableCount) {
        throw adapterContractViolation(
          "Metric relationship returned more points than comparable banks.",
        );
      }
      const seen = new Set<number>();
      const points = result.points.map((point, index) => {
        const bankCert = cert(point.cert, `result.points[${index}].cert`);
        if (seen.has(bankCert)) {
          throw adapterContractViolation(
            `Metric relationship returned certificate ${bankCert} twice.`,
          );
        }
        seen.add(bankCert);
        return {
          cert: bankCert,
          name: stringValue(point.name, `result.points[${index}].name`, {
            min: 1,
            max: 200,
          }),
          state:
            point.state === null
              ? null
              : stateCode(point.state, `result.points[${index}].state`),
          x: finiteNumber(point.x, `result.points[${index}].x`, -1e15, 1e15),
          y: finiteNumber(point.y, `result.points[${index}].y`, -1e15, 1e15),
        };
      });
      const correlation = optionalResultNumber(
        result.correlation,
        "result.correlation",
        -1,
        1,
      );
      const interpretationTier = correlationInterpretationTier(comparableCount);
      const interpretationLabel = correlationInterpretationLabel(comparableCount);
      const period =
        result.period === null
          ? null
          : reportingPeriod(result.period, "result.period");
      const summary = comparableCount < MIN_CALCULABLE_CORRELATION_OBSERVATIONS
          ? `${comparableCount} comparable ${comparableCount === 1 ? "bank is" : "banks are"} available; two nonconstant pairs are required for Pearson correlation.`
          : correlation === null
          ? `${comparableCount} comparable banks have no usable variation for a cross-sectional correlation.`
          : `Pearson correlation is ${correlation.toFixed(3)} across ${comparableCount} comparable banks · ${interpretationLabel.toLowerCase()}; this is not a causal estimate.`;
      let fittedPointCount = points.length;
      while (true) {
        const pagePoints = points.slice(0, fittedPointCount);
        const data = {
          xMetric,
          yMetric,
          units: {
            x: WEBMCP_METRIC_METHODS[xMetric].unit,
            y: WEBMCP_METRIC_METHODS[yMetric].unit,
          },
          period,
          method: result.method,
          correlation,
          interpretation: {
            tier: interpretationTier,
            label: interpretationLabel,
          },
          counts: {
            cohort: cohortCount,
            comparable: comparableCount,
            missing: cohortCount - comparableCount,
            returned: pagePoints.length,
          },
          points: pagePoints,
          sourceMode: result.sourceMode,
          ...resultFreshness(deps, result.sourceAsOf, result.retrievedAt),
          truncated: Boolean(result.truncated || pagePoints.length < comparableCount),
        };
        if (fittedPointCount <= 1 || fitsExtendedEnvelope(summary, data)) {
          return { summary, data };
        }
        fittedPointCount -= 1;
      }
    },
  });

  const readGeographySummary = readOnlyTool({
    name: "bankgraph.read_geography_summary",
    title: "Read the cohort geography",
    description:
      "Summarize the current cohort by headquarters state for one reported measure. Returns up to all 56 state and territory codes with bank count, total assets, median, and mean, shrinking only when required by the serialized result budget.",
    maxResultChars: MAX_WEBMCP_EXTENDED_ENVELOPE_CHARS,
    inputSchema: OBJECT({
      metric: VISIBLE_METRIC_SCHEMA,
      maxStates: NUMBER(1, 56, true, "Headquarters states to return; defaults to 56."),
    }),
    controller: async (input, context) => {
      const source = inputObject(input, ["metric", "maxStates"]);
      if (!deps.readGeographySummary) {
        throw capabilityUnavailable(
          "Geography summary",
          "Open the analysis workspace and retry.",
        );
      }
      requireBoundedCurrentCohort(deps);
      const metric = preferredVisibleMetric(deps.workspace.state, source.metric);
      const maxStates = source.maxStates === undefined
        ? 56
        : integer(source.maxStates, "maxStates", 1, 56);
      const result = await deps.readGeographySummary(
        { metric, maxStates },
        context,
      );
      throwIfAborted(context.signal);
      requireMatchingSourceMode(deps, result.sourceMode, "Geography summary");
      if (result.metric !== metric) {
        throw adapterContractViolation(
          `Geography summary returned ${result.metric} for requested metric ${metric}.`,
        );
      }
      const cohortCount = integer(
        result.cohortCount,
        "result.cohortCount",
        0,
        WEBMCP_COHORT_ANALYSIS_LIMIT,
      );
      if (!Array.isArray(result.states) || result.states.length > maxStates) {
        throw adapterContractViolation(
          `Geography summary must return at most ${maxStates} states.`,
        );
      }
      const seenStates = new Set<string>();
      const states = result.states.map((item, index) => {
        const state = stateCode(item.state, `result.states[${index}].state`);
        if (seenStates.has(state)) {
          throw adapterContractViolation(
            `Geography summary returned state ${state} twice.`,
          );
        }
        seenStates.add(state);
        return {
          state,
          bankCount: integer(
            item.bankCount,
            `result.states[${index}].bankCount`,
            1,
            Math.max(1, cohortCount),
          ),
          totalAssets: optionalResultNumber(
            item.totalAssets,
            `result.states[${index}].totalAssets`,
            0,
            1e15,
          ),
          metricMedian: optionalResultNumber(
            item.metricMedian,
            `result.states[${index}].metricMedian`,
          ),
          metricMean: optionalResultNumber(
            item.metricMean,
            `result.states[${index}].metricMean`,
          ),
        };
      });
      if (states.reduce((sum, item) => sum + item.bankCount, 0) > cohortCount) {
        throw adapterContractViolation(
          "Geography state counts exceed the current cohort count.",
        );
      }
      const omittedStateCount = integer(
        result.omittedStateCount,
        "result.omittedStateCount",
        0,
        56,
      );
      const period =
        result.period === null
          ? null
          : reportingPeriod(result.period, "result.period");
      let fittedStateCount = states.length;
      while (true) {
        const pageStates = states.slice(0, fittedStateCount);
        const payloadOmittedStateCount = omittedStateCount + states.length - pageStates.length;
        const summary = `${pageStates.length} headquarters states returned for ${WEBMCP_METRIC_METHODS[metric].label.toLowerCase()}; ${payloadOmittedStateCount} states are omitted.`;
        const data = {
          metric,
          unit: WEBMCP_METRIC_METHODS[metric].unit,
          period,
          cohortCount,
          states: pageStates,
          omittedStateCount: payloadOmittedStateCount,
          sourceMode: result.sourceMode,
          ...resultFreshness(deps, result.sourceAsOf, result.retrievedAt),
          truncated: payloadOmittedStateCount > 0,
        };
        if (fittedStateCount <= 1 || fitsExtendedEnvelope(summary, data)) {
          return { summary, data };
        }
        fittedStateCount -= 1;
      }
    },
  });

  const readWorkspaceMacroContext = readOnlyTool({
    name: "bankgraph.read_workspace_macro_context",
    title: "Read the workspace economic context",
    description:
      "Read the direct-agency economic series shown beside the bank analysis. Returns at most eight latest and prior observations with exact units and sources; it makes no causal claim.",
    maxResultChars: MAX_WEBMCP_EXTENDED_ENVELOPE_CHARS,
    inputSchema: OBJECT({}),
    controller: async (input, context) => {
      inputObject(input, []);
      if (!deps.readWorkspaceMacroContext) {
        throw capabilityUnavailable(
          "Workspace economic context",
          "Open the analysis workspace and retry.",
        );
      }
      const result = await deps.readWorkspaceMacroContext(context);
      throwIfAborted(context.signal);
      requireMatchingSourceMode(deps, result.sourceMode, "Workspace economic context");
      const status = enumValue(
        result.status,
        "result.status",
        ["ready", "partial", "unavailable"] as const,
      );
      if (!Array.isArray(result.series) || result.series.length > 8) {
        throw adapterContractViolation(
          "Workspace economic context must return at most eight series.",
        );
      }
      const seen = new Set<string>();
      const series = result.series.map((item, index) => {
        const id = stringValue(item.id, `result.series[${index}].id`, {
          min: 1,
          max: 80,
        });
        if (seen.has(id)) {
          throw adapterContractViolation(
            `Workspace economic context returned series ${id} twice.`,
          );
        }
        seen.add(id);
        return {
          id,
          label: stringValue(item.label, `result.series[${index}].label`, {
            min: 1,
            max: 160,
          }),
          unit: stringValue(item.unit, `result.series[${index}].unit`, {
            min: 1,
            max: 80,
          }),
          period:
            item.period === null
              ? null
              : stringValue(item.period, `result.series[${index}].period`, {
                  min: 4,
                  max: 40,
                }),
          value: optionalResultNumber(item.value, `result.series[${index}].value`, -1e12, 1e12),
          priorPeriod:
            item.priorPeriod === null
              ? null
              : stringValue(
                  item.priorPeriod,
                  `result.series[${index}].priorPeriod`,
                  { min: 4, max: 40 },
                ),
          priorValue: optionalResultNumber(
            item.priorValue,
            `result.series[${index}].priorValue`,
            -1e12,
            1e12,
          ),
          change: optionalResultNumber(
            item.change,
            `result.series[${index}].change`,
            -1e12,
            1e12,
          ),
          source: stringValue(item.source, `result.series[${index}].source`, {
            min: 1,
            max: 240,
          }),
        };
      });
      if (status === "unavailable" && series.length > 0) {
        throw adapterContractViolation(
          "Unavailable economic context cannot include series observations.",
        );
      }
      if (status === "ready" && series.length === 0) {
        throw adapterContractViolation(
          "Ready economic context must include at least one series.",
        );
      }
      return {
        summary: status === "unavailable"
          ? "Economic series are unavailable in this workspace."
          : `${series.length} direct-agency economic series returned with latest and prior observations.`,
        data: {
          status,
          series,
          sourceMode: result.sourceMode,
          ...resultFreshness(deps, result.sourceAsOf, result.retrievedAt),
          truncated: false,
        },
      };
    },
  });

  const readMetricHistory = readOnlyTool({
    name: "bankgraph.read_metric_history",
    title: "Read bank metric history",
    description:
      "Read exact quarterly values for up to five requested banks. Returns all requested bank series by default with aligned periods, missing values, raw units, and source field; an explicitly smaller page can continue with nextCursor.",
    maxResultChars: MAX_WEBMCP_EXTENDED_ENVELOPE_CHARS,
    inputSchema: OBJECT(
      {
        metric: VISIBLE_METRIC_SCHEMA,
        certs: ARRAY(CERT_SCHEMA, 5, 1),
        periods: NUMBER(1, 12, true),
        endingAt: PERIOD_SCHEMA,
        pageSize: NUMBER(1, 5, true, "Complete bank series requested; defaults to every requested bank."),
        cursor: STRING(128, "Opaque nextCursor from the previous page."),
      },
      ["metric", "certs", "periods"],
    ),
    controller: async (input, context) => {
      const source = inputObject(input, [
        "metric",
        "certs",
        "periods",
        "endingAt",
        "pageSize",
        "cursor",
      ]);
      if (!deps.readMetricHistory) {
        throw capabilityUnavailable(
          "Metric history",
          "Open the analysis workspace and retry.",
        );
      }
      const request: WebMcpMetricHistoryRequest = {
        metric: enumValue(
          source.metric,
          "metric",
          WORKSPACE_VISIBLE_METRICS,
        ),
        certs: parseCerts(source.certs, "certs", 5, 1),
        periods: integer(source.periods, "periods", 1, 12),
        endingAt:
          source.endingAt === undefined
            ? null
            : reportingPeriod(source.endingAt, "endingAt"),
      };
      const pageSize =
        source.pageSize === undefined
          ? request.certs.length
          : integer(source.pageSize, "pageSize", 1, 5);
      const key = paginationKey(request);
      const offset = decodeCursor(source.cursor, "metric_history", key, request.certs.length);
      const result = await deps.readMetricHistory(request, context);
      requireMatchingSourceMode(deps, result.sourceMode, "Metric history");
      if (!Array.isArray(result.periods) || result.periods.length > request.periods) {
        throw adapterContractViolation(
          `Metric history must return at most ${request.periods} periods.`,
        );
      }
      const periods = result.periods.map((period, index) =>
        reportingPeriod(period, `result.periods[${index}]`),
      );
      if (new Set(periods).size !== periods.length) {
        throw adapterContractViolation("Metric history periods must be unique.");
      }
      if (periods.some((period, index) => index > 0 && period <= periods[index - 1])) {
        throw adapterContractViolation("Metric history periods must be in ascending order.");
      }
      if (!Array.isArray(result.series) || result.series.length > request.certs.length) {
        throw adapterContractViolation(
          `Metric history must return at most ${request.certs.length} bank series.`,
        );
      }
      const seenCerts = new Set<number>();
      const series = result.series.map((item, seriesIndex) => {
        const itemCert = cert(item.cert, `result.series[${seriesIndex}].cert`);
        if (!request.certs.includes(itemCert)) {
          throw adapterContractViolation(`Metric history returned unrequested certificate ${itemCert}.`);
        }
        if (seenCerts.has(itemCert)) {
          throw adapterContractViolation(`Metric history returned certificate ${itemCert} twice.`);
        }
        seenCerts.add(itemCert);
        if (!Array.isArray(item.values) || item.values.length !== periods.length) {
          throw adapterContractViolation(
            `Metric history values for certificate ${itemCert} must align with all ${periods.length} periods.`,
          );
        }
        return {
          cert: itemCert,
          name: stringValue(item.name, `result.series[${seriesIndex}].name`, {
            min: 1,
            max: 120,
          }),
          values: item.values.map((value, valueIndex) =>
            value === null
              ? null
              : finiteNumber(
                  value,
                  `result.series[${seriesIndex}].values[${valueIndex}]`,
                  -1e15,
                  1e15,
                ),
          ),
        };
      });
      const definition = WEBMCP_METRIC_METHODS[request.metric];
      let fittedPageSize = pageSize;
      while (true) {
        const page = pageItems(series, {
          scope: "metric_history",
          key,
          offset,
          pageSize: fittedPageSize,
        });
        const missingValues = page.items.reduce(
          (count, item) =>
            count + item.values.filter((value) => value === null).length,
          0,
        );
        const summary = `This page returns ${page.items.length} complete bank series across ${periods.length} reporting periods.`;
        const data = {
          metric: request.metric,
          unit: definition.unit,
          source: definition.source,
          frequency: definition.frequency,
          periods,
          series: page.items,
          pagination: page.pagination,
          counts: {
            requestedBanks: request.certs.length,
            returnedBanks: page.pagination.returnedCount,
            omittedBanks: page.pagination.omittedCount,
            periods: periods.length,
            missingValues,
          },
          sourceMode: result.sourceMode,
          ...resultFreshness(deps, result.asOf, result.refreshedAt),
          sourceHasEarlierPeriods: result.truncated,
        };
        if (fittedPageSize === 1 || fitsExtendedEnvelope(summary, data)) {
          return { summary, data };
        }
        fittedPageSize -= 1;
      }
    },
  });

  const getMetricMethod = readOnlyTool(
    {
      name: "bankgraph.get_metric_method",
      title: "Read a metric definition",
      description:
        "Read the canonical name, label, unit, source field, calculation, reporting frequency, and limitations for any metric accepted by Bankgraph's screen, workspace, or change tools.",
      inputSchema: OBJECT(
        {
          metric: ENUM(
            WEBMCP_METRICS,
            "Metric accepted by a Bankgraph screen, workspace, history, or change operation.",
          ),
        },
        ["metric"],
      ),
      controller: async (input) => {
        const source = inputObject(input, ["metric"]);
        const requestedMetric = enumValue(
          source.metric,
          "metric",
          WEBMCP_METRICS,
        );
        const definition =
          WEBMCP_METRIC_METHODS[WEBMCP_METRIC_ALIASES[requestedMetric]];
        return {
          summary: `${definition.label}: ${definition.frequency}, ${definition.unit}.`,
          data: {
            requestedMetric,
            ...definition,
            ...dataContext(deps),
            truncated: false,
          },
        };
      },
    },
    false,
  );

  const inspectChange = readOnlyTool({
    name: "bankgraph.inspect_change",
    title: "Explain a bank metric change",
    description:
      "Explain a reported change across consecutive quarters. Workspace metrics return supported endpoint evidence; assets, quarterly net income, and loan-to-deposit ratio also return component bridges. Results include units, method, provenance, available peer movement, and any FDIC structural event mapped to the certificate inside the comparison window.",
    maxResultChars: CHANGE_ATTRIBUTION_RESULT_CHARS,
    inputSchema: OBJECT(
      {
        cert: CERT_SCHEMA,
        metric: ATTRIBUTION_METRIC_SCHEMA,
        from: PERIOD_SCHEMA,
        to: PERIOD_SCHEMA,
        peerRelative: BOOLEAN,
        maxComponents: NUMBER(1, 8, true),
      },
      ["cert", "metric", "from", "to", "peerRelative", "maxComponents"],
    ),
    controller: async (input, context) => {
      const source = inputObject(input, [
        "cert",
        "metric",
        "from",
        "to",
        "peerRelative",
        "maxComponents",
      ]);
      if (!deps.inspectChange)
        throw capabilityUnavailable(
          "Change attribution",
          "Open the analysis workspace and retry.",
        );
      const request = {
        cert: cert(source.cert, "cert"),
        metric: enumValue(source.metric, "metric", WEBMCP_ATTRIBUTION_METRICS),
        from: reportingPeriod(source.from, "from"),
        to: reportingPeriod(source.to, "to"),
        peerRelative: booleanValue(source.peerRelative, "peerRelative"),
        maxComponents: integer(source.maxComponents, "maxComponents", 1, 8),
      };
      if (
        request.from.length === request.to.length &&
        request.from >= request.to
      )
        throw new WebMcpInputError("from must be earlier than to");
      const result = await deps.inspectChange(request, context);
      requireMatchingSourceMode(deps, result.sourceMode, "Change attribution");
      const components = result.components
        .slice(0, request.maxComponents)
        .map((component, index) => ({
          label: stringValue(
            component.label,
            `result.components[${index}].label`,
            { min: 1, max: 120 },
          ),
          change: finiteNumber(
            component.change,
            `result.components[${index}].change`,
            -1e15,
            1e15,
          ),
          ...(component.unit === undefined
            ? {}
            : {
                unit: stringValue(
                  component.unit,
                  `result.components[${index}].unit`,
                  { max: 40 },
                ),
              }),
        }));
      const evidence = WEBMCP_ATTRIBUTION_EVIDENCE[request.metric];
      if (result.unit !== undefined && result.unit !== evidence.unit) {
        throw adapterContractViolation(
          `Change attribution returned unit ${result.unit}; expected ${evidence.unit} for ${request.metric}`,
        );
      }
      if (
        result.method !== undefined &&
        !evidence.methods.includes(result.method)
      ) {
        throw adapterContractViolation(
          `Change attribution returned method ${result.method}; expected ${evidence.methods.join(" or ")} for ${request.metric}`,
        );
      }
      const method = result.method ?? evidence.defaultMethod;
      return {
        summary: attributionSummary(request, result, evidence),
        data: {
          ...result,
          unit: evidence.unit,
          peerUnit: evidence.peerUnit,
          method,
          components,
          truncated:
            result.truncated ||
            result.components.length > request.maxComponents,
        },
      };
    },
  });

  const investigateBank = mutationTool({
    name: "bankgraph.investigate_bank",
    title: "Investigate a bank across reported measures",
    description:
      "Open a linked, multi-metric investigation for one bank across two consecutive reporting quarters. The operation configures the visible workspace, then returns deterministic metric changes, reported component bridges, peer-relative evidence, mapped structural events, and optional direct-agency economic context. Read bankgraph.get_context first and pass its revision as ifRevision.",
    maxResultChars: BANK_INVESTIGATION_RESULT_CHARS,
    inputSchema: OBJECT(
      {
        cert: CERT_SCHEMA,
        comparisonCerts: ARRAY(CERT_SCHEMA, 4),
        metrics: ARRAY(ATTRIBUTION_METRIC_SCHEMA, 6, 2),
        from: PERIOD_SCHEMA,
        to: PERIOD_SCHEMA,
        historyPeriods: NUMBER(
          4,
          12,
          true,
          "Quarterly observations to show in the linked history view.",
        ),
        peerRelative: BOOLEAN,
        includeMacro: BOOLEAN,
        maxComponents: NUMBER(
          1,
          4,
          true,
          "Largest reported components to return for each supported bridge.",
        ),
        depth: ENUM(["guided", "pro"]),
        question: STRING(1_000),
        ifRevision: REVISION_SCHEMA,
      },
      [
        "cert",
        "metrics",
        "from",
        "to",
        "peerRelative",
        "includeMacro",
        "ifRevision",
      ],
    ),
    controller: async (input, context) => {
      const source = inputObject(input, [
        "cert",
        "comparisonCerts",
        "metrics",
        "from",
        "to",
        "historyPeriods",
        "peerRelative",
        "includeMacro",
        "maxComponents",
        "depth",
        "question",
        "ifRevision",
      ]);
      if (!deps.inspectChange) {
        throw capabilityUnavailable(
          "Bank investigation",
          "Open the analysis workspace and retry.",
        );
      }
      requireBoundedCurrentCohort(deps);
      const subjectCert = cert(source.cert, "cert");
      const comparisonCerts = source.comparisonCerts === undefined
        ? []
        : parseCerts(source.comparisonCerts, "comparisonCerts", 4);
      if (comparisonCerts.includes(subjectCert)) {
        throw new WebMcpInputError(
          "comparisonCerts must not repeat the investigated certificate",
        );
      }
      const selectedCerts = [subjectCert, ...comparisonCerts];
      const metrics = parseAttributionMetrics(source.metrics, "metrics");
      const from = reportingPeriod(source.from, "from");
      const to = reportingPeriod(source.to, "to");
      if (compareReportingQuarters(from, to) !== -1) {
        throw new WebMcpInputError(
          "from and to must be consecutive reporting quarters",
        );
      }
      const peerRelative = booleanValue(source.peerRelative, "peerRelative");
      const includeMacro = booleanValue(source.includeMacro, "includeMacro");
      const historyPeriods = source.historyPeriods === undefined
        ? 8
        : integer(source.historyPeriods, "historyPeriods", 4, 12);
      const maxComponents = source.maxComponents === undefined
        ? 3
        : integer(source.maxComponents, "maxComponents", 1, 4);
      const depth = source.depth === undefined
        ? "pro"
        : enumValue(source.depth, "depth", ["guided", "pro"] as const);
      const question = source.question === undefined
        ? `What changed across FDIC ${subjectCert}'s reported measures from ${quarterName(from)} to ${quarterName(to)}?`
        : stringValue(source.question, "question", { max: 1_000, trim: false });
      const commitRevision = requiredRevision(source.ifRevision);
      requireRevision(deps.workspace.state, commitRevision);
      await deps.ensureBanksLoaded?.(selectedCerts, context);
      throwIfAborted(context.signal);
      requireRevision(deps.workspace.state, commitRevision);

      const metricEvidencePromise = Promise.all(metrics.map(async (metric) => {
        const response = await inspectChange.controller(
          {
            cert: subjectCert,
            metric,
            from,
            to,
            peerRelative,
            maxComponents,
          },
          { ...context, toolName: inspectChange.name },
        );
        const raw = (response.data ?? {}) as WebMcpChangeResult;
        const peer = raw.peerEvidence
          ? {
              status: raw.peerEvidence.status,
              peerCount: integer(
                raw.peerEvidence.peerCount,
                `result.${metric}.peerEvidence.peerCount`,
                0,
                WEBMCP_COHORT_ANALYSIS_LIMIT,
              ),
              minimumPeerCount: integer(
                raw.peerEvidence.minimumPeerCount,
                `result.${metric}.peerEvidence.minimumPeerCount`,
                0,
                WEBMCP_COHORT_ANALYSIS_LIMIT,
              ),
              medianChange: optionalResultNumber(
                raw.peerMedianChange,
                `result.${metric}.peerMedianChange`,
              ),
              unit: raw.peerUnit ?? null,
              subjectPercentile: optionalResultNumber(
                raw.peerEvidence.subjectPercentile,
                `result.${metric}.peerEvidence.subjectPercentile`,
                0,
                100,
              ),
              warning: raw.peerEvidence.warning === null
                ? null
                : stringValue(
                    raw.peerEvidence.warning,
                    `result.${metric}.peerEvidence.warning`,
                    { max: 280 },
                  ),
            }
          : null;
        return {
          evidence: {
            metric,
            label: WEBMCP_METRIC_METHODS[metric].label,
            summary: stringValue(response.summary, `result.${metric}.summary`, {
              min: 1,
              max: 420,
            }),
            change: optionalResultNumber(
              raw.bankChange,
              `result.${metric}.bankChange`,
            ),
            unit: raw.unit ?? WEBMCP_ATTRIBUTION_EVIDENCE[metric].unit,
            method: stringValue(
              raw.method ?? WEBMCP_ATTRIBUTION_EVIDENCE[metric].defaultMethod,
              `result.${metric}.method`,
              { min: 1, max: 120 },
            ),
            components: (raw.components ?? []).slice(0, maxComponents),
            peer,
            provenance: raw.provenance === undefined
              ? null
              : stringValue(raw.provenance, `result.${metric}.provenance`, {
                  max: 500,
                }),
          },
          structuralContext: raw.structuralContext ?? null,
        };
      }));
      const macroPromise = includeMacro
        ? readWorkspaceMacroContext.controller(
            {},
            { ...context, toolName: readWorkspaceMacroContext.name },
          )
        : Promise.resolve(null);
      const [metricEvidenceRecords, macroResponse] = await Promise.all([
        metricEvidencePromise,
        macroPromise,
      ]);
      const metricEvidence = metricEvidenceRecords.map((item) => item.evidence);
      const firstStructuralContext = metricEvidenceRecords[0]?.structuralContext ?? null;
      throwIfAborted(context.signal);
      requireRevision(deps.workspace.state, commitRevision);

      const structural = firstStructuralContext
        ? {
            status: firstStructuralContext.status,
            window: firstStructuralContext.window,
            events: firstStructuralContext.events.slice(0, 4).map((event, index) => ({
              date: stringValue(event.date, `result.structural.events[${index}].date`, {
                min: 4,
                max: 40,
              }),
              category: enumValue(
                event.category,
                `result.structural.events[${index}].category`,
                ["merger", "acquisition", "closure", "charter"] as const,
              ),
              description: stringValue(
                event.description,
                `result.structural.events[${index}].description`,
                { min: 1, max: 320 },
              ),
              changeCode: event.changeCode === null
                ? null
                : integer(
                    event.changeCode,
                    `result.structural.events[${index}].changeCode`,
                    -1_000_000,
                    1_000_000,
                  ),
            })),
            caution: firstStructuralContext.caution === null
              ? null
              : stringValue(
                  firstStructuralContext.caution,
                  "result.structural.caution",
                  { max: 420 },
                ),
            coverage: firstStructuralContext.coverage,
          }
        : null;

      const historyFrom = shiftReportingQuarter(to, -(historyPeriods - 1)) ?? from;
      const removedFromExclusions = deps.workspace.state.excludedCerts.filter(
        (excludedCert) => selectedCerts.includes(excludedCert),
      );
      const chart = {
        id: "linked-analysis",
        title: "Linked bank investigation",
        kind: "line" as const,
        metrics,
        certs: selectedCerts,
        scale: "value" as const,
        stacked: false,
        visible: true,
      };
      const commands: WorkspaceCommand[] = [
        ...(removedFromExclusions.length > 0
          ? [workspaceCommands.setExcludedCerts(
              deps.workspace.state.excludedCerts.filter(
                (excludedCert) => !selectedCerts.includes(excludedCert),
              ),
            )]
          : []),
        workspaceCommands.setQuestion(question),
        workspaceCommands.setSelectedCerts(selectedCerts),
        workspaceCommands.setAsOfQuarter(to),
        workspaceCommands.setComparison({
          mode: "custom",
          rangeStartQuarter: null,
          customQuarter: from,
        }),
        workspaceCommands.setChartHistory({ from: historyFrom, to }),
        workspaceCommands.upsertChart(chart),
        workspaceCommands.setActiveBank(subjectCert),
        workspaceCommands.setActiveMetric(metrics[0]),
        workspaceCommands.setDepth(depth),
        workspaceCommands.setActivePanel("compare"),
      ];
      const result = executeSeries(
        deps.workspace,
        commands,
        commitRevision,
        context.signal,
      );
			const boardUpdate = deps.applyBoardTemplate
				? await deps.applyBoardTemplate({ templateId: 'one_bank', mode: 'replace', focus: false }, context)
				: null;
			const finalState = deps.workspace.state;
			const summary = `Opened a ${metrics.length}-metric investigation for FDIC ${subjectCert} from ${quarterName(from)} to ${quarterName(to)}${boardUpdate ? ` and built ${boardUpdate.blockIds.length} linked board views` : ''}.`;
      const macroData = (macroResponse?.data ?? null) as null | {
        status?: unknown;
        series?: unknown[];
      };
      const workspace = {
			revision: finalState.revision,
			selectedCerts: finalState.selectedCerts,
			activeBank: finalState.activeBank,
			activeMetric: finalState.activeMetric,
			panel: finalState.activePanel,
			depth: finalState.depth,
			comparisonPair: getWorkspaceComparisonPair(finalState),
			board: boardUpdate ? { blockIds: boardUpdate.blockIds, visible: true } : null,
      };
      const nextTools = [
				"bankgraph.read_research_board",
				"bankgraph.read_board_block",
				"bankgraph.analyze_peer_distribution",
				"bankgraph.upsert_takeaway",
      ];
      const fullResult = {
        summary,
        data: {
					...resultMeta(deps, finalState, result.changed || boardUpdate?.changed === true),
          subjectCert,
          comparisonCerts,
					question: finalState.question,
          from,
          to,
          history: { from: historyFrom, to, periods: historyPeriods },
          metrics: metricEvidence,
          structural,
          macro: macroData
            ? {
                status: macroData.status,
                series: Array.isArray(macroData.series)
                  ? macroData.series.slice(0, 5)
                  : [],
                interpretation: "Context only; no causal claim is made.",
              }
            : null,
          workspace,
          removedFromExclusions,
          nextTools,
        },
      };
      if (createResultEnvelope(fullResult, BANK_INVESTIGATION_RESULT_CHARS).ok) {
        return fullResult;
      }

      // The workspace is already committed. Return an explicit success receipt instead of
      // letting the native host turn a successful mutation into a retryable size failure.
      const compactResult = {
        summary: `${summary} Detailed evidence was compacted in this commit receipt.`,
        data: {
			changed: result.changed || boardUpdate?.changed === true,
			revision: finalState.revision,
          sourceMode: dataContext(deps).sourceMode,
          assetUnit: "usd_thousands",
			truncated: finalState.results.truncated,
          responseMode: "compact_commit_receipt",
          evidenceCompacted: true,
          subjectCert,
          comparisonCerts,
          from,
          to,
          history: { from: historyFrom, to, periods: historyPeriods },
          metrics: metricEvidence.map((item) => ({
            metric: item.metric,
            label: item.label,
            change: item.change,
            unit: item.unit,
            method: item.method,
            componentCount: item.components.length,
            peer: item.peer
              ? {
                  status: item.peer.status,
                  peerCount: item.peer.peerCount,
                  minimumPeerCount: item.peer.minimumPeerCount,
                  medianChange: item.peer.medianChange,
                  unit: item.peer.unit,
                  subjectPercentile: item.peer.subjectPercentile,
                }
              : null,
          })),
          structural: structural
            ? { status: structural.status, eventCount: structural.events.length }
            : null,
          macro: macroData
            ? {
                status: macroData.status,
                seriesCount: Array.isArray(macroData.series) ? macroData.series.length : 0,
              }
            : null,
          workspace,
          removedFromExclusions,
          nextTools: ["bankgraph.inspect_change", ...nextTools],
        },
      };
      if (createResultEnvelope(compactResult, BANK_INVESTIGATION_RESULT_CHARS).ok) {
        return compactResult;
      }

      return {
        summary,
        data: {
			changed: result.changed || boardUpdate?.changed === true,
			revision: finalState.revision,
          responseMode: "minimal_commit_receipt",
          evidenceCompacted: true,
          subjectCert,
          from,
          to,
          metricCount: metrics.length,
          workspace,
          nextTools: ["bankgraph.get_context", "bankgraph.inspect_change"],
        },
      };
    },
  });

  const updateResearch = mutationTool({
    name: "bankgraph.update_research",
    title: "Update findings or the watchlist",
    description:
      "Save or remove a pinned finding, or set a bank's watchlist status. Read bankgraph.get_context first and pass its revision as ifRevision; the response reports the resulting revision and whether anything changed.",
    inputSchema: OBJECT(
      {
        action: ENUM(["upsert_finding", "remove_finding", "set_watchlist"]),
        id: STRING(64, undefined, 1),
        title: STRING(160),
        note: STRING(4_000),
        certs: ARRAY(CERT_SCHEMA, 10),
        metrics: ARRAY(RESEARCH_METRIC_SCHEMA, 6),
        period: PERIOD_SCHEMA,
        source: STRING(500),
        cert: CERT_SCHEMA,
        watched: BOOLEAN,
        ifRevision: REVISION_SCHEMA,
      },
      ["action", "ifRevision"],
    ),
    controller: async (input, context) => {
      const source = inputObject(input, [
        "action",
        "id",
        "title",
        "note",
        "certs",
        "metrics",
        "period",
        "source",
        "cert",
        "watched",
        "ifRevision",
      ]);
      const action = enumValue(source.action, "action", [
        "upsert_finding",
        "remove_finding",
        "set_watchlist",
      ] as const);
      let command: WorkspaceCommand;
      if (action === "remove_finding") {
        inputObject(input, ["action", "id", "ifRevision"]);
        command = workspaceCommands.removeFinding(identifier(source.id, "id"));
      } else if (action === "set_watchlist") {
        inputObject(input, ["action", "cert", "watched", "ifRevision"]);
        command = workspaceCommands.setWatchlistDesired(
          cert(source.cert, "cert"),
          booleanValue(source.watched, "watched"),
        );
      } else {
        inputObject(input, [
          "action", "id", "title", "note", "certs", "metrics", "period", "source", "ifRevision",
        ]);
        const metrics = parseResearchMetrics(source.metrics, "metrics");
        const contextLineage = dataContext(deps);
        const finding: PinnedFinding = {
          id: identifier(source.id, "id"),
          title: stringValue(source.title, "title", { max: 160 }),
          note: stringValue(source.note, "note", { max: 4_000, trim: false }),
          certs: parseCerts(source.certs, "certs"),
          metrics,
          period:
            source.period === undefined
              ? null
              : reportingPeriod(source.period, "period"),
          source: optionalString(source.source, "source", { max: 500 }) ?? null,
          provenance: researchMetricAnalysisProvenance({
            metrics,
            sourceAsOf: contextLineage.sourceAsOf,
            retrievedAt: contextLineage.retrievedAt,
            release: contextLineage.release,
            releaseGeneration: contextLineage.releaseGeneration,
            cohortHash: contextLineage.cohortHash,
          }),
        };
        command = workspaceCommands.upsertFinding(finding);
      }
      throwIfAborted(context.signal);
      const result = deps.workspace.execute(command, {
        ifRevision: requiredRevision(source.ifRevision),
      });
      return {
        summary: result.changed
          ? "Research state updated."
          : "Research state already matched.",
        data: resultMeta(deps, result.state, result.changed),
      };
    },
  });

  const shareOrExport = mutationTool({
    name: "bankgraph.share_or_export",
    title: "Copy a live link or export data",
    description:
      "Create a live workspace link that replays the current choices against published data, a public workspace-state JSON artifact, or a release-fenced bank-data CSV.",
    maxResultChars: MAX_WEBMCP_EXTENDED_ENVELOPE_CHARS,
    inputSchema: OBJECT(
      {
        format: ENUM(["share_link", "workspace_json", "bank_csv"]),
        certs: ARRAY(CERT_SCHEMA, 10),
        ifRevision: REVISION_SCHEMA,
      },
      ["format"],
    ),
    controller: async (input, context) => {
      const source = inputObject(input, ["format", "certs", "ifRevision"]);
      const format = enumValue(source.format, "format", [
        "share_link",
        "workspace_json",
        "bank_csv",
      ] as const);
      if (format !== "bank_csv" && source.certs !== undefined) {
        throw new WebMcpInputError("certs is only valid for bank_csv");
      }
      const state = deps.workspace.state;
      requireRevision(state, optionalRevision(source.ifRevision));
      throwIfAborted(context.signal);
      const invocationContext = dataContext(deps);
      const certs =
        source.certs === undefined
          ? state.selectedCerts
          : parseCerts(source.certs, "certs");
      if (format === "bank_csv" && certs.length === 0)
        throw new WebMcpInputError("bank_csv requires certs or selected banks");
      const serialized =
        format === "bank_csv" ? null : trySerializeWorkspaceSearch(state);
      if (serialized && !serialized.ok) {
        throw new WebMcpToolError(
          "workspace_share_budget_exceeded",
          "The public workspace state exceeds the safe browser URL budget. Remove some findings or chart views, then retry.",
          {
            direction: serialized.error.direction,
            encodedLength: serialized.metadata.encodedLength,
            maxEncodedLength: serialized.metadata.maxEncodedLength,
            findingNotesTruncated: serialized.metadata.findingNotesTruncated,
            omittedNoteCharacters: serialized.metadata.omittedNoteCharacters,
          },
        );
      }
      let artifact: WebMcpArtifactResult;
      if (deps.createArtifact) {
        artifact = await deps.createArtifact(
          format === "bank_csv"
            ? {
                format,
                revision: state.revision,
                metrics: visibleMetricsFromState(state),
                releaseGeneration: invocationContext.releaseGeneration,
                certs,
                filters: {
                  query: state.filters.query,
                  states: [...state.filters.states],
                  assetRange: { ...state.filters.assetRange },
                  active: state.filters.active,
                  metricConditions: state.filters.metricConditions.map((condition) => ({
                    ...condition,
                  })),
                },
                comparisonPair: getWorkspaceComparisonPair(state),
                chartHistory: { ...state.chartHistory },
              }
            : {
                format,
                revision: state.revision,
                search: serialized!.search,
                shareMetadata: serialized!.metadata,
              },
          context,
        );
      } else if (format === "share_link") {
        const origin = (
          deps.origin?.() ??
          (typeof location === "undefined" ? "" : location.origin)
        ).replace(/\/$/, "");
        const url = `${origin}${deps.workspacePath ?? "/b"}?${serialized!.search}`;
        artifact = { url };
      } else {
        throw capabilityUnavailable(
          "Artifact export",
          "Use share_link on this page, or open the analysis workspace and retry.",
        );
      }
      throwIfAborted(context.signal);
      if (format === "bank_csv") {
        requireRevision(deps.workspace.state, state.revision);
        const completedContext = dataContext(deps);
        if (completedContext.releaseGeneration !== invocationContext.releaseGeneration) {
          throw new WebMcpToolError(
            "stale_page_release",
            "The published data release changed while the CSV was being prepared. Reload the workspace and retry.",
            {
              expectedReleaseGeneration: invocationContext.releaseGeneration,
              actualReleaseGeneration: completedContext.releaseGeneration,
              nextAction: "Reload the workspace, read bankgraph.get_context, and retry the export.",
            },
            true,
          );
        }
      }
      artifact = boundedArtifactResult(artifact);
      const sourceContext = dataContext(deps);
      const shareMetadata = serialized?.ok ? serialized.metadata : null;
      const shareTruncated = Boolean(
        shareMetadata &&
        (shareMetadata.findingNotesTruncated > 0 ||
          shareMetadata.findingSourcesTruncated > 0),
      );
      return {
        summary:
          format === "share_link"
            ? "Live workspace link created."
            : "Export artifact created.",
        data: {
          ...artifact,
          changed: false,
          artifactCreated: true,
          revision: state.revision,
          ...sourceContext,
          shareMetadata,
          truncated: shareTruncated,
        },
      };
    },
  });

  const diagnostics = readOnlyTool(
    {
      name: "bankgraph.webmcp_diagnostics",
      title: "Read WebMCP diagnostics",
      description:
        "Read bounded feature, registration, and recent execution diagnostics for the current page. Use when a site tool is missing or failed.",
      maxResultChars: DIAGNOSTICS_RESULT_CHARS,
      inputSchema: OBJECT({}),
      controller: async (input) => {
        inputObject(input, []);
        const snapshot = deps.getDiagnostics?.();
        return {
          summary: snapshot
            ? `${snapshot.registrations.length} WebMCP registrations observed.`
            : "Host diagnostics are not connected.",
          data: snapshot
            ? {
                feature: snapshot.feature,
                registrations: snapshot.registrations.slice(0, 12),
                events: snapshot.events.slice(-8),
                ...dataContext(deps),
                truncated:
                  snapshot.registrations.length > 12 ||
                  snapshot.events.length > 8,
              }
            : { available: null, ...dataContext(deps), truncated: false },
        };
      },
    },
    false,
  );

  const workspaceTools = Object.fromEntries(
    [
      getContext,
      searchBanks,
      readCurrentScreen,
      configureScreen,
      configureComparison,
      configureView,
      setPeerCohort,
      readCurrentCohort,
      analyzeCohortTrends,
      readResultSet,
      buildBoardFromResult,
      analyzeCohortChange,
      findTemporalPatterns,
      analyzeFinancialComposition,
      analyzeFailurePatterns,
      readAnalysisResult,
      readCurrentComparison,
      analyzePeerDistribution,
      rankCohortOnBoard,
      analyzeMetricRelationship,
      readGeographySummary,
      readWorkspaceMacroContext,
      readMetricHistory,
      getMetricMethod,
      inspectChange,
      investigateBank,
      updateResearch,
      shareOrExport,
      diagnostics,
    ].map((tool) => [tool.name, tool]),
  );
  return {
    ...workspaceTools,
    ...createResearchBoardWebMcpToolCatalog(deps),
  };
}

/** Build the route catalog without hiding useful workspace operations behind the active panel. */
export function createWorkspaceWebMcpTools(
  deps: WorkspaceWebMcpDependencies,
  options: WorkspaceWebMcpCatalogOptions,
): readonly WebMcpToolDefinition[] {
  const catalog = createWorkspaceWebMcpToolCatalog(deps);
  if (options.page !== "workspace") {
    const names = [
      "bankgraph.get_context",
      "bankgraph.search_banks",
      "bankgraph.get_metric_method",
      ...(options.includeDiagnostics
        ? ["bankgraph.webmcp_diagnostics"]
        : []),
    ];
    return names.map((name) => catalog[name]);
  }
	const hasCohortTrendResult = deps.workspace.state.cohortTrendResult !== null;
	const hasAnalysisResult = deps.workspace.state.analysisResult !== null;
	const collectingAnalysis = !hasCohortTrendResult && !hasAnalysisResult;
  const names = [
    "bankgraph.get_context",
    "bankgraph.search_banks",
    "bankgraph.read_current_screen",
    "bankgraph.configure_screen",
    "bankgraph.configure_comparison",
		...(deps.getBoardPresentation ? [] : ["bankgraph.configure_view"]),
    "bankgraph.set_peer_cohort",
    ...(deps.readCurrentCohort ? ["bankgraph.read_current_cohort"] : []),
    ...(deps.analyzeCohortTrends && collectingAnalysis ? ["bankgraph.analyze_cohort_trends"] : []),
    ...(hasCohortTrendResult ? ["bankgraph.read_result_set"] : []),
    ...(deps.analyzeCohortTrends && hasCohortTrendResult ? ["bankgraph.build_board_from_result"] : []),
    ...(deps.analyzeCohortChange && collectingAnalysis ? ["bankgraph.analyze_cohort_change"] : []),
    ...(deps.findTemporalPatterns && collectingAnalysis ? ["bankgraph.find_temporal_patterns"] : []),
    ...(deps.analyzeFinancialComposition && collectingAnalysis ? ["bankgraph.analyze_financial_composition"] : []),
    ...(deps.analyzeFailurePatterns && collectingAnalysis ? ["bankgraph.analyze_failure_patterns"] : []),
		...(hasAnalysisResult && (deps.analyzeCohortChange || deps.findTemporalPatterns || deps.analyzeFinancialComposition || deps.analyzeFailurePatterns)
      ? ["bankgraph.read_analysis_result"]
      : []),
    "bankgraph.read_research_board",
    "bankgraph.read_board_block",
    "bankgraph.list_board_templates",
    "bankgraph.apply_board_template",
    "bankgraph.add_workspace_view",
    "bankgraph.plot_metric_history",
    "bankgraph.publish_exact_table",
    ...(hasAnalysisResult ? ["bankgraph.publish_result_view"] : []),
    "bankgraph.upsert_takeaway",
    "bankgraph.arrange_research_board",
		...(deps.configureBoardView ? ["bankgraph.configure_board_view"] : []),
    "bankgraph.remove_board_blocks",
		...(deps.clearResearchBoard ? ["bankgraph.clear_research_board"] : []),
		...(deps.resetBoardLayout ? ["bankgraph.reset_board_layout"] : []),
		...(deps.resetResearchBoard ? ["bankgraph.reset_research_board"] : []),
    "bankgraph.focus_board_block",
		...(deps.setAppearance ? ["bankgraph.set_appearance"] : []),
    ...(deps.readCurrentComparison ? ["bankgraph.read_current_comparison"] : []),
    ...(deps.analyzePeerDistribution ? ["bankgraph.analyze_peer_distribution"] : []),
    ...(deps.analyzePeerDistribution && collectingAnalysis ? ["bankgraph.rank_cohort_on_board"] : []),
    ...(deps.analyzeMetricRelationship ? ["bankgraph.analyze_metric_relationship"] : []),
    ...(deps.readGeographySummary ? ["bankgraph.read_geography_summary"] : []),
    ...(deps.readWorkspaceMacroContext ? ["bankgraph.read_workspace_macro_context"] : []),
    ...(deps.readMetricHistory ? ["bankgraph.read_metric_history"] : []),
    "bankgraph.get_metric_method",
    ...(deps.inspectChange ? ["bankgraph.inspect_change"] : []),
    ...(deps.inspectChange ? ["bankgraph.investigate_bank"] : []),
    "bankgraph.update_research",
    "bankgraph.share_or_export",
    ...(options.includeDiagnostics
      ? ["bankgraph.webmcp_diagnostics"]
      : []),
  ];
  return names.map((name) => catalog[name]);
}
