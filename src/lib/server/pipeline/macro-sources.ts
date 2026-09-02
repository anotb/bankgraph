import { BLS_CPI_BULK_URL } from './bls-bulk';

export type MacroCadence = 'daily' | 'weekly' | 'monthly' | 'quarterly';
export type MacroProvider = 'treasury' | 'bls' | 'frb';

export interface MacroObservation {
  date: string;
  value: number;
}

export interface MacroSeriesDefinition {
  seriesId: string;
  title: string;
  category: 'rates' | 'labor' | 'prices' | 'banking';
  provider: MacroProvider;
  /** First observation exposed by the originating agency for this exact series/transform. */
  sourceStartDate: string;
  sourceAgency: string;
  sourceSeries: string;
  sourceUrl: string;
  sourcePageUrl: string;
  rightsUrl: string;
  rightsNote: string;
  cadence: MacroCadence;
  units: string;
  transform: string;
  seasonalAdjustment: string;
  treasuryFields?: readonly string[];
  blsSeriesId?: string;
  frbRelease?: 'H15' | 'H8';
  frbSeriesHash?: string;
  frbSeriesCode?: string;
  frbExpectedDescription?: string;
}

const TREASURY_ENDPOINT =
  'https://home.treasury.gov/resource-center/data-chart-center/interest-rates/pages/xml';
const TREASURY_PAGE = 'https://home.treasury.gov/treasury-daily-interest-rate-xml-feed';
const TREASURY_RIGHTS = 'https://www.usa.gov/government-copyright';
const BLS_ENDPOINT = 'https://api.bls.gov/publicAPI/v2/timeseries/data/';
const BLS_PAGE = 'https://www.bls.gov/developers/api_signature_v2.htm';
const BLS_RIGHTS = 'https://www.bls.gov/developers/termsOfService.htm';
const FRB_PAGE = 'https://www.federalreserve.gov/datadownload/Choose.aspx?rel=H15';
const FRB_H8_PAGE = 'https://www.federalreserve.gov/releases/h8/about.htm';
const FRB_RIGHTS = 'https://www.federalreserve.gov/disclaimer.htm';
const FRB_FUNDS_HASH = '40afb80a445c5903ca2c4888e40f3f1f';
const FRB_H8_BANK_CONDITIONS_HASH = 'fce2318909bacbc8ce268096deddd180';

const TREASURY_RIGHTS_NOTE =
  'Treasury-produced federal data are attributed to the U.S. Department of the Treasury. The feed page has no separate data license; users should verify any material identified as third-party.';
const BLS_RIGHTS_NOTE =
  'BLS material is public domain except identified third-party images. Retrieved data must include the access date and the statement that BLS cannot vouch for data or analyses after retrieval.';
const FRB_RIGHTS_NOTE =
  'Unless otherwise indicated, Board website information is public domain and may be copied with attribution; identified non-Board material has separate rights.';

function treasurySourceUrl(): string {
  return `${TREASURY_ENDPOINT}?data=daily_treasury_yield_curve&field_tdr_date_value=all`;
}

function frbSourceUrl(release: 'H15' | 'H8', seriesHash: string): string {
  const url = new URL('https://www.federalreserve.gov/datadownload/Output.aspx');
  url.searchParams.set('rel', release);
  url.searchParams.set('series', seriesHash);
  url.searchParams.set('filetype', 'csv');
  url.searchParams.set('label', 'include');
  url.searchParams.set('layout', 'seriescolumn');
  return url.toString();
}

export function frbRangeSourceUrl(
  definition: Pick<MacroSeriesDefinition, 'provider' | 'frbRelease' | 'frbSeriesHash'>,
  startYear: number,
  endYear: number
): string {
  if (
    definition.provider !== 'frb'
    || !definition.frbRelease
    || !definition.frbSeriesHash
    || !Number.isInteger(startYear)
    || !Number.isInteger(endYear)
    || endYear < startYear
    || endYear - startYear + 1 > 10
  ) {
    throw new MacroSourceError('Federal Reserve source range is invalid');
  }
  const url = new URL('https://www.federalreserve.gov/datadownload/Output.aspx');
  url.searchParams.set('rel', definition.frbRelease);
  url.searchParams.set('series', definition.frbSeriesHash);
  url.searchParams.set('from', `01/01/${startYear}`);
  url.searchParams.set('to', `12/31/${endYear}`);
  url.searchParams.set('filetype', 'csv');
  url.searchParams.set('label', 'include');
  url.searchParams.set('layout', 'seriescolumn');
  return url.toString();
}

export const MACRO_SERIES = [
  {
    seriesId: 'UST10Y',
    title: '10-Year Treasury Par Yield',
    category: 'rates',
    provider: 'treasury',
    sourceStartDate: '1990-01-02',
    sourceAgency: 'U.S. Department of the Treasury',
    sourceSeries: 'Daily Treasury Par Yield Curve Rates / BC_10YEAR',
    sourceUrl: treasurySourceUrl(),
    sourcePageUrl: TREASURY_PAGE,
    rightsUrl: TREASURY_RIGHTS,
    rightsNote: TREASURY_RIGHTS_NOTE,
    cadence: 'daily',
    units: 'Percent per year',
    transform: 'Identity; published 10-year par yield',
    seasonalAdjustment: 'Not applicable',
    treasuryFields: ['BC_10YEAR']
  },
  {
    seriesId: 'UST2Y',
    title: '2-Year Treasury Par Yield',
    category: 'rates',
    provider: 'treasury',
    sourceStartDate: '1990-01-02',
    sourceAgency: 'U.S. Department of the Treasury',
    sourceSeries: 'Daily Treasury Par Yield Curve Rates / BC_2YEAR',
    sourceUrl: treasurySourceUrl(),
    sourcePageUrl: TREASURY_PAGE,
    rightsUrl: TREASURY_RIGHTS,
    rightsNote: TREASURY_RIGHTS_NOTE,
    cadence: 'daily',
    units: 'Percent per year',
    transform: 'Identity; published 2-year par yield',
    seasonalAdjustment: 'Not applicable',
    treasuryFields: ['BC_2YEAR']
  },
  {
    seriesId: 'UST10Y2Y',
    title: '10-Year Minus 2-Year Treasury Yield Spread',
    category: 'rates',
    provider: 'treasury',
    sourceStartDate: '1990-01-02',
    sourceAgency: 'U.S. Department of the Treasury',
    sourceSeries: 'Daily Treasury Par Yield Curve Rates / BC_10YEAR and BC_2YEAR',
    sourceUrl: treasurySourceUrl(),
    sourcePageUrl: TREASURY_PAGE,
    rightsUrl: TREASURY_RIGHTS,
    rightsNote: TREASURY_RIGHTS_NOTE,
    cadence: 'daily',
    units: 'Percentage points',
    transform: 'BC_10YEAR minus BC_2YEAR on the same observation date',
    seasonalAdjustment: 'Not applicable',
    treasuryFields: ['BC_10YEAR', 'BC_2YEAR']
  },
  {
    seriesId: 'BLS_UNRATE',
    title: 'Civilian Unemployment Rate',
    category: 'labor',
    provider: 'bls',
    sourceStartDate: '1948-01-01',
    sourceAgency: 'U.S. Bureau of Labor Statistics',
    sourceSeries: 'LNS14000000',
    sourceUrl: BLS_ENDPOINT,
    sourcePageUrl: BLS_PAGE,
    rightsUrl: BLS_RIGHTS,
    rightsNote: BLS_RIGHTS_NOTE,
    cadence: 'monthly',
    units: 'Percent',
    transform: 'Identity; month represented as the first calendar day',
    seasonalAdjustment: 'Seasonally adjusted',
    blsSeriesId: 'LNS14000000'
  },
  {
    seriesId: 'BLS_CPI_U',
    title: 'Consumer Price Index for All Urban Consumers',
    category: 'prices',
    provider: 'bls',
    sourceStartDate: '1913-01-01',
    sourceAgency: 'U.S. Bureau of Labor Statistics',
    sourceSeries: 'CUUR0000SA0',
    sourceUrl: BLS_CPI_BULK_URL,
    sourcePageUrl: 'https://www.bls.gov/cpi/factsheets/cpi-series-ids.htm',
    rightsUrl: BLS_RIGHTS,
    rightsNote: BLS_RIGHTS_NOTE,
    cadence: 'monthly',
    units: 'Index, 1982-84=100',
    transform: 'Identity; month represented as the first calendar day',
    seasonalAdjustment: 'Not seasonally adjusted',
    blsSeriesId: 'CUUR0000SA0'
  },
  {
    seriesId: 'BLS_CPI_YOY',
    title: 'CPI-U Inflation, 12-Month Change',
    category: 'prices',
    provider: 'bls',
    sourceStartDate: '1914-01-01',
    sourceAgency: 'U.S. Bureau of Labor Statistics',
    sourceSeries: 'CUUR0000SA0',
    sourceUrl: BLS_CPI_BULK_URL,
    sourcePageUrl: 'https://www.bls.gov/cpi/factsheets/cpi-series-ids.htm',
    rightsUrl: BLS_RIGHTS,
    rightsNote: BLS_RIGHTS_NOTE,
    cadence: 'monthly',
    units: 'Percent change from 12 months earlier',
    transform: '100 × (CPI-U[t] / CPI-U[t-12] − 1), using the not-seasonally-adjusted index',
    seasonalAdjustment: 'Derived from not seasonally adjusted CPI-U',
    blsSeriesId: 'CUUR0000SA0'
  },
  {
    seriesId: 'FRB_FEDFUNDS',
    title: 'Federal Funds Effective Rate, Monthly Average',
    category: 'rates',
    provider: 'frb',
    sourceStartDate: '1954-07-01',
    sourceAgency: 'Board of Governors of the Federal Reserve System',
    sourceSeries: 'H15/H15/RIFSPFF_N.M',
    sourceUrl: frbSourceUrl('H15', FRB_FUNDS_HASH),
    sourcePageUrl: FRB_PAGE,
    rightsUrl: FRB_RIGHTS,
    rightsNote: FRB_RIGHTS_NOTE,
    cadence: 'monthly',
    units: 'Percent per year',
    transform: 'Identity; monthly average represented as the first calendar day',
    seasonalAdjustment: 'Not seasonally adjusted',
    frbRelease: 'H15',
    frbSeriesHash: FRB_FUNDS_HASH,
    frbSeriesCode: 'RIFSPFF_N.M'
  },
  {
    seriesId: 'FRB_H8_BANK_CREDIT',
    title: 'Bank Credit, All Commercial Banks',
    category: 'banking',
    provider: 'frb',
    sourceStartDate: '1973-01-03',
    sourceAgency: 'Board of Governors of the Federal Reserve System',
    sourceSeries: 'H8/H8/B1001NCBA',
    sourceUrl: frbSourceUrl('H8', FRB_H8_BANK_CONDITIONS_HASH),
    sourcePageUrl: FRB_H8_PAGE,
    rightsUrl: FRB_RIGHTS,
    rightsNote: FRB_RIGHTS_NOTE,
    cadence: 'weekly',
    units: 'Millions of U.S. dollars',
    transform: 'Identity; estimated Wednesday level',
    seasonalAdjustment: 'Seasonally adjusted',
    frbRelease: 'H8',
    frbSeriesHash: FRB_H8_BANK_CONDITIONS_HASH,
    frbSeriesCode: 'B1001NCBA',
    frbExpectedDescription: 'Bank credit, all commercial banks, seasonally adjusted'
  },
  {
    seriesId: 'FRB_H8_LOANS_LEASES',
    title: 'Loans and Leases in Bank Credit, All Commercial Banks',
    category: 'banking',
    provider: 'frb',
    sourceStartDate: '1973-01-03',
    sourceAgency: 'Board of Governors of the Federal Reserve System',
    sourceSeries: 'H8/H8/B1020NCBA',
    sourceUrl: frbSourceUrl('H8', FRB_H8_BANK_CONDITIONS_HASH),
    sourcePageUrl: FRB_H8_PAGE,
    rightsUrl: FRB_RIGHTS,
    rightsNote: FRB_RIGHTS_NOTE,
    cadence: 'weekly',
    units: 'Millions of U.S. dollars',
    transform: 'Identity; estimated Wednesday level',
    seasonalAdjustment: 'Seasonally adjusted',
    frbRelease: 'H8',
    frbSeriesHash: FRB_H8_BANK_CONDITIONS_HASH,
    frbSeriesCode: 'B1020NCBA',
    frbExpectedDescription: 'Loans and leases in bank credit, all commercial banks, seasonally adjusted'
  },
  {
    seriesId: 'FRB_H8_CI_LOANS',
    title: 'Commercial and Industrial Loans, All Commercial Banks',
    category: 'banking',
    provider: 'frb',
    sourceStartDate: '1973-01-03',
    sourceAgency: 'Board of Governors of the Federal Reserve System',
    sourceSeries: 'H8/H8/B1023NCBA',
    sourceUrl: frbSourceUrl('H8', FRB_H8_BANK_CONDITIONS_HASH),
    sourcePageUrl: FRB_H8_PAGE,
    rightsUrl: FRB_RIGHTS,
    rightsNote: FRB_RIGHTS_NOTE,
    cadence: 'weekly',
    units: 'Millions of U.S. dollars',
    transform: 'Identity; estimated Wednesday level',
    seasonalAdjustment: 'Seasonally adjusted',
    frbRelease: 'H8',
    frbSeriesHash: FRB_H8_BANK_CONDITIONS_HASH,
    frbSeriesCode: 'B1023NCBA',
    frbExpectedDescription: 'Commercial and industrial loans, all commercial banks, seasonally adjusted'
  },
  {
    seriesId: 'FRB_H8_REAL_ESTATE',
    title: 'Real Estate Loans, All Commercial Banks',
    category: 'banking',
    provider: 'frb',
    sourceStartDate: '1973-01-03',
    sourceAgency: 'Board of Governors of the Federal Reserve System',
    sourceSeries: 'H8/H8/B1026NCBA',
    sourceUrl: frbSourceUrl('H8', FRB_H8_BANK_CONDITIONS_HASH),
    sourcePageUrl: FRB_H8_PAGE,
    rightsUrl: FRB_RIGHTS,
    rightsNote: FRB_RIGHTS_NOTE,
    cadence: 'weekly',
    units: 'Millions of U.S. dollars',
    transform: 'Identity; estimated Wednesday level',
    seasonalAdjustment: 'Seasonally adjusted',
    frbRelease: 'H8',
    frbSeriesHash: FRB_H8_BANK_CONDITIONS_HASH,
    frbSeriesCode: 'B1026NCBA',
    frbExpectedDescription: 'Real estate loans, all commercial banks, seasonally adjusted'
  },
  {
    seriesId: 'FRB_H8_CRE',
    title: 'Commercial Real Estate Loans, All Commercial Banks',
    category: 'banking',
    provider: 'frb',
    sourceStartDate: '2004-06-02',
    sourceAgency: 'Board of Governors of the Federal Reserve System',
    sourceSeries: 'H8/H8/B3219NCBA',
    sourceUrl: frbSourceUrl('H8', FRB_H8_BANK_CONDITIONS_HASH),
    sourcePageUrl: FRB_H8_PAGE,
    rightsUrl: FRB_RIGHTS,
    rightsNote: FRB_RIGHTS_NOTE,
    cadence: 'weekly',
    units: 'Millions of U.S. dollars',
    transform: 'Identity; estimated Wednesday level',
    seasonalAdjustment: 'Seasonally adjusted',
    frbRelease: 'H8',
    frbSeriesHash: FRB_H8_BANK_CONDITIONS_HASH,
    frbSeriesCode: 'B3219NCBA',
    frbExpectedDescription: 'Real estate loans: Commercial real estate loans, all commercial banks, seasonally adjusted'
  },
  {
    seriesId: 'FRB_H8_CONSUMER',
    title: 'Consumer Loans, All Commercial Banks',
    category: 'banking',
    provider: 'frb',
    sourceStartDate: '1973-01-03',
    sourceAgency: 'Board of Governors of the Federal Reserve System',
    sourceSeries: 'H8/H8/B1029NCBA',
    sourceUrl: frbSourceUrl('H8', FRB_H8_BANK_CONDITIONS_HASH),
    sourcePageUrl: FRB_H8_PAGE,
    rightsUrl: FRB_RIGHTS,
    rightsNote: FRB_RIGHTS_NOTE,
    cadence: 'weekly',
    units: 'Millions of U.S. dollars',
    transform: 'Identity; estimated Wednesday level',
    seasonalAdjustment: 'Seasonally adjusted',
    frbRelease: 'H8',
    frbSeriesHash: FRB_H8_BANK_CONDITIONS_HASH,
    frbSeriesCode: 'B1029NCBA',
    frbExpectedDescription: 'Consumer loans, all commercial banks, seasonally adjusted'
  },
  {
    seriesId: 'FRB_H8_DEPOSITS',
    title: 'Deposits, All Commercial Banks',
    category: 'banking',
    provider: 'frb',
    sourceStartDate: '1973-01-03',
    sourceAgency: 'Board of Governors of the Federal Reserve System',
    sourceSeries: 'H8/H8/B1058NCBA',
    sourceUrl: frbSourceUrl('H8', FRB_H8_BANK_CONDITIONS_HASH),
    sourcePageUrl: FRB_H8_PAGE,
    rightsUrl: FRB_RIGHTS,
    rightsNote: FRB_RIGHTS_NOTE,
    cadence: 'weekly',
    units: 'Millions of U.S. dollars',
    transform: 'Identity; estimated Wednesday level',
    seasonalAdjustment: 'Seasonally adjusted',
    frbRelease: 'H8',
    frbSeriesHash: FRB_H8_BANK_CONDITIONS_HASH,
    frbSeriesCode: 'B1058NCBA',
    frbExpectedDescription: 'Deposits, all commercial banks, seasonally adjusted'
  }
] as const satisfies readonly MacroSeriesDefinition[];

export const MACRO_SERIES_BY_ID = new Map<string, MacroSeriesDefinition>(
  MACRO_SERIES.map((series) => [series.seriesId, series])
);

const MAX_RESPONSE_BYTES = 4_000_000;
const DATE_PREFIX = /^(\d{4}-\d{2}-\d{2})/;

export class MacroSourceError extends Error {
  constructor(
    message: string,
    public readonly status: number | null = null
  ) {
    super(message);
    this.name = 'MacroSourceError';
  }
}

function decodeXml(value: string): string {
  return value
    .replaceAll('&amp;', '&')
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&apos;', "'");
}

function xmlField(entry: string, name: string): string | null {
  const match = entry.match(new RegExp(`<d:${name}(?:\\s[^>]*)?>([^<]*)<\\/d:${name}>`, 'i'));
  return match ? decodeXml(match[1].trim()) : null;
}

export function parseTreasuryXml(
  xml: string,
  fields: readonly string[]
): MacroObservation[] {
  if (xml.length > MAX_RESPONSE_BYTES) throw new MacroSourceError('Treasury response exceeded 4 MB');
  const observations: MacroObservation[] = [];
  for (const entryMatch of xml.matchAll(/<entry\b[\s\S]*?<\/entry>/gi)) {
    const entry = entryMatch[0];
    const dateRaw = xmlField(entry, 'NEW_DATE');
    const date = dateRaw?.match(DATE_PREFIX)?.[1];
    if (!date) continue;
    const values = fields.map((field) => Number(xmlField(entry, field)));
    if (!values.every(Number.isFinite)) continue;
    const value = values.length === 1 ? values[0] : values[0] - values[1];
    observations.push({ date, value });
  }
  return observations.sort((a, b) => a.date.localeCompare(b.date));
}

interface BlsPayload {
  status?: unknown;
  message?: unknown;
  Results?: {
    series?: Array<{
      seriesID?: unknown;
      data?: Array<{ year?: unknown; period?: unknown; value?: unknown }>;
    }>;
  };
}

export function parseBlsJsonRange(
  payload: unknown,
  sourceSeries: string,
  targetStartYear: number,
  targetEndYear: number,
  inflationYoY: boolean
): MacroObservation[] {
  const root = payload as BlsPayload;
  if (root.status !== 'REQUEST_SUCCEEDED') throw new MacroSourceError('BLS request did not succeed');
  const messages = Array.isArray(root.message) ? root.message.filter((item) => String(item).trim()) : [];
  if (messages.length > 0) throw new MacroSourceError(`BLS returned a constrained result: ${messages.join('; ')}`);
  const series = root.Results?.series?.find((item) => item.seriesID === sourceSeries);
  if (!series || !Array.isArray(series.data)) throw new MacroSourceError(`BLS omitted series ${sourceSeries}`);

  const raw = new Map<string, number>();
  for (const row of series.data) {
    if (typeof row.year !== 'string' || typeof row.period !== 'string' || !/^M(0[1-9]|1[0-2])$/.test(row.period)) continue;
    const value = Number(row.value);
    if (!Number.isFinite(value)) continue;
    raw.set(`${row.year}-${row.period.slice(1)}-01`, value);
  }

  const result: MacroObservation[] = [];
  for (const [date, value] of raw) {
    const year = Number(date.slice(0, 4));
    if (year < targetStartYear || year > targetEndYear) continue;
    if (!inflationYoY) {
      result.push({ date, value });
      continue;
    }
    const current = new Date(`${date}T00:00:00Z`);
    current.setUTCFullYear(current.getUTCFullYear() - 1);
    const prior = raw.get(current.toISOString().slice(0, 10));
    if (prior !== undefined && prior !== 0) {
      result.push({ date, value: ((value / prior) - 1) * 100 });
    }
  }
  return result.sort((a, b) => a.date.localeCompare(b.date));
}

export function parseBlsJson(
  payload: unknown,
  sourceSeries: string,
  targetYear: number,
  inflationYoY: boolean
): MacroObservation[] {
  return parseBlsJsonRange(payload, sourceSeries, targetYear, targetYear, inflationYoY);
}

function parseCsvRow(line: string): string[] {
  const cells: string[] = [];
  let value = '';
  let quoted = false;
  for (let index = 0; index < line.length; index++) {
    const char = line[index];
    if (char === '"') {
      if (quoted && line[index + 1] === '"') {
        value += '"';
        index++;
      } else quoted = !quoted;
    } else if (char === ',' && !quoted) {
      cells.push(value);
      value = '';
    } else value += char;
  }
  cells.push(value);
  return cells;
}

export function parseFrbCsvRange(
  csv: string,
  startYear: number,
  endYear: number
): MacroObservation[] {
  if (csv.length > MAX_RESPONSE_BYTES) throw new MacroSourceError('Federal Reserve response exceeded 4 MB');
  const lines = csv.split(/\r?\n/).filter(Boolean);
  const headerIndex = lines.findIndex((line) => parseCsvRow(line)[0] === 'Time Period');
  if (headerIndex < 0) throw new MacroSourceError('Federal Reserve CSV header was not found');
  const header = parseCsvRow(lines[headerIndex]);
  if (header[1] !== 'RIFSPFF_N.M') throw new MacroSourceError('Federal Reserve CSV series did not match RIFSPFF_N.M');
  const observations: MacroObservation[] = [];
  for (const line of lines.slice(headerIndex + 1)) {
    const [period, rawValue] = parseCsvRow(line);
    const year = Number(period.slice(0, 4));
    if (!/^\d{4}-\d{2}$/.test(period) || year < startYear || year > endYear) continue;
    const value = Number(rawValue);
    if (Number.isFinite(value)) observations.push({ date: `${period}-01`, value });
  }
  return observations.sort((a, b) => a.date.localeCompare(b.date));
}

export function parseFrbCsv(csv: string, targetYear: number): MacroObservation[] {
  return parseFrbCsvRange(csv, targetYear, targetYear);
}

export function parseH8CsvRange(
  csv: string,
  startYear: number,
  endYear: number,
  expectedCode: string,
  expectedDescription: string
): MacroObservation[] {
  if (csv.length > MAX_RESPONSE_BYTES) throw new MacroSourceError('Federal Reserve H.8 response exceeded 4 MB');
  const lines = csv.split(/\r?\n/).filter(Boolean);
  const rows = lines.map(parseCsvRow);
  const headerIndex = rows.findIndex((row) => row[0] === 'Time Period');
  if (headerIndex < 0) throw new MacroSourceError('Federal Reserve H.8 CSV header was not found');
  const column = rows[headerIndex].indexOf(expectedCode);
  if (column < 1) throw new MacroSourceError(`Federal Reserve H.8 series did not match ${expectedCode}`);

  const metadata = (label: string): string[] => {
    const row = rows.find((item) => item[0].trim() === label);
    if (!row) throw new MacroSourceError(`Federal Reserve H.8 ${label} metadata was not found`);
    return row;
  };
  const description = metadata('Series Description')[column];
  const unit = metadata('Unit:')[column];
  const multiplier = metadata('Multiplier:')[column];
  const currency = metadata('Currency:')[column];
  const identifier = metadata('Unique Identifier:')[column];
  if (description !== expectedDescription) throw new MacroSourceError(`Federal Reserve H.8 description did not match ${expectedCode}`);
  if (unit !== 'Currency' || multiplier !== '1000000' || currency !== 'USD') {
    throw new MacroSourceError(`Federal Reserve H.8 units did not match millions of U.S. dollars for ${expectedCode}`);
  }
  if (identifier !== `H8/H8/${expectedCode}`) {
    throw new MacroSourceError(`Federal Reserve H.8 identifier did not match H8/H8/${expectedCode}`);
  }

  const observations: MacroObservation[] = [];
  for (const row of rows.slice(headerIndex + 1)) {
    const period = row[0];
    const year = Number(period.slice(0, 4));
    if (!/^\d{4}-\d{2}-\d{2}$/.test(period) || year < startYear || year > endYear) continue;
    const rawValue = row[column]?.trim();
    if (!rawValue) continue;
    const value = Number(rawValue);
    if (Number.isFinite(value)) observations.push({ date: period, value });
  }
  return observations.sort((a, b) => a.date.localeCompare(b.date));
}

export function parseH8Csv(
  csv: string,
  targetYear: number,
  expectedCode: string,
  expectedDescription: string
): MacroObservation[] {
  return parseH8CsvRange(csv, targetYear, targetYear, expectedCode, expectedDescription);
}

async function checkedText(response: Response, provider: string): Promise<string> {
  if (!response.ok) throw new MacroSourceError(`${provider} returned HTTP ${response.status}`, response.status);
  const contentLength = Number(response.headers.get('Content-Length') ?? 0);
  if (contentLength > MAX_RESPONSE_BYTES) throw new MacroSourceError(`${provider} response exceeded 4 MB`);
  const text = await response.text();
  if (text.length > MAX_RESPONSE_BYTES) throw new MacroSourceError(`${provider} response exceeded 4 MB`);
  return text;
}

export async function fetchMacroRange(
  definition: MacroSeriesDefinition,
  startYear: number,
  endYear: number,
  fetcher: typeof fetch = fetch
): Promise<MacroObservation[]> {
  if (!Number.isInteger(startYear) || !Number.isInteger(endYear) || endYear < startYear) {
    throw new MacroSourceError('Macro source range is invalid');
  }
  if (definition.provider === 'treasury' && startYear !== endYear) {
    throw new MacroSourceError(`${definition.sourceAgency} supports one bounded year per refresh`);
  }
  if (definition.provider === 'frb' && endYear - startYear + 1 > 10) {
    throw new MacroSourceError('Federal Reserve Board requests are limited to 10 years');
  }

  if (definition.provider === 'treasury') {
    const url = new URL(TREASURY_ENDPOINT);
    url.searchParams.set('data', 'daily_treasury_yield_curve');
    url.searchParams.set('field_tdr_date_value', String(startYear));
    const response = await fetcher(url, { headers: { Accept: 'application/xml' } });
    const text = await checkedText(response, 'Treasury');
    return parseTreasuryXml(text, definition.treasuryFields ?? []);
  }

  if (definition.provider === 'bls') {
    const requestStartYear = definition.seriesId === 'BLS_CPI_YOY' ? startYear - 1 : startYear;
    if (endYear - requestStartYear + 1 > 10) {
      throw new MacroSourceError('Unregistered BLS requests are limited to 10 years');
    }
    const response = await fetcher(BLS_ENDPOINT, {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        seriesid: [definition.blsSeriesId],
        startyear: String(requestStartYear),
        endyear: String(endYear)
      })
    });
    const text = await checkedText(response, 'BLS');
    let payload: unknown;
    try {
      payload = JSON.parse(text);
    } catch {
      throw new MacroSourceError('BLS returned invalid JSON');
    }
    return parseBlsJsonRange(
      payload,
      definition.blsSeriesId!,
      startYear,
      endYear,
      definition.seriesId === 'BLS_CPI_YOY'
    );
  }

  const release = definition.frbRelease ?? 'H15';
  const url = frbRangeSourceUrl(definition, startYear, endYear);
  const response = await fetcher(url, { headers: { Accept: 'text/csv' } });
  const text = await checkedText(response, 'Federal Reserve Board');
  if (release === 'H8') {
    return parseH8CsvRange(
      text,
      startYear,
      endYear,
      definition.frbSeriesCode!,
      definition.frbExpectedDescription!
    );
  }
  return parseFrbCsvRange(text, startYear, endYear);
}

export async function fetchMacroYear(
  definition: MacroSeriesDefinition,
  year: number,
  fetcher: typeof fetch = fetch
): Promise<MacroObservation[]> {
  return fetchMacroRange(definition, year, year, fetcher);
}
