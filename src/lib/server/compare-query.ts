import { utf8ByteLength } from '$lib/server/query-bytes';
import { EXPECTED_RELEASE_GENERATION_PARAM } from '$lib/server/release-lineage';

const ALLOWED_PARAMS = new Set([
	'certs', 'metrics', 'from', 'to', 'format', 'download', EXPECTED_RELEASE_GENERATION_PARAM
]);
const DEFAULT_METRICS = ['roa', 'roe', 'nimy'];
const MAX_QUERY_BYTES = 4_096;
const MAX_CERTS_TEXT_LENGTH = 160;
const MAX_METRICS_TEXT_LENGTH = 2_048;
const MAX_CERT = 9_999_999;

export class CompareQueryError extends Error {}

export interface CompareQuery {
	certs: number[];
	metrics: string[];
	from: string | null;
	to: string | null;
	format: 'json' | 'csv';
	download: boolean;
}

function parseDate(value: string | null, name: string): string | null {
	if (value === null) return null;
	if (!/^\d{8}$/.test(value)) throw new CompareQueryError(`${name} must be YYYYMMDD format`);
	const iso = `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`;
	const date = new Date(`${iso}T00:00:00.000Z`);
	if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== iso) {
		throw new CompareQueryError(`${name} must be a real calendar date`);
	}
	return value;
}

export function parseCompareQuery(
	searchParams: URLSearchParams,
	validMetrics: ReadonlySet<string>
): CompareQuery {
	if (utf8ByteLength(searchParams.toString()) > MAX_QUERY_BYTES) {
		throw new CompareQueryError(`query must be at most ${MAX_QUERY_BYTES} encoded bytes`);
	}
	const seen = new Set<string>();
	for (const key of searchParams.keys()) {
		if (!ALLOWED_PARAMS.has(key)) throw new CompareQueryError(`Unknown query parameter: ${key}`);
		if (seen.has(key)) throw new CompareQueryError(`Duplicate query parameter: ${key}`);
		seen.add(key);
	}

	const certsRaw = searchParams.get('certs');
	if (!certsRaw) throw new CompareQueryError('certs parameter is required (comma-separated)');
	if (certsRaw.length > MAX_CERTS_TEXT_LENGTH) throw new CompareQueryError('certs parameter is too long');
	const certTokens = certsRaw.split(',').map((value) => value.trim()).filter(Boolean);
	if (!certTokens.length || certTokens.some((value) => !/^[1-9]\d*$/.test(value))) {
		throw new CompareQueryError('certs must contain positive integers');
	}
	const certs = [...new Set(certTokens.map(Number))];
	if (certs.some((value) => !Number.isSafeInteger(value) || value > MAX_CERT)) {
		throw new CompareQueryError(`certs must not exceed ${MAX_CERT}`);
	}
	if (certs.length > 10) throw new CompareQueryError('Maximum 10 unique certs allowed');

	const metricsRaw = searchParams.get('metrics');
	if (metricsRaw !== null && metricsRaw.length > MAX_METRICS_TEXT_LENGTH) {
		throw new CompareQueryError('metrics parameter is too long');
	}
	const metricTokens = (metricsRaw?.trim() ? metricsRaw : DEFAULT_METRICS.join(','))
		.split(',')
		.map((value) => value.trim())
		.filter(Boolean);
	const metrics = [...new Set(metricTokens)];
	if (!metrics.length) throw new CompareQueryError('metrics must contain at least one field');
	if (metrics.length > validMetrics.size) throw new CompareQueryError('metrics contains too many fields');
	const invalid = metrics.filter((metric) => !validMetrics.has(metric));
	if (invalid.length) throw new CompareQueryError(`Invalid metrics: ${invalid.join(', ')}`);

	const from = parseDate(searchParams.get('from'), 'from');
	const to = parseDate(searchParams.get('to'), 'to');
	if (from && to && from > to) throw new CompareQueryError('from must not be after to');

	const format = searchParams.get('format') ?? 'json';
	if (format !== 'json' && format !== 'csv') throw new CompareQueryError('format must be json or csv');

	return { certs, metrics, from, to, format, download: searchParams.has('download') };
}
