import type { Financial } from "$lib/types";
import { isResearchMetric, researchMetricDefinition } from "$lib/research-metrics";
import type { WorkspaceBank } from "./workspace-data";

export type AttributionMode =
  | "assets"
  | "funding"
  | "quarterlyNetIncome"
  | "loanToDeposit"
  | "reportedMetric";
export type FlowSource =
  | "reported_single_quarter"
  | "reported_ytd_first_quarter"
  | "derived_from_consecutive_ytd"
  | "unavailable";

export interface AttributionContribution {
  key: string;
  label: string;
  from: number | null;
  to: number | null;
  change: number | null;
  availability: "reported" | "missing";
  fromSource?: FlowSource;
  toSource?: FlowSource;
}
export interface AdditiveBridge {
  metric: string;
  unit: "usd_thousands";
  from: { repdte: string; value: number | null };
  to: { repdte: string; value: number | null };
  totalChange: number | null;
  contributions: AttributionContribution[];
  residual: number | null;
  dataCoverage: number;
  attributedChangeShare: number | null;
  method: "exact_difference_identity" | "unavailable";
  reconciliation:
    "reconciled" | "residual_present" | "partial_inputs" | "missing_total";
}
export interface RatioAttribution {
  metric: "loan_to_deposit";
  unit: "percentage_points";
  from: number | null;
  to: number | null;
  totalChange: number | null;
  contributions: { numerator: number | null; denominator: number | null };
  method: "exact_two_factor_shapley" | "unavailable";
  status: "ok" | "missing_input" | "zero_denominator";
}
export interface PeerMovement {
  subjectMovement: number | null;
  peerMedian: number | null;
  subjectPercentile: number | null;
  peerCount: number;
  minimumPeerCount: number;
  status: "ok" | "insufficient_peers" | "unavailable";
  warning: string | null;
}
export interface WorkspaceQuarterBrief {
  cert: number;
  bank: { name: string; city: string | null; state: string | null };
  comparison: {
    status: string;
    from: string | null;
    to: string | null;
    isConsecutiveQuarter: boolean;
    message: string | null;
  };
  bridges: {
    assets: AdditiveBridge;
    funding: AdditiveBridge;
    quarterlyNetIncome: AdditiveBridge;
    loanToDeposit: RatioAttribution;
  } | null;
  peerContext: {
    assetGrowth: PeerMovement;
    depositGrowth: PeerMovement;
    loanGrowth: PeerMovement;
    loanToDepositChange: PeerMovement;
  } | null;
  structuralContext: {
    status: "events_present" | "no_mapped_events" | "unavailable";
    window: { from: string; to: string };
    events: Array<{
      id: string;
      date: string;
      category: "merger" | "acquisition" | "closure" | "charter";
      description: string;
      institutionName: string | null;
      organizationRole: string | null;
      changeCode: number | null;
    }>;
    caution: string | null;
    source: string;
    sourceUrl: string;
    retrievedAt: string | null;
    coverage: {
      processYearFrom: number | null;
      processYearTo: number | null;
      publishedPartitions: number;
      mapping: "certificate_rows_only";
    };
  } | null;
  provenance: {
    source: string;
    sourceUrl: string;
    datasetGrain: string;
    monetaryUnit: string;
    cohortDefinition: string;
    cohortDefinitionHash?: string | null;
    cohortHash?: string | null;
    cohortMemberCount?: number | null;
    calculationVersion: string;
  };
}

export interface WorkspacePeerEvidenceOptions {
  cohortDefinition?: string;
  cohortDefinitionHash?: string | null;
  cohortHash?: string | null;
  minimumPeerCount?: number;
  comparisonFrom?: string | null;
}

export interface MetricChangeInspection {
  bankChange: number | null;
  unit: "usd_thousands" | "percentage_points" | "percent_change" | "count";
  method: string;
  components: Array<{ label: string; change: number; unit: string }>;
  peerMedianChange: number | null;
  peerEvidence: {
    status: PeerMovement["status"];
    cohortDefinition: string;
    peerCount: number;
    minimumPeerCount: number;
    subjectPercentile: number | null;
    subjectRank: number | null;
    coverage: number | null;
    warning: string | null;
  } | null;
}

export interface MetricEndpointValues {
  from: number | null;
  to: number | null;
}

export function inspectReportedMetricChange(
  metric: string,
  from: Financial,
  to: Financial,
  brief: WorkspaceQuarterBrief,
  peerRelative: boolean,
  endpoints?: MetricEndpointValues,
  endpointPeerMovement?: PeerMovement,
): MetricChangeInspection {
  if (!brief.bridges)
    throw new Error(
      brief.comparison.message ??
        "Quarter attribution is unavailable for these dates.",
    );
  const peerEvidence = (movement: PeerMovement | null) =>
    !peerRelative || !movement
      ? null
      : {
          status: movement.status,
          cohortDefinition: brief.provenance.cohortDefinition,
          peerCount: movement.peerCount,
          minimumPeerCount: movement.minimumPeerCount,
          subjectPercentile: movement.subjectPercentile,
          subjectRank: null,
          coverage: null,
          warning: movement.warning,
        };
  if (metric === "asset") {
    const bridge = brief.bridges.assets;
    return {
      bankChange:
        finite(from.asset) && finite(to.asset) ? to.asset - from.asset : null,
      unit: "usd_thousands",
      method: "reported_endpoint_difference_with_asset_identity",
      components: [
        ...bridge.contributions
          .filter((item) => item.change !== null)
          .map((item) => ({
            label: item.label,
            change: item.change as number,
            unit: "usd_thousands",
          })),
        ...(bridge.residual === null
          ? []
          : [
              {
                label: "Reconciled residual",
                change: bridge.residual,
                unit: "usd_thousands",
              },
            ]),
      ],
      peerMedianChange:
        peerRelative && brief.peerContext?.assetGrowth.status === "ok"
          ? brief.peerContext.assetGrowth.peerMedian
          : null,
      peerEvidence: peerEvidence(brief.peerContext?.assetGrowth ?? null),
    };
  }
  if (metric === "dep") {
    return {
      bankChange: finite(from.dep) && finite(to.dep) ? to.dep - from.dep : null,
      unit: "usd_thousands",
      method: "reported_endpoint_difference",
      components: [],
      peerMedianChange:
        peerRelative && brief.peerContext?.depositGrowth.status === "ok"
          ? brief.peerContext.depositGrowth.peerMedian
          : null,
      peerEvidence: peerEvidence(brief.peerContext?.depositGrowth ?? null),
    };
  }
  if (metric === "roa" || metric === "nimy" || metric === "nclnlsr") {
    const left = from[metric];
    const right = to[metric];
    return {
      bankChange: finite(left) && finite(right) ? right - left : null,
      unit: "percentage_points",
      method: "reported_endpoint_point_difference",
      components: [],
      peerMedianChange:
        peerRelative && endpointPeerMovement?.status === "ok"
          ? endpointPeerMovement.peerMedian
          : null,
      peerEvidence: peerEvidence(endpointPeerMovement ?? null),
    };
  }
  if (metric === "loanGrowth" || metric === "lnlsnet") {
    if (metric === "loanGrowth") {
      if (!endpoints) {
        throw new Error(
          "Year-over-year loan-growth attribution requires both derived endpoint values.",
        );
      }
      return {
        bankChange:
          finite(endpoints.from) && finite(endpoints.to)
            ? endpoints.to - endpoints.from
            : null,
        unit: "percentage_points",
        method:
          "derived_year_over_year_net_loan_growth_endpoint_point_difference",
        components: [],
        peerMedianChange:
          peerRelative && endpointPeerMovement?.status === "ok"
            ? endpointPeerMovement.peerMedian
            : null,
        peerEvidence: peerEvidence(endpointPeerMovement ?? null),
      };
    }
    const bankChange =
      finite(from.lnlsnet) && finite(to.lnlsnet) && from.lnlsnet !== 0
        ? ((to.lnlsnet - from.lnlsnet) / from.lnlsnet) * 100
        : null;
    return {
      bankChange,
      unit: "percent_change",
      method: "net_loans_percent_change_between_requested_periods",
      components: [],
      peerMedianChange:
        peerRelative && brief.peerContext?.loanGrowth.status === "ok"
          ? brief.peerContext.loanGrowth.peerMedian
          : null,
      peerEvidence: peerEvidence(brief.peerContext?.loanGrowth ?? null),
    };
  }
  if (metric === "lnlsdepr" || metric === "loanToDeposit") {
    const bridge = brief.bridges.loanToDeposit;
    return {
      bankChange: bridge.totalChange,
      unit: "percentage_points",
      method: bridge.method,
      components: [
        ...(bridge.contributions.numerator === null
          ? []
          : [
              {
                label: "Loan balance effect",
                change: bridge.contributions.numerator,
                unit: "percentage_points",
              },
            ]),
        ...(bridge.contributions.denominator === null
          ? []
          : [
              {
                label: "Deposit balance effect",
                change: bridge.contributions.denominator,
                unit: "percentage_points",
              },
            ]),
      ],
      peerMedianChange:
        peerRelative && brief.peerContext?.loanToDepositChange.status === "ok"
          ? brief.peerContext.loanToDepositChange.peerMedian
          : null,
      peerEvidence: peerEvidence(
        brief.peerContext?.loanToDepositChange ?? null,
      ),
    };
  }
  if (metric === "netinc" || metric === "quarterlyNetIncome") {
    const bridge = brief.bridges.quarterlyNetIncome;
    return {
      bankChange: bridge.totalChange,
      unit: "usd_thousands",
      method: bridge.method,
      components: bridge.contributions
        .filter((item) => item.change !== null)
        .map((item) => ({
          label: item.label,
          change: item.change as number,
          unit: "usd_thousands",
        })),
      peerMedianChange: null,
      peerEvidence: null,
    };
  }
  if (isResearchMetric(metric) && endpoints) {
    const definition = researchMetricDefinition(metric);
    const bankChange =
      !finite(endpoints.from) || !finite(endpoints.to)
        ? null
        : definition.change === "percent_change"
          ? endpoints.from === 0
            ? null
            : ((endpoints.to - endpoints.from) / endpoints.from) * 100
          : endpoints.to - endpoints.from;
    return {
      bankChange,
      unit:
        definition.change === "percent_change"
          ? "percent_change"
          : definition.change === "percentage_points"
            ? "percentage_points"
            : definition.unit === "count"
              ? "count"
              : "usd_thousands",
      method:
        definition.change === "percent_change"
          ? "reported_endpoint_percent_change"
          : definition.change === "percentage_points"
            ? "reported_endpoint_point_difference"
            : "reported_endpoint_difference",
      components: [],
      peerMedianChange: null,
      peerEvidence: null,
    };
  }
  throw new Error(
    `Change attribution does not support metric "${metric}". Use asset, dep, roa, nimy, nclnlsr, loanGrowth, lnlsdepr, or netinc.`,
  );
}

type Component = { key: keyof Financial; label: string; sign?: 1 | -1 };
const ASSETS: Component[] = [
  { key: "chbal", label: "Cash and balances due" },
  { key: "frepo", label: "Fed funds sold and reverse repos" },
  { key: "sec", label: "Securities" },
  { key: "lnlsnet", label: "Net loans and leases" },
  { key: "trade", label: "Trading assets" },
  { key: "ore", label: "Other real estate owned" },
  { key: "bkprem", label: "Goodwill" },
  { key: "intan", label: "Other intangible assets" },
  { key: "oa", label: "Other assets" },
];
const FUNDING: Component[] = [
  { key: "dep", label: "Deposits" },
  { key: "frepp", label: "Fed funds purchased and repos" },
  { key: "othbor", label: "Other borrowed funds" },
  { key: "subnd", label: "Subordinated debt" },
  { key: "tradel", label: "Trading liabilities" },
  { key: "allothl", label: "Other liabilities" },
  { key: "eq", label: "Equity capital" },
];
const FLOWS = [
  {
    key: "net_interest_income",
    label: "Net interest income",
    direct: "nimq",
    ytd: "nim",
    sign: 1,
  },
  {
    key: "noninterest_income",
    label: "Noninterest income",
    direct: "noniiq",
    ytd: "nonii",
    sign: 1,
  },
  {
    key: "noninterest_expense",
    label: "Noninterest expense",
    direct: "nonixq",
    ytd: "nonix",
    sign: -1,
  },
  {
    key: "provision",
    label: "Provision for credit losses",
    direct: "elnatq",
    ytd: "elnatr",
    sign: -1,
  },
  {
    key: "securities_gains",
    label: "Securities gains or losses",
    direct: "iglsecq",
    ytd: "iglsec",
    sign: 1,
  },
  {
    key: "income_tax",
    label: "Income tax expense",
    direct: "itaxq",
    ytd: "itax",
    sign: -1,
  },
  {
    key: "extraordinary_items",
    label: "Extraordinary items",
    direct: "extraq",
    ytd: "extra",
    sign: 1,
  },
] as const;

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}
function previousQuarter(date: string): string | null {
  const match = /^(\d{4})(0331|0630|0930|1231)$/.exec(date);
  if (!match) return null;
  const year = Number(match[1]);
  const ending = match[2];
  return ending === "0331"
    ? `${year - 1}1231`
    : ending === "0630"
      ? `${year}0331`
      : ending === "0930"
        ? `${year}0630`
        : `${year}0930`;
}
function additive(
  metric: string,
  totalKey: keyof Financial,
  definitions: Component[],
  from: Financial,
  to: Financial,
): AdditiveBridge {
  const fromTotal = finite(from[totalKey]) ? (from[totalKey] as number) : null;
  const toTotal = finite(to[totalKey]) ? (to[totalKey] as number) : null;
  const totalChange =
    fromTotal !== null && toTotal !== null ? toTotal - fromTotal : null;
  let known = 0;
  let magnitude = 0;
  let endpoints = 0;
  const contributions = definitions.map(
    (definition): AttributionContribution => {
      const fromValue = finite(from[definition.key])
        ? (from[definition.key] as number) * (definition.sign ?? 1)
        : null;
      const toValue = finite(to[definition.key])
        ? (to[definition.key] as number) * (definition.sign ?? 1)
        : null;
      if (fromValue !== null) endpoints++;
      if (toValue !== null) endpoints++;
      const change =
        fromValue !== null && toValue !== null ? toValue - fromValue : null;
      if (change !== null) {
        known += change;
        magnitude += Math.abs(change);
      }
      return {
        key: String(definition.key),
        label: definition.label,
        from: fromValue,
        to: toValue,
        change,
        availability: change === null ? "missing" : "reported",
      };
    },
  );
  const residual = totalChange === null ? null : totalChange - known;
  const tolerance =
    totalChange === null ? 0 : Math.max(1, Math.abs(totalChange) * 1e-10);
  return {
    metric,
    unit: "usd_thousands",
    from: { repdte: from.repdte, value: fromTotal },
    to: { repdte: to.repdte, value: toTotal },
    totalChange,
    contributions,
    residual,
    dataCoverage: endpoints / (definitions.length * 2),
    attributedChangeShare:
      totalChange === null
        ? null
        : magnitude + Math.abs(residual ?? 0) === 0
          ? 1
          : magnitude / (magnitude + Math.abs(residual ?? 0)),
    method: totalChange === null ? "unavailable" : "exact_difference_identity",
    reconciliation:
      totalChange === null
        ? "missing_total"
        : endpoints < definitions.length * 2
          ? "partial_inputs"
          : Math.abs(residual ?? 0) <= tolerance
            ? "reconciled"
            : "residual_present",
  };
}
function quarterFlow(
  row: Financial,
  prior: Financial | null,
  direct: string,
  ytd: string,
): { value: number | null; source: FlowSource } {
  const directValue = row[direct as keyof Financial];
  if (finite(directValue))
    return { value: directValue, source: "reported_single_quarter" };
  const ytdValue = row[ytd as keyof Financial];
  const ending = row.repdte.slice(4);
  if (!finite(ytdValue)) return { value: null, source: "unavailable" };
  if (ending === "0331")
    return { value: ytdValue, source: "reported_ytd_first_quarter" };
  if (
    !prior ||
    previousQuarter(row.repdte) !== prior.repdte ||
    prior.repdte.slice(0, 4) !== row.repdte.slice(0, 4)
  )
    return { value: null, source: "unavailable" };
  const priorYtd = prior[ytd as keyof Financial];
  return finite(priorYtd)
    ? { value: ytdValue - priorYtd, source: "derived_from_consecutive_ytd" }
    : { value: null, source: "unavailable" };
}
function incomeBridge(
  before: Financial | null,
  from: Financial,
  to: Financial,
): AdditiveBridge {
  const fromTotal = quarterFlow(from, before, "netincq", "netinc");
  const toTotal = quarterFlow(to, from, "netincq", "netinc");
  const left = {
    cert: from.cert,
    repdte: from.repdte,
    total: fromTotal.value,
  } as unknown as Financial;
  const right = {
    cert: to.cert,
    repdte: to.repdte,
    total: toTotal.value,
  } as unknown as Financial;
  const definitions: Component[] = [];
  const sources = new Map<string, { from: FlowSource; to: FlowSource }>();
  for (const flow of FLOWS) {
    const a = quarterFlow(from, before, flow.direct, flow.ytd);
    const b = quarterFlow(to, from, flow.direct, flow.ytd);
    (left as unknown as Record<string, unknown>)[flow.key] = a.value;
    (right as unknown as Record<string, unknown>)[flow.key] = b.value;
    definitions.push({
      key: flow.key as keyof Financial,
      label: flow.label,
      sign: flow.sign as 1 | -1,
    });
    sources.set(flow.key, { from: a.source, to: b.source });
  }
  const bridge = additive(
    "quarterly_net_income",
    "total" as keyof Financial,
    definitions,
    left,
    right,
  );
  bridge.contributions = bridge.contributions.map((item) => ({
    ...item,
    fromSource: sources.get(item.key)?.from,
    toSource: sources.get(item.key)?.to,
  }));
  return bridge;
}
function ratio(from: Financial, to: Financial): RatioAttribution {
  if (![from.lnlsnet, to.lnlsnet, from.dep, to.dep].every(finite))
    return {
      metric: "loan_to_deposit",
      unit: "percentage_points",
      from: null,
      to: null,
      totalChange: null,
      contributions: { numerator: null, denominator: null },
      method: "unavailable",
      status: "missing_input",
    };
  const n0 = from.lnlsnet as number,
    n1 = to.lnlsnet as number,
    d0 = from.dep as number,
    d1 = to.dep as number;
  if (!d0 || !d1)
    return {
      metric: "loan_to_deposit",
      unit: "percentage_points",
      from: null,
      to: null,
      totalChange: null,
      contributions: { numerator: null, denominator: null },
      method: "unavailable",
      status: "zero_denominator",
    };
  const left = (100 * n0) / d0,
    right = (100 * n1) / d1;
  return {
    metric: "loan_to_deposit",
    unit: "percentage_points",
    from: left,
    to: right,
    totalChange: right - left,
    contributions: {
      numerator: ((100 * (n1 - n0)) / 2) * (1 / d0 + 1 / d1),
      denominator: ((100 * (n0 + n1)) / 2) * (1 / d1 - 1 / d0),
    },
    method: "exact_two_factor_shapley",
    status: "ok",
  };
}
function movement(
  values: Array<{ from: number | null; to: number | null }>,
  subject: { from: number | null; to: number | null },
  mode: "percent" | "points",
  minimumPeerCount = 2,
): PeerMovement {
  const calc = (item: { from: number | null; to: number | null }) =>
    item.from === null ||
    item.to === null ||
    (mode === "percent" && item.from === 0)
      ? null
      : mode === "percent"
        ? ((item.to - item.from) / item.from) * 100
        : item.to - item.from;
  const subjectMovement = calc(subject);
  const peers = values
    .map(calc)
    .filter((value): value is number => value !== null)
    .sort((a, b) => a - b);
  if (subjectMovement === null)
    return {
      subjectMovement: null,
      peerMedian: null,
      subjectPercentile: null,
      peerCount: peers.length,
      minimumPeerCount,
      status: "unavailable",
      warning: "The focused bank does not have both reported values.",
    };
  const median = peers.length
    ? (peers[Math.floor((peers.length - 1) / 2)] +
        peers[Math.ceil((peers.length - 1) / 2)]) /
      2
    : null;
  return {
    subjectMovement,
    peerMedian: median,
    subjectPercentile: peers.length
      ? (peers.filter((value) => value <= subjectMovement).length /
          peers.length) *
        100
      : null,
    peerCount: peers.length,
    minimumPeerCount,
    status: peers.length >= minimumPeerCount ? "ok" : "insufficient_peers",
    warning:
      peers.length >= minimumPeerCount
        ? null
        : `Only ${peers.length} comparable banks are available; ${minimumPeerCount} are required for peer-relative claims.`,
  };
}
export function buildRecordedQuarterBrief(
  bank: WorkspaceBank,
  cohort: WorkspaceBank[],
  cursorIndex: number,
  options: WorkspacePeerEvidenceOptions = {},
): WorkspaceQuarterBrief {
  const to = bank.financials[cursorIndex];
  const fromIndex = options.comparisonFrom
    ? bank.financials.findIndex((row) => row.repdte === options.comparisonFrom)
    : cursorIndex - 1;
  const from = fromIndex >= 0 ? bank.financials[fromIndex] : undefined;
  const before = fromIndex > 0 ? bank.financials[fromIndex - 1] : null;
  const provenance = {
    source: "FDIC BankFind Financials",
    sourceUrl: "https://api.fdic.gov/banks/docs/",
    datasetGrain: "institution_quarter",
    monetaryUnit: "usd_thousands",
    cohortDefinition:
      options.cohortDefinition ??
      "current workspace peer cohort; focused bank excluded",
    cohortDefinitionHash: options.cohortDefinitionHash ?? null,
    cohortHash: options.cohortHash ?? null,
    cohortMemberCount: cohort.length,
    calculationVersion: "quarter-change-v1-compatible",
  };
  if (!to || !from)
    return {
      cert: bank.cert,
      bank: { name: bank.name, city: bank.city, state: bank.state },
      comparison: {
        status: "missing_comparison_quarter",
        from: from?.repdte ?? null,
        to: to?.repdte ?? null,
        isConsecutiveQuarter: false,
        message: "Select a period with a preceding quarter.",
      },
      bridges: null,
      peerContext: null,
      structuralContext: null,
      provenance,
    };
  const pairs = cohort
    .filter((item) => item.cert !== bank.cert)
    .map((item) => ({
      from: item.financials.find((row) => row.repdte === from.repdte) ?? null,
      to: item.financials.find((row) => row.repdte === to.repdte) ?? null,
    }));
  const peer = (
    field: keyof Financial,
    mode: "percent" | "points" = "percent",
  ) =>
    movement(
      pairs.map((pair) => ({
        from:
          pair.from && finite(pair.from[field])
            ? (pair.from[field] as number)
            : null,
        to:
          pair.to && finite(pair.to[field]) ? (pair.to[field] as number) : null,
      })),
      {
        from: finite(from[field]) ? (from[field] as number) : null,
        to: finite(to[field]) ? (to[field] as number) : null,
      },
      mode,
      options.minimumPeerCount ?? 2,
    );
  const loanDeposit = (row: Financial | null) =>
    row && finite(row.lnlsnet) && finite(row.dep) && row.dep !== 0
      ? (100 * row.lnlsnet) / row.dep
      : null;
  return {
    cert: bank.cert,
    bank: { name: bank.name, city: bank.city, state: bank.state },
    comparison: {
      status: "ok",
      from: from.repdte,
      to: to.repdte,
      isConsecutiveQuarter: previousQuarter(to.repdte) === from.repdte,
      message: null,
    },
    bridges: {
      assets: additive("total_assets", "asset", ASSETS, from, to),
      funding: additive("funding_and_equity", "asset", FUNDING, from, to),
      quarterlyNetIncome: incomeBridge(before, from, to),
      loanToDeposit: ratio(from, to),
    },
    peerContext: {
      assetGrowth: peer("asset"),
      depositGrowth: peer("dep"),
      loanGrowth: peer("lnlsnet"),
      loanToDepositChange: movement(
        pairs.map((pair) => ({
          from: loanDeposit(pair.from),
          to: loanDeposit(pair.to),
        })),
        { from: loanDeposit(from), to: loanDeposit(to) },
        "points",
        options.minimumPeerCount ?? 2,
      ),
    },
    structuralContext: null,
    provenance,
  };
}

/**
 * Keep the server's exact component bridges while replacing its default asset-
 * bucket peer context with the visible workspace cohort.
 */
export function withWorkspacePeerContext(
  brief: WorkspaceQuarterBrief,
  bank: WorkspaceBank,
  cohort: WorkspaceBank[],
  cursorIndex: number,
  options: WorkspacePeerEvidenceOptions = {},
): WorkspaceQuarterBrief {
  const peerBrief = buildRecordedQuarterBrief(
    bank,
    cohort,
    cursorIndex,
    options,
  );
  return {
    ...brief,
    peerContext: peerBrief.peerContext,
    provenance: {
      ...brief.provenance,
      cohortDefinition: peerBrief.provenance.cohortDefinition,
      cohortDefinitionHash: peerBrief.provenance.cohortDefinitionHash,
      cohortHash: peerBrief.provenance.cohortHash,
      cohortMemberCount: peerBrief.provenance.cohortMemberCount,
    },
  };
}
export function attributionModeForMetric(metric: string): AttributionMode {
  if (metric === "asset") return "assets";
  if (metric === "dep") return "funding";
  if (metric === "lnlsdepr" || metric === "loanToDeposit")
    return "loanToDeposit";
  if (metric === "netinc" || metric === "quarterlyNetIncome")
    return "quarterlyNetIncome";
  if (isResearchMetric(metric)) return "reportedMetric";
  throw new Error(`Quarter-change evidence does not support metric "${metric}".`);
}
