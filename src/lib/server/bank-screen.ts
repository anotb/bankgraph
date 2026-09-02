import {
	BANK_SCREEN_MAX_CONDITIONS,
	BANK_SCREEN_MAX_LIMIT,
	BANK_SCREEN_METRIC_DEFINITIONS,
	BANK_SCREEN_METRIC_RULES,
	BANK_SCREEN_METRICS,
	BANK_SCREEN_OPERATORS,
	BANK_SCREEN_SORTS,
	type BankScreenCondition,
	type BankScreenMetric,
	type BankScreenOperator,
	type BankScreenRequest,
	type BankScreenSort
} from '$lib/bank-screen';
import { queryAll, queryOne } from '$lib/server/db';
import { utf8ByteLength } from '$lib/server/query-bytes';
import { STATE_NAMES } from '$lib/utils/states';
import type { Institution, ReleaseLineage } from '$lib/types';
import { EXPECTED_RELEASE_GENERATION_PARAM } from '$lib/server/release-lineage';

const MAX_QUERY_LENGTH = 120;
const MAX_QUERY_BYTES = 120;
const MAX_CONDITIONS_JSON_LENGTH = 6_000;
const MAX_STATES = Object.keys(STATE_NAMES).length;
const MAX_BALANCE_VALUE = BANK_SCREEN_METRIC_RULES.assets.maximum;

interface MetricSpec {
	column: string;
	unit: 'usd_thousands' | 'percent' | 'count';
	minimum: number;
	maximum: number;
	integer: boolean;
}

export const BANK_SCREEN_METRIC_SPECS: Record<BankScreenMetric, MetricSpec> = Object.fromEntries(
	BANK_SCREEN_METRIC_DEFINITIONS.map(({ screen }) => [
		screen.id,
		{ column: screen.snapshotField, ...BANK_SCREEN_METRIC_RULES[screen.id] }
	])
) as Record<BankScreenMetric, MetricSpec>;

const OPERATOR_SQL: Record<Exclude<BankScreenOperator, 'between'>, string> = {
	eq: '=',
	ne: '!=',
	gt: '>',
	gte: '>=',
	lt: '<',
	lte: '<='
};

const ALLOWED_QUERY_PARAMS = new Set([
	'q', 'state', 'active', 'asset_min', 'asset_max', 'conditions', 'sort', 'order', 'limit', 'offset',
	EXPECTED_RELEASE_GENERATION_PARAM
]);

const SELECT_COLUMNS = [
	'cert', 'name', 'state', 'city', 'active', 'total_assets', 'total_deposits',
	'num_branches', 'num_employees', 'latest_repdte', 'latest_roa', 'latest_roe',
	'latest_nim', 'latest_npl_ratio', 'latest_tier1_ratio'
].join(', ');

export class BankScreenInputError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'BankScreenInputError';
	}
}

export interface CompiledBankScreen {
	whereSql: string;
	params: unknown[];
	sortSql: string;
	limit: number;
	offset: number;
}

export type BankScreenRow = Pick<Institution,
	| 'cert' | 'name' | 'state' | 'city' | 'active'
	| 'total_assets' | 'total_deposits' | 'num_branches' | 'num_employees'
	| 'latest_repdte' | 'latest_roa' | 'latest_roe' | 'latest_nim'
	| 'latest_npl_ratio' | 'latest_tier1_ratio'
>;

export interface BankScreenResponse {
	data: BankScreenRow[];
	total: number;
	limit: number;
	truncated: boolean;
	asOf: string | null;
	provenance: ReleaseLineage & {
		source: 'FDIC BankFind';
		dataset: 'institutions';
		basis: 'latest values stored for each institution';
		conditionLogic: 'and';
		nullBehavior: 'exclude when a condition references a null metric';
		units: Record<BankScreenMetric, MetricSpec['unit']>;
	};
}

/**
 * Cache only the small, finite family of unfiltered active-bank screens used by
 * the workspace. User-supplied search/filter combinations deliberately bypass KV
 * so arbitrary public queries cannot create unbounded cache cardinality.
 */
export function commonBankScreenCacheKey(request: BankScreenRequest): string | null {
	if (
		request.query !== ''
		|| request.states.length > 0
		|| request.active !== 'active'
		|| request.assetMin !== null
		|| request.assetMax !== null
		|| request.conditions.length > 0
		|| (request.offset ?? 0) !== 0
		|| request.limit !== BANK_SCREEN_MAX_LIMIT
	) return null;
	return `bank-screen:v1:active:${request.sort}:${request.order}:${request.limit}`;
}

function finiteNumber(value: unknown, path: string, minimum: number, maximum: number): number {
	if (typeof value !== 'number' || !Number.isFinite(value) || value < minimum || value > maximum) {
		throw new BankScreenInputError(`${path} must be a finite number from ${minimum} to ${maximum}`);
	}
	return value;
}

function metricValue(value: unknown, metric: BankScreenMetric, path: string): number {
	const spec = BANK_SCREEN_METRIC_SPECS[metric];
	const candidate = finiteNumber(value, path, spec.minimum, spec.maximum);
	if (spec.integer && !Number.isSafeInteger(candidate)) {
		throw new BankScreenInputError(`${path} must be an integer for ${metric}`);
	}
	return candidate;
}

function enumValue<T extends string>(value: unknown, path: string, values: readonly T[]): T {
	if (typeof value !== 'string' || !values.includes(value as T)) {
		throw new BankScreenInputError(`${path} must be one of: ${values.join(', ')}`);
	}
	return value as T;
}

function object(value: unknown, path: string): Record<string, unknown> {
	if (typeof value !== 'object' || value === null || Array.isArray(value)) {
		throw new BankScreenInputError(`${path} must be an object`);
	}
	return value as Record<string, unknown>;
}

function parseCondition(value: unknown, index: number): BankScreenCondition {
	const path = `conditions[${index}]`;
	const source = object(value, path);
	const allowed = new Set(['metric', 'operator', 'value', 'upperValue']);
	const unknown = Object.keys(source).find((key) => !allowed.has(key));
	if (unknown) throw new BankScreenInputError(`${path} contains unknown field ${unknown}`);

	const metric = enumValue(source.metric, `${path}.metric`, BANK_SCREEN_METRICS);
	const operator = enumValue(source.operator, `${path}.operator`, BANK_SCREEN_OPERATORS);
	const conditionValue = metricValue(source.value, metric, `${path}.value`);
	const upperValue = source.upperValue === undefined || source.upperValue === null
		? null
		: metricValue(source.upperValue, metric, `${path}.upperValue`);

	if (operator === 'between') {
		if (upperValue === null) throw new BankScreenInputError(`${path}.upperValue is required for between`);
		if (conditionValue > upperValue) throw new BankScreenInputError(`${path}.value must not exceed upperValue`);
	} else if (upperValue !== null) {
		throw new BankScreenInputError(`${path}.upperValue is only valid for between`);
	}

	return { metric, operator, value: conditionValue, upperValue };
}

function parseInteger(raw: string, path: string, minimum: number, maximum: number): number {
	if (!/^(0|[1-9]\d*)$/.test(raw)) throw new BankScreenInputError(`${path} must be an integer`);
	const value = Number(raw);
	if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
		throw new BankScreenInputError(`${path} must be between ${minimum} and ${maximum}`);
	}
	return value;
}

function parseConditions(raw: string | null): BankScreenCondition[] {
	if (raw === null || raw === '') return [];
	if (raw.length > MAX_CONDITIONS_JSON_LENGTH) {
		throw new BankScreenInputError(`conditions must be at most ${MAX_CONDITIONS_JSON_LENGTH} characters`);
	}
	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch {
		throw new BankScreenInputError('conditions must be a JSON array');
	}
	if (!Array.isArray(parsed)) throw new BankScreenInputError('conditions must be a JSON array');
	if (parsed.length > BANK_SCREEN_MAX_CONDITIONS) {
		throw new BankScreenInputError(`conditions supports at most ${BANK_SCREEN_MAX_CONDITIONS} items`);
	}
	return parsed.map(parseCondition);
}

export function parseBankScreenRequest(searchParams: URLSearchParams): BankScreenRequest {
	const seen = new Set<string>();
	for (const key of searchParams.keys()) {
		if (!ALLOWED_QUERY_PARAMS.has(key)) throw new BankScreenInputError(`Unknown query parameter: ${key}`);
		if (seen.has(key)) throw new BankScreenInputError(`Duplicate query parameter: ${key}`);
		seen.add(key);
	}

	const query = (searchParams.get('q') ?? '').trim();
	if (Array.from(query).length > MAX_QUERY_LENGTH) {
		throw new BankScreenInputError(`q must be at most ${MAX_QUERY_LENGTH} characters`);
	}
	if (utf8ByteLength(query) > MAX_QUERY_BYTES) {
		throw new BankScreenInputError(`q must be at most ${MAX_QUERY_BYTES} UTF-8 bytes`);
	}

	const stateRaw = searchParams.get('state');
	const states = stateRaw === null || stateRaw === ''
		? []
		: stateRaw.split(',').map((state) => state.trim().toUpperCase());
	if (states.some((state) => !state)) throw new BankScreenInputError('state must not contain empty codes');
	if (states.length > MAX_STATES) throw new BankScreenInputError(`state supports at most ${MAX_STATES} codes`);
	if (new Set(states).size !== states.length) throw new BankScreenInputError('state must not contain duplicate codes');
	const invalidState = states.find((state) => !(state in STATE_NAMES));
	if (invalidState) throw new BankScreenInputError(`Unknown state code: ${invalidState}`);

	const activeRaw = searchParams.get('active') ?? 'active';
	const active = enumValue(activeRaw, 'active', ['any', 'active', 'inactive'] as const);

	const assetMinRaw = searchParams.get('asset_min');
	const assetMaxRaw = searchParams.get('asset_max');
	const assetMin = assetMinRaw === null ? null : parseInteger(assetMinRaw, 'asset_min', 0, MAX_BALANCE_VALUE);
	const assetMax = assetMaxRaw === null ? null : parseInteger(assetMaxRaw, 'asset_max', 0, MAX_BALANCE_VALUE);
	if (assetMin !== null && assetMax !== null && assetMin > assetMax) {
		throw new BankScreenInputError('asset_min must not exceed asset_max');
	}

	return {
		query,
		states,
		active,
		assetMin,
		assetMax,
		conditions: parseConditions(searchParams.get('conditions')),
		sort: enumValue(searchParams.get('sort') ?? 'assets', 'sort', BANK_SCREEN_SORTS),
		order: enumValue((searchParams.get('order') ?? 'desc').toLowerCase(), 'order', ['asc', 'desc'] as const),
		limit: parseInteger(searchParams.get('limit') ?? '25', 'limit', 1, BANK_SCREEN_MAX_LIMIT),
		offset: parseInteger(searchParams.get('offset') ?? '0', 'offset', 0, 100_000)
	};
}

/** Compile only allowlisted columns/operators. Every user value remains a bound parameter. */
export function compileBankScreen(request: BankScreenRequest): CompiledBankScreen {
	if (typeof request.query !== 'string' || Array.from(request.query).length > MAX_QUERY_LENGTH) {
		throw new BankScreenInputError(`q must be at most ${MAX_QUERY_LENGTH} characters`);
	}
	if (utf8ByteLength(request.query) > MAX_QUERY_BYTES) {
		throw new BankScreenInputError(`q must be at most ${MAX_QUERY_BYTES} UTF-8 bytes`);
	}
	if (!Array.isArray(request.states) || request.states.length > MAX_STATES) {
		throw new BankScreenInputError(`state supports at most ${MAX_STATES} codes`);
	}
	if (new Set(request.states).size !== request.states.length) {
		throw new BankScreenInputError('state must not contain duplicate codes');
	}
	const invalidState = request.states.find((state) => typeof state !== 'string' || !(state in STATE_NAMES));
	if (invalidState !== undefined) throw new BankScreenInputError(`Unknown state code: ${String(invalidState)}`);
	enumValue(request.active, 'active', ['any', 'active', 'inactive'] as const);
	if (request.assetMin !== null) metricValue(request.assetMin, 'assets', 'asset_min');
	if (request.assetMax !== null) metricValue(request.assetMax, 'assets', 'asset_max');
	if (request.assetMin !== null && request.assetMax !== null && request.assetMin > request.assetMax) {
		throw new BankScreenInputError('asset_min must not exceed asset_max');
	}
	if (!Array.isArray(request.conditions)) throw new BankScreenInputError('conditions must be an array');
	if (request.conditions.length > BANK_SCREEN_MAX_CONDITIONS) {
		throw new BankScreenInputError(`conditions supports at most ${BANK_SCREEN_MAX_CONDITIONS} items`);
	}
	if (!Number.isSafeInteger(request.limit) || request.limit < 1 || request.limit > BANK_SCREEN_MAX_LIMIT) {
		throw new BankScreenInputError(`limit must be between 1 and ${BANK_SCREEN_MAX_LIMIT}`);
	}
	const offset = request.offset ?? 0;
	if (!Number.isSafeInteger(offset) || offset < 0 || offset > 100_000) {
		throw new BankScreenInputError('offset must be between 0 and 100000');
	}

	const conditions: string[] = [];
	const params: unknown[] = [];
	if (request.query) {
		conditions.push('INSTR(LOWER(name), LOWER(?)) > 0');
		params.push(request.query);
	}
	if (request.states.length) {
		conditions.push(`state IN (${request.states.map(() => '?').join(', ')})`);
		params.push(...request.states);
	}
	if (request.active !== 'any') {
		conditions.push('active = ?');
		params.push(request.active === 'active' ? 1 : 0);
	}
	if (request.assetMin !== null) {
		conditions.push('total_assets IS NOT NULL AND total_assets >= ?');
		params.push(request.assetMin);
	}
	if (request.assetMax !== null) {
		conditions.push('total_assets IS NOT NULL AND total_assets <= ?');
		params.push(request.assetMax);
	}

	for (let index = 0; index < request.conditions.length; index += 1) {
		const condition = parseCondition(request.conditions[index], index);
		const { metric, operator, value } = condition;
		const column = BANK_SCREEN_METRIC_SPECS[metric].column;
		if (operator === 'between') {
			if (condition.upperValue === null) throw new BankScreenInputError(`conditions[${index}].upperValue is required for between`);
			const upperValue = metricValue(condition.upperValue, metric, `conditions[${index}].upperValue`);
			if (value > upperValue) throw new BankScreenInputError(`conditions[${index}].value must not exceed upperValue`);
			conditions.push(`${column} IS NOT NULL AND ${column} BETWEEN ? AND ?`);
			params.push(value, upperValue);
		} else {
			if (condition.upperValue !== null) throw new BankScreenInputError(`conditions[${index}].upperValue is only valid for between`);
			conditions.push(`${column} IS NOT NULL AND ${column} ${OPERATOR_SQL[operator]} ?`);
			params.push(value);
		}
	}

	const sort = enumValue(request.sort, 'sort', BANK_SCREEN_SORTS);
	const order = enumValue(request.order, 'order', ['asc', 'desc'] as const).toUpperCase();
	const sortColumn = sort === 'name' ? 'name' : BANK_SCREEN_METRIC_SPECS[sort as BankScreenMetric].column;
	const sortSql = sort === 'name'
		? `name ${order}, cert ASC`
		: `${sortColumn} IS NULL ASC, ${sortColumn} ${order}, name ASC, cert ASC`;

	return {
		whereSql: conditions.length ? `WHERE ${conditions.map((condition) => `(${condition})`).join(' AND ')}` : '',
		params,
		sortSql,
		limit: request.limit,
		offset
	};
}

export async function screenBanks(
	db: D1Database,
	request: BankScreenRequest,
	lineage: ReleaseLineage = { release: null, release_generation: null }
): Promise<BankScreenResponse> {
	const compiled = compileBankScreen(request);
	const summarySql = `SELECT COUNT(*) AS total, MAX(latest_repdte) AS as_of FROM published_institutions ${compiled.whereSql}`;
	const dataSql = `SELECT ${SELECT_COLUMNS} FROM published_institutions ${compiled.whereSql} ORDER BY ${compiled.sortSql} LIMIT ? OFFSET ?`;
	const [summary, data] = await Promise.all([
		queryOne<{ total: number; as_of: string | null }>(db, summarySql, compiled.params),
		queryAll<BankScreenRow>(db, dataSql, [...compiled.params, compiled.limit, compiled.offset])
	]);
	const total = summary?.total ?? 0;
	return {
		data,
		total,
		limit: compiled.limit,
		truncated: compiled.offset + data.length < total,
		asOf: summary?.as_of ?? null,
		provenance: {
			...lineage,
			source: 'FDIC BankFind',
			dataset: 'institutions',
			basis: 'latest values stored for each institution',
			conditionLogic: 'and',
			nullBehavior: 'exclude when a condition references a null metric',
			units: Object.fromEntries(BANK_SCREEN_METRICS.map((metric) => [metric, BANK_SCREEN_METRIC_SPECS[metric].unit])) as Record<BankScreenMetric, MetricSpec['unit']>
		}
	};
}
