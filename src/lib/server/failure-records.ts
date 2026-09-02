export type FailureRecordFilter = 'failure' | 'assistance' | 'all';

export const FAILURE_RECORD_DEFAULT_LIMIT = 100;
export const FAILURE_RECORD_MAX_LIMIT = 5_000;

export function parseFailureRecordFilter(value: string | null): FailureRecordFilter {
	if (value === null || value === '' || value === 'failure') return 'failure';
	if (value === 'assistance' || value === 'all') return value;
	throw new Error('type must be one of: failure, assistance, all');
}

function parseBoundedInteger(
	value: string | null,
	name: string,
	fallback: number,
	minimum: number,
	maximum: number
): number {
	if (value === null || value === '') return fallback;
	if (!/^\d+$/.test(value)) throw new Error(`${name} must be an integer`);
	const parsed = Number(value);
	if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) {
		throw new Error(`${name} must be between ${minimum} and ${maximum}`);
	}
	return parsed;
}

export function parseFailureRecordLimit(value: string | null): number {
	return parseBoundedInteger(
		value,
		'limit',
		FAILURE_RECORD_DEFAULT_LIMIT,
		1,
		FAILURE_RECORD_MAX_LIMIT
	);
}

export function parseFailureRecordOffset(value: string | null): number {
	return parseBoundedInteger(value, 'offset', 0, 0, 100_000);
}
