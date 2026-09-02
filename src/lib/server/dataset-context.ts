import type { DatasetContext, PipelineState } from '$lib/types';
import { queryAll, queryOne } from '$lib/server/db';
import { expectedSystemReportingPeriod } from '$lib/server/analytics/system-signals';
import { cacheWrap } from '$lib/server/cache';

const DATASET_CONTEXT_CACHE_KEY = 'dataset-context:v4';
const DATASET_CONTEXT_TTL_SECONDS = 24 * 60 * 60;

/**
 * Resolve the elected release and its already-computed reporting population
 * through singleton/primary-key lookups. This deliberately never scans the
 * quarterly financial history.
 */
export const DATASET_FINANCIAL_SUMMARY_SQL = `
  SELECT control.release AS source_as_of,
         CAST(aggregate.value AS INTEGER) AS institution_count
  FROM release_control AS control
  LEFT JOIN agg_industry AS aggregate
    ON aggregate.repdte = control.release
   AND aggregate.segment = 'all'
   AND aggregate.metric = 'bank_count'
  WHERE control.singleton = 1
    AND control.release IS NOT NULL
  LIMIT 1
`;

export interface DatasetContextInput {
  pipelineState: PipelineState[];
  institutionCount: number;
  activeInstitutionCount: number;
  institutionSourceAsOf: string | null;
  financialSourceAsOf: string | null;
  financialInstitutionCount: number;
  aggregateSourceAsOf: string | null;
  aggregateInstitutionCount: number;
  pageLoadedAt: string;
}

type DatasetContextSnapshot = Omit<DatasetContextInput, 'pageLoadedAt'>;

export interface LoadDatasetContextOptions {
  kv?: KVNamespace;
  /** Authoritative generation admitted by the D1 publication barrier. */
  generation?: string;
  pageLoadedAt?: string;
}

function stateMap(rows: PipelineState[]): Map<string, PipelineState> {
  return new Map(rows.map((row) => [row.key, row]));
}

export function buildDatasetContext(input: DatasetContextInput): DatasetContext {
  const states = stateMap(input.pipelineState);
  const demoMarker = states.get('demo_fixture_mode');
  const isDemo = demoMarker?.value === 'recorded';
  const sourceAsOf = input.financialSourceAsOf ?? input.institutionSourceAsOf;
  const expectedSourceAsOf = expectedSystemReportingPeriod(new Date(input.pageLoadedAt));
  const isStale = sourceAsOf === null || sourceAsOf < expectedSourceAsOf;
  const retrievedAt = isDemo
    ? states.get('demo_fixture_recorded_at')?.value ?? demoMarker?.updated_at ?? null
    : states.get('financials_retrieved_at')?.value ?? null;
  const pipelineStageUpdatedAt = isDemo
    ? null
    : states.get('financials_last_sync')?.updated_at
      ?? states.get('financials_sync_status')?.updated_at
      ?? null;

  return {
    mode: isDemo ? 'recorded_snapshot' : 'pipeline',
    demo_fixture_mode: isDemo ? 'recorded' : null,
    source: 'FDIC BankFind',
    is_demo: isDemo,
    scopes: {
      institutions: {
        kind: isDemo ? 'recorded_selection' : 'loaded_population',
        label: isDemo
          ? `${input.institutionCount} recorded institutions`
          : `${input.activeInstitutionCount} active loaded institutions`,
        population: isDemo
          ? 'Named institutions included in the recorded FDIC demonstration snapshot'
          : 'Institution records currently loaded from FDIC BankFind',
        count: isDemo ? input.institutionCount : input.activeInstitutionCount,
        record_count: input.institutionCount,
        source_as_of: input.institutionSourceAsOf
      },
      institution_financials: {
        kind: isDemo ? 'recorded_selection' : 'loaded_population',
        label: isDemo
          ? `${input.financialInstitutionCount} recorded institutions with financials`
          : `${input.financialInstitutionCount} institutions reporting in the latest loaded period`,
        population: isDemo
          ? 'The same named institutions in the recorded demonstration selection; not the national reporting population'
          : 'Institutions with a BankFind Financials record in the latest loaded reporting period',
        count: input.financialInstitutionCount,
        source_as_of: input.financialSourceAsOf
      },
      industry_aggregates: {
        kind: 'reported_population_aggregate',
        label: `${input.aggregateInstitutionCount} reporting institutions`,
        population: 'All institutions returned by FDIC BankFind Financials for this reporting period; values are separately derived aggregates and are not calculated from the recorded institution selection',
        count: input.aggregateInstitutionCount,
        source_as_of: input.aggregateSourceAsOf
      }
    },
    source_as_of: sourceAsOf,
    expected_source_as_of: expectedSourceAsOf,
    retrieved_at: retrievedAt,
    pipeline_stage_updated_at: pipelineStageUpdatedAt,
    page_loaded_at: input.pageLoadedAt,
    is_stale: isStale,
    stale_message: isStale
      ? sourceAsOf
        ? `Latest loaded FDIC reporting period is ${sourceAsOf}; ${expectedSourceAsOf} is expected after the normal reporting lag.`
        : 'No FDIC financial reporting period is loaded.'
      : null
  };
}

export async function loadDatasetContext(
  db: D1Database,
  options: LoadDatasetContextOptions = {}
): Promise<DatasetContext> {
  const snapshot = await cacheWrap<DatasetContextSnapshot>(
    options.kv,
    DATASET_CONTEXT_CACHE_KEY,
    DATASET_CONTEXT_TTL_SECONDS,
    async () => {
      const [pipelineState, institutions, financialSummary] = await Promise.all([
        queryAll<PipelineState>(db, 'SELECT key, value, updated_at FROM pipeline_state'),
        queryOne<{
          institution_count: number;
          active_count: number;
        }>(db, `
          SELECT COUNT(*) AS institution_count,
                 SUM(CASE WHEN active = 1 THEN 1 ELSE 0 END) AS active_count
          FROM published_institutions
        `),
        queryOne<{ source_as_of: string | null; institution_count: number | null }>(
          db,
          DATASET_FINANCIAL_SUMMARY_SQL
        ).catch(() => null)
      ]);

      return {
        pipelineState,
        institutionCount: institutions?.institution_count ?? 0,
        activeInstitutionCount: institutions?.active_count ?? 0,
        institutionSourceAsOf: financialSummary?.source_as_of ?? null,
        financialSourceAsOf: financialSummary?.source_as_of ?? null,
        financialInstitutionCount: financialSummary?.institution_count ?? 0,
        aggregateSourceAsOf: financialSummary?.source_as_of ?? null,
        aggregateInstitutionCount: financialSummary?.institution_count ?? 0
      };
    },
    options.generation
  );

  return buildDatasetContext({
    ...snapshot,
    pageLoadedAt: options.pageLoadedAt ?? new Date().toISOString()
  });
}
