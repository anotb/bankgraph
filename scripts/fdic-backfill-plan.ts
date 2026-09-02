const FDIC_SUMMARY_URL = 'https://api.fdic.gov/banks/summary';
const PIPELINE_RUN_ID_RE = /^[A-Za-z0-9._:-]+$/;

export type AnnualCharterClass = 'CB' | 'SI';

export interface AnnualSummaryBounds {
  CB: { min: number; max: number };
  SI: { min: number; max: number };
}

export function validatePipelineRunId(runId: string): string {
  if (runId.length < 1 || runId.length > 128 || !PIPELINE_RUN_ID_RE.test(runId)) {
    throw new Error('--run-id/BACKFILL_RUN_ID must be 1-128 URL-safe characters');
  }
  return runId;
}

interface SummaryBoundaryPayload {
  data?: Array<{ data?: { YEAR?: unknown; CB_SI?: unknown } }>;
}

function parseBoundary(
  payload: SummaryBoundaryPayload,
  charter: AnnualCharterClass,
  boundary: 'first' | 'latest'
): number {
  const row = payload.data?.[0]?.data;
  const year = Number(row?.YEAR);
  if (row?.CB_SI !== charter || !Number.isInteger(year) || year < 1900 || year > 9999) {
    throw new Error(`FDIC summary did not return the ${boundary} ${charter} year`);
  }
  return year;
}

async function fetchBoundary(
  charter: AnnualCharterClass,
  order: 'ASC' | 'DESC',
  fetcher: typeof fetch
): Promise<number> {
  const params = new URLSearchParams({
    filters: `CB_SI:${charter}`,
    fields: 'YEAR,CB_SI',
    sort_by: 'YEAR',
    sort_order: order,
    limit: '1',
    offset: '0'
  });
  const response = await fetcher(`${FDIC_SUMMARY_URL}?${params.toString()}`, {
    headers: { Accept: 'application/json' }
  });
  if (!response.ok) throw new Error(`FDIC summary bounds request returned HTTP ${response.status}`);
  const payload = await response.json() as SummaryBoundaryPayload;
  return parseBoundary(payload, charter, order === 'ASC' ? 'first' : 'latest');
}

export async function discoverAnnualSummaryBounds(
  fetcher: typeof fetch = fetch
): Promise<AnnualSummaryBounds> {
  const [cbMin, cbMax, siMin, siMax] = await Promise.all([
    fetchBoundary('CB', 'ASC', fetcher),
    fetchBoundary('CB', 'DESC', fetcher),
    fetchBoundary('SI', 'ASC', fetcher),
    fetchBoundary('SI', 'DESC', fetcher)
  ]);
  if (cbMin > cbMax || siMin > siMax) throw new Error('FDIC summary bounds are inconsistent');
  return { CB: { min: cbMin, max: cbMax }, SI: { min: siMin, max: siMax } };
}

export function buildAnnualSummaryRange(
  from: number,
  to: number,
  bounds: AnnualSummaryBounds
): string[] {
  if (!Number.isInteger(from) || !Number.isInteger(to) || from > to) {
    throw new Error('Annual summary range must contain increasing whole years');
  }
  const partitions: string[] = [];
  for (let year = from; year <= to; year++) {
    for (const charter of ['CB', 'SI'] as const) {
      const classBounds = bounds[charter];
      if (year >= classBounds.min && year <= classBounds.max) {
        partitions.push(`${year}:${charter}`);
      }
    }
  }
  if (partitions.length === 0) {
    throw new Error(`Annual summary range ${from}..${to} is outside current FDIC coverage`);
  }
  return partitions;
}

export function latestAnnualSummaryPartitions(): string[] {
  return ['latest:CB', 'latest:SI'];
}
