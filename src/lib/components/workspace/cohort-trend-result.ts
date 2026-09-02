import type {
	CohortTrendResultRow,
	CohortTrendResultSet,
	MetricOperator
} from '$lib/workspace';

export type CohortTrendSortKey = 'name' | 'state' | 'totalAssets' | `change:${string}`;
export type CohortTrendSortDirection = 'asc' | 'desc';

const OPERATOR_LABELS: Record<MetricOperator, string> = {
	eq: '=',
	ne: '≠',
	gt: '>',
	gte: '≥',
	lt: '<',
	lte: '≤',
	between: 'between'
};

export function cohortTrendOperatorLabel(operator: MetricOperator): string {
	return OPERATOR_LABELS[operator];
}

function compareNullableNumber(left: number | null, right: number | null): number {
	if (left === null && right === null) return 0;
	if (left === null) return 1;
	if (right === null) return -1;
	return left - right;
}

function sortValue(row: CohortTrendResultRow, key: CohortTrendSortKey): string | number | null {
	if (key === 'name') return row.name;
	if (key === 'state') return row.state;
	if (key === 'totalAssets') return row.totalAssets;
	return row.changes[key.slice('change:'.length)] ?? null;
}

/** Stable, null-last ordering for the visible exact-result table. */
export function sortCohortTrendRows(
	rows: readonly CohortTrendResultRow[],
	key: CohortTrendSortKey,
	direction: CohortTrendSortDirection
): CohortTrendResultRow[] {
	const sign = direction === 'asc' ? 1 : -1;
	return [...rows].sort((left, right) => {
		const leftValue = sortValue(left, key);
		const rightValue = sortValue(right, key);
		let comparison: number;
		if (typeof leftValue === 'number' || typeof rightValue === 'number') {
			comparison = compareNullableNumber(
				typeof leftValue === 'number' ? leftValue : null,
				typeof rightValue === 'number' ? rightValue : null
			);
			// Nulls remain last in either direction.
			if (leftValue === null || rightValue === null) return comparison;
		} else if (leftValue === null && rightValue === null) {
			comparison = 0;
		} else if (leftValue === null) {
			return 1;
		} else if (rightValue === null) {
			return -1;
		} else {
			comparison = leftValue.localeCompare(rightValue, 'en-US', { sensitivity: 'base' });
		}
		return comparison * sign || left.name.localeCompare(right.name) || left.cert - right.cert;
	});
}

export function cohortTrendResultIsCurrent(
	result: CohortTrendResultSet,
	currentCohortHash: string | null
): boolean {
	return currentCohortHash !== null && result.cohortHash === currentCohortHash;
}
