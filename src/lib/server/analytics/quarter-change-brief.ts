import { queryAll, queryOne } from '$lib/server/db';
import type { AnalysisProvenance, Institution } from '$lib/types';
import {
  financialAnalysisProvenance,
  latestTimestamp,
  lineageHash
} from '$lib/provenance';
import {
  buildAssetBridge,
  buildFrozenPeerMovement,
  buildFundingBridge,
  buildQuarterlyNetIncomeBridge,
  decomposeLoanToDeposit,
  isConsecutiveQuarter,
  previousQuarterDate,
  type AdditiveBridge,
  type AttributionRow,
  type FrozenPeerMovement,
  type RatioAttribution
} from './change-attribution';
import { loadStructuralContext, type StructuralContext } from './structural-history';

interface QuarterFinancialRow extends AttributionRow {
  cert: number;
  repdte: string;
  asset_bucket: number | null;
  asset: number | null;
  dep: number | null;
  eq: number | null;
  lnlsnet: number | null;
  sec: number | null;
  chbal: number | null;
  frepo: number | null;
  trade: number | null;
  ore: number | null;
  bkprem: number | null;
  intan: number | null;
  oa: number | null;
  frepp: number | null;
  othbor: number | null;
  subnd: number | null;
  tradel: number | null;
  allothl: number | null;
  netinc: number | null;
  nim: number | null;
  nonii: number | null;
  nonix: number | null;
  elnatr: number | null;
  netincq: number | null;
  nimq: number | null;
  noniiq: number | null;
  nonixq: number | null;
  elnatq: number | null;
  iglsecq: number | null;
  itaxq: number | null;
  extraq: number | null;
  source_retrieved_at: string | null;
}

interface PeerQuarterPair {
  cert: number;
  asset_bucket: number | null;
  from_asset: number | null;
  to_asset: number | null;
  from_dep: number | null;
  to_dep: number | null;
  from_lnlsnet: number | null;
  to_lnlsnet: number | null;
  from_retrieved_at: string | null;
  to_retrieved_at: string | null;
}

export type QuarterChangeStatus =
  | 'ok'
  | 'missing_target_quarter'
  | 'missing_comparison_quarter'
  | 'nonconsecutive_periods';

export interface QuarterChangeBrief {
  cert: number;
  bank: Pick<Institution, 'name' | 'city' | 'state'>;
  comparison: {
    status: QuarterChangeStatus;
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
    assetGrowth: FrozenPeerMovement;
    depositGrowth: FrozenPeerMovement;
    loanGrowth: FrozenPeerMovement;
    loanToDepositChange: FrozenPeerMovement;
  } | null;
  structuralContext: StructuralContext | null;
  provenance: AnalysisProvenance & {
    source: 'FDIC BankFind Financials';
    sourceUrl: 'https://api.fdic.gov/banks/docs/';
    datasetGrain: 'institution_quarter';
    monetaryUnit: 'usd_thousands';
    cohortDefinition: 'opening_quarter_asset_bucket';
    calculationVersion: 'quarter-change-v1';
  };
}

export interface QuarterChangeBriefOptions {
  from?: string | null;
  to?: string | null;
  minimumPeerCount?: number;
  release?: string | null;
  releaseGeneration?: string | null;
}

const FINANCIAL_COLUMNS = [
  'cert', 'repdte', 'asset_bucket', 'asset', 'dep', 'eq', 'lnlsnet', 'sec',
  'chbal', 'frepo', 'trade', 'ore', 'bkprem', 'intan', 'oa',
  'frepp', 'othbor', 'subnd', 'tradel', 'allothl',
  'netinc', 'nim', 'nonii', 'nonix', 'elnatr',
  'netincq', 'nimq', 'noniiq', 'nonixq', 'elnatq', 'iglsecq', 'itaxq', 'extraq',
  'source_retrieved_at'
].join(', ');

const QUARTER_CHANGE_SOURCE_FIELDS = {
  total_assets: ['ASSET', 'CHBAL', 'FREPO', 'SEC', 'LNLSNET', 'TRADE', 'ORE', 'BKPREM', 'INTAN', 'OA'],
  funding_and_equity: ['ASSET', 'DEP', 'FREPP', 'OTHBOR', 'SUBND', 'TRADEL', 'ALLOTHL', 'EQ'],
  quarterly_net_income: ['NETINCQ', 'NETINC', 'NIMQ', 'NIM', 'NONIIQ', 'NONII', 'NONIXQ', 'NONIX', 'ELNATQ', 'ELNATR', 'IGLSECQ', 'ITAXQ', 'EXTRAQ'],
  loan_to_deposit: ['LNLSNET', 'DEP']
} as const;

const QUARTER_CHANGE_FORMULAS = {
  total_assets: 'Change in ASSET = sum of changes in reported asset components + residual',
  funding_and_equity: 'Change in ASSET = sum of changes in reported funding and equity components + residual',
  quarterly_net_income: 'Reported single-quarter fields; NETINC, NIM, NONII, NONIX, and ELNATR use exact consecutive year-to-date differences when a single-quarter field is unavailable',
  loan_to_deposit: '100 × LNLSNET / DEP; change decomposed with an exact two-factor Shapley identity'
} as const;

function quarterChangeProvenance(input: {
  sourceAsOf: string | null;
  retrievedAt: string | null;
  release?: string | null;
  releaseGeneration?: string | null;
  cohortHash?: string | null;
}): QuarterChangeBrief['provenance'] {
  return {
    ...financialAnalysisProvenance({
      metrics: [],
      sourceAsOf: input.sourceAsOf,
      retrievedAt: input.retrievedAt,
      release: input.release,
      releaseGeneration: input.releaseGeneration,
      cohortHash: input.cohortHash
    }),
    source: 'FDIC BankFind Financials',
    sourceUrl: 'https://api.fdic.gov/banks/docs/',
    datasetGrain: 'institution_quarter',
    monetaryUnit: 'usd_thousands',
    cohortDefinition: 'opening_quarter_asset_bucket',
    calculationVersion: 'quarter-change-v1',
    source_fields: Object.fromEntries(
      Object.entries(QUARTER_CHANGE_SOURCE_FIELDS).map(([key, fields]) => [key, [...fields]])
    ),
    formulas: { ...QUARTER_CHANGE_FORMULAS }
  };
}

function emptyBrief(
  cert: number,
  bank: Pick<Institution, 'name' | 'city' | 'state'>,
  status: Exclude<QuarterChangeStatus, 'ok'>,
  from: string | null,
  to: string | null,
  message: string,
  provenance: QuarterChangeBrief['provenance']
): QuarterChangeBrief {
  return {
    cert,
    bank,
    comparison: {
      status,
      from,
      to,
      isConsecutiveQuarter: from !== null && to !== null && isConsecutiveQuarter(from, to),
      message
    },
    bridges: null,
    peerContext: null,
    structuralContext: null,
    provenance
  };
}

function ratio(loans: number | null, deposits: number | null): number | null {
  if (loans === null || deposits === null || deposits === 0) return null;
  return 100 * loans / deposits;
}

async function findQuarter(
  db: D1Database,
  cert: number,
  repdte?: string | null
): Promise<QuarterFinancialRow | null> {
  if (repdte) {
    return queryOne<QuarterFinancialRow>(
      db,
      `SELECT ${FINANCIAL_COLUMNS} FROM published_financials WHERE cert = ? AND repdte = ?`,
      [cert, repdte]
    );
  }
  return queryOne<QuarterFinancialRow>(
    db,
    `SELECT ${FINANCIAL_COLUMNS} FROM published_financials WHERE cert = ? ORDER BY repdte DESC LIMIT 1`,
    [cert]
  );
}

/**
 * Build a quarter brief from the newest ingested quarter by default. The
 * comparison date is derived from that row, so reporting lag never causes a
 * silently stale or nonconsecutive comparison.
 */
export async function getQuarterChangeBrief(
  db: D1Database,
  cert: number,
  options: QuarterChangeBriefOptions = {}
): Promise<QuarterChangeBrief | null> {
  const bank = await queryOne<Pick<Institution, 'name' | 'city' | 'state'>>(
    db,
    'SELECT name, city, state FROM published_institutions WHERE cert = ?',
    [cert]
  );
  if (!bank) return null;

  const toRow = await findQuarter(db, cert, options.to);
  if (!toRow) {
    return emptyBrief(
      cert,
      bank,
      'missing_target_quarter',
      options.from ?? null,
      options.to ?? null,
      options.to
        ? `No FDIC financial row is available for ${options.to}.`
        : 'No FDIC financial rows are available for this institution.',
      quarterChangeProvenance({
        sourceAsOf: null,
        retrievedAt: null,
        release: options.release,
        releaseGeneration: options.releaseGeneration
      })
    );
  }

  const fromRepdte = options.from ?? previousQuarterDate(toRow.repdte);
  if (!fromRepdte) {
    return emptyBrief(
      cert,
      bank,
      'missing_comparison_quarter',
      null,
      toRow.repdte,
      'The target reporting date is not a recognized FDIC quarter end.',
      quarterChangeProvenance({
        sourceAsOf: toRow.repdte,
        retrievedAt: toRow.source_retrieved_at,
        release: options.release,
        releaseGeneration: options.releaseGeneration
      })
    );
  }
  if (!isConsecutiveQuarter(fromRepdte, toRow.repdte)) {
    return emptyBrief(
      cert,
      bank,
      'nonconsecutive_periods',
      fromRepdte,
      toRow.repdte,
      'Quarter attribution requires consecutive FDIC quarter ends.',
      quarterChangeProvenance({
        sourceAsOf: toRow.repdte,
        retrievedAt: toRow.source_retrieved_at,
        release: options.release,
        releaseGeneration: options.releaseGeneration
      })
    );
  }

  const fromRow = await findQuarter(db, cert, fromRepdte);
  if (!fromRow) {
    return emptyBrief(
      cert,
      bank,
      'missing_comparison_quarter',
      fromRepdte,
      toRow.repdte,
      `The required preceding quarter, ${fromRepdte}, is missing.`,
      quarterChangeProvenance({
        sourceAsOf: toRow.repdte,
        retrievedAt: toRow.source_retrieved_at,
        release: options.release,
        releaseGeneration: options.releaseGeneration
      })
    );
  }

  const beforeFromRepdte = previousQuarterDate(fromRepdte);
  const beforeFromRow = beforeFromRepdte
    ? await findQuarter(db, cert, beforeFromRepdte)
    : null;
  const peerRows = await queryAll<PeerQuarterPair>(
    db,
    `SELECT
       p.cert,
       p.asset_bucket,
       p.asset AS from_asset,
       c.asset AS to_asset,
       p.dep AS from_dep,
       c.dep AS to_dep,
       p.lnlsnet AS from_lnlsnet,
       c.lnlsnet AS to_lnlsnet,
       p.source_retrieved_at AS from_retrieved_at,
       c.source_retrieved_at AS to_retrieved_at
     FROM published_financials p
     JOIN published_financials c ON c.cert = p.cert AND c.repdte = ?
     WHERE p.repdte = ? AND p.asset_bucket IS NOT NULL`,
    [toRow.repdte, fromRow.repdte]
  );
  const structuralContext = await loadStructuralContext(db, cert, fromRow.repdte, toRow.repdte);
  const minimumPeerCount = options.minimumPeerCount ?? 2;
  const peerInput = {
    fromRepdte: fromRow.repdte,
    toRepdte: toRow.repdte,
    subjectCert: cert,
    subjectAssetBucket: fromRow.asset_bucket,
    minimumPeerCount
  };

  const assetGrowth = buildFrozenPeerMovement({
    ...peerInput,
    metric: 'total_assets',
    mode: 'percent_change',
    subjectFrom: fromRow.asset,
    subjectTo: toRow.asset,
    rows: peerRows.map((row) => ({
      cert: row.cert,
      assetBucket: row.asset_bucket,
      fromValue: row.from_asset,
      toValue: row.to_asset
    }))
  });
  const depositGrowth = buildFrozenPeerMovement({
    ...peerInput,
    metric: 'deposits',
    mode: 'percent_change',
    subjectFrom: fromRow.dep,
    subjectTo: toRow.dep,
    rows: peerRows.map((row) => ({
      cert: row.cert,
      assetBucket: row.asset_bucket,
      fromValue: row.from_dep,
      toValue: row.to_dep
    }))
  });
  const loanGrowth = buildFrozenPeerMovement({
    ...peerInput,
    metric: 'net_loans_and_leases',
    mode: 'percent_change',
    subjectFrom: fromRow.lnlsnet,
    subjectTo: toRow.lnlsnet,
    rows: peerRows.map((row) => ({
      cert: row.cert,
      assetBucket: row.asset_bucket,
      fromValue: row.from_lnlsnet,
      toValue: row.to_lnlsnet
    }))
  });
  const loanToDepositChange = buildFrozenPeerMovement({
    ...peerInput,
    metric: 'loan_to_deposit',
    mode: 'point_change',
    subjectFrom: ratio(fromRow.lnlsnet, fromRow.dep),
    subjectTo: ratio(toRow.lnlsnet, toRow.dep),
    rows: peerRows.map((row) => ({
      cert: row.cert,
      assetBucket: row.asset_bucket,
      fromValue: ratio(row.from_lnlsnet, row.from_dep),
      toValue: ratio(row.to_lnlsnet, row.to_dep)
    }))
  });
  const cohortHash = lineageHash({
    kind: 'quarter-change-peer-cohorts-v1',
    from: fromRow.repdte,
    to: toRow.repdte,
    assetGrowth: assetGrowth.cohort.hash,
    depositGrowth: depositGrowth.cohort.hash,
    loanGrowth: loanGrowth.cohort.hash,
    loanToDepositChange: loanToDepositChange.cohort.hash
  });
  const retrievedAt = latestTimestamp([
    toRow.source_retrieved_at,
    fromRow.source_retrieved_at,
    beforeFromRow?.source_retrieved_at,
    ...peerRows.flatMap((row) => [row.from_retrieved_at, row.to_retrieved_at])
  ]);

  return {
    cert,
    bank,
    comparison: {
      status: 'ok',
      from: fromRow.repdte,
      to: toRow.repdte,
      isConsecutiveQuarter: true,
      message: null
    },
    bridges: {
      assets: buildAssetBridge(fromRow, toRow),
      funding: buildFundingBridge(fromRow, toRow),
      quarterlyNetIncome: buildQuarterlyNetIncomeBridge(
        { row: fromRow, previousRow: beforeFromRow },
        { row: toRow, previousRow: fromRow }
      ),
      loanToDeposit: decomposeLoanToDeposit(
        fromRow.lnlsnet,
        toRow.lnlsnet,
        fromRow.dep,
        toRow.dep
      )
    },
    peerContext: {
      assetGrowth,
      depositGrowth,
      loanGrowth,
      loanToDepositChange
    },
    structuralContext,
    provenance: quarterChangeProvenance({
      sourceAsOf: toRow.repdte,
      retrievedAt,
      release: options.release,
      releaseGeneration: options.releaseGeneration,
      cohortHash
    })
  };
}
