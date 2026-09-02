import type { CompareResponse, Financial, Institution } from "$lib/types";
import {
  RESEARCH_METRICS,
  researchMetricDefinition,
  type ResearchMetric,
} from "$lib/research-metrics";

export type WorkspaceMetric = ResearchMetric;
export type MetricDefinition = (typeof RESEARCH_METRICS)[number];

export interface WorkspaceBank extends Institution {
  color: string;
  financials: Financial[];
}

export const METRICS: readonly MetricDefinition[] = RESEARCH_METRICS;

const COLORS = [
  "#2bd2ff",
  "#48a8d8",
  "#9a83e8",
  "#c590e5",
  "#f08acb",
  "#e7a95a",
];

function coerceFinancials(rows: Financial[]): Financial[] {
  return [...rows].sort((a, b) => a.repdte.localeCompare(b.repdte));
}

function latestInstitutionRow(bank: Institution): Financial[] {
  if (!bank.latest_repdte) return [];
  return [
    {
      cert: bank.cert,
      repdte: bank.latest_repdte,
      asset: bank.total_assets,
      dep: bank.total_deposits,
      eq: null,
      lnlsnet: null,
      lnre: null,
      lnci: null,
      lncon: null,
      sec: null,
      netinc: null,
      intinc: null,
      eintexp: null,
      nim: null,
      nonii: null,
      nonix: null,
      elnatr: null,
      roa: bank.latest_roa,
      roe: bank.latest_roe,
      nimy: bank.latest_nim,
      eeffr: null,
      rbcrwaj: null,
      rbc1rwaj: bank.latest_tier1_ratio,
      rbc1aaj: null,
      eqv: null,
      nclnlsr: bank.latest_npl_ratio,
      lnatresr: null,
      nco_ratio: null,
      lnlsdepr: null,
      othbfhlb: null,
      numemp: bank.num_employees,
      asset_bucket: bank.asset_tier,
    },
  ];
}

export function buildWorkspaceBanks(
  banks: Institution[],
  selected: Institution[],
  comparison: CompareResponse | null,
): { cohort: WorkspaceBank[]; selected: WorkspaceBank[]; fallback: boolean } {
  if (
    banks.length &&
    comparison &&
    Object.values(comparison.data).some((rows) => rows.length)
  ) {
    const chosen = selected.length ? selected : banks.slice(0, 5);
    const hydrate = (bank: Institution, index: number): WorkspaceBank => ({
      ...bank,
      color: COLORS[index % COLORS.length],
      financials: coerceFinancials(
        comparison.data[bank.cert]?.length
          ? comparison.data[bank.cert]
          : latestInstitutionRow(bank),
      ),
    });
    return {
      cohort: banks.map((bank, index) => hydrate(bank, index)),
      selected: chosen.map((bank, index) => hydrate(bank, index)),
      fallback: false,
    };
  }

  return { cohort: [], selected: [], fallback: true };
}

export function valueAt(
  bank: WorkspaceBank,
  metric: WorkspaceMetric,
  index = bank.financials.length - 1,
): number | null {
  const row = bank.financials[index];
  if (!row) return null;
  const definition = researchMetricDefinition(metric);
  if ("derived" in definition && definition.derived === "loan_growth_yoy") {
    const priorPeriod = `${Number(row.repdte.slice(0, 4)) - 1}${row.repdte.slice(4)}`;
    const prior = bank.financials.find(
      (candidate) => candidate.repdte === priorPeriod,
    )?.lnlsnet;
    return row.lnlsnet != null && prior
      ? (row.lnlsnet / prior - 1) * 100
      : null;
  }
  if ("derived" in definition && definition.derived === "quarterly_net_income") {
    if (typeof row.netincq === "number" && Number.isFinite(row.netincq)) return row.netincq;
    if (row.netinc == null) return null;
    if (row.repdte.slice(4) === "0331") return row.netinc;
    const previous = bank.financials[index - 1];
    if (!previous || previous.netinc == null || previous.repdte.slice(0, 4) !== row.repdte.slice(0, 4)) return null;
    return row.netinc - previous.netinc;
  }
  if ("latestInstitutionField" in definition) {
    const latest = bank.latest_repdte ?? bank.financials.at(-1)?.repdte;
    if (row.repdte !== latest) return null;
    const value = bank[definition.latestInstitutionField];
    return typeof value === "number" && Number.isFinite(value) ? value : null;
  }
  if (!("valueField" in definition)) return null;
  const value = row[definition.valueField];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/** Resolve a metric at an exact reporting date; never substitute an ordinal quarter. */
export function valueAtPeriod(
  bank: WorkspaceBank,
  metric: WorkspaceMetric,
  period: string | null,
): number | null {
  if (!period) return null;
  const index = bank.financials.findIndex((row) => row.repdte === period);
  return index < 0 ? null : valueAt(bank, metric, index);
}

export function changeFromStart(
  bank: WorkspaceBank,
  metric: WorkspaceMetric,
): number | null {
  const end = valueAt(bank, metric);
  const start = valueAt(bank, metric, 0);
  return metricChange(start, end, metric);
}

export function metricChange(
  start: number | null,
  end: number | null,
  metric: WorkspaceMetric,
): number | null {
  if (start == null || end == null) return null;
  const mode = researchMetricDefinition(metric).change;
  if (mode === "percent_change") return start === 0 ? null : (end / start - 1) * 100;
  return end - start;
}

export function formatMetric(
  value: number | null,
  metric: WorkspaceMetric,
): string {
  if (value == null || !Number.isFinite(value)) return "—";
  const unit = researchMetricDefinition(metric).unit;
  if (unit === "usd_thousands") {
    const billions = value / 1_000_000;
    const magnitude = Math.abs(billions);
    if (magnitude >= 1_000) return `$${(billions / 1_000).toFixed(2)}T`;
    if (magnitude < 0.01) return `$${(value / 1_000).toFixed(1)}M`;
    return `$${billions.toFixed(magnitude < 10 ? 2 : 1)}B`;
  }
  if (unit === "count") return Math.round(value).toLocaleString("en-US");
  return `${value.toFixed(2)}%`;
}

export function formatMetricExact(value: number, metric: WorkspaceMetric): string {
  const unit = researchMetricDefinition(metric).unit;
  if (unit === "usd_thousands")
    return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value * 1_000);
  if (unit === "count") return Math.round(value).toLocaleString("en-US");
  return `${value.toLocaleString("en-US", { maximumFractionDigits: 4 })}%`;
}

export function formatMetricChange(value: number | null, metric: WorkspaceMetric): string {
  if (value == null || !Number.isFinite(value)) return "—";
  const definition = researchMetricDefinition(metric);
  const sign = value >= 0 ? "+" : "−";
  const magnitude = Math.abs(value);
  if (definition.change === "percent_change") return `${sign}${magnitude.toFixed(1)}%`;
  if (definition.change === "percentage_points") return `${sign}${(magnitude * 100).toFixed(0)} bps`;
  if (definition.unit === "usd_thousands") return `${sign}${formatMetric(magnitude, metric)}`;
  return `${sign}${Math.round(magnitude).toLocaleString("en-US")}`;
}

export function quarterLabel(repdte: string): string {
  const month = Number(repdte.slice(4, 6));
  return `Q${Math.ceil(month / 3)} '${repdte.slice(2, 4)}`;
}
