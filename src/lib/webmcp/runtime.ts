/** A controller failure with a stable public code and bounded JSON-safe details. */
export class WebMcpToolError extends Error {
	readonly code: string;
	readonly retryable: boolean;
	readonly details?: Record<string, string | number | boolean | null>;

	constructor(
		code: string,
		message: string,
		details?: Record<string, string | number | boolean | null>,
		retryable = false
	) {
		super(message);
		this.name = 'WebMcpToolError';
		this.code = code;
		this.retryable = retryable;
		this.details = details;
	}
}

/** Runtime validation for WebMCP controllers. Native schema validation is not a trust boundary. */
export class WebMcpInputError extends WebMcpToolError {
	constructor(message: string) {
		super('invalid_input', `Invalid tool input: ${message}`);
		this.name = 'WebMcpInputError';
	}
}

export function staleRevision(expected: number, actual: number): WebMcpToolError {
	return new WebMcpToolError(
		'stale_revision',
		`Workspace revision ${expected} is stale; the current revision is ${actual}. Read bankgraph.get_context and retry against the new revision.`,
		{ expectedRevision: expected, currentRevision: actual, nextAction: 'bankgraph.get_context' },
		true
	);
}

export function inputObject(
	value: unknown,
	allowed: readonly string[],
	path = 'input'
): Record<string, unknown> {
	if (typeof value !== 'object' || value === null || Array.isArray(value)) {
		throw new WebMcpInputError(`${path} must be an object`);
	}
	const source = value as Record<string, unknown>;
	const unknown = Object.keys(source).filter((key) => !allowed.includes(key));
	if (unknown.length) throw new WebMcpInputError(`${path} contains unknown field ${unknown[0]}`);
	return source;
}

export function optionalRevision(value: unknown): number | undefined {
	if (value === undefined) return undefined;
	return integer(value, 'ifRevision', 0, Number.MAX_SAFE_INTEGER);
}

export function stringValue(
	value: unknown,
	path: string,
	options: { max: number; min?: number; trim?: boolean } = { max: 200 }
): string {
	if (typeof value !== 'string') throw new WebMcpInputError(`${path} must be a string`);
	const candidate = options.trim === false ? value : value.trim();
	if (candidate.length < (options.min ?? 0)) {
		throw new WebMcpInputError(`${path} must contain at least ${options.min ?? 0} characters`);
	}
	if (candidate.length > options.max) {
		throw new WebMcpInputError(`${path} must contain at most ${options.max} characters`);
	}
	return candidate;
}

export function optionalString(
	value: unknown,
	path: string,
	options: { max: number; min?: number; trim?: boolean }
): string | undefined {
	return value === undefined ? undefined : stringValue(value, path, options);
}

export function enumValue<T extends string>(
	value: unknown,
	path: string,
	values: readonly T[]
): T {
	if (typeof value !== 'string' || !values.includes(value as T)) {
		throw new WebMcpInputError(`${path} must be one of ${values.join(', ')}`);
	}
	return value as T;
}

export function booleanValue(value: unknown, path: string): boolean {
	if (typeof value !== 'boolean') throw new WebMcpInputError(`${path} must be a boolean`);
	return value;
}

export function finiteNumber(value: unknown, path: string, min: number, max: number): number {
	if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) {
		throw new WebMcpInputError(`${path} must be a finite number from ${min} to ${max}`);
	}
	return value;
}

export function integer(value: unknown, path: string, min: number, max: number): number {
	const candidate = finiteNumber(value, path, min, max);
	if (!Number.isSafeInteger(candidate)) throw new WebMcpInputError(`${path} must be an integer`);
	return candidate;
}

export function optionalNumber(
	value: unknown,
	path: string,
	min: number,
	max: number
): number | undefined {
	return value === undefined ? undefined : finiteNumber(value, path, min, max);
}

export function arrayValue<T>(
	value: unknown,
	path: string,
	options: { min?: number; max: number; map: (item: unknown, index: number) => T }
): T[] {
	if (!Array.isArray(value)) throw new WebMcpInputError(`${path} must be an array`);
	if (value.length < (options.min ?? 0) || value.length > options.max) {
		throw new WebMcpInputError(
			`${path} must contain ${(options.min ?? 0)} to ${options.max} items`
		);
	}
	return value.map(options.map);
}

export function unique<T>(values: T[], path: string): T[] {
	if (new Set(values).size !== values.length) {
		throw new WebMcpInputError(`${path} must not contain duplicates`);
	}
	return values;
}

export function cert(value: unknown, path: string): number {
	return integer(value, path, 1, 99_999_999);
}

export function stateCode(value: unknown, path: string): string {
	const state = stringValue(value, path, { min: 2, max: 2 }).toUpperCase();
	if (!/^[A-Z]{2}$/.test(state)) throw new WebMcpInputError(`${path} must be a two-letter code`);
	return state;
}

export function reportingPeriod(value: unknown, path: string): string {
	const period = stringValue(value, path, { min: 6, max: 8 });
	if (!/^(?:\d{4}(?:0331|0630|0930|1231)|\d{4}Q[1-4])$/.test(period)) {
		throw new WebMcpInputError(`${path} must be a quarter-end YYYYMMDD or YYYYQn`);
	}
	const quarter = /^(\d{4})Q([1-4])$/.exec(period);
	if (!quarter) return period;
	const ending = ['0331', '0630', '0930', '1231'][Number(quarter[2]) - 1];
	return `${quarter[1]}${ending}`;
}

export function identifier(value: unknown, path: string): string {
	const id = stringValue(value, path, { min: 1, max: 64 });
	if (!/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,63}$/.test(id)) {
		throw new WebMcpInputError(`${path} contains unsupported characters`);
	}
	return id;
}

export function metric(value: unknown, path: string): string {
	const name = stringValue(value, path, { min: 1, max: 64 });
	if (!/^[A-Za-z][A-Za-z0-9_:. -]{0,63}$/.test(name)) {
		throw new WebMcpInputError(`${path} contains unsupported characters`);
	}
	return name;
}
