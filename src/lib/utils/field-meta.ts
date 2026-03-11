/**
 * Field metadata: labels, descriptions, formulas, MDRM codes,
 * and code-to-name mappings for displaying FDIC institution data.
 */

const regulatorMap: Record<string, string> = {
  OCC: 'Office of the Comptroller of the Currency',
  FDIC: 'Federal Deposit Insurance Corporation',
  FRB: 'Federal Reserve Board'
};

const charterClassMap: Record<string, string> = {
  N: 'National Bank',
  NM: 'State Non-Member Bank',
  SB: 'Savings Bank',
  SM: 'State Member Bank',
  SA: 'Savings Association',
  OI: 'Other Institution'
};

export type FieldCategory =
  | 'balance_sheet'
  | 'income'
  | 'ratios'
  | 'capital'
  | 'asset_quality'
  | 'liquidity'
  | 'general';

export interface FieldDef {
  label: string;
  description: string;
  formula?: string;
  category: FieldCategory;
  mdrm?: string;
}

export const fieldDefs: Record<string, FieldDef> = {
  // ── Balance Sheet ──────────────────────────────────────────────
  asset: {
    label: 'Total Assets',
    description: 'Total assets reported in thousands of dollars.',
    category: 'balance_sheet'
  },
  dep: {
    label: 'Total Deposits',
    description: 'Total deposits reported in thousands of dollars.',
    category: 'balance_sheet'
  },
  eq: {
    label: 'Total Equity Capital',
    description: 'Total equity capital including common stock, surplus, and retained earnings, in thousands.',
    category: 'balance_sheet'
  },
  lnlsnet: {
    label: 'Net Loans & Leases',
    description:
      'Total loans and leases net of unearned income and the allowance for loan and lease losses, in thousands.',
    category: 'balance_sheet'
  },
  lnre: {
    label: 'Real Estate Loans',
    description:
      'Loans secured by real estate, including residential mortgage, commercial real estate, and construction loans, in thousands.',
    category: 'balance_sheet'
  },
  lnci: {
    label: 'Commercial & Industrial Loans',
    description: 'Loans to businesses for commercial and industrial purposes, in thousands.',
    category: 'balance_sheet'
  },
  lncon: {
    label: 'Consumer Loans',
    description:
      'Loans to individuals for household, family, and personal expenditures including credit cards and auto loans, in thousands.',
    category: 'balance_sheet'
  },
  sec: {
    label: 'Securities',
    description:
      'Total investment securities including held-to-maturity, available-for-sale, and trading securities, in thousands.',
    category: 'balance_sheet'
  },

  // ── Income Statement ───────────────────────────────────────────
  netinc: {
    label: 'Net Income',
    description: 'Net income after taxes and extraordinary items, in thousands.',
    category: 'income'
  },
  intinc: {
    label: 'Interest Income',
    description:
      'Total interest and fee income earned on loans, leases, securities, and other interest-bearing assets, in thousands.',
    category: 'income'
  },
  eintexp: {
    label: 'Interest Expense',
    description: 'Total interest paid on deposits and other borrowed funds, in thousands.',
    category: 'income'
  },
  nim: {
    label: 'Net Interest Income',
    description:
      'Interest income minus interest expense, representing the core earnings from lending activities, in thousands.',
    formula: 'Interest Income - Interest Expense',
    category: 'income'
  },
  nonii: {
    label: 'Noninterest Income',
    description:
      'Income from sources other than interest, including service charges, trading revenue, and fee income, in thousands.',
    category: 'income'
  },
  nonix: {
    label: 'Noninterest Expense',
    description:
      'Operating expenses excluding interest expense, including salaries, occupancy, and other overhead, in thousands.',
    category: 'income'
  },
  elnatr: {
    label: 'Provision for Loan Losses',
    description:
      'Expense set aside to cover estimated losses on loans and leases, in thousands.',
    category: 'income'
  },

  // ── Performance Ratios ─────────────────────────────────────────
  roa: {
    label: 'Return on Assets (ROA)',
    description:
      'Annualized net income as a percentage of average total assets. Measures how efficiently a bank uses its assets to generate profit.',
    formula: 'Net Income / Average Total Assets',
    category: 'ratios',
    mdrm: 'UBPR2170'
  },
  roe: {
    label: 'Return on Equity (ROE)',
    description:
      'Annualized net income as a percentage of average total equity capital. Measures the return generated on shareholders\' investment.',
    formula: 'Net Income / Average Total Equity',
    category: 'ratios',
    mdrm: 'UBPR2180'
  },
  nimy: {
    label: 'Net Interest Margin (NIM)',
    description:
      'Net interest income as a percentage of average earning assets, annualized. Reflects the spread between what a bank earns on loans/investments and pays on deposits/borrowings.',
    formula: '(Interest Income - Interest Expense) / Average Earning Assets',
    category: 'ratios',
    mdrm: 'UBPRE591'
  },
  eeffr: {
    label: 'Efficiency Ratio',
    description:
      'Noninterest expense as a percentage of net interest income plus noninterest income. Lower values indicate better operational efficiency.',
    formula: 'Noninterest Expense / (Net Interest Income + Noninterest Income)',
    category: 'ratios',
    mdrm: 'UBPRE082'
  },

  // ── Capital Adequacy ───────────────────────────────────────────
  rbcrwaj: {
    label: 'Total Risk-Based Capital Ratio',
    description:
      'Total qualifying capital (Tier 1 + Tier 2) as a percentage of risk-weighted assets. Banks must maintain at least 8% to be adequately capitalized.',
    category: 'capital',
    mdrm: 'UBPRD849'
  },
  rbc1rwaj: {
    label: 'Tier 1 Risk-Based Capital Ratio',
    description:
      'Tier 1 (core) capital as a percentage of risk-weighted assets. Must be at least 6% for adequately capitalized status.',
    category: 'capital',
    mdrm: 'UBPRD851'
  },
  rbc1aaj: {
    label: 'Tier 1 Leverage Ratio',
    description:
      'Tier 1 capital as a percentage of average total consolidated assets (not risk-weighted). Must be at least 4% for adequately capitalized status.',
    category: 'capital',
    mdrm: 'UBPR7204'
  },
  eqv: {
    label: 'Equity-to-Assets Ratio',
    description:
      'Total equity capital as a percentage of total assets. A simple measure of a bank\'s capital cushion against losses.',
    formula: 'Total Equity Capital / Total Assets',
    category: 'capital'
  },

  // ── Asset Quality ──────────────────────────────────────────────
  nclnlsr: {
    label: 'Noncurrent Loan Ratio',
    description:
      'Noncurrent loans and leases (90+ days past due or in nonaccrual) as a percentage of total loans and leases. Higher values indicate deteriorating credit quality.',
    category: 'asset_quality',
    mdrm: 'UBPR3506'
  },
  lnatresr: {
    label: 'Loan Loss Reserve Ratio',
    description:
      'Allowance for loan and lease losses as a percentage of noncurrent loans and leases. Indicates how well reserved the bank is against problem loans.',
    category: 'asset_quality'
  },
  nco_ratio: {
    label: 'Net Charge-Off Ratio',
    description:
      'Annualized net charge-offs (loans written off minus recoveries) as a percentage of average loans. Measures actual loan losses realized during the period.',
    formula: '(Gross Charge-Offs - Recoveries) / Average Loans',
    category: 'asset_quality'
  },

  // ── Liquidity ──────────────────────────────────────────────────
  lnlsdepr: {
    label: 'Loan-to-Deposit Ratio',
    description:
      'Total loans and leases as a percentage of total deposits. Higher values may indicate tighter liquidity; lower values suggest excess deposit funding.',
    formula: 'Total Loans & Leases / Total Deposits',
    category: 'liquidity',
    mdrm: 'UBPRK415'
  },
  othbfhlb: {
    label: 'Other Borrowed Funds (incl. FHLB)',
    description:
      'Other borrowed money including Federal Home Loan Bank advances, in thousands. Heavy reliance on wholesale funding can indicate liquidity pressure.',
    category: 'liquidity'
  },

  // ── General ────────────────────────────────────────────────────
  numemp: {
    label: 'Number of Employees',
    description: 'Total number of full-time equivalent employees at the institution.',
    category: 'general'
  }
};

/** Human-readable names for field categories, in display order. */
export const categoryLabels: Record<FieldCategory, string> = {
  balance_sheet: 'Balance Sheet',
  income: 'Income Statement',
  ratios: 'Performance Ratios',
  capital: 'Capital Adequacy',
  asset_quality: 'Asset Quality',
  liquidity: 'Liquidity',
  general: 'General'
};

/** Ordered list of categories for iteration. */
export const categoryOrder: FieldCategory[] = [
  'balance_sheet',
  'income',
  'ratios',
  'capital',
  'asset_quality',
  'liquidity',
  'general'
];

export function getFieldDef(field: string): FieldDef | undefined {
  return fieldDefs[field];
}

export function getFieldLabel(field: string): string {
  return fieldDefs[field]?.label ?? field;
}

export function getFieldDescription(field: string): string {
  return fieldDefs[field]?.description ?? '';
}

export function getRegulatorName(code: string): string {
  return regulatorMap[code] ?? code;
}

export function getCharterClassName(code: string): string {
  return charterClassMap[code] ?? code;
}
