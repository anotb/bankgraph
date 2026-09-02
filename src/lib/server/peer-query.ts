import { utf8ByteLength } from '$lib/server/query-bytes';

const DEFAULT_METRICS = ['roa', 'roe', 'nimy', 'eeffr', 'nclnlsr', 'rbcrwaj'] as const;
const VALID_METRICS = new Set([
	'roa',
	'roe',
	'nimy',
	'eeffr',
	'nclnlsr',
	'rbcrwaj',
	'lnlsdepr',
	'eqv'
]);

const MAX_METRICS = 8;
const MAX_METRICS_QUERY_LENGTH = 256;

export class PeerMetricsQueryError extends Error {}

export function parsePeerMetrics(searchParams: URLSearchParams): string[] {
	const values = searchParams.getAll('metrics');
	if (values.length === 0) return [...DEFAULT_METRICS];
	if (values.length > 1) {
		throw new PeerMetricsQueryError('Duplicate query parameter: metrics');
	}

	const raw = values[0];
	if (utf8ByteLength(raw) > MAX_METRICS_QUERY_LENGTH) {
		throw new PeerMetricsQueryError(
			`metrics must be at most ${MAX_METRICS_QUERY_LENGTH} UTF-8 bytes`
		);
	}

	const requested = raw.split(',').map((metric) => metric.trim()).filter(Boolean);
	if (requested.length === 0) {
		throw new PeerMetricsQueryError('metrics parameter must not be empty');
	}

	const metrics = [...new Set(requested)];
	if (metrics.length > MAX_METRICS) {
		throw new PeerMetricsQueryError(`metrics supports at most ${MAX_METRICS} unique values`);
	}

	const invalid = metrics.filter((metric) => !VALID_METRICS.has(metric));
	if (invalid.length > 0) {
		throw new PeerMetricsQueryError(`Invalid metrics: ${invalid.join(', ')}`);
	}
	return metrics;
}

/** Cache only the finite, shared default peer view; custom slices stay in D1. */
export function shouldCachePeerRequest(searchParams: URLSearchParams): boolean {
	return !searchParams.has('metrics')
		&& !searchParams.has('repdte')
		&& (searchParams.get('format') === null || searchParams.get('format') === 'json')
		&& !searchParams.has('download');
}
