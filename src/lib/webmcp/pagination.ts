import { WebMcpInputError } from './runtime.js';

export interface WebMcpPagination {
	offset: number;
	pageSize: number;
	returnedCount: number;
	totalCount: number;
	omittedCount: number;
	hasMore: boolean;
	nextCursor: string | null;
}

function digest(value: string): string {
	let hash = 0x811c9dc5;
	for (let index = 0; index < value.length; index += 1) {
		hash ^= value.charCodeAt(index);
		hash = Math.imul(hash, 0x01000193);
	}
	return (hash >>> 0).toString(36);
}

export function paginationKey(value: unknown): string {
	return digest(JSON.stringify(value));
}

/**
 * Stable identity for an exact peer cohort inside one published data generation.
 * Sorting here keeps page adapters and tool-contract validation from drifting.
 */
export function cohortIdentityKey(options: {
	definitionHash: string;
	memberCerts: readonly number[];
	sourceAsOf: string | null;
	releaseGeneration: string | null;
}): string {
	return paginationKey({
		definitionHash: options.definitionHash,
		memberCerts: [...options.memberCerts].sort((left, right) => left - right),
		sourceAsOf: options.sourceAsOf,
		releaseGeneration: options.releaseGeneration
	});
}

export function encodeCursor(scope: string, key: string, offset: number): string {
	return `bg1.${scope}.${key}.${offset.toString(36)}`;
}

export function decodeCursor(
	value: unknown,
	scope: string,
	key: string,
	maximum: number
): number {
	if (value === undefined) return 0;
	if (typeof value !== 'string' || value.length > 128) {
		throw new WebMcpInputError('cursor must be a bounded string returned by this tool');
	}
	const match = /^bg1\.([a-z_]+)\.([a-z0-9]+)\.([a-z0-9]+)$/.exec(value);
	if (!match || match[1] !== scope || match[2] !== key) {
		throw new WebMcpInputError('cursor does not match the current tool request');
	}
	const offset = Number.parseInt(match[3], 36);
	if (!Number.isSafeInteger(offset) || offset < 0 || offset > maximum) {
		throw new WebMcpInputError('cursor offset is outside the current result set');
	}
	return offset;
}

/**
 * Read only the bounded offset before an adapter request. Call decodeCursor with
 * the complete result identity afterwards; this helper never authenticates the key.
 */
export function cursorOffset(
	value: unknown,
	scope: string,
	maximum: number
): number {
	if (value === undefined) return 0;
	if (typeof value !== 'string' || value.length > 128) {
		throw new WebMcpInputError('cursor must be a bounded string returned by this tool');
	}
	const match = /^bg1\.([a-z_]+)\.([a-z0-9]+)\.([a-z0-9]+)$/.exec(value);
	if (!match || match[1] !== scope) {
		throw new WebMcpInputError('cursor does not match the current tool request');
	}
	const offset = Number.parseInt(match[3], 36);
	if (!Number.isSafeInteger(offset) || offset < 0 || offset > maximum) {
		throw new WebMcpInputError('cursor offset is outside the current result set');
	}
	return offset;
}

export function pageItems<T>(
	items: readonly T[],
	options: { scope: string; key: string; offset: number; pageSize: number; totalCount?: number }
): { items: T[]; pagination: WebMcpPagination } {
	const totalCount = options.totalCount ?? items.length;
	const page = items.slice(options.offset, options.offset + options.pageSize);
	const nextOffset = options.offset + page.length;
	return {
		items: page,
		pagination: {
			offset: options.offset,
			pageSize: options.pageSize,
			returnedCount: page.length,
			totalCount,
			omittedCount: Math.max(0, totalCount - nextOffset),
			hasMore: nextOffset < totalCount,
			nextCursor:
				nextOffset < totalCount
					? encodeCursor(options.scope, options.key, nextOffset)
					: null
		}
	};
}
