import { STATE_NAMES } from '$lib/utils/states';
import { utf8ByteLength } from '$lib/server/query-bytes';
import { EXPECTED_RELEASE_GENERATION_PARAM } from '$lib/server/release-lineage';

const ALLOWED_PARAMS = new Set([
	'q',
	'state',
	'asset_min',
	'asset_max',
	'active',
	'sort',
	'order',
	'page',
	'limit',
	'format',
	'download',
	EXPECTED_RELEASE_GENERATION_PARAM
]);

const VALID_SORTS = new Set(['name', 'assets', 'deposits', 'roe', 'nim', 'npl', 'tier1']);
const MAX_QUERY_LENGTH = 100;
const MAX_QUERY_BYTES = 100;
const MAX_STATES = 56;
const MAX_PAGE = 10_000;
const MAX_ASSET_VALUE = 1_000_000_000_000;
const UNSIGNED_INTEGER = /^(0|[1-9]\d*)$/;

export class BankListQueryError extends Error {}

export interface BankListQuery {
	q?: string;
	states?: string[];
	assetMin?: number;
	assetMax?: number;
	active: 0 | 1 | 'all';
	sort: string;
	order: 'asc' | 'desc';
	page: number;
	limit: number;
	format: 'json' | 'csv';
	download: boolean;
}

function parseInteger(
	raw: string,
	name: string,
	min: number,
	max: number
): number {
	if (!UNSIGNED_INTEGER.test(raw)) {
		throw new BankListQueryError(`${name} must be an integer`);
	}
	const value = Number(raw);
	if (!Number.isSafeInteger(value) || value < min || value > max) {
		throw new BankListQueryError(`${name} must be between ${min} and ${max}`);
	}
	return value;
}

export function parseBankListQuery(searchParams: URLSearchParams): BankListQuery {
	const seen = new Set<string>();
	for (const key of searchParams.keys()) {
		if (!ALLOWED_PARAMS.has(key)) {
			throw new BankListQueryError(`Unknown query parameter: ${key}`);
		}
		if (seen.has(key)) {
			throw new BankListQueryError(`Duplicate query parameter: ${key}`);
		}
		seen.add(key);
	}

	const qRaw = searchParams.get('q');
	const q = qRaw?.trim() || undefined;
	if (q && Array.from(q).length > MAX_QUERY_LENGTH) {
		throw new BankListQueryError(`q must be at most ${MAX_QUERY_LENGTH} characters`);
	}
	if (q && utf8ByteLength(q) > MAX_QUERY_BYTES) {
		throw new BankListQueryError(`q must be at most ${MAX_QUERY_BYTES} UTF-8 bytes`);
	}

	let states: string[] | undefined;
	const stateRaw = searchParams.get('state');
	if (stateRaw !== null) {
		states = stateRaw.split(',').map((state) => state.trim().toUpperCase()).filter(Boolean);
		if (states.length === 0) {
			throw new BankListQueryError('state must contain at least one state code');
		}
		if (states.length > MAX_STATES) {
			throw new BankListQueryError(`state supports at most ${MAX_STATES} state codes`);
		}
		if (new Set(states).size !== states.length) {
			throw new BankListQueryError('state must not contain duplicate state codes');
		}
		const invalidState = states.find((state) => !(state in STATE_NAMES));
		if (invalidState) {
			throw new BankListQueryError(`Unknown state code: ${invalidState}`);
		}
	}

	const assetMinRaw = searchParams.get('asset_min');
	const assetMaxRaw = searchParams.get('asset_max');
	const assetMin = assetMinRaw === null
		? undefined
		: parseInteger(assetMinRaw, 'asset_min', 0, MAX_ASSET_VALUE);
	const assetMax = assetMaxRaw === null
		? undefined
		: parseInteger(assetMaxRaw, 'asset_max', 0, MAX_ASSET_VALUE);
	if (assetMin !== undefined && assetMax !== undefined && assetMin > assetMax) {
		throw new BankListQueryError('asset_min must be less than or equal to asset_max');
	}

	const activeRaw = searchParams.get('active');
	if (activeRaw !== null && activeRaw !== '0' && activeRaw !== '1' && activeRaw !== 'all') {
		throw new BankListQueryError('active must be 0, 1, or all');
	}
	const active = activeRaw === '0' ? 0 : activeRaw === 'all' ? 'all' : 1;

	const sort = (searchParams.get('sort') || 'assets').toLowerCase();
	if (!VALID_SORTS.has(sort)) {
		throw new BankListQueryError(`sort must be one of: ${[...VALID_SORTS].join(', ')}`);
	}

	const order = (searchParams.get('order') || 'desc').toLowerCase();
	if (order !== 'asc' && order !== 'desc') {
		throw new BankListQueryError('order must be asc or desc');
	}

	const page = parseInteger(searchParams.get('page') || '1', 'page', 1, MAX_PAGE);
	const limit = parseInteger(searchParams.get('limit') || '25', 'limit', 1, 100);

	const format = searchParams.get('format') || 'json';
	if (format !== 'json' && format !== 'csv') {
		throw new BankListQueryError('format must be json or csv');
	}

	return {
		q,
		states,
		assetMin,
		assetMax,
		active,
		sort,
		order,
		page,
		limit,
		format,
		download: searchParams.has('download')
	};
}

/** Serialize fixed, effective fields so decoded delimiters cannot collide. */
export function buildBankListCacheKey(query: BankListQuery): string {
	return `banks:list:${JSON.stringify({
		q: query.q ?? null,
		states: query.states ? [...query.states].sort() : null,
		assetMin: query.assetMin ?? null,
		assetMax: query.assetMax ?? null,
		active: query.active,
		sort: query.sort,
		order: query.order,
		page: query.page,
		limit: query.limit
	})}`;
}

/**
 * KV is for the small, shared directory views. User-shaped searches and deep
 * pages stay in D1 so arbitrary inputs cannot consume one KV write each.
 */
export function shouldCacheBankList(query: BankListQuery): boolean {
	return query.q === undefined
		&& query.states === undefined
		&& query.assetMin === undefined
		&& query.assetMax === undefined
		&& query.page <= 20
		&& query.format === 'json'
		&& !query.download;
}
