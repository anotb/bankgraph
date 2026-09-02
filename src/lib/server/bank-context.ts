import { queryAll, queryOne } from '$lib/server/db';
import { classifyStructuralEvent, normalizeHistoryDate, type StructuralEvent } from './analytics/structural-history';

export interface BankContext {
  cert: number;
  footprint: Array<{
    year: number;
    branches: number;
    mainOffices: number;
    states: number;
    counties: number;
    deposits: number;
    source: { objectSha256: string; manifestKey: string; retrievedAt: string };
  }>;
  markets: Array<{ countyFips: string; county: string; state: string; branches: number; bankDeposits: number; marketDeposits: number; depositShare: number | null; competingBanks: number }>;
  structuralHistory: StructuralEvent[];
  industry: Array<{
    year: number;
    assets: number;
    deposits: number;
    loans: number;
    banks: number;
    branches: number;
    employees: number;
    sources: Array<{
      charterType: 'CB' | 'SI';
      sourceRunId: string;
      sourceRetrievedAt: string | null;
      publishedAt: string;
    }>;
  }>;
  coverage: { sodYear: number | null; sodRetrievedAt: string | null; annualFrom: number | null; annualTo: number | null; historyRetrievedAt: string | null; historyProcessYearFrom: number | null; historyProcessYearTo: number | null; historyPartitions: number };
  provenance: {
    source: 'FDIC BankFind Suite';
    sourceUrl: 'https://api.fdic.gov/banks/docs/';
    monetaryUnit: 'usd_thousands';
    footprintGrain: 'institution_year';
    marketGrain: 'county_current_sod';
    industryGrain: 'usa_year';
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

interface FootprintRow { year: number; branch_count: number; main_office_count: number; state_count: number; county_count: number; total_deposits: number; object_sha256: string; manifest_key: string; retrieved_at: string }
interface MarketRow { cntynumb: number; cntynamb: string | null; stalpbr: string; branch_count: number; bank_deposits: number; market_deposits: number; competing_banks: number }
interface AnnualRow { year: number; charter_type: 'CB' | 'SI'; assets: number; deposits: number; loans: number; banks: number; branches: number; employees: number; source_run_id: string; source_retrieved_at: string | null; published_at: string }
interface HistoryRow { id: string; event_date: string | null; change_code: number | null; change_desc: string | null; org_role: string | null; inst_name: string | null; source_retrieved_at: string | null }
interface HistoryCoverageRow { year_from: number | null; year_to: number | null; partitions: number }
interface SodCurrentRow { year: number; object_sha256: string; manifest_key: string; lake_retrieved_at: string; source_run_id: string; source_retrieved_at: string; published_at: string }

const STATE_FIPS_BY_USPS: Readonly<Record<string, string>> = {
  AL: '01', AK: '02', AZ: '04', AR: '05', CA: '06', CO: '08', CT: '09', DE: '10',
  DC: '11', FL: '12', GA: '13', HI: '15', ID: '16', IL: '17', IN: '18', IA: '19',
  KS: '20', KY: '21', LA: '22', ME: '23', MD: '24', MA: '25', MI: '26', MN: '27',
  MS: '28', MO: '29', MT: '30', NE: '31', NV: '32', NH: '33', NJ: '34', NM: '35',
  NY: '36', NC: '37', ND: '38', OH: '39', OK: '40', OR: '41', PA: '42', RI: '44',
  SC: '45', SD: '46', TN: '47', TX: '48', UT: '49', VT: '50', VA: '51', WA: '53',
  WV: '54', WI: '55', WY: '56', AS: '60', FM: '64', GU: '66', MH: '68', MP: '69',
  PW: '70', PR: '72', VI: '78'
};

function countyFips(state: string, countyCode: number): string {
  const normalizedState = state.trim().toUpperCase();
  const stateFips = STATE_FIPS_BY_USPS[normalizedState];
  const county = String(Math.trunc(countyCode)).padStart(3, '0');
  return stateFips ? `${stateFips}${county}` : `${normalizedState}-${county}`;
}

export async function getBankContext(
  db: D1Database,
  cert: number,
  publicationGeneration: string | null = null
): Promise<BankContext | null> {
  const bank = await queryOne<{ cert: number }>(db, 'SELECT cert FROM published_institutions WHERE cert = ?', [cert]);
  if (!bank) return null;

  const [footprintRows, marketRows, annualRows, historyRows, historyCoverageRows, sodCurrent] = await Promise.all([
    queryAll<FootprintRow>(db, `
      SELECT aggregate.year, aggregate.branch_count, aggregate.main_office_count,
             aggregate.state_count, aggregate.county_count, aggregate.total_deposits,
             lake.object_sha256, lake.manifest_key, lake.retrieved_at
        FROM sod_bank_year aggregate
        JOIN fdic_lake_partitions lake
          ON lake.dataset = 'sod'
         AND lake.partition_key = CAST(aggregate.year AS TEXT)
         AND lake.object_sha256 = aggregate.source_sha256
       WHERE aggregate.cert = ?
       ORDER BY aggregate.year ASC
       LIMIT 50`, [cert]),
    queryAll<MarketRow>(db, `
      WITH bank_markets AS (
        SELECT stalpbr, cntynumb, MAX(cntynamb) AS cntynamb,
               COUNT(*) AS branch_count, SUM(COALESCE(depsumbr, 0)) AS bank_deposits
          FROM sod_latest_branches
         WHERE cert = ? AND cntynumb IS NOT NULL
         GROUP BY stalpbr, cntynumb
         ORDER BY bank_deposits DESC
         LIMIT 8
      ), market_totals AS (
        SELECT branch.stalpbr, branch.cntynumb,
               SUM(COALESCE(branch.depsumbr, 0)) AS market_deposits,
               COUNT(DISTINCT branch.cert) AS competing_banks
          FROM sod_latest_branches branch
          JOIN bank_markets bank
            ON bank.stalpbr = branch.stalpbr
           AND bank.cntynumb = branch.cntynumb
         GROUP BY branch.stalpbr, branch.cntynumb
      )
      SELECT bank.cntynumb, bank.cntynamb, bank.stalpbr, bank.branch_count,
             bank.bank_deposits, total.market_deposits, total.competing_banks
        FROM bank_markets bank
        JOIN market_totals total
          ON total.stalpbr = bank.stalpbr
         AND total.cntynumb = bank.cntynumb
       ORDER BY bank.bank_deposits DESC, bank.stalpbr ASC, bank.cntynumb ASC`, [cert]),
    queryAll<AnnualRow>(db, `
      SELECT summary.year, summary.charter_type,
             COALESCE(summary.asset, 0) AS assets,
             COALESCE(summary.dep, 0) AS deposits,
             COALESCE(summary.lnlsnet, 0) AS loans,
             COALESCE(summary.banks, 0) AS banks,
             COALESCE(summary.branches, 0) AS branches,
             COALESCE(summary.numemp, 0) AS employees,
             summary.source_run_id, summary.source_retrieved_at,
             publication.published_at
        FROM annual_summary summary
        JOIN fdic_dataset_publications publication
          ON publication.dataset = 'annual-summary'
         AND publication.partition_key = CAST(summary.year AS TEXT) || ':' || summary.charter_type
         AND publication.run_id = summary.source_run_id
       WHERE summary.stalp = 'USA'
       ORDER BY summary.year ASC, summary.charter_type ASC
       LIMIT 300`),
    queryAll<HistoryRow>(db, `
      SELECT event.id, event.event_date, event.change_code, event.change_desc,
             event.org_role, event.inst_name, event.source_retrieved_at
       FROM history_events event
        JOIN fdic_dataset_publications publication
          ON publication.dataset = 'history'
         AND publication.partition_key = CAST(event.proc_year AS TEXT)
         AND publication.run_id = event.source_run_id
       WHERE event.cert = ?
         AND UPPER(COALESCE(event.org_role, '')) NOT IN ('BR', 'BRANCH')
         AND (UPPER(COALESCE(event.change_desc, '')) LIKE '%MERG%'
           OR UPPER(COALESCE(event.change_desc, '')) LIKE '%ACQUI%'
           OR UPPER(COALESCE(event.change_desc, '')) LIKE '%CLOS%'
           OR UPPER(COALESCE(event.change_desc, '')) LIKE '%FAIL%'
           OR UPPER(COALESCE(event.change_desc, '')) LIKE '%TERMINAT%'
           OR UPPER(COALESCE(event.change_desc, '')) LIKE '%CHARTER%'
           OR UPPER(COALESCE(event.change_desc, '')) LIKE '%CONVERT%')
       ORDER BY event.eff_year DESC, event.event_date DESC, event.id DESC
       LIMIT 100`, [cert]),
    queryAll<HistoryCoverageRow>(db, `
      SELECT MIN(CAST(partition_key AS INTEGER)) AS year_from,
             MAX(CAST(partition_key AS INTEGER)) AS year_to,
             COUNT(*) AS partitions
        FROM fdic_dataset_publications
       WHERE dataset = 'history'`),
    queryOne<SodCurrentRow>(db, `
      SELECT CAST(lake.partition_key AS INTEGER) AS year,
             lake.object_sha256, lake.manifest_key,
             lake.retrieved_at AS lake_retrieved_at,
             publication.run_id AS source_run_id,
             publication.retrieved_at AS source_retrieved_at,
             publication.published_at
        FROM fdic_lake_partitions lake
        JOIN fdic_dataset_publications publication
          ON publication.dataset = 'sod'
         AND publication.partition_key = lake.partition_key
       WHERE lake.dataset = 'sod' AND lake.is_current_snapshot = 1
       LIMIT 1`)
  ]);

  const structuralHistory = historyRows.flatMap((row) => {
    const date = normalizeHistoryDate(row.event_date);
    const category = classifyStructuralEvent(row.change_desc, row.org_role);
    return date && category ? [{ id: row.id, date, category, description: row.change_desc?.trim() || 'FDIC structural history event', institutionName: row.inst_name, organizationRole: row.org_role, changeCode: row.change_code }] : [];
  }).slice(0, 20);
  const footprint = footprintRows.map((row) => ({
    year: row.year,
    branches: row.branch_count,
    mainOffices: row.main_office_count,
    states: row.state_count,
    counties: row.county_count,
    deposits: row.total_deposits,
    source: {
      objectSha256: row.object_sha256,
      manifestKey: row.manifest_key,
      retrievedAt: row.retrieved_at
    }
  }));
  const markets = marketRows.map((row) => ({
    countyFips: countyFips(row.stalpbr, row.cntynumb), county: row.cntynamb || 'County not reported', state: row.stalpbr,
    branches: row.branch_count, bankDeposits: row.bank_deposits, marketDeposits: row.market_deposits,
    depositShare: row.market_deposits > 0 ? 100 * row.bank_deposits / row.market_deposits : null,
    competingBanks: row.competing_banks
  }));
  const industryByYear = new Map<number, BankContext['industry'][number]>();
  for (const row of annualRows) {
    const item = industryByYear.get(row.year) ?? {
      year: row.year, assets: 0, deposits: 0, loans: 0, banks: 0, branches: 0, employees: 0, sources: []
    };
    item.assets += row.assets;
    item.deposits += row.deposits;
    item.loans += row.loans;
    item.banks += row.banks;
    item.branches += row.branches;
    item.employees += row.employees;
    item.sources.push({
      charterType: row.charter_type,
      sourceRunId: row.source_run_id,
      sourceRetrievedAt: row.source_retrieved_at,
      publishedAt: row.published_at
    });
    industryByYear.set(row.year, item);
  }
  const industry = [...industryByYear.values()]
    .filter((item) => item.sources.some((source) => source.charterType === 'CB') && item.sources.some((source) => source.charterType === 'SI'))
    .sort((a, b) => a.year - b.year);
  const sodLatest = footprintRows.at(-1) ?? null;
  const historyCoverage = historyCoverageRows[0] ?? { year_from: null, year_to: null, partitions: 0 };
  return {
    cert, footprint, markets, structuralHistory, industry,
    coverage: {
      sodYear: sodLatest?.year ?? null, sodRetrievedAt: sodLatest?.retrieved_at ?? null,
      annualFrom: industry.at(0)?.year ?? null, annualTo: industry.at(-1)?.year ?? null,
      historyRetrievedAt: historyRows.reduce<string | null>((latest, row) => row.source_retrieved_at && (!latest || row.source_retrieved_at > latest) ? row.source_retrieved_at : latest, null),
      historyProcessYearFrom: historyCoverage.year_from,
      historyProcessYearTo: historyCoverage.year_to,
      historyPartitions: historyCoverage.partitions
    },
    provenance: {
      source: 'FDIC BankFind Suite', sourceUrl: 'https://api.fdic.gov/banks/docs/',
      monetaryUnit: 'usd_thousands', footprintGrain: 'institution_year',
      marketGrain: 'county_current_sod', industryGrain: 'usa_year',
      publicationGeneration,
      sodCurrent: sodCurrent ? {
        year: sodCurrent.year,
        objectSha256: sodCurrent.object_sha256,
        manifestKey: sodCurrent.manifest_key,
        lakeRetrievedAt: sodCurrent.lake_retrieved_at,
        sourceRunId: sodCurrent.source_run_id,
        sourceRetrievedAt: sodCurrent.source_retrieved_at,
        publishedAt: sodCurrent.published_at
      } : null
    }
  };
}
