import { BANK_SCREEN_SORTS, type BankScreenSort } from "$lib/bank-screen.js";
import { buildWorkspaceHref } from "$lib/components/home/workspace-links.js";
import {
  correlationInterpretationLabel,
  correlationInterpretationTier,
} from "$lib/analytics/correlation-policy.js";
import type {
  SystemChangeRadar,
  SystemChangeRadarMetricId,
} from "$lib/server/analytics/system-signals.js";
import {
  canonicalResearchMetric,
  isResearchMetric,
  type ResearchMetric,
} from "$lib/research-metrics.js";
import type {
  AnalysisProvenance,
  AnomalyResponse,
  CompareResponse,
  Failure,
  Financial,
  Institution,
  MacroResponse,
  PeerComparison,
  PercentileHistoryPoint,
  RiskResponse,
} from "$lib/types/index.js";
import {
  createDefaultWorkspaceState,
  createWorkspaceStore,
  workspaceCommands,
  type WorkspaceCommand,
  type WorkspacePanel,
  type WorkspaceStore,
} from "$lib/workspace/index.js";
import {
  arrayValue,
  enumValue,
  integer,
  inputObject,
  metric,
  unique,
  WebMcpInputError,
} from "./runtime.js";
import type { TightObjectSchema, WebMcpToolDefinition } from "./types.js";

const EMPTY_SCHEMA: TightObjectSchema = {
  type: "object",
  properties: {},
  additionalProperties: false,
};

const READ_ONLY = { readOnlyHint: true, untrustedContentHint: true } as const;
const LOCAL_MUTATION = {
  readOnlyHint: false,
  untrustedContentHint: true,
} as const;
const METRIC_RE = /^[A-Za-z][A-Za-z0-9_:. -]{0,63}$/;

export interface RouteWorkspaceBridge {
  workspace: WorkspaceStore;
  /** Reload persisted workspace state immediately before a route handoff. */
  refresh?(): WorkspaceStore;
  open(path: string): void;
}

export interface WorkspaceEvidence {
  id: string;
  title: string;
  note: string;
  certs?: number[];
  metrics?: string[];
  period?: string | null;
  source: string;
  panel: WorkspacePanel;
  activeBank?: number | null;
  question: string;
  chartTitle?: string;
  provenance?: AnalysisProvenance | null;
}

export interface IndustrySegment {
  segment: string;
  data: Array<{ repdte: string; metrics: Record<string, number> }>;
}

export interface IndustryRouteData {
  allSegment: IndustrySegment | null;
  communitySegment: IndustrySegment | null;
  regionalSegment: IndustrySegment | null;
  largeSegment: IndustrySegment | null;
  failureCount: number;
  recentFailures: Array<{
    cert: number;
    name: string | null;
    city: string | null;
    state: string | null;
    fail_date: string | null;
    total_assets: number | null;
  }>;
  assetTiers: Array<{
    asset_tier: number;
    bank_count: number;
    total_assets: number;
    total_deposits: number;
    avg_assets: number;
  }>;
  topStates: Array<{ state: string; bank_count: number; total_assets: number }>;
  regulators: Array<{ regulator: string; bank_count: number }>;
  systemBrief?: { changeRadar: SystemChangeRadar | null } | null;
}

export interface FailureRouteData {
  failures: Failure[];
  yearlyData: Array<{ year: string; count: number }>;
  estimatedLossSummary: {
    totalEstimatedLoss: number;
    recordCount: number;
    recordsWithEstimatedLoss: number;
    averageEstimatedLoss: number;
    highestEstimatedLoss: {
      name: string;
      cost: number;
      fail_date: string;
    } | null;
    largestByAssets: {
      name: string;
      total_assets: number;
      fail_date: string;
    } | null;
    estimatedLossByDecade: Array<{
      decade: string;
      estimatedLoss: number;
      count: number;
      recordsWithEstimatedLoss: number;
    }>;
  };
  recordFilter: "failure" | "assistance" | "all";
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

/** The exact server-backed state rendered by the standalone bank directory. */
export interface BankDirectoryRouteData {
  banks: Array<Institution & { latest_loan_to_deposit_ratio?: number | null }>;
  total: number;
  page: number;
  limit: number;
  release: string | null;
  releaseGeneration: string | null;
  params: {
    q: string;
    state: string;
    asset_min: string;
    asset_max: string;
    active: string;
    sort: string;
    order: string;
  };
}

export interface RiskHistoryPoint {
  repdte: string;
  composite: number | null;
  capital: number | null;
  asset_quality: number | null;
  earnings: number | null;
  liquidity: number | null;
}

export interface RiskHistoryComparison {
  status: "comparable" | "coverage_changed" | "insufficient_composite_history";
  coverage_signatures: string[];
  method: string;
}

export interface MacroRouteData {
  series: Record<string, MacroResponse | null>;
  correlations: Array<{
    metric_a: string;
    metric_b: string;
    window_start: string;
    window_end: string;
    observations: number;
    correlation: number | null;
    lag_quarters: number;
    alignment_direction: string;
    method: string;
    computed_at: string;
  }>;
  view?: {
    range: string;
    from: string;
    to: string;
    mode: "level" | "yoy";
    eventsVisible: boolean;
    focusedGroup: string;
  };
}

export interface BankSystemContextData {
  cert: number;
  footprint: Array<{
    year: number;
    branches: number;
    mainOffices: number;
    states: number;
    counties: number;
    deposits: number;
    source: {
      objectSha256: string;
      manifestKey: string;
      retrievedAt: string;
    };
  }>;
  markets: Array<{
    countyFips: string;
    county: string;
    state: string;
    branches: number;
    bankDeposits: number;
    marketDeposits: number;
    depositShare: number | null;
    competingBanks: number;
  }>;
  structuralHistory: Array<{
    id: string;
    date: string;
    category: string;
    description: string;
    institutionName: string | null;
    organizationRole: string | null;
    changeCode: number | null;
  }>;
  industry: Array<{
    year: number;
    assets: number;
    deposits: number;
    loans: number;
    banks: number;
    branches: number;
    employees: number;
    sources: Array<{
      charterType: "CB" | "SI";
      sourceRunId: string;
      sourceRetrievedAt: string | null;
      publishedAt: string;
    }>;
  }>;
  coverage: {
    sodYear: number | null;
    sodRetrievedAt: string | null;
    annualFrom: number | null;
    annualTo: number | null;
    historyRetrievedAt: string | null;
    historyProcessYearFrom: number | null;
    historyProcessYearTo: number | null;
    historyPartitions: number;
  };
  provenance: {
    source: string;
    sourceUrl: string;
    monetaryUnit: string;
    footprintGrain: string;
    marketGrain: string;
    industryGrain: string;
    publicationGeneration: string | null;
    sodCurrent: {
      year: number;
      objectSha256: string;
      manifestKey: string;
      lakeRetrievedAt: string;
      sourceRunId: string;
      sourceRetrievedAt: string;
      publishedAt: string;
    } | null;
  };
}

function routeWorkspace(): RouteWorkspaceBridge {
  let workspace = createWorkspaceStore({ persist: true });
  return {
    get workspace() {
      return workspace;
    },
    refresh() {
      workspace = createWorkspaceStore({ persist: true });
      return workspace;
    },
    open(path) {
      if (typeof window === "undefined") return;
      window.setTimeout(() => window.location.assign(path), 25);
    },
  };
}

/** Creates one shared, reducer-backed workspace bridge per route component. */
export function createRouteWorkspaceBridge(): RouteWorkspaceBridge {
  return routeWorkspace();
}

function source(
  dataset: string,
  reportingPeriod: string | null,
  extra: Record<string, unknown> = {},
) {
  return {
    publisher: "Federal Deposit Insurance Corporation",
    dataset,
    reportingPeriod,
    ...extra,
  };
}

function assertEmptyInput(input: unknown): void {
  inputObject(input, []);
}

function requestedLimit(value: unknown, max: number, fallback: number): number {
  return value === undefined ? fallback : integer(value, "limit", 1, max);
}

function requestedMetrics(value: unknown, max: number): string[] {
  return unique(
    arrayValue(value, "metrics", {
      min: 1,
      max,
      map: (item, index) => metric(item, `metrics[${index}]`),
    }),
    "metrics",
  );
}

function metricValues(
  row: Record<string, unknown>,
  metrics: readonly string[],
): Record<string, unknown> {
  return Object.fromEntries(metrics.map((name) => [name, row[name] ?? null]));
}

function workspaceResearchMetrics(values: readonly string[]): ResearchMetric[] {
  const metrics: ResearchMetric[] = [];
  for (const value of values) {
    const canonical = canonicalResearchMetric(value);
    if (canonical && !metrics.includes(canonical)) metrics.push(canonical);
    if (metrics.length === 6) break;
  }
  return metrics;
}

function researchMetricsFromFinancialFields(
  values: readonly string[],
): ResearchMetric[] {
  return values.flatMap((value) => {
    if (value === "netincq") return ["netinc"];
    return isResearchMetric(value) ? [value] : [];
  });
}

function openWorkspaceEvidence(
  bridge: RouteWorkspaceBridge,
  evidence: WorkspaceEvidence,
) {
  const certs = [...new Set(evidence.certs ?? [])].slice(0, 10);
  const metrics = workspaceResearchMetrics(evidence.metrics ?? []);
  const workspace = bridge.refresh?.() ?? bridge.workspace;
  const removedFromExclusions = workspace.state.excludedCerts.filter(
    (excludedCert) => certs.includes(excludedCert),
  );
  const commands: WorkspaceCommand[] = [
    ...(removedFromExclusions.length > 0
      ? [workspaceCommands.setExcludedCerts(
          workspace.state.excludedCerts.filter(
            (excludedCert) => !certs.includes(excludedCert),
          ),
        )]
      : []),
    workspaceCommands.setQuestion(evidence.question),
    workspaceCommands.setSelectedCerts(certs),
    workspaceCommands.setActiveBank(evidence.activeBank ?? certs[0] ?? null),
    workspaceCommands.setActivePanel(evidence.panel),
    workspaceCommands.setActiveMetric(metrics[0] ?? null),
    workspaceCommands.upsertFinding({
      id: evidence.id,
      title: evidence.title,
      note: evidence.note,
      certs,
      metrics,
      period: evidence.period ?? null,
      source: evidence.source,
      provenance: evidence.provenance ?? null,
    }),
  ];
  if (metrics.length > 0 && certs.length > 0) {
    commands.push(
      workspaceCommands.upsertChart({
        id: `route-${evidence.id}`.slice(0, 64),
        title: evidence.chartTitle ?? evidence.title,
        kind: "line",
        metrics,
        certs,
        scale: "value",
        stacked: false,
        visible: true,
      }),
    );
  }
  const result = workspace.executeBatch(commands);
  bridge.open("/b");
  return {
    summary: `Opened ${evidence.title} in the shared workspace.`,
    data: {
      changed: result.changed,
      revision: result.revision,
      workspacePath: "/b",
      activePanel: result.state.activePanel,
      activeBank: result.state.activeBank,
      selectedCerts: result.state.selectedCerts,
      removedFromExclusions,
      metrics,
    },
  };
}

function openInWorkspaceTool(
  bridge: RouteWorkspaceBridge,
  evidence: WorkspaceEvidence,
  name = "bankgraph.open_in_workspace",
): WebMcpToolDefinition {
  return {
    name,
    title: "Open this evidence in the workspace",
    description:
      "Carry the evidence visible on this page into the shared Bankgraph workspace, then open the workspace.",
    inputSchema: EMPTY_SCHEMA,
    annotations: LOCAL_MUTATION,
    maxResultChars: 2_400,
    controller(input) {
      assertEmptyInput(input);
      return openWorkspaceEvidence(bridge, evidence);
    },
  };
}

const DIRECTORY_SORT_TO_SCREEN: Readonly<Record<string, BankScreenSort>> = {
  name: "name",
  assets: "assets",
  deposits: "deposits",
  loanToDeposit: "loanToDeposit",
  roe: "roe",
  nim: "nim",
  npl: "noncurrentLoanRatio",
  tier1: "tier1Ratio",
};

function directoryAssetBound(value: string): number | null {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}

function directoryState(data: BankDirectoryRouteData) {
  const states = [...new Set(
    data.params.state
      .split(",")
      .map((item) => item.trim().toUpperCase())
      .filter((item) => /^[A-Z]{2}$/.test(item)),
  )].slice(0, 56);
  const assetMin = directoryAssetBound(data.params.asset_min);
  const assetMax = directoryAssetBound(data.params.asset_max);
  const active = data.params.active === "0"
    ? "inactive" as const
    : data.params.active === ""
      ? "any" as const
      : "active" as const;
  const sort = (BANK_SCREEN_SORTS as readonly string[]).includes(data.params.sort)
    ? data.params.sort as BankScreenSort
    : DIRECTORY_SORT_TO_SCREEN[data.params.sort] ?? "assets";
  const order = data.params.order === "asc" ? "asc" as const : "desc" as const;
  return {
    filters: {
      query: data.params.q.slice(0, 200),
      states,
      assetRange: {
        min: assetMin,
        max: assetMax !== null && assetMin !== null && assetMax < assetMin
          ? null
          : assetMax,
      },
      active,
      metricConditions: [],
    },
    screenView: { sort, order },
  };
}

function directoryQuestion(data: BankDirectoryRouteData): string {
  const { filters } = directoryState(data);
  const status = filters.active === "any" ? "" : `${filters.active} `;
  const query = filters.query
    ? ` matching “${filters.query.slice(0, 80)}”`
    : "";
  const geography = filters.states.length > 0
    ? ` in ${filters.states.join(", ")}`
    : " in the United States";
  const formatAssets = (usdThousands: number) => {
    const usd = usdThousands * 1_000;
    if (usd >= 1_000_000_000) {
      return `$${Number((usd / 1_000_000_000).toPrecision(3))} billion`;
    }
    if (usd >= 1_000_000) {
      return `$${Number((usd / 1_000_000).toPrecision(3))} million`;
    }
    return `$${Math.round(usd).toLocaleString("en-US")}`;
  };
  const bounds = filters.assetRange.min !== null && filters.assetRange.max !== null
    ? ` with assets from ${formatAssets(filters.assetRange.min)} to ${formatAssets(filters.assetRange.max)}`
    : filters.assetRange.min !== null
      ? ` with at least ${formatAssets(filters.assetRange.min)} in assets`
      : filters.assetRange.max !== null
        ? ` with no more than ${formatAssets(filters.assetRange.max)} in assets`
        : "";
  return `What does the data show for ${status}banks${query}${geography}${bounds}?`;
}

function latestDirectoryPeriod(banks: readonly Institution[]): string | null {
  return banks
    .map((bank) => bank.latest_repdte)
    .filter((period): period is string => typeof period === "string")
    .sort()
    .at(-1) ?? null;
}

/** Route-scoped tools backed by the exact page of institutions rendered in /banks. */
export function createBankDirectoryRouteTools(
  data: BankDirectoryRouteData,
  bridge: RouteWorkspaceBridge,
): WebMcpToolDefinition[] {
  const current = directoryState(data);
  const visibleBanks = data.banks.slice(0, Math.max(0, data.limit));
  const latestPeriod = latestDirectoryPeriod(visibleBanks);

  return [
    {
      name: "bankgraph.read_bank_directory",
      title: "Read the current bank directory",
      description:
        "Read the filters, ordering, pagination, and a bounded set of results visible in the bank directory.",
      inputSchema: {
        type: "object",
        properties: {
          limit: {
            type: "integer",
            minimum: 1,
            maximum: 10,
            description: "Visible banks to return from the current page.",
          },
        },
        additionalProperties: false,
      },
      annotations: READ_ONLY,
      maxResultChars: 8_000,
      controller(input) {
        const object = inputObject(input, ["limit"]);
        const limit = requestedLimit(object.limit, 10, 10);
        const rows = visibleBanks.slice(0, limit).map((bank, index) => ({
          rankOnPage: index + 1,
          cert: bank.cert,
          name: bank.name,
          city: bank.city,
          state: bank.state,
          active: bank.active === 1,
          regulator: bank.regulator,
          latestReportingPeriod: bank.latest_repdte,
          assetsUsdThousands: bank.total_assets,
          depositsUsdThousands: bank.total_deposits,
          roaPercent: bank.latest_roa,
          roePercent: bank.latest_roe,
          netInterestMarginPercent: bank.latest_nim,
          loanToDepositPercent: bank.latest_loan_to_deposit_ratio ?? null,
          noncurrentLoansPercent: bank.latest_npl_ratio,
          tier1RiskBasedCapitalPercent: bank.latest_tier1_ratio,
        }));
        const totalPages = data.limit > 0
          ? Math.max(1, Math.ceil(data.total / data.limit))
          : 1;
        return {
          summary: `${rows.length} of ${visibleBanks.length} banks on directory page ${data.page}; ${data.total} match the current filters.`,
          data: {
            filters: {
              query: current.filters.query,
              states: current.filters.states,
              active: current.filters.active,
              assetMinUsdThousands: current.filters.assetRange.min,
              assetMaxUsdThousands: current.filters.assetRange.max,
            },
            ordering: {
              sort: data.params.sort,
              order: current.screenView.order,
            },
            pagination: {
              page: data.page,
              pageSize: data.limit,
              total: data.total,
              totalPages,
              visible: visibleBanks.length,
              returned: rows.length,
              resultsTruncated: visibleBanks.length > rows.length,
            },
            banks: rows,
            source: source(
              "BankFind institutions and latest Call Report snapshot",
              latestPeriod,
              {
                release: data.release,
                releaseGeneration: data.releaseGeneration,
                units:
                  "Assets and deposits are USD thousands; ratios are percent.",
              },
            ),
          },
        };
      },
    },
    {
      name: "bankgraph.open_directory_bank",
      title: "Open a directory bank in the workspace",
      description:
        "Open one bank from the visible directory page in the shared research workspace. The certificate number must belong to a current visible result.",
      inputSchema: {
        type: "object",
        properties: {
          cert: {
            type: "integer",
            minimum: 1,
            maximum: 100_000_000,
            description: "FDIC certificate number from the current visible page.",
          },
        },
        required: ["cert"],
        additionalProperties: false,
      },
      annotations: LOCAL_MUTATION,
      maxResultChars: 2_400,
      controller(input) {
        const object = inputObject(input, ["cert"]);
        const cert = integer(object.cert, "cert", 1, 100_000_000);
        const bank = visibleBanks.find((item) => item.cert === cert);
        if (!bank) {
          throw new WebMcpInputError(
            `cert ${cert} is not a result on the current visible directory page`,
          );
        }
        return openWorkspaceEvidence(bridge, {
          id: `directory-bank-${bank.cert}`,
          title: `${bank.name.slice(0, 125)} from the bank directory`,
          note: "Continue from the bank directory with exact financial history and peer context.",
          certs: [bank.cert],
          metrics: ["asset", "dep", "roa", "nimy", "nclnlsr"],
          period: bank.latest_repdte,
          source: `/banks?${new URLSearchParams(data.params).toString()}`,
          panel: "bank",
          activeBank: bank.cert,
          question: `What has changed at ${bank.name.slice(0, 800)}, and how does it compare with relevant peers?`,
          chartTitle: `${bank.name.slice(0, 140)} financial history`,
        });
      },
    },
    {
      name: "bankgraph.open_directory_screen",
      title: "Open this bank screen in the workspace",
      description:
        "Carry the directory's current question, filters, ordering, and matching cohort into the shared workspace. Existing map and peer exclusions are cleared so the workspace opens the same bank population.",
      inputSchema: EMPTY_SCHEMA,
      annotations: LOCAL_MUTATION,
      maxResultChars: 3_000,
      controller(input) {
        assertEmptyInput(input);
        const workspace = bridge.refresh?.() ?? bridge.workspace;
        const clearedExcludedCerts = [...workspace.state.excludedCerts];
        const result = workspace.executeBatch([
          workspaceCommands.setQuestion(directoryQuestion(data)),
          workspaceCommands.setFilters(current.filters),
          workspaceCommands.setScreenView(current.screenView),
          workspaceCommands.setResults({
            total: data.total,
            returned: visibleBanks.length,
            latestQuarter: latestPeriod,
            refreshedAt: null,
            queryRevision: data.releaseGeneration,
            truncated: data.total > visibleBanks.length,
          }),
          workspaceCommands.setPeerRecipe({
            name: "Current bank directory",
            basis: "screen",
            states: [],
            assetRange: { min: null, max: null },
            active: "any",
            metricConditions: [],
            minimumPeers: 2,
            maximumPeers: Math.min(200, Math.max(50, data.total)),
          }),
          workspaceCommands.setMapSelection({ states: [], certs: [] }),
          workspaceCommands.setExcludedCerts([]),
          workspaceCommands.setActivePanel("screen"),
        ]);
        bridge.open("/b");
        return {
          summary: result.changed
            ? "Opened the current directory screen in the shared workspace."
            : "The shared workspace already matched the current directory screen.",
          data: {
            changed: result.changed,
            revision: result.revision,
            workspacePath: "/b",
            question: result.state.question,
            filters: result.state.filters,
            screenView: result.state.screenView,
            total: result.state.results.total,
            peerBasis: result.state.peerRecipe.basis,
            peerMaximum: result.state.peerRecipe.maximumPeers,
            clearedExcludedCerts,
          },
        };
      },
    },
  ];
}

export function createBankProfileRouteTools(
  bank: Institution,
  anomalyCounts: { critical: number; warning: number; info: number } | null,
  bridge: RouteWorkspaceBridge,
): WebMcpToolDefinition[] {
  const latestMetrics = {
    assetsUsdThousands: bank.total_assets,
    depositsUsdThousands: bank.total_deposits,
    roaPercent: bank.latest_roa,
    roePercent: bank.latest_roe,
    netInterestMarginPercent: bank.latest_nim,
    noncurrentLoansPercent: bank.latest_npl_ratio,
    tier1RiskBasedCapitalPercent: bank.latest_tier1_ratio,
  };
  return [
    {
      name: "bankgraph.read_bank_profile",
      title: "Read the bank profile",
      description:
        "Read the identity, latest reported measures, and anomaly counts for the bank open on this page.",
      inputSchema: EMPTY_SCHEMA,
      annotations: READ_ONLY,
      maxResultChars: 3_000,
      controller(input) {
        assertEmptyInput(input);
        return {
          summary: `${bank.name} profile and latest reported measures.`,
          data: {
            bank: {
              cert: bank.cert,
              name: bank.name,
              location: {
                city: bank.city,
                state: bank.state,
                county: bank.county,
              },
              active: bank.active === 1,
              charterClass: bank.charter_class,
              regulator: bank.regulator,
              holdingCompany: bank.holding_company,
              domesticOffices: bank.num_branches,
              employees: bank.num_employees,
            },
            latestMetrics,
            anomalyCounts,
            source: source(
              "BankFind institutions and Call Report financials",
              bank.latest_repdte,
            ),
          },
        };
      },
    },
    openInWorkspaceTool(
      bridge,
      {
        id: `bank-${bank.cert}-profile`,
        title: `${bank.name} profile`,
        note: `Review ${bank.name}'s reported financial condition and recent movement.`,
        certs: [bank.cert],
        metrics: [
          "assets",
          "deposits",
          "roa",
          "nimy",
          "nclnlsr",
        ],
        period: bank.latest_repdte,
        source: `/banks/${bank.cert}`,
        panel: "bank",
        activeBank: bank.cert,
        question: `What has changed at ${bank.name}, and how does it compare with relevant peers?`,
      },
      "bankgraph.open_bank_in_workspace",
    ),
  ];
}

export function createBankFinancialRouteTools(
  bank: Pick<Institution, "cert" | "name">,
  financials: Financial[],
  bridge: RouteWorkspaceBridge,
  selectedMetrics: readonly string[],
): WebMcpToolDefinition[] {
  const visibleMetrics = researchMetricsFromFinancialFields(selectedMetrics);
  return [
    {
      name: "bankgraph.read_bank_financial_history",
      title: "Read bank financial history",
      description:
        "Read a bounded quarterly history from the same Call Report rows shown in the bank financials view.",
      inputSchema: {
        type: "object",
        properties: {
          metrics: {
            type: "array",
            items: { type: "string", minLength: 1, maxLength: 64 },
            minItems: 1,
            maxItems: 4,
            uniqueItems: true,
            description:
              "Call Report fields to read, such as asset, dep, roa, or nimy.",
          },
          limit: {
            type: "integer",
            minimum: 1,
            maximum: 12,
            description: "Most recent quarters to return.",
          },
        },
        required: ["metrics"],
        additionalProperties: false,
      },
      annotations: READ_ONLY,
      maxResultChars: 5_200,
      controller(input) {
        const object = inputObject(input, ["metrics", "limit"]);
        const metrics = requestedMetrics(object.metrics, 4);
        const unknown = metrics.find(
          (name) => !financials.some((row) => name in row),
        );
        if (unknown)
          throw new WebMcpInputError(
            `metrics contains ${unknown}, which is not available in the open bank history`,
          );
        const limit = requestedLimit(object.limit, 12, 8);
        const rows = financials.slice(-limit).map((row) => ({
          reportingPeriod: row.repdte,
          ...metricValues(row as unknown as Record<string, unknown>, metrics),
        }));
        return {
          summary: `${rows.length} quarterly observations for ${bank.name}.`,
          data: {
            bank: { cert: bank.cert, name: bank.name },
            metrics,
            rows,
            availableRange: {
              from: financials[0]?.repdte ?? null,
              to: financials.at(-1)?.repdte ?? null,
            },
            source: source(
              "Call Report financials",
              financials.at(-1)?.repdte ?? null,
              {
                units:
                  "Balance-sheet and income fields are USD thousands; ratio fields are percent.",
              },
            ),
          },
        };
      },
    },
    openInWorkspaceTool(
      bridge,
      {
        id: `bank-${bank.cert}-financials`,
        title: `${bank.name} financial history`,
        note: `Continue the financial-history review from the bank page.`,
        certs: [bank.cert],
        metrics: visibleMetrics.slice(0, 6),
        period: financials.at(-1)?.repdte ?? null,
        source: `/banks/${bank.cert}/financials`,
        panel: "charts",
        activeBank: bank.cert,
        question: `How have ${bank.name}'s selected financial measures changed over time?`,
        chartTitle: `${bank.name} financial history`,
      },
      "bankgraph.open_financials_in_workspace",
    ),
  ];
}

export function createBankPeerRouteTools(
  bank: Pick<Institution, "cert" | "name">,
  peers: PeerComparison | null,
  percentileHistory: PercentileHistoryPoint[],
  bridge: RouteWorkspaceBridge,
): WebMcpToolDefinition[] {
  return [
    {
      name: "bankgraph.read_bank_peer_position",
      title: "Read the bank peer position",
      description:
        "Read same-period peer ranks and recent percentile movement for one metric in the bank peer view.",
      inputSchema: {
        type: "object",
        properties: {
          metric: {
            type: "string",
            minLength: 1,
            maxLength: 64,
            description: "Peer metric, such as roa, nimy, or rbcrwaj.",
          },
          limit: {
            type: "integer",
            minimum: 1,
            maximum: 8,
            description: "Recent percentile observations to return.",
          },
        },
        required: ["metric"],
        additionalProperties: false,
      },
      annotations: READ_ONLY,
      maxResultChars: 3_600,
      controller(input) {
        const object = inputObject(input, ["metric", "limit"]);
        const selectedMetric = metric(object.metric, "metric");
        const current =
          peers?.metrics.find((item) => item.metric === selectedMetric) ?? null;
        const limit = requestedLimit(object.limit, 8, 8);
        const history = percentileHistory
          .filter((item) => item.metric === selectedMetric)
          .sort((a, b) => a.repdte.localeCompare(b.repdte))
          .slice(-limit);
        if (!current && history.length === 0) {
          throw new WebMcpInputError(
            `metric ${selectedMetric} is not available in the open peer view`,
          );
        }
        return {
          summary: `${bank.name} peer evidence for ${selectedMetric}.`,
          data: {
            bank: { cert: bank.cert, name: bank.name },
            metric: selectedMetric,
            current,
            history,
            cohort: peers?.cohort ?? null,
            source: source(
              "Call Report financials and derived same-period asset peers",
              peers?.repdte ?? history.at(-1)?.repdte ?? null,
              {
                percentileHistoryMethod:
                  "Estimated from stored peer quantiles; current percentile uses exact same-period ranks.",
              },
            ),
          },
        };
      },
    },
    openInWorkspaceTool(
      bridge,
      {
        id: `bank-${bank.cert}-peers`,
        title: `${bank.name} peer position`,
        note: peers
          ? `${bank.name} is compared with ${peers.cohort.institution_count} institutions in ${peers.cohort.label}.`
          : `Continue the peer review from the bank page.`,
        certs: [bank.cert],
        metrics: peers?.metrics.map((item) => item.metric).slice(0, 6) ?? [],
        period: peers?.repdte ?? null,
        source: `/banks/${bank.cert}/peers`,
        panel: "peers",
        activeBank: bank.cert,
        question: `Where does ${bank.name} stand against a reproducible same-period peer group?`,
      },
      "bankgraph.open_peers_in_workspace",
    ),
  ];
}

export function createBankRiskRouteTools(
  bank: Pick<Institution, "cert" | "name">,
  risk: RiskResponse | null,
  anomalies: AnomalyResponse | null,
  history: RiskHistoryPoint[],
  bridge: RouteWorkspaceBridge,
  historyComparison: RiskHistoryComparison | null = null,
): WebMcpToolDefinition[] {
  const sections = ["score", "anomalies", "history"] as const;
  return [
    {
      name: "bankgraph.read_bank_risk_evidence",
      title: "Read bank risk evidence",
      description:
        "Read the deterministic risk proxy, anomaly evidence, or recent score history shown for this bank.",
      inputSchema: {
        type: "object",
        properties: {
          section: {
            type: "string",
            maxLength: 9,
            enum: sections,
            description: "Evidence section to read.",
          },
          limit: {
            type: "integer",
            minimum: 1,
            maximum: 8,
            description: "Anomalies or history points to return.",
          },
        },
        required: ["section"],
        additionalProperties: false,
      },
      annotations: READ_ONLY,
      maxResultChars: 4_200,
      controller(input) {
        const object = inputObject(input, ["section", "limit"]);
        const section = enumValue(object.section, "section", sections);
        const limit = requestedLimit(object.limit, 8, 6);
        const evidence =
          section === "score"
            ? risk
            : section === "anomalies"
              ? {
                  counts: anomalies?.counts ?? null,
                  methodology: anomalies?.methodology ?? null,
                  items: (anomalies?.anomalies ?? []).slice(0, limit),
                }
              : {
                  comparison: historyComparison,
                  points: history.slice(-limit),
                };
        return {
          summary: `${bank.name} ${section} evidence.`,
          data: {
            bank: { cert: bank.cert, name: bank.name },
            section,
            evidence,
            source: source(
              "Call Report-derived analytical screens",
              risk?.repdte ?? history.at(-1)?.repdte ?? null,
              {
                limitation:
                  "These are analytical screens, not examination findings or supervisory ratings.",
              },
            ),
          },
        };
      },
    },
    openInWorkspaceTool(
      bridge,
      {
        id: `bank-${bank.cert}-risk`,
        title: `${bank.name} risk evidence`,
        note: `Review the reported measures, deterministic risk proxy, and ${anomalies?.anomalies.length ?? 0} detected anomalies together.`,
        certs: [bank.cert],
        metrics: ["rbc1rwaj", "nclnlsr", "roa"],
        period: risk?.repdte ?? history.at(-1)?.repdte ?? null,
        source: `/banks/${bank.cert}/risk`,
        panel: "bank",
        activeBank: bank.cert,
        question: `Which reported measures drive ${bank.name}'s risk signals, and are they persistent or recent?`,
      },
      "bankgraph.open_risk_in_workspace",
    ),
  ];
}

export function createBankSystemContextTools(
  data: BankSystemContextData,
  bankName: string | null,
  selection?: {
    footprintIndex: number | null;
    marketIndex: number;
    industryIndex: number;
  },
): WebMcpToolDefinition[] {
  const sections = [
    "footprint",
    "markets",
    "industry",
    "structural_history",
    "coverage",
  ] as const;
  return [
    {
      name: "bankgraph.read_bank_system_context",
      title: "Read bank and system context",
      description:
        "Read the branch footprint, county deposit markets, structural history, or long-run U.S. banking series shown for the selected bank.",
      inputSchema: {
        type: "object",
        properties: {
          section: {
            type: "string",
            maxLength: 18,
            enum: sections,
            description: "Context section to read.",
          },
          fromYear: {
            type: "integer",
            minimum: 1900,
            maximum: 2100,
            description: "Optional first year for annual or structural rows.",
          },
          toYear: {
            type: "integer",
            minimum: 1900,
            maximum: 2100,
            description: "Optional last year for annual or structural rows.",
          },
          limit: {
            type: "integer",
            minimum: 1,
            maximum: 12,
            description:
              "Most recent annual rows, markets, or structural events to return.",
          },
        },
        required: ["section"],
        additionalProperties: false,
      },
      annotations: READ_ONLY,
      maxResultChars: 6_200,
      controller(input) {
        const object = inputObject(input, [
          "section",
          "fromYear",
          "toYear",
          "limit",
        ]);
        const section = enumValue(object.section, "section", sections);
        const fromYear =
          object.fromYear === undefined
            ? 1900
            : integer(object.fromYear, "fromYear", 1900, 2100);
        const toYear =
          object.toYear === undefined
            ? 2100
            : integer(object.toYear, "toYear", 1900, 2100);
        if (fromYear > toYear) {
          throw new WebMcpInputError("fromYear must not be later than toYear");
        }
        const limit = requestedLimit(
          object.limit,
          12,
          section === "markets" ? 8 : 10,
        );
        const inRange = (year: number) => year >= fromYear && year <= toYear;
        let evidence: unknown;
        if (section === "footprint") {
          evidence = data.footprint
            .filter((item) => inRange(item.year))
            .slice(-limit);
        } else if (section === "markets") {
          evidence = data.markets.slice(0, Math.min(limit, 8));
        } else if (section === "industry") {
          evidence = data.industry
            .filter((item) => inRange(item.year))
            .slice(-limit);
        } else if (section === "structural_history") {
          evidence = data.structuralHistory
            .filter((item) => inRange(Number(item.date.slice(0, 4))))
            .slice(0, limit);
        } else {
          evidence = data.coverage;
        }
        return {
          summary: `${bankName ?? `FDIC certificate ${data.cert}`} ${section.replace("_", " ")} evidence.`,
          data: {
            bank: { cert: data.cert, name: bankName },
            section,
            requestedYears:
              section === "markets" || section === "coverage"
                ? null
                : { from: fromYear, to: toYear },
            evidence,
            visibleSelection: selection
              ? {
                  footprint:
                    selection.footprintIndex === null
                      ? null
                      : (data.footprint[selection.footprintIndex] ?? null),
                  market: data.markets[selection.marketIndex] ?? null,
                  industry: data.industry[selection.industryIndex] ?? null,
                }
              : null,
            coverage: data.coverage,
            provenance: data.provenance,
            interpretation:
              section === "markets"
                ? "Deposit share uses the current published Summary of Deposits county snapshot."
                : section === "structural_history"
                  ? "Events are FDIC history rows mapped to this certificate; they do not by themselves explain a financial change."
                  : null,
          },
        };
      },
    },
  ];
}

function segmentFor(
  data: IndustryRouteData,
  segment: string,
): IndustrySegment | null {
  if (segment === "community") return data.communitySegment;
  if (segment === "regional") return data.regionalSegment;
  if (segment === "large") return data.largeSegment;
  return data.allSegment;
}

export function createIndustryRouteTools(
  data: IndustryRouteData,
  bridge: RouteWorkspaceBridge,
): WebMcpToolDefinition[] {
  const segments = ["all", "community", "regional", "large"] as const;
  const radarMetrics = ["total_assets", "total_deposits", "net_loans"] as const;
  const latest = data.allSegment?.data[0]?.repdte ?? null;
  return [
    {
      name: "bankgraph.read_industry_evidence",
      title: "Read industry evidence",
      description:
        "Read a bounded segment trend, quarterly matched-bank change radar, or market structure visible in the U.S. banking industry view.",
      inputSchema: {
        type: "object",
        properties: {
          section: {
            type: "string",
            maxLength: 12,
            enum: ["trend", "structure", "change_radar"],
            description: "Industry evidence to read.",
          },
          segment: {
            type: "string",
            maxLength: 9,
            enum: segments,
            description: "Asset-size segment for a trend read.",
          },
          metrics: {
            type: "array",
            items: { type: "string", minLength: 1, maxLength: 64 },
            minItems: 1,
            maxItems: 4,
            uniqueItems: true,
            description:
              "Aggregate metrics, such as bank_count, total_assets, median_roa, or median_nim.",
          },
          radarMetric: {
            type: "string",
            maxLength: 14,
            enum: radarMetrics,
            description:
              "Balance-sheet measure for a change-radar read. Defaults to total_assets.",
          },
          limit: {
            type: "integer",
            minimum: 1,
            maximum: 8,
            description: "Recent quarters to return.",
          },
        },
        required: ["section"],
        additionalProperties: false,
      },
      annotations: READ_ONLY,
      maxResultChars: 6_200,
      controller(input) {
        const object = inputObject(input, [
          "section",
          "segment",
          "metrics",
          "radarMetric",
          "limit",
        ]);
        const section = enumValue(object.section, "section", [
          "trend",
          "structure",
          "change_radar",
        ] as const);
        if (section === "structure") {
          return {
            summary: "Current U.S. banking market structure.",
            data: {
              assetTiers: data.assetTiers,
              topStates: data.topStates,
              regulators: data.regulators,
              failureCount: data.failureCount,
              recentFailures: data.recentFailures,
              source: source(
                "BankFind institutions, Call Reports, and Failures & Assistance",
                latest,
              ),
            },
          };
        }
        if (section === "change_radar") {
          const radar = data.systemBrief?.changeRadar ?? null;
          const radarMetric = object.radarMetric === undefined
            ? "total_assets"
            : enumValue(object.radarMetric, "radarMetric", radarMetrics);
          if (!radar) {
            return {
              summary: "Quarterly change radar is unavailable for the current industry view.",
              data: {
                available: false,
                reason:
                  "The view does not have a complete pair of consecutive institution-quarter filings.",
                source: source("FDIC BankFind Financials", latest),
              },
            };
          }
          const selectedMetric = radar.metrics.find(
            (metric) => metric.id === radarMetric,
          ) ?? null;
          const workspaceMetrics: Record<SystemChangeRadarMetricId, ResearchMetric> = {
            total_assets: "asset",
            total_deposits: "dep",
            net_loans: "lnlsnet",
          };
          const workspaceHref = buildWorkspaceHref({
            question: `Which banks expanded or contracted ${selectedMetric?.label.toLowerCase() ?? radarMetric} this quarter?`,
            workspaceMetrics: [workspaceMetrics[radarMetric]],
            quarter: radar.period.current,
            panel: "screen",
            depth: "pro",
          });
          return {
            summary: `${selectedMetric?.label ?? radarMetric} change breadth and largest institution contributors from ${radar.period.prior} to ${radar.period.current}.`,
            data: {
              available: selectedMetric !== null,
              period: radar.period,
              population: radar.population,
              metric: selectedMetric,
              source: radar.source,
              workspace: {
                href: workspaceHref,
                route: "/b",
                purpose:
                  "Continue with the same metric and closing quarter in the shared research workspace.",
              },
            },
          };
        }
        const segment =
          object.segment === undefined
            ? "all"
            : enumValue(object.segment, "segment", segments);
        const metrics =
          object.metrics === undefined
            ? ["bank_count", "total_assets", "median_roa", "median_nim"]
            : requestedMetrics(object.metrics, 4);
        const limit = requestedLimit(object.limit, 8, 8);
        const selected = segmentFor(data, segment);
        const rows = (selected?.data ?? []).slice(0, limit).map((row) => ({
          reportingPeriod: row.repdte,
          ...metricValues(row.metrics, metrics),
        }));
        return {
          summary: `${rows.length} recent quarters for the ${segment} banking segment.`,
          data: {
            segment,
            metrics,
            rows,
            source: source(
              "Derived Call Report industry aggregates",
              rows[0]?.reportingPeriod ?? latest,
            ),
          },
        };
      },
    },
    openInWorkspaceTool(bridge, {
      id: "industry-overview",
      title: "U.S. banking industry evidence",
      note: `Review the latest industry aggregates and long-run segment movement as of ${latest ?? "the latest loaded quarter"}.`,
      period: latest,
      source: "/industry",
      panel: "findings",
      question:
        "What is changing across the U.S. banking system, and which bank cohorts explain the movement?",
    }),
  ];
}

export function createFailureRouteTools(
  data: FailureRouteData,
  bridge: RouteWorkspaceBridge,
): WebMcpToolDefinition[] {
  const sections = ["summary", "records", "timeline"] as const;
  return [
    {
      name: "bankgraph.read_failure_evidence",
      title: "Read failure evidence",
      description:
        "Read the active failure or assistance view, including its coverage, records, and historical counts.",
      inputSchema: {
        type: "object",
        properties: {
          section: {
            type: "string",
            maxLength: 8,
            enum: sections,
            description: "Evidence section to read.",
          },
          limit: {
            type: "integer",
            minimum: 1,
            maximum: 10,
            description: "Records, years, or decades to return.",
          },
        },
        required: ["section"],
        additionalProperties: false,
      },
      annotations: READ_ONLY,
      maxResultChars: 5_000,
      controller(input) {
        const object = inputObject(input, ["section", "limit"]);
        const section = enumValue(object.section, "section", sections);
        const limit = requestedLimit(object.limit, 10, 8);
        const evidence =
          section === "summary"
            ? data.estimatedLossSummary
            : section === "records"
              ? data.failures.slice(0, limit)
              : {
                  years: data.yearlyData.slice(-limit),
                  decades:
                    data.estimatedLossSummary.estimatedLossByDecade.slice(
                      -limit,
                    ),
                };
        return {
          summary: `${data.recordFilter} ${section} evidence from FDIC source records.`,
          data: {
            recordFilter: data.recordFilter,
            pagination: data.pagination,
            evidence,
            source: source(
              "Failures & Assistance",
              data.failures[0]?.fail_date ?? null,
              {
                units:
                  "Assets, deposits, and estimated loss are USD thousands.",
                coverage:
                  "Estimated loss coverage is incomplete for some early records.",
              },
            ),
          },
        };
      },
    },
    openInWorkspaceTool(bridge, {
      id: `failures-${data.recordFilter}`,
      title: `${data.recordFilter === "failure" ? "Bank failure" : data.recordFilter === "assistance" ? "Assistance transaction" : "Failure and assistance"} evidence`,
      note: `${data.pagination.total} ${data.recordFilter} records are in the active FDIC view.`,
      period: data.failures[0]?.fail_date ?? null,
      source: `/industry/failures${data.recordFilter === "failure" ? "" : `?type=${data.recordFilter}`}`,
      panel: "findings",
      question:
        "How have U.S. bank failures changed across cycles, geography, size, and resolution method?",
    }),
  ];
}

export function createMacroRouteTools(
  data: MacroRouteData,
  bridge: RouteWorkspaceBridge,
  selectedBank: Pick<Institution, "cert" | "name"> | null = null,
): WebMcpToolDefinition[] {
  return [
    {
      name: "bankgraph.read_macro_evidence",
      title: "Read macro evidence",
      description:
        "Read bounded observations and agency provenance for macro series loaded in this banking view.",
      inputSchema: {
        type: "object",
        properties: {
          seriesIds: {
            type: "array",
            items: { type: "string", minLength: 1, maxLength: 64 },
            minItems: 1,
            maxItems: 3,
            uniqueItems: true,
            description:
              "Loaded series IDs, such as FRB_FEDFUNDS, UST10Y2Y, or BLS_UNRATE.",
          },
          limit: {
            type: "integer",
            minimum: 1,
            maximum: 8,
            description: "Recent observations per series.",
          },
        },
        required: ["seriesIds"],
        additionalProperties: false,
      },
      annotations: READ_ONLY,
      maxResultChars: 6_200,
      controller(input) {
        const object = inputObject(input, ["seriesIds", "limit"]);
        const seriesIds = unique(
          arrayValue(object.seriesIds, "seriesIds", {
            min: 1,
            max: 3,
            map: (item, index) => metric(item, `seriesIds[${index}]`),
          }),
          "seriesIds",
        );
        const limit = requestedLimit(object.limit, 8, 6);
        const result = seriesIds.map((seriesId) => {
          const item = data.series[seriesId];
          if (!item) return { seriesId, available: false };
          return {
            seriesId,
            available: true,
            title: item.title,
            units: item.units,
            cadence: item.cadence,
            transform: item.transform,
            seasonalAdjustment: item.seasonal_adjustment,
            observedThrough: item.observed_through,
            observations: item.data.slice(-limit),
            source: {
              agency: item.source_agency,
              series: item.source_series,
              url: item.source_page_url,
              retrievedAt: item.retrieved_at,
            },
          };
        });
        return {
          summary: `${result.filter((item) => item.available).length} macro series from the active page.`,
          data: { view: data.view ?? null, series: result },
        };
      },
    },
    {
      name: "bankgraph.read_macro_bank_relationships",
      title: "Read macro-bank relationships",
      description:
        "Read the fixed-plan contemporaneous co-movement results shown in the macro view.",
      inputSchema: EMPTY_SCHEMA,
      annotations: READ_ONLY,
      maxResultChars: 4_200,
      controller(input) {
        assertEmptyInput(input);
        return {
          summary: `${data.correlations.length} computed macro-bank relationships.`,
          data: {
            method:
              "Pearson correlation of aligned same-quarter year-over-year changes; exact n and interpretation tier accompany every coefficient; not causal.",
            relationships: data.correlations.slice(0, 8).map((relationship) => ({
              ...relationship,
              interpretation: {
                tier: correlationInterpretationTier(relationship.observations),
                label: correlationInterpretationLabel(relationship.observations),
              },
            })),
            selectedBank,
          },
        };
      },
    },
    openInWorkspaceTool(bridge, {
      id: selectedBank ? `macro-bank-${selectedBank.cert}` : "macro-system",
      title: selectedBank
        ? `${selectedBank.name} and the macro environment`
        : "Banking and the macro environment",
      note: selectedBank
        ? `Continue the bank-versus-macro review for ${selectedBank.name}.`
        : "Continue the review of rates, inflation, labor conditions, bank credit, loans, and deposits.",
      certs: selectedBank ? [selectedBank.cert] : [],
      metrics: selectedBank
        ? ["roa", "nimy", "nclnlsr"]
        : [],
      period:
        Object.values(data.series).find((item) => item)?.observed_through ??
        null,
      source: "/macro",
      panel: selectedBank ? "charts" : "findings",
      activeBank: selectedBank?.cert ?? null,
      question: selectedBank
        ? `How has the macro environment moved alongside ${selectedBank.name}'s reported performance?`
        : "How are rates, inflation, labor conditions, and bank balance sheets moving together?",
    }),
  ];
}

export function createCompareRouteTools(
  banks: Institution[],
  selectedMetrics: readonly string[],
  compareData: CompareResponse | null,
  dateRange: { from: string; to: string },
  bridge: RouteWorkspaceBridge,
): WebMcpToolDefinition[] {
  const metricList = [...new Set(selectedMetrics)]
    .filter((item) => METRIC_RE.test(item))
    .slice(0, 10);
  const workspaceMetrics = researchMetricsFromFinancialFields(metricList);
  const latestPeriod = compareData
    ? (Object.values(compareData.data)
        .flatMap((rows) => rows.map((row) => row.repdte))
        .sort()
        .at(-1) ?? null)
    : null;
  return [
    {
      name: "bankgraph.read_current_comparison",
      title: "Read the current bank comparison",
      description:
        "Read one selected metric across the banks and date range active in the comparison view.",
      inputSchema: {
        type: "object",
        properties: {
          metric: {
            type: "string",
            minLength: 1,
            maxLength: 64,
            description: "A metric selected in the comparison view.",
          },
          limit: {
            type: "integer",
            minimum: 1,
            maximum: 8,
            description: "Recent quarterly observations per bank.",
          },
        },
        required: ["metric"],
        additionalProperties: false,
      },
      annotations: READ_ONLY,
      maxResultChars: 6_000,
      controller(input) {
        const object = inputObject(input, ["metric", "limit"]);
        const selectedMetric = metric(object.metric, "metric");
        if (!metricList.includes(selectedMetric)) {
          throw new WebMcpInputError(
            `metric ${selectedMetric} is not selected in the current comparison`,
          );
        }
        const limit = requestedLimit(object.limit, 8, 8);
        const rows = banks.map((bank) => {
          const history = (compareData?.data[bank.cert] ?? [])
            .filter(
              (row) =>
                (!dateRange.from || row.repdte >= dateRange.from) &&
                (!dateRange.to || row.repdte <= dateRange.to),
            )
            .slice(-limit)
            .map((row) => ({
              reportingPeriod: row.repdte,
              value:
                (row as unknown as Record<string, unknown>)[selectedMetric] ??
                null,
            }));
          return { cert: bank.cert, name: bank.name, history };
        });
        return {
          summary: `${selectedMetric} across ${rows.length} banks in the active comparison.`,
          data: {
            metric: selectedMetric,
            dateRange,
            banks: rows,
            source: source("Call Report financials", latestPeriod, {
              units:
                "Balance-sheet and income fields are USD thousands; ratio fields are percent.",
            }),
          },
        };
      },
    },
    openInWorkspaceTool(bridge, {
      id: "current-comparison",
      title: "Current bank comparison",
      note: `Continue the comparison of ${banks
        .map((bank) => bank.name)
        .join(", ")
        .slice(0, 500)}.`,
      certs: banks.map((bank) => bank.cert),
      metrics: workspaceMetrics,
      period: latestPeriod,
      source: "/compare",
      provenance: compareData?.provenance ?? null,
      panel: "compare",
      question: `How do the selected banks compare across ${metricList.join(", ") || "the selected measures"}?`,
      chartTitle: "Selected bank comparison",
    }),
  ];
}

/** Test helper: a fresh non-persistent bridge with a recorded open path. */
export function createTestRouteWorkspaceBridge(
  opened: string[],
): RouteWorkspaceBridge {
  return {
    workspace: createWorkspaceStore({
      initialState: createDefaultWorkspaceState(),
      storage: null,
      persist: false,
    }),
    open(path) {
      opened.push(path);
    },
  };
}
