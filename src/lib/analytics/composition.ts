import type { Financial } from '$lib/types';

export type CompositionId = 'asset_mix' | 'funding_mix' | 'loan_mix';

export type CompositionField =
  | 'asset'
  | 'chbal'
  | 'frepo'
  | 'sec'
  | 'lnlsnet'
  | 'trade'
  | 'ore'
  | 'bkprem'
  | 'intan'
  | 'oa'
  | 'dep'
  | 'frepp'
  | 'othbor'
  | 'subnd'
  | 'tradel'
  | 'allothl'
  | 'eq'
  | 'lnre'
  | 'lnci'
  | 'lncon';

export type CompositionRow = Pick<Financial, 'cert' | 'repdte'>
  & Partial<Pick<Financial, CompositionField>>;

export interface CompositionFieldDefinition {
  field: CompositionField;
  sourceField: string;
  label: string;
  definition: string;
}

export interface CompositionComponentDefinition extends CompositionFieldDefinition {
  id: string;
}

export interface CompositionDefinition {
  id: CompositionId;
  label: string;
  description: string;
  denominator: CompositionFieldDefinition;
  components: readonly CompositionComponentDefinition[];
  residual: {
    id: string;
    label: string;
    definition: string;
    expected: boolean;
    canBeNegative: boolean;
  };
  identity: 'reported_balance_sheet_identity' | 'reported_categories_with_basis_residual';
  source: {
    dataset: 'FDIC BankFind Financials';
    url: 'https://api.fdic.gov/banks/docs/';
    unit: 'usd_thousands';
  };
}

const SOURCE = {
  dataset: 'FDIC BankFind Financials',
  url: 'https://api.fdic.gov/banks/docs/',
  unit: 'usd_thousands'
} as const;

/**
 * Canonical composition vocabulary. The balance-sheet definitions mirror the
 * exact component identities already used by quarter-change attribution.
 */
export const COMPOSITION_DEFINITIONS = [
  {
    id: 'asset_mix',
    label: 'Asset mix',
    description: 'How reported assets are distributed across the balance sheet.',
    denominator: {
      field: 'asset', sourceField: 'ASSET', label: 'Total assets',
      definition: 'Total assets reported by the institution.'
    },
    components: [
      { id: 'cash', field: 'chbal', sourceField: 'CHBAL', label: 'Cash and balances due', definition: 'Cash and balances due from depository institutions.' },
      { id: 'fed_funds_sold', field: 'frepo', sourceField: 'FREPO', label: 'Fed funds sold and reverse repos', definition: 'Federal funds sold and securities purchased under agreements to resell.' },
      { id: 'securities', field: 'sec', sourceField: 'SC', label: 'Securities', definition: 'Reported securities holdings.' },
      { id: 'net_loans', field: 'lnlsnet', sourceField: 'LNLSNET', label: 'Net loans and leases', definition: 'Loans and leases after unearned income and the loss allowance.' },
      { id: 'trading_assets', field: 'trade', sourceField: 'TRADE', label: 'Trading assets', definition: 'Assets held in trading accounts.' },
      { id: 'other_real_estate', field: 'ore', sourceField: 'ORE', label: 'Other real estate owned', definition: 'Real estate owned other than bank premises.' },
      { id: 'goodwill', field: 'bkprem', sourceField: 'BKPREM', label: 'Goodwill', definition: 'Goodwill reported in the FDIC field BKPREM.' },
      { id: 'other_intangibles', field: 'intan', sourceField: 'INTAN', label: 'Other intangible assets', definition: 'Intangible assets other than goodwill.' },
      { id: 'other_assets', field: 'oa', sourceField: 'OA', label: 'Other assets', definition: 'Assets not included in the listed asset components.' }
    ],
    residual: {
      id: 'reconciliation_difference',
      label: 'Reconciliation difference',
      definition: 'Total assets less the sum of the reported asset components.',
      expected: false,
      canBeNegative: true
    },
    identity: 'reported_balance_sheet_identity',
    source: SOURCE
  },
  {
    id: 'funding_mix',
    label: 'Funding mix',
    description: 'How deposits, other liabilities, and equity fund reported assets.',
    denominator: {
      field: 'asset', sourceField: 'ASSET', label: 'Total assets',
      definition: 'Total assets, equal to reported liabilities plus equity.'
    },
    components: [
      { id: 'deposits', field: 'dep', sourceField: 'DEP', label: 'Deposits', definition: 'Institution-level deposits across domestic and foreign offices.' },
      { id: 'fed_funds_purchased', field: 'frepp', sourceField: 'FREPP', label: 'Fed funds purchased and repos', definition: 'Federal funds purchased and securities sold under agreements to repurchase.' },
      { id: 'other_borrowings', field: 'othbor', sourceField: 'OTHBOR', label: 'Other borrowed funds', definition: 'Borrowed funds outside deposits and the separately reported liability categories.' },
      { id: 'subordinated_debt', field: 'subnd', sourceField: 'SUBND', label: 'Subordinated debt', definition: 'Subordinated notes and debentures.' },
      { id: 'trading_liabilities', field: 'tradel', sourceField: 'TRADEL', label: 'Trading liabilities', definition: 'Liabilities from trading activities.' },
      { id: 'other_liabilities', field: 'allothl', sourceField: 'ALLOTHL', label: 'Other liabilities', definition: 'Liabilities not included in the listed funding components.' },
      { id: 'equity', field: 'eq', sourceField: 'EQ', label: 'Equity capital', definition: 'Reported equity capital, including retained earnings.' }
    ],
    residual: {
      id: 'reconciliation_difference',
      label: 'Reconciliation difference',
      definition: 'Total assets less the sum of reported liabilities and equity.',
      expected: false,
      canBeNegative: true
    },
    identity: 'reported_balance_sheet_identity',
    source: SOURCE
  },
  {
    id: 'loan_mix',
    label: 'Loan mix',
    description: 'How reported real estate, commercial, and consumer loans relate to net loans and leases.',
    denominator: {
      field: 'lnlsnet', sourceField: 'LNLSNET', label: 'Net loans and leases',
      definition: 'Loans and leases after unearned income and the loss allowance.'
    },
    components: [
      { id: 'real_estate', field: 'lnre', sourceField: 'LNRE', label: 'Real estate loans', definition: 'Loans secured by real estate.' },
      { id: 'commercial_industrial', field: 'lnci', sourceField: 'LNCI', label: 'Commercial and industrial loans', definition: 'Loans to commercial and industrial borrowers.' },
      { id: 'consumer', field: 'lncon', sourceField: 'LNCON', label: 'Consumer loans', definition: 'Loans to individuals for household, family, and other personal spending.' }
    ],
    residual: {
      id: 'unclassified_basis_residual',
      label: 'Unclassified / basis residual',
      definition: 'Net loans and leases less the three reported loan categories. This is an arithmetic residual, not a claim that the amount is one loan category: the fields do not exhaust net loans on identical bases.',
      expected: true,
      canBeNegative: true
    },
    identity: 'reported_categories_with_basis_residual',
    source: SOURCE
  }
] as const satisfies readonly CompositionDefinition[];

export interface CompositionDefinitionIssue {
  definitionId: string;
  path: string;
  message: string;
}

/** Validate registry structure without making claims about FDIC field semantics. */
export function validateCompositionDefinitions(
  definitions: readonly CompositionDefinition[]
): CompositionDefinitionIssue[] {
  const issues: CompositionDefinitionIssue[] = [];
  const definitionIds = new Set<string>();

  for (const definition of definitions) {
    if (definitionIds.has(definition.id)) {
      issues.push({
        definitionId: definition.id,
        path: 'id',
        message: `Composition definition id "${definition.id}" is duplicated.`
      });
    }
    definitionIds.add(definition.id);

    const componentIds = new Set<string>();
    const componentFields = new Set<CompositionField>();
    for (const component of definition.components) {
      if (componentIds.has(component.id)) {
        issues.push({
          definitionId: definition.id,
          path: `components.${component.id}`,
          message: `Component id "${component.id}" is duplicated within ${definition.id}.`
        });
      }
      componentIds.add(component.id);

      if (componentFields.has(component.field)) {
        issues.push({
          definitionId: definition.id,
          path: `components.${component.id}.field`,
          message: `Source field "${component.field}" is assigned to more than one component in ${definition.id}.`
        });
      }
      componentFields.add(component.field);

      if (component.field === definition.denominator.field) {
        issues.push({
          definitionId: definition.id,
          path: `components.${component.id}.field`,
          message: `Denominator field "${component.field}" cannot also be a component in ${definition.id}.`
        });
      }
    }

    if (componentIds.has(definition.residual.id)) {
      issues.push({
        definitionId: definition.id,
        path: 'residual.id',
        message: `Residual id "${definition.residual.id}" overlaps a component id in ${definition.id}.`
      });
    }
    if (definition.components.length === 0) {
      issues.push({
        definitionId: definition.id,
        path: 'components',
        message: `${definition.id} must define at least one component.`
      });
    }
  }

  return issues;
}

const DEFINITION_ISSUES = validateCompositionDefinitions(COMPOSITION_DEFINITIONS);
if (DEFINITION_ISSUES.length > 0) {
  throw new Error(DEFINITION_ISSUES.map((issue) => issue.message).join(' '));
}

const DEFINITION_BY_ID = new Map<CompositionId, CompositionDefinition>(
  COMPOSITION_DEFINITIONS.map((definition) => [definition.id, definition])
);

export const COMPOSITION_IDS = COMPOSITION_DEFINITIONS.map((definition) => definition.id) as CompositionId[];

export function isCompositionId(value: string): value is CompositionId {
  return DEFINITION_BY_ID.has(value as CompositionId);
}

export function compositionDefinition(id: CompositionId): CompositionDefinition {
  return DEFINITION_BY_ID.get(id)!;
}

export interface CompositionCoverage {
  inputRows: number;
  distinctReporters: number;
  denominatorReporters: number;
  completeReporters: number;
  excludedReporters: number;
  duplicateReporters: number;
  completeReporterShare: number | null;
  fieldReporterCounts: Record<string, number>;
  missingFieldCounts: Record<string, number>;
}

export interface CompositionComponentValue extends CompositionComponentDefinition {
  value: number | null;
  sharePercent: number | null;
  reporterCount: number;
}

export type CompositionStatus =
  | 'ok'
  | 'partial_coverage'
  | 'zero_denominator'
  | 'unavailable'
  | 'mixed_periods';

export interface CompositionSnapshot {
  id: CompositionId;
  label: string;
  period: string | null;
  scope: 'institution' | 'cohort';
  status: CompositionStatus;
  denominator: CompositionFieldDefinition & {
    value: number | null;
    reporterCount: number;
  };
  components: CompositionComponentValue[];
  residual: CompositionDefinition['residual'] & {
    value: number | null;
    sharePercent: number | null;
  };
  reconciliation: {
    status:
      | 'reconciled'
      | 'difference_present'
      | 'basis_residual'
      | 'partial_inputs'
      | 'missing_denominator'
      | 'zero_denominator'
      | 'mixed_periods';
    componentTotal: number | null;
    reconstructedTotal: number | null;
    difference: number | null;
    tolerance: number | null;
  };
  coverage: CompositionCoverage;
  source: {
    dataset: CompositionDefinition['source']['dataset'];
    url: CompositionDefinition['source']['url'];
    unit: CompositionDefinition['source']['unit'];
    fields: string[];
    denominatorFormula: string;
    shareFormula: '100 × SUM(component) / SUM(denominator) over the same complete reporters';
    residualFormula: 'SUM(denominator) − SUM(reported components) over the same complete reporters';
  };
}

interface PreparedRows {
  uniqueRows: CompositionRow[];
  duplicateReporterCount: number;
  distinctReporterCount: number;
}

function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function prepareRows(rows: readonly CompositionRow[]): PreparedRows {
  const byCert = new Map<number, CompositionRow[]>();
  for (const row of rows) {
    const existing = byCert.get(row.cert) ?? [];
    existing.push(row);
    byCert.set(row.cert, existing);
  }
  const duplicateReporterCount = [...byCert.values()].filter((entries) => entries.length > 1).length;
  return {
    uniqueRows: [...byCert.values()].filter((entries) => entries.length === 1).map(([row]) => row),
    duplicateReporterCount,
    distinctReporterCount: byCert.size
  };
}

function requiredFields(definition: CompositionDefinition): CompositionField[] {
  return [definition.denominator.field, ...definition.components.map((component) => component.field)];
}

function completeRow(row: CompositionRow, definition: CompositionDefinition): boolean {
  return requiredFields(definition).every((field) => finite(row[field]));
}

function coverageFor(
  rows: readonly CompositionRow[],
  definition: CompositionDefinition,
  prepared = prepareRows(rows)
): CompositionCoverage {
  const fields = requiredFields(definition);
  const fieldReporterCounts = Object.fromEntries(
    fields.map((field) => [field, prepared.uniqueRows.filter((row) => finite(row[field])).length])
  );
  const completeReporters = prepared.uniqueRows.filter((row) => completeRow(row, definition)).length;
  return {
    inputRows: rows.length,
    distinctReporters: prepared.distinctReporterCount,
    denominatorReporters: fieldReporterCounts[definition.denominator.field] ?? 0,
    completeReporters,
    excludedReporters: prepared.distinctReporterCount - completeReporters,
    duplicateReporters: prepared.duplicateReporterCount,
    completeReporterShare: prepared.distinctReporterCount === 0
      ? null
      : completeReporters / prepared.distinctReporterCount,
    fieldReporterCounts,
    missingFieldCounts: Object.fromEntries(
      fields.map((field) => [field, prepared.uniqueRows.length - (fieldReporterCounts[field] ?? 0)])
    )
  };
}

function sumField(rows: readonly CompositionRow[], field: CompositionField): number {
  return rows.reduce((sum, row) => sum + (row[field] as number), 0);
}

function outputSource(definition: CompositionDefinition): CompositionSnapshot['source'] {
  return {
    ...definition.source,
    fields: [
      definition.denominator.sourceField,
      ...definition.components.map((component) => component.sourceField)
    ],
    denominatorFormula: `SUM(${definition.denominator.sourceField}) over reporters with every required field`,
    shareFormula: '100 × SUM(component) / SUM(denominator) over the same complete reporters',
    residualFormula: 'SUM(denominator) − SUM(reported components) over the same complete reporters'
  };
}

function unavailableSnapshot(
  definition: CompositionDefinition,
  period: string | null,
  status: Extract<CompositionStatus, 'unavailable' | 'mixed_periods'>,
  coverage: CompositionCoverage
): CompositionSnapshot {
  return {
    id: definition.id,
    label: definition.label,
    period,
    scope: coverage.distinctReporters === 1 ? 'institution' : 'cohort',
    status,
    denominator: { ...definition.denominator, value: null, reporterCount: 0 },
    components: definition.components.map((component) => ({
      ...component,
      value: null,
      sharePercent: null,
      reporterCount: 0
    })),
    residual: { ...definition.residual, value: null, sharePercent: null },
    reconciliation: {
      status: status === 'mixed_periods' ? 'mixed_periods' : 'partial_inputs',
      componentTotal: null,
      reconstructedTotal: null,
      difference: null,
      tolerance: null
    },
    coverage,
    source: outputSource(definition)
  };
}

/**
 * Derive one point-in-time composition. Cohort shares are ratios of sums over
 * one common set of complete reporters; bank-level shares use the same path.
 */
export function deriveCompositionSnapshot(
  id: CompositionId,
  rows: readonly CompositionRow[]
): CompositionSnapshot {
  const definition = compositionDefinition(id);
  const prepared = prepareRows(rows);
  const coverage = coverageFor(rows, definition, prepared);
  const periods = [...new Set(prepared.uniqueRows.map((row) => row.repdte))];
  if (periods.length > 1) {
    return unavailableSnapshot(definition, null, 'mixed_periods', coverage);
  }

  const period = periods[0] ?? null;
  const eligible = prepared.uniqueRows.filter((row) => completeRow(row, definition));
  if (eligible.length === 0) {
    return unavailableSnapshot(definition, period, 'unavailable', coverage);
  }

  const denominatorValue = sumField(eligible, definition.denominator.field);
  const components = definition.components.map((component): CompositionComponentValue => {
    const value = sumField(eligible, component.field);
    return {
      ...component,
      value,
      sharePercent: denominatorValue === 0 ? null : (100 * value) / denominatorValue,
      reporterCount: eligible.length
    };
  });
  const componentTotal = components.reduce((sum, component) => sum + (component.value ?? 0), 0);
  const difference = denominatorValue - componentTotal;
  const tolerance = Math.max(1, Math.abs(denominatorValue) * 1e-10);
  const zeroDenominator = denominatorValue === 0;
  const partialCoverage = coverage.completeReporters < coverage.distinctReporters;

  return {
    id: definition.id,
    label: definition.label,
    period,
    scope: coverage.distinctReporters === 1 ? 'institution' : 'cohort',
    status: zeroDenominator ? 'zero_denominator' : partialCoverage ? 'partial_coverage' : 'ok',
    denominator: {
      ...definition.denominator,
      value: denominatorValue,
      reporterCount: eligible.length
    },
    components,
    residual: {
      ...definition.residual,
      value: difference,
      sharePercent: zeroDenominator ? null : (100 * difference) / denominatorValue
    },
    reconciliation: {
      status: zeroDenominator
        ? 'zero_denominator'
        : definition.residual.expected
          ? 'basis_residual'
          : Math.abs(difference) <= tolerance
            ? 'reconciled'
            : 'difference_present',
      componentTotal,
      reconstructedTotal: componentTotal + difference,
      difference,
      tolerance
    },
    coverage,
    source: outputSource(definition)
  };
}

export interface CompositionChangeComponent extends CompositionComponentDefinition {
  fromValue: number | null;
  toValue: number | null;
  valueChange: number | null;
  fromSharePercent: number | null;
  toSharePercent: number | null;
  shareChangePercentagePoints: number | null;
}

export interface CompositionChange {
  id: CompositionId;
  label: string;
  status: CompositionStatus;
  from: CompositionSnapshot;
  to: CompositionSnapshot;
  denominator: CompositionFieldDefinition & {
    fromValue: number | null;
    toValue: number | null;
    valueChange: number | null;
  };
  components: CompositionChangeComponent[];
  residual: CompositionDefinition['residual'] & {
    fromValue: number | null;
    toValue: number | null;
    valueChange: number | null;
    fromSharePercent: number | null;
    toSharePercent: number | null;
    shareChangePercentagePoints: number | null;
  };
  matchedReporters: {
    fromReporters: number;
    toReporters: number;
    identityMatchedReporters: number;
    comparableReporters: number;
    nonComparableReporters: number;
    fromOnlyReporters: number;
    toOnlyReporters: number;
    duplicateFromReporters: number;
    duplicateToReporters: number;
  };
  changeReconciliation: {
    status: 'reconciled' | 'difference_present' | 'unavailable';
    denominatorChange: number | null;
    componentChangeTotal: number | null;
    residualChange: number | null;
    reconstructedChange: number | null;
    difference: number | null;
    tolerance: number | null;
  };
  source: CompositionSnapshot['source'];
}

function difference(left: number | null, right: number | null): number | null {
  return left === null || right === null ? null : right - left;
}

function pointDifference(left: number | null, right: number | null): number | null {
  return difference(left, right);
}

/**
 * Compare composition on a matched-reporter basis. A reporter must have every
 * required field in both periods, so both endpoint shares use the same cohort.
 */
export function deriveCompositionChange(
  id: CompositionId,
  fromRows: readonly CompositionRow[],
  toRows: readonly CompositionRow[]
): CompositionChange {
  const definition = compositionDefinition(id);
  const preparedFrom = prepareRows(fromRows);
  const preparedTo = prepareRows(toRows);
  const fromPeriods = [...new Set(preparedFrom.uniqueRows.map((row) => row.repdte))];
  const toPeriods = [...new Set(preparedTo.uniqueRows.map((row) => row.repdte))];
  const fromByCert = new Map(preparedFrom.uniqueRows.map((row) => [row.cert, row]));
  const toByCert = new Map(preparedTo.uniqueRows.map((row) => [row.cert, row]));
  const identityMatchedCerts = [...fromByCert.keys()].filter((cert) => toByCert.has(cert));
  const comparableCerts = identityMatchedCerts.filter((cert) => {
    const from = fromByCert.get(cert)!;
    const to = toByCert.get(cert)!;
    return completeRow(from, definition) && completeRow(to, definition);
  });
  const comparableFrom = comparableCerts.map((cert) => fromByCert.get(cert)!);
  const comparableTo = comparableCerts.map((cert) => toByCert.get(cert)!);
  const mixedPeriods = fromPeriods.length > 1 || toPeriods.length > 1;
  const emptyCoverage = (rows: readonly CompositionRow[]) => coverageFor(rows, definition);
  const from = mixedPeriods
    ? unavailableSnapshot(definition, null, 'mixed_periods', coverageFor(fromRows, definition, preparedFrom))
    : comparableFrom.length > 0
      ? deriveCompositionSnapshot(id, comparableFrom)
      : unavailableSnapshot(definition, fromPeriods[0] ?? null, 'unavailable', emptyCoverage(comparableFrom));
  const to = mixedPeriods
    ? unavailableSnapshot(definition, null, 'mixed_periods', coverageFor(toRows, definition, preparedTo))
    : comparableTo.length > 0
      ? deriveCompositionSnapshot(id, comparableTo)
      : unavailableSnapshot(definition, toPeriods[0] ?? null, 'unavailable', emptyCoverage(comparableTo));

  const componentById = new Map(to.components.map((component) => [component.id, component]));
  const components = from.components.map((fromComponent): CompositionChangeComponent => {
    const toComponent = componentById.get(fromComponent.id)!;
    return {
      id: fromComponent.id,
      field: fromComponent.field,
      sourceField: fromComponent.sourceField,
      label: fromComponent.label,
      definition: fromComponent.definition,
      fromValue: fromComponent.value,
      toValue: toComponent.value,
      valueChange: difference(fromComponent.value, toComponent.value),
      fromSharePercent: fromComponent.sharePercent,
      toSharePercent: toComponent.sharePercent,
      shareChangePercentagePoints: pointDifference(fromComponent.sharePercent, toComponent.sharePercent)
    };
  });
  const denominatorChange = difference(from.denominator.value, to.denominator.value);
  const residualChange = difference(from.residual.value, to.residual.value);
  const componentChanges = components.map((component) => component.valueChange);
  const hasChangeIdentity = denominatorChange !== null
    && residualChange !== null
    && componentChanges.every((value) => value !== null);
  const componentChangeTotal = hasChangeIdentity
    ? componentChanges.reduce((sum, value) => sum + (value as number), 0)
    : null;
  const reconstructedChange = componentChangeTotal === null || residualChange === null
    ? null
    : componentChangeTotal + residualChange;
  const changeDifference = denominatorChange === null || reconstructedChange === null
    ? null
    : denominatorChange - reconstructedChange;
  const tolerance = denominatorChange === null ? null : Math.max(1, Math.abs(denominatorChange) * 1e-10);
  const partialCoverage = comparableCerts.length < new Set([
    ...fromByCert.keys(),
    ...toByCert.keys()
  ]).size;
  const status: CompositionStatus = mixedPeriods
    ? 'mixed_periods'
    : comparableCerts.length === 0
      ? 'unavailable'
      : from.status === 'zero_denominator' || to.status === 'zero_denominator'
        ? 'zero_denominator'
        : partialCoverage
          ? 'partial_coverage'
          : 'ok';

  return {
    id,
    label: definition.label,
    status,
    from,
    to,
    denominator: {
      ...definition.denominator,
      fromValue: from.denominator.value,
      toValue: to.denominator.value,
      valueChange: denominatorChange
    },
    components,
    residual: {
      ...definition.residual,
      fromValue: from.residual.value,
      toValue: to.residual.value,
      valueChange: residualChange,
      fromSharePercent: from.residual.sharePercent,
      toSharePercent: to.residual.sharePercent,
      shareChangePercentagePoints: pointDifference(from.residual.sharePercent, to.residual.sharePercent)
    },
    matchedReporters: {
      fromReporters: preparedFrom.distinctReporterCount,
      toReporters: preparedTo.distinctReporterCount,
      identityMatchedReporters: identityMatchedCerts.length,
      comparableReporters: comparableCerts.length,
      nonComparableReporters: identityMatchedCerts.length - comparableCerts.length,
      fromOnlyReporters: [...fromByCert.keys()].filter((cert) => !toByCert.has(cert)).length,
      toOnlyReporters: [...toByCert.keys()].filter((cert) => !fromByCert.has(cert)).length,
      duplicateFromReporters: preparedFrom.duplicateReporterCount,
      duplicateToReporters: preparedTo.duplicateReporterCount
    },
    changeReconciliation: {
      status: changeDifference === null || tolerance === null
        ? 'unavailable'
        : Math.abs(changeDifference) <= tolerance
          ? 'reconciled'
          : 'difference_present',
      denominatorChange,
      componentChangeTotal,
      residualChange,
      reconstructedChange,
      difference: changeDifference,
      tolerance
    },
    source: outputSource(definition)
  };
}
