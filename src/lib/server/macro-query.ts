import { MACRO_SERIES_BY_ID } from '$lib/server/pipeline/macro-sources';
import { EXPECTED_RELEASE_GENERATION_PARAM } from '$lib/server/release-lineage';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const ALLOWED_PARAMS = new Set(['from', 'to', 'limit', EXPECTED_RELEASE_GENERATION_PARAM]);
const DEFAULT_LIMIT = 5_000;
const MAX_LIMIT = 5_000;
const DEFAULT_WINDOW_YEARS = 10;

export class MacroQueryError extends Error {}

export interface MacroQuery {
	seriesId: string;
	from: string;
	to: string;
	limit: number;
}

function isCalendarDate(value: string): boolean {
	if (!ISO_DATE.test(value)) return false;
	const date = new Date(`${value}T00:00:00.000Z`);
	return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function defaultFrom(to: string): string {
	const date = new Date(`${to}T00:00:00.000Z`);
	date.setUTCFullYear(date.getUTCFullYear() - DEFAULT_WINDOW_YEARS);
	return date.toISOString().slice(0, 10);
}

export function parseMacroQuery(
	seriesIdRaw: string,
	searchParams: URLSearchParams,
	today = new Date().toISOString().slice(0, 10)
): MacroQuery {
	const seen = new Set<string>();
	for (const key of searchParams.keys()) {
		if (!ALLOWED_PARAMS.has(key)) throw new MacroQueryError(`Unknown query parameter: ${key}`);
		if (seen.has(key)) throw new MacroQueryError(`Duplicate query parameter: ${key}`);
		seen.add(key);
	}

	const seriesId = seriesIdRaw.trim().toUpperCase();
	if (
		seriesId.length > 32 ||
		!/^[A-Z0-9_]+$/.test(seriesId) ||
		!MACRO_SERIES_BY_ID.has(seriesId)
	) {
		throw new MacroQueryError('Unknown macro series');
	}

	const to = searchParams.get('to') ?? today;
	if (!isCalendarDate(to)) {
		throw new MacroQueryError('to must be a real calendar date in YYYY-MM-DD format');
	}
	const from = searchParams.get('from') ?? defaultFrom(to);
	if (!isCalendarDate(from)) {
		throw new MacroQueryError('from must be a real calendar date in YYYY-MM-DD format');
	}
	if (from > to) throw new MacroQueryError('from must not be after to');
	if (from < defaultFrom(to)) throw new MacroQueryError('Macro queries are limited to a 10-year window');

	const limitRaw = searchParams.get('limit') ?? String(DEFAULT_LIMIT);
	if (!/^\d+$/.test(limitRaw)) throw new MacroQueryError('limit must be a positive integer');
	const limit = Number(limitRaw);
	if (limit < 1 || limit > MAX_LIMIT) throw new MacroQueryError(`limit must be between 1 and ${MAX_LIMIT}`);
	return { seriesId, from, to, limit };
}
