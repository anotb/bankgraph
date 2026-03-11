/**
 * Field metadata: labels, descriptions, and code-to-name mappings
 * for displaying FDIC institution data.
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

interface FieldDef {
  label: string;
  description: string;
}

const fieldDefs: Record<string, FieldDef> = {
  total_assets: {
    label: 'Total Assets',
    description: 'Total assets reported in thousands of dollars'
  },
  total_deposits: {
    label: 'Total Deposits',
    description: 'Total deposits reported in thousands of dollars'
  },
  roa: {
    label: 'Return on Assets (ROA)',
    description: 'Net income as a percentage of average total assets, annualized'
  },
  roe: {
    label: 'Return on Equity (ROE)',
    description: 'Net income as a percentage of average total equity, annualized'
  },
  nim: {
    label: 'Net Interest Margin (NIM)',
    description: 'Net interest income as a percentage of average earning assets'
  },
  nimy: {
    label: 'Net Interest Margin (NIM)',
    description: 'Net interest income as a percentage of average earning assets'
  },
  npl_ratio: {
    label: 'NPL Ratio',
    description: 'Non-performing loans as a percentage of total loans'
  },
  nclnlsr: {
    label: 'NPL Ratio',
    description: 'Noncurrent loans and leases as a percentage of total loans and leases'
  },
  tier1_ratio: {
    label: 'Tier 1 Capital Ratio',
    description: 'Tier 1 risk-based capital as a percentage of risk-weighted assets'
  },
  rbcrwaj: {
    label: 'Tier 1 Capital Ratio',
    description: 'Tier 1 risk-based capital as a percentage of risk-weighted assets'
  },
  eeffr: {
    label: 'Efficiency Ratio',
    description: 'Non-interest expense as a percentage of net interest income plus non-interest income'
  },
  lnlsdepr: {
    label: 'Loan-to-Deposit Ratio',
    description: 'Total loans and leases as a percentage of total deposits'
  },
  eq: {
    label: 'Total Equity',
    description: 'Total equity capital reported in thousands of dollars'
  },
  lnlsnet: {
    label: 'Net Loans & Leases',
    description: 'Total loans and leases net of unearned income and allowance, in thousands'
  },
  num_branches: {
    label: 'Branches',
    description: 'Total number of domestic branch offices'
  },
  num_employees: {
    label: 'Employees',
    description: 'Total number of full-time equivalent employees'
  }
};

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
