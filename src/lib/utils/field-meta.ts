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

export type FieldDisplayFormat = 'currency' | 'percent' | 'number';
export type FieldTimeBasis = 'single_quarter' | 'year_to_date';

export interface FieldDef {
  label: string;
	/** Short label used when the period basis is shown separately. */
	shortLabel?: string;
  description: string;
  /** Exact FDIC BankFind field requested by the ingestion pipeline. */
  sourceField?: string;
  /** Source-level meaning, kept separate from Bankgraph's display interpretation. */
  sourceDefinition?: string;
  /** How Bankgraph stores or presents the source field. */
  productInterpretation?: string;
  formula?: string;
  category: FieldCategory;
  mdrm?: string;
	/** Explicit display format for fields whose category alone is not precise enough. */
	displayFormat?: FieldDisplayFormat;
	/** Reporting-period basis for income-statement flow fields. */
	timeBasis?: FieldTimeBasis;
	/** Single-quarter companion to a year-to-date source field. */
	quarterlyField?: string;
	/** Year-to-date companion to a single-quarter source field. */
	yearToDateField?: string;
}

export const fieldDefs: Record<string, FieldDef> = {
  // ── Balance Sheet ──────────────────────────────────────────────
  asset: {
    label: 'Total Assets',
    description: 'Total assets reported in thousands of dollars.',
    sourceField: 'ASSET',
    sourceDefinition: 'FDIC BankFind defines ASSET as the sum of assets owned by the institution, excluding off-balance-sheet accounts.',
    productInterpretation: 'Bankgraph preserves the institution-level reported amount in thousands of U.S. dollars.',
    category: 'balance_sheet'
  },
  dep: {
    label: 'Total Deposits',
    description: 'Institution-level total deposits reported in thousands of dollars.',
    sourceField: 'DEP',
    sourceDefinition: 'FDIC BankFind defines DEP as all deposits, including demand, money-market, other savings, time, and foreign-office deposits.',
    productInterpretation: 'This is the quarterly institution total. It is not the annual Summary of Deposits branch allocation and should not be read as local-market deposits.',
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
  netincq: {
    label: 'Net Income — Quarter',
    shortLabel: 'Net Income',
    description: 'Net income after taxes and extraordinary items for the single reporting quarter, in thousands of dollars.',
    sourceField: 'NETINCQ',
    sourceDefinition: 'FDIC BankFind reports NETINCQ for the single reporting quarter.',
    productInterpretation: 'Bankgraph uses this field for quarter-to-quarter trends and same-quarter cross-bank comparisons. NETINC remains available for cumulative calendar-year analysis.',
    category: 'income',
    displayFormat: 'currency',
    timeBasis: 'single_quarter',
    yearToDateField: 'netinc'
  },
  netinc: {
    label: 'Net Income — Year to Date',
    shortLabel: 'Net Income',
    description: 'Net income after taxes and extraordinary items accumulated since the start of the calendar year, in thousands of dollars.',
    sourceField: 'NETINC',
    sourceDefinition: 'FDIC BankFind reports NETINC on a calendar-year-to-date basis.',
    productInterpretation: 'Use this field for cumulative or same-quarter year-over-year analysis. Use NETINCQ for a single quarter or quarter-to-quarter comparison.',
    category: 'income',
    displayFormat: 'currency',
    timeBasis: 'year_to_date',
    quarterlyField: 'netincq'
  },
  intinc: {
    label: 'Interest Income — Year to Date',
    shortLabel: 'Interest Income',
    description:
      'Interest and fee income accumulated since the start of the calendar year, in thousands of dollars.',
    sourceField: 'INTINC',
    sourceDefinition: 'FDIC BankFind reports INTINC on a calendar-year-to-date basis.',
    productInterpretation: 'Bankgraph retains the reported cumulative value. A reported single-quarter companion is not ingested for this field.',
    category: 'income',
    displayFormat: 'currency',
    timeBasis: 'year_to_date'
  },
  eintexp: {
    label: 'Interest Expense — Year to Date',
    shortLabel: 'Interest Expense',
    description: 'Interest expense accumulated since the start of the calendar year, in thousands of dollars.',
    sourceField: 'EINTEXP',
    sourceDefinition: 'FDIC BankFind reports EINTEXP on a calendar-year-to-date basis.',
    productInterpretation: 'Bankgraph retains the reported cumulative value. A reported single-quarter companion is not ingested for this field.',
    category: 'income',
    displayFormat: 'currency',
    timeBasis: 'year_to_date'
  },
  nimq: {
    label: 'Net Interest Income — Quarter',
    shortLabel: 'Net Interest Income',
    description: 'Interest income minus interest expense for the single reporting quarter, in thousands of dollars.',
    sourceField: 'NIMQ',
    sourceDefinition: 'FDIC BankFind reports NIMQ for the single reporting quarter.',
    productInterpretation: 'Bankgraph uses this field for quarter-to-quarter trends and same-quarter cross-bank comparisons. NIM remains available for cumulative calendar-year analysis.',
    formula: 'Interest Income - Interest Expense',
    category: 'income',
    displayFormat: 'currency',
    timeBasis: 'single_quarter',
    yearToDateField: 'nim'
  },
  nim: {
    label: 'Net Interest Income — Year to Date',
    shortLabel: 'Net Interest Income',
    description: 'Interest income minus interest expense accumulated since the start of the calendar year, in thousands of dollars.',
    sourceField: 'NIM',
    sourceDefinition: 'FDIC BankFind reports NIM on a calendar-year-to-date basis.',
    productInterpretation: 'Use this field for cumulative or same-quarter year-over-year analysis. Use NIMQ for a single quarter or quarter-to-quarter comparison.',
    formula: 'Interest Income - Interest Expense',
    category: 'income',
    displayFormat: 'currency',
    timeBasis: 'year_to_date',
    quarterlyField: 'nimq'
  },
  noniiq: {
    label: 'Noninterest Income — Quarter',
    shortLabel: 'Noninterest Income',
    description: 'Income from noninterest sources for the single reporting quarter, in thousands of dollars.',
    sourceField: 'NONIIQ',
    sourceDefinition: 'FDIC BankFind reports NONIIQ for the single reporting quarter.',
    productInterpretation: 'Bankgraph uses this field for quarter-to-quarter trends and same-quarter cross-bank comparisons. NONII remains available for cumulative calendar-year analysis.',
    category: 'income',
    displayFormat: 'currency',
    timeBasis: 'single_quarter',
    yearToDateField: 'nonii'
  },
  nonii: {
    label: 'Noninterest Income — Year to Date',
    shortLabel: 'Noninterest Income',
    description: 'Income from noninterest sources accumulated since the start of the calendar year, in thousands of dollars.',
    sourceField: 'NONII',
    sourceDefinition: 'FDIC BankFind reports NONII on a calendar-year-to-date basis.',
    productInterpretation: 'Use this field for cumulative or same-quarter year-over-year analysis. Use NONIIQ for a single quarter or quarter-to-quarter comparison.',
    category: 'income',
    displayFormat: 'currency',
    timeBasis: 'year_to_date',
    quarterlyField: 'noniiq'
  },
  nonixq: {
    label: 'Noninterest Expense — Quarter',
    shortLabel: 'Noninterest Expense',
    description: 'Operating expense excluding interest expense for the single reporting quarter, in thousands of dollars.',
    sourceField: 'NONIXQ',
    sourceDefinition: 'FDIC BankFind reports NONIXQ for the single reporting quarter.',
    productInterpretation: 'Bankgraph uses this field for quarter-to-quarter trends and same-quarter cross-bank comparisons. NONIX remains available for cumulative calendar-year analysis.',
    category: 'income',
    displayFormat: 'currency',
    timeBasis: 'single_quarter',
    yearToDateField: 'nonix'
  },
  nonix: {
    label: 'Noninterest Expense — Year to Date',
    shortLabel: 'Noninterest Expense',
    description: 'Operating expense excluding interest expense accumulated since the start of the calendar year, in thousands of dollars.',
    sourceField: 'NONIX',
    sourceDefinition: 'FDIC BankFind reports NONIX on a calendar-year-to-date basis.',
    productInterpretation: 'Use this field for cumulative or same-quarter year-over-year analysis. Use NONIXQ for a single quarter or quarter-to-quarter comparison.',
    category: 'income',
    displayFormat: 'currency',
    timeBasis: 'year_to_date',
    quarterlyField: 'nonixq'
  },
  elnatq: {
    label: 'Provision for Credit Losses — Quarter',
    shortLabel: 'Provision for Credit Losses',
    description: 'Provision for credit losses for the single reporting quarter, in thousands of dollars.',
    sourceField: 'ELNATQ',
    sourceDefinition: 'FDIC BankFind reports ELNATQ for the single reporting quarter.',
    productInterpretation: 'Bankgraph uses this field for quarter-to-quarter trends and same-quarter cross-bank comparisons. ELNATR remains available for cumulative calendar-year analysis.',
    category: 'income',
    displayFormat: 'currency',
    timeBasis: 'single_quarter',
    yearToDateField: 'elnatr'
  },
  elnatr: {
    label: 'Provision for Credit Losses — Year to Date',
    shortLabel: 'Provision for Credit Losses',
    description: 'Provision for credit losses accumulated since the start of the calendar year, in thousands of dollars.',
    sourceField: 'ELNATR',
    sourceDefinition: 'FDIC BankFind reports ELNATR on a calendar-year-to-date basis.',
    productInterpretation: 'Use this field for cumulative or same-quarter year-over-year analysis. Use ELNATQ for a single quarter or quarter-to-quarter comparison.',
    category: 'income',
    displayFormat: 'currency',
    timeBasis: 'year_to_date',
    quarterlyField: 'elnatq'
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
      'Total qualifying capital as a percentage of risk-weighted assets. Bankgraph uses reported values in a disclosed reference-threshold screen, not as an official supervisory status.',
    sourceField: 'RBCRWAJ',
    category: 'capital',
    mdrm: 'UBPRD849'
  },
  rbc1rwaj: {
    label: 'Tier 1 Risk-Based Capital Ratio',
    description:
      'Tier 1 capital as a percentage of risk-weighted assets. Bankgraph compares available reported values with disclosed reference thresholds; it does not determine PCA status.',
    sourceField: 'RBC1RWAJ',
    productInterpretation: 'This field supplies the institution summary Tier 1 ratio. RBCRWAJ, the total risk-based ratio, is kept separate.',
    category: 'capital',
    mdrm: 'UBPRD851'
  },
  rbc1aaj: {
    label: 'Tier 1 Leverage Ratio',
    description:
      'Tier 1 capital as a percentage of average total consolidated assets (not risk-weighted). It is one input to Bankgraph\'s reference-threshold screen, not an official PCA determination.',
    sourceField: 'RBC1AAJ',
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
		label: 'Noncurrent loan ratio',
		description:
			'Loans and leases 90 or more days past due or in nonaccrual as a percentage of total loans and leases. Higher values indicate deteriorating credit quality.',
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
    sourceField: 'NUMEMP',
    category: 'general'
  },
  offdom: {
    label: 'Domestic Offices',
    description: 'Current reported count of domestic offices, including the headquarters.',
    sourceField: 'OFFDOM',
    sourceDefinition: 'FDIC BankFind defines OFFDOM as domestic offices, including headquarters, operated by active institutions in the 50 states.',
    productInterpretation: 'The database column is named num_branches for compatibility, but Bankgraph displays this as domestic offices. It is not a branch-only count and not a geographic branch inventory.',
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

export function getFieldShortLabel(field: string): string {
  const def = fieldDefs[field];
  return def?.shortLabel ?? def?.label ?? field;
}

export function getFieldPeriodLabel(field: string): 'Quarter' | 'YTD' | null {
  const basis = fieldDefs[field]?.timeBasis;
  if (basis === 'single_quarter') return 'Quarter';
  if (basis === 'year_to_date') return 'YTD';
  return null;
}

export function getFieldDisplayFormat(field: string): FieldDisplayFormat {
  const def = fieldDefs[field];
  if (def?.displayFormat) return def.displayFormat;
  if (def?.category === 'balance_sheet' || def?.category === 'income') return 'currency';
  if (
    def?.category === 'ratios' ||
    def?.category === 'capital' ||
    def?.category === 'asset_quality'
  ) return 'percent';
  return 'number';
}

/** Resolve the reported single-quarter companion when one exists. */
export function getQuarterlyComparisonField(field: string): string {
  return fieldDefs[field]?.quarterlyField ?? field;
}

export function getRegulatorName(code: string): string {
  return regulatorMap[code] ?? code;
}

export function getCharterClassName(code: string): string {
  return charterClassMap[code] ?? code;
}

export function getFieldLabelWithMdrm(field: string): string {
  const def = fieldDefs[field];
  if (!def) return field;
  if (def.mdrm) return `${def.label} (${def.mdrm})`;
  return def.label;
}

export function getFieldMdrm(field: string): string | undefined {
  return fieldDefs[field]?.mdrm;
}
