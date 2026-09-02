import { queryAll, queryOne } from '$lib/server/db';
import {
  fetchMacroRange,
  MACRO_SERIES_BY_ID,
  parseBlsJsonRange,
  parseFrbCsvRange,
  parseH8CsvRange,
  type MacroObservation,
  type MacroSeriesDefinition
} from './macro-sources';
import { BLS_CPI_BULK_URL } from './bls-bulk';

const MAX_D1_PARAMETERS = 100;

interface SyncStateRow {
  status: 'partial' | 'success' | 'failed';
  cursor_year: number | null;
  attempts: number;
}

interface CoverageRow {
  coverage_start: string | null;
  coverage_end: string | null;
  observed_through: string | null;
}

interface CompleteCoverage {
  coverage_start: string;
  coverage_end: string;
}

export interface MacroSyncRange {
  startYear: number;
  endYear: number;
  cursorYear: number;
}

interface StoredMacroObservation {
  date: string;
  value: number;
}

export interface MacroSyncResult {
  series_id: string;
  source_agency: string;
  source_url: string;
  cursor_year: number;
  observations: number;
  statements: number;
  coverage_start: string;
  coverage_end: string;
  observed_through: string;
  retrieved_at: string;
  done: boolean;
}

export type UploadedMacroTransport = 'bls_api' | 'bls_bulk' | 'frb_csv';

export function resolveMacroSourceUrl(
  definition: Pick<MacroSeriesDefinition, 'provider' | 'seriesId' | 'sourceUrl'>,
  transport: UploadedMacroTransport | undefined
): string {
  if (transport === undefined) return definition.sourceUrl;
  if (transport === 'frb_csv') {
    if (definition.provider !== 'frb') {
      throw new Error('The Federal Reserve CSV transport is only accepted for Board series');
    }
    return definition.sourceUrl;
  }
  if (definition.provider !== 'bls') throw new Error('A BLS transport requires a BLS series');
  if (transport === 'bls_api') return definition.sourceUrl;
  if (transport === 'bls_bulk' && definition.seriesId !== 'BLS_CPI_U') {
    throw new Error('The BLS bulk transport is only accepted for CPI-U');
  }
  return BLS_CPI_BULK_URL;
}

export class MacroSyncError extends Error {
  constructor(
    message: string,
    public readonly seriesId: string,
    public readonly range: MacroSyncRange | null = null
  ) {
    super(message);
    this.name = 'MacroSyncError';
  }
}

export function chooseSyncYear(
  sourceStartDate: string,
  currentYear: number,
  state: Pick<SyncStateRow, 'status' | 'cursor_year'> | null,
  coverage: Pick<CoverageRow, 'coverage_start' | 'coverage_end'> | null
): number {
  const sourceStartYear = Number(sourceStartDate.slice(0, 4));
  const floor = Math.min(sourceStartYear, currentYear);
  const bounded = (year: number): number => Math.min(currentYear, Math.max(floor, year));

  // A failed authoritative slice must be retried before advancing either side
  // of the stored coverage.
  if (state?.status === 'failed' && state.cursor_year !== null) {
    return bounded(state.cursor_year);
  }

  const coverageStart = coverage?.coverage_start ?? null;
  const coverageEnd = coverage?.coverage_end ?? null;
  const coverageStartYear = coverageStart
    ? Number(coverageStart.slice(0, 4))
    : null;
  const coverageEndYear = coverageEnd
    ? Number(coverageEnd.slice(0, 4))
    : null;
  if (coverageStartYear === null || coverageEndYear === null) return floor;

  // If stored coverage begins above the source floor, walk backward from its
  // edge before resuming forward progress from the other side.
  if (coverageStart !== null && coverageStart > sourceStartDate) {
    return coverageStartYear === floor ? floor : bounded(coverageStartYear - 1);
  }
  if (coverageEndYear < currentYear) return bounded(coverageEndYear + 1);
  return currentYear;
}

export function chooseSyncRange(
  definition: Pick<MacroSeriesDefinition, 'provider' | 'seriesId' | 'sourceStartDate'>,
  currentYear: number,
  state: Pick<SyncStateRow, 'status' | 'cursor_year'> | null,
  coverage: Pick<CoverageRow, 'coverage_start' | 'coverage_end'> | null
): MacroSyncRange {
  const year = chooseSyncYear(definition.sourceStartDate, currentYear, state, coverage);
  if (definition.provider === 'treasury') {
    return { startYear: year, endYear: year, cursorYear: year };
  }

  // BLS's public API and the Board's CSV packages both support bounded
  // multi-year windows. CPI YoY is derived from stored CPI-U observations.
  const span = 10;
  const sourceStartYear = Number(definition.sourceStartDate.slice(0, 4));
  const coverageStartYear = coverage?.coverage_start
    ? Number(coverage.coverage_start.slice(0, 4))
    : null;
  const coverageEndYear = coverage?.coverage_end
    ? Number(coverage.coverage_end.slice(0, 4))
    : null;

  const movingBackward = coverageStartYear !== null
    && coverage!.coverage_start! > definition.sourceStartDate;
  if (movingBackward) {
    const startYear = Math.max(sourceStartYear, year - span + 1);
    return { startYear, endYear: year, cursorYear: startYear };
  }

  const needsForwardHistory = coverageEndYear === null || coverageEndYear < currentYear;
  if (needsForwardHistory) {
    const endYear = Math.min(currentYear, year + span - 1);
    return { startYear: year, endYear, cursorYear: endYear };
  }

  return { startYear: year, endYear: year, cursorYear: year };
}

export function deriveCpiYoY(
  source: StoredMacroObservation[],
  startYear: number,
  endYear: number
): MacroObservation[] {
  const byDate = new Map(source.map((observation) => [observation.date, observation.value]));
  const result: MacroObservation[] = [];
  for (const observation of source) {
    const year = Number(observation.date.slice(0, 4));
    if (year < startYear || year > endYear) continue;
    const prior = new Date(`${observation.date}T00:00:00Z`);
    prior.setUTCFullYear(prior.getUTCFullYear() - 1);
    const priorValue = byDate.get(prior.toISOString().slice(0, 10));
    if (priorValue !== undefined && priorValue !== 0) {
      result.push({
        date: observation.date,
        value: ((observation.value / priorValue) - 1) * 100
      });
    }
  }
  return result.sort((left, right) => left.date.localeCompare(right.date));
}

export function parseUploadedBlsSource(
  definition: Pick<MacroSeriesDefinition, 'provider' | 'seriesId' | 'blsSeriesId'>,
  syncRange: Pick<MacroSyncRange, 'startYear' | 'endYear'>,
  sourcePayload: unknown,
  sourceRange: Pick<MacroSyncRange, 'startYear' | 'endYear'> | undefined
): MacroObservation[] {
  if (definition.provider !== 'bls' || definition.seriesId === 'BLS_CPI_YOY') {
    throw new Error('Uploaded source payloads are only accepted for fetched BLS series');
  }
  if (
    sourceRange?.startYear !== syncRange.startYear
    || sourceRange?.endYear !== syncRange.endYear
  ) {
    throw new Error(
      `Uploaded BLS range did not match the expected ${syncRange.startYear}-${syncRange.endYear} slice`
    );
  }
  return parseBlsJsonRange(
    sourcePayload,
    definition.blsSeriesId!,
    syncRange.startYear,
    syncRange.endYear,
    false
  );
}

export function parseUploadedMacroSource(
  definition: MacroSeriesDefinition,
  syncRange: Pick<MacroSyncRange, 'startYear' | 'endYear'>,
  sourcePayload: unknown,
  sourceRange: Pick<MacroSyncRange, 'startYear' | 'endYear'> | undefined,
  sourceTransport: UploadedMacroTransport | undefined
): MacroObservation[] {
  if (
    sourceRange?.startYear !== syncRange.startYear
    || sourceRange?.endYear !== syncRange.endYear
  ) {
    throw new Error(
      `Uploaded macro range did not match the expected ${syncRange.startYear}-${syncRange.endYear} slice`
    );
  }
  if (sourceTransport === 'frb_csv') {
    if (definition.provider !== 'frb' || typeof sourcePayload !== 'string') {
      throw new Error('Federal Reserve uploads require an allowlisted Board series and CSV text');
    }
    if (definition.frbRelease === 'H8') {
      return parseH8CsvRange(
        sourcePayload,
        syncRange.startYear,
        syncRange.endYear,
        definition.frbSeriesCode!,
        definition.frbExpectedDescription!
      );
    }
    return parseFrbCsvRange(sourcePayload, syncRange.startYear, syncRange.endYear);
  }
  return parseUploadedBlsSource(definition, syncRange, sourcePayload, sourceRange);
}

async function deriveStoredCpiYoY(
  db: D1Database,
  startYear: number,
  endYear: number
): Promise<MacroObservation[]> {
  const rows = await queryAll<StoredMacroObservation>(
    db,
    `SELECT date, value
     FROM macro_observations
     WHERE series_id = 'BLS_CPI_U' AND date >= ? AND date <= ?
     ORDER BY date`,
    [`${startYear - 1}-01-01`, `${endYear}-12-31`]
  );
  return deriveCpiYoY(rows, startYear, endYear);
}

export function latestExpectedSourceYear(
  cadence: MacroSeriesDefinition['cadence'],
  now: Date
): number {
  if (cadence === 'daily' || cadence === 'weekly') return now.getUTCFullYear();
  const lagDays = cadence === 'monthly' ? 45 : 100;
  return new Date(now.getTime() - lagDays * 86_400_000).getUTCFullYear();
}

function sqlDateRange(startYear: number, endYear: number): { start: string; end: string } {
  return { start: `${startYear}-01-01`, end: `${endYear}-12-31` };
}

function validateObservations(
  observations: MacroObservation[],
  startYear: number,
  endYear: number,
  sourceStartDate: string
): void {
  if (observations.length === 0) {
    throw new Error(`Source returned no observations for ${startYear}-${endYear}`);
  }
  const dates = new Set<string>();
  for (const observation of observations) {
    const year = Number(observation.date.slice(0, 4));
    if (year < startYear || year > endYear || !Number.isFinite(observation.value)) {
      throw new Error(`Source returned an invalid observation for ${startYear}-${endYear}`);
    }
    if (dates.has(observation.date)) throw new Error(`Source returned duplicate date ${observation.date}`);
    dates.add(observation.date);
  }
  if (startYear === Number(sourceStartDate.slice(0, 4)) && observations[0].date !== sourceStartDate) {
    throw new Error(`Source history started at ${observations[0].date}; expected ${sourceStartDate}`);
  }
}

function expectedCoverageAfterSlice(
  prior: Pick<CoverageRow, 'coverage_start' | 'coverage_end'> | null,
  observations: MacroObservation[]
): CompleteCoverage {
  const first = observations[0].date;
  const last = observations[observations.length - 1].date;
  const priorStart = prior?.coverage_start;
  const priorEnd = prior?.coverage_end;
  return {
    coverage_start: priorStart ? [priorStart, first].sort()[0] : first,
    coverage_end: priorEnd ? [priorEnd, last].sort()[1] : last
  };
}

function seriesMetadataStatement(
  db: D1Database,
  definition: MacroSeriesDefinition,
  sourceUrl: string,
  retrievedAt: string,
  coverageStart: string,
  coverageEnd: string,
  observedThrough: string
): D1PreparedStatement {
  return db.prepare(
    `INSERT INTO macro_series (
       series_id, title, category, source_agency, source_series, source_url,
       source_page_url, rights_url, rights_note, cadence, units, transform,
       seasonal_adjustment, retrieved_at, observed_through, coverage_start, coverage_end
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(series_id) DO UPDATE SET
       title=excluded.title,
       category=excluded.category,
       source_agency=excluded.source_agency,
       source_series=excluded.source_series,
       source_url=excluded.source_url,
       source_page_url=excluded.source_page_url,
       rights_url=excluded.rights_url,
       rights_note=excluded.rights_note,
       cadence=excluded.cadence,
       units=excluded.units,
       transform=excluded.transform,
       seasonal_adjustment=excluded.seasonal_adjustment,
       retrieved_at=excluded.retrieved_at,
       observed_through=CASE
         WHEN macro_series.observed_through IS NULL OR excluded.observed_through > macro_series.observed_through
         THEN excluded.observed_through ELSE macro_series.observed_through END,
       coverage_start=CASE
         WHEN macro_series.coverage_start IS NULL OR excluded.coverage_start < macro_series.coverage_start
         THEN excluded.coverage_start ELSE macro_series.coverage_start END,
       coverage_end=CASE
         WHEN macro_series.coverage_end IS NULL OR excluded.coverage_end > macro_series.coverage_end
         THEN excluded.coverage_end ELSE macro_series.coverage_end END`
  ).bind(
    definition.seriesId,
    definition.title,
    definition.category,
    definition.sourceAgency,
    definition.sourceSeries,
    sourceUrl,
    definition.sourcePageUrl,
    definition.rightsUrl,
    definition.rightsNote,
    definition.cadence,
    definition.units,
    definition.transform,
    definition.seasonalAdjustment,
    retrievedAt,
    observedThrough,
    coverageStart,
    coverageEnd
  );
}

function observationStatements(
  db: D1Database,
  seriesId: string,
  observations: MacroObservation[],
  retrievedAt: string
): D1PreparedStatement[] {
  const columnsPerRow = 4;
  const rowsPerStatement = Math.floor(MAX_D1_PARAMETERS / columnsPerRow);
  const statements: D1PreparedStatement[] = [];
  for (let start = 0; start < observations.length; start += rowsPerStatement) {
    const group = observations.slice(start, start + rowsPerStatement);
    const placeholders = group.map(() => '(?, ?, ?, ?)').join(', ');
    const values = group.flatMap((observation) => [
      seriesId,
      observation.date,
      observation.value,
      retrievedAt
    ]);
    statements.push(
      db.prepare(
        `INSERT INTO macro_observations (series_id, date, value, retrieved_at)
         VALUES ${placeholders}
         ON CONFLICT(series_id, date) DO UPDATE SET
           value=excluded.value, retrieved_at=excluded.retrieved_at`
      ).bind(...values)
    );
  }
  return statements;
}

async function recordFailure(
  db: D1Database,
  seriesId: string,
  year: number,
  at: string,
  message: string
): Promise<void> {
  const boundedMessage = message.slice(0, 300);
  await db.prepare(
    `INSERT INTO macro_sync_state (
       series_id, status, cursor_year, attempts, last_attempt_at, last_success_at, last_error
     ) VALUES (?, 'failed', ?, 1, ?, NULL, ?)
     ON CONFLICT(series_id) DO UPDATE SET
       status='failed', cursor_year=excluded.cursor_year,
       attempts=macro_sync_state.attempts + 1,
       last_attempt_at=excluded.last_attempt_at, last_error=excluded.last_error`
  ).bind(seriesId, year, at, boundedMessage).run();
}

export async function syncMacroSeries(
  db: D1Database,
  seriesIdRaw: string,
  options: {
    fetcher?: typeof fetch;
    now?: Date;
    sourcePayload?: unknown;
    sourceRange?: Pick<MacroSyncRange, 'startYear' | 'endYear'>;
    sourceTransport?: UploadedMacroTransport;
  } = {}
): Promise<MacroSyncResult> {
  const seriesId = seriesIdRaw.trim().toUpperCase();
  const definition = MACRO_SERIES_BY_ID.get(seriesId);
  if (!definition) throw new MacroSyncError('Unknown direct-source macro series', seriesId);

  const now = options.now ?? new Date();
  const retrievedAt = now.toISOString();
  const currentYear = latestExpectedSourceYear(definition.cadence, now);
  const state = await queryOne<SyncStateRow>(
    db,
    `SELECT status, cursor_year, attempts FROM macro_sync_state WHERE series_id = ?`,
    [seriesId]
  );
  const priorCoverage = await queryOne<CoverageRow>(
    db,
    `SELECT coverage_start, coverage_end, observed_through
     FROM macro_series WHERE series_id = ?`,
    [seriesId]
  );
  const year = chooseSyncYear(definition.sourceStartDate, currentYear, state, priorCoverage);
  const syncRange = chooseSyncRange(definition, currentYear, state, priorCoverage);

  try {
    const sourceUrl = resolveMacroSourceUrl(definition, options.sourceTransport);
    if (options.sourceTransport !== undefined && options.sourcePayload === undefined) {
      throw new Error('A BLS source transport requires an uploaded source payload');
    }
    const observations = definition.seriesId === 'BLS_CPI_YOY'
      ? await deriveStoredCpiYoY(db, syncRange.startYear, syncRange.endYear)
      : options.sourcePayload !== undefined
        ? parseUploadedMacroSource(
            definition,
            syncRange,
            options.sourcePayload,
            options.sourceRange,
            options.sourceTransport
          )
      : await fetchMacroRange(
          definition,
          syncRange.startYear,
          syncRange.endYear,
          options.fetcher
        );
    validateObservations(
      observations,
      syncRange.startYear,
      syncRange.endYear,
      definition.sourceStartDate
    );
    const range = sqlDateRange(syncRange.startYear, syncRange.endYear);
    const observedThrough = observations[observations.length - 1].date;
    const coverageStart = observations[0].date;
    const coverageEnd = observedThrough;
    const expectedCoverage = expectedCoverageAfterSlice(priorCoverage, observations);
    const done = expectedCoverage.coverage_start <= definition.sourceStartDate
      && Number(expectedCoverage.coverage_end.slice(0, 4)) >= currentYear;

    // Every fetched slice is an authoritative full cadence window. Deleting
    // that year before the compact upsert reconciles source revisions and
    // withdrawals without inventing weekend or holiday observations.
    const statements: D1PreparedStatement[] = [
      db.prepare(
        `DELETE FROM macro_observations
         WHERE series_id = ? AND date >= ? AND date <= ?`
      ).bind(seriesId, range.start, range.end),
      // Create the parent row before the first observation. The provisional
      // coverage is replaced from stored rows later in this same batch.
      seriesMetadataStatement(
        db,
        definition,
        sourceUrl,
        retrievedAt,
        coverageStart,
        coverageEnd,
        observedThrough
      ),
      ...observationStatements(db, seriesId, observations, retrievedAt),
      db.prepare(
        `UPDATE macro_series
         SET retrieved_at = ?,
             observed_through = (
               SELECT MAX(date) FROM macro_observations WHERE series_id = ?
             ),
             coverage_start = (
               SELECT MIN(date) FROM macro_observations WHERE series_id = ?
             ),
             coverage_end = (
               SELECT MAX(date) FROM macro_observations WHERE series_id = ?
             )
         WHERE series_id = ?`
      ).bind(retrievedAt, seriesId, seriesId, seriesId, seriesId),
      db.prepare(
        `INSERT INTO macro_sync_state (
           series_id, status, cursor_year, attempts, last_attempt_at, last_success_at, last_error
         ) VALUES (?, ?, ?, 1, ?, ?, NULL)
         ON CONFLICT(series_id) DO UPDATE SET
           status=excluded.status, cursor_year=excluded.cursor_year,
           attempts=macro_sync_state.attempts + 1,
           last_attempt_at=excluded.last_attempt_at,
           last_success_at=excluded.last_success_at, last_error=NULL`
      ).bind(seriesId, done ? 'success' : 'partial', syncRange.cursorYear, retrievedAt, retrievedAt)
    ];
    await db.batch(statements);

    const storedCoverage = await queryOne<CoverageRow>(
      db,
      `SELECT coverage_start, coverage_end, observed_through
       FROM macro_series
       WHERE series_id = ?`,
      [seriesId]
    );
    if (!storedCoverage?.coverage_start || !storedCoverage.coverage_end || !storedCoverage.observed_through) {
      throw new Error('Stored macro coverage could not be reconciled');
    }

    return {
      series_id: seriesId,
      source_agency: definition.sourceAgency,
      source_url: sourceUrl,
      cursor_year: syncRange.cursorYear,
      observations: observations.length,
      statements: statements.length,
      coverage_start: storedCoverage.coverage_start,
      coverage_end: storedCoverage.coverage_end,
      observed_through: storedCoverage.observed_through,
      retrieved_at: retrievedAt,
      done
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown source failure';
    try {
      await recordFailure(db, seriesId, year, retrievedAt, message);
    } catch (stateError) {
      console.error('Failed to record macro sync failure:', stateError);
    }
    throw new MacroSyncError(`${definition.sourceAgency}: ${message}`, seriesId, syncRange);
  }
}
