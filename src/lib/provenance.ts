import type { AnalysisProvenance } from '$lib/types';
import { fieldDefs } from '$lib/utils/field-meta.js';
import { researchMetricDefinition, type ResearchMetric } from '$lib/research-metrics.js';

export const FDIC_FINANCIALS_SOURCE = 'FDIC BankFind Financials';
export const FDIC_FINANCIALS_SOURCE_URL = 'https://api.fdic.gov/banks/docs/';

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

/** Stable, bounded identity for a cohort definition or exact member set. */
export function lineageHash(value: unknown): string {
  const input = canonical(value);
  let hash = 0x811c9dc5;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `fnv1a32:${hash.toString(16).padStart(8, '0')}`;
}

export function latestTimestamp(values: Array<string | null | undefined>): string | null {
  return values.filter((value): value is string => Boolean(value)).sort().at(-1) ?? null;
}

export function metricSourceFields(metric: string): string[] {
  const definition = fieldDefs[metric];
  return [definition?.sourceField ?? metric.toUpperCase()];
}

export function metricFormula(metric: string): string {
  const definition = fieldDefs[metric];
  const sourceField = definition?.sourceField ?? metric.toUpperCase();
  return definition?.formula ?? `Reported FDIC field ${sourceField}`;
}

export function financialMetricLineage(metrics: readonly string[]): Pick<AnalysisProvenance, 'source_fields' | 'formulas'> {
  const unique = [...new Set(metrics)];
  return {
    source_fields: Object.fromEntries(unique.map((metric) => [metric, metricSourceFields(metric)])),
    formulas: Object.fromEntries(unique.map((metric) => [metric, metricFormula(metric)]))
  };
}

export function financialAnalysisProvenance(input: {
  metrics: readonly string[];
  sourceAsOf: string | null;
  retrievedAt: string | null;
  release?: string | null;
  releaseGeneration?: string | null;
  cohortHash?: string | null;
}): AnalysisProvenance {
  return {
    source: FDIC_FINANCIALS_SOURCE,
    source_url: FDIC_FINANCIALS_SOURCE_URL,
    source_as_of: input.sourceAsOf,
    retrieved_at: input.retrievedAt,
    release: input.release ?? null,
    release_generation: input.releaseGeneration ?? null,
    ...financialMetricLineage(input.metrics),
    cohort_hash: input.cohortHash ?? null
  };
}

function researchMetricFormula(metric: ResearchMetric): string {
  if (metric === 'loanGrowth') return '100 × (LNLSNET this quarter / LNLSNET four quarters earlier − 1)';
  if (metric === 'netinc') {
    return 'Reported NETINCQ; when unavailable, exact NETINC year-to-date difference across consecutive quarters in the same calendar year';
  }
  const rawMetric = metric === 'offdom' ? 'offdom' : metric;
  return metricFormula(rawMetric);
}

export function researchMetricAnalysisProvenance(input: {
  metrics: readonly ResearchMetric[];
  sourceAsOf: string | null;
  retrievedAt: string | null;
  release?: string | null;
  releaseGeneration?: string | null;
  cohortHash?: string | null;
}): AnalysisProvenance {
  const metrics = [...new Set(input.metrics)];
  const base = financialAnalysisProvenance({ ...input, metrics: [] });
  return {
    ...base,
    source_fields: Object.fromEntries(metrics.map((metric) => {
      const fields = researchMetricDefinition(metric).source.match(/[A-Z][A-Z0-9_]+/g) ?? [metric.toUpperCase()];
      return [metric, [...new Set(fields)]];
    })),
    formulas: Object.fromEntries(metrics.map((metric) => [metric, researchMetricFormula(metric)]))
  };
}
