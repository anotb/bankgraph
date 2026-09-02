import type {
	WebMcpBankSearchRequest,
	WebMcpBankSearchResult,
	WebMcpBankSummary
} from './catalog.js';
import {
	BANK_SCREEN_METRIC_DEFINITIONS,
	bankScreenSearchParams,
	type BankScreenMetric
} from '$lib/bank-screen.js';
import type { WebMcpControllerContext } from './types.js';
import { WebMcpToolError } from './runtime.js';

interface BankApiRow {
	[key: string]: unknown;
	cert?: unknown;
	name?: unknown;
	state?: unknown;
	city?: unknown;
	total_assets?: unknown;
	total_deposits?: unknown;
	num_branches?: unknown;
	num_employees?: unknown;
	latest_repdte?: unknown;
	latest_roa?: unknown;
	latest_roe?: unknown;
	latest_nim?: unknown;
	latest_npl_ratio?: unknown;
	latest_tier1_ratio?: unknown;
}

interface BankApiResponse {
	data?: unknown;
	total?: unknown;
	asOf?: unknown;
	truncated?: unknown;
}

function row(value: unknown): BankApiRow | null {
	return typeof value === 'object' && value !== null && !Array.isArray(value)
		? value as BankApiRow
		: null;
}

function finiteOrNull(value: unknown): number | null {
	return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function textOrNull(value: unknown): string | null {
	return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function mapRow(value: unknown): WebMcpBankSummary | null {
	const source = row(value);
	if (!source || !Number.isSafeInteger(source.cert) || (source.cert as number) <= 0) return null;
	if (typeof source.name !== 'string' || !source.name.trim()) return null;
	return {
		cert: source.cert as number,
		name: source.name.trim().slice(0, 200),
		state: textOrNull(source.state),
		city: textOrNull(source.city),
		totalAssets: finiteOrNull(source.total_assets),
		latestQuarter: textOrNull(source.latest_repdte),
		metrics: Object.fromEntries(
			BANK_SCREEN_METRIC_DEFINITIONS.map(({ screen }) => [
				screen.id,
				finiteOrNull(source[screen.snapshotField])
			])
		) as Record<BankScreenMetric, number | null>
	};
}

function requestUrl(request: WebMcpBankSearchRequest, releaseGeneration: string | null): string {
	const params = bankScreenSearchParams(request);
	if (releaseGeneration) params.set('expected_release_generation', releaseGeneration);
	return `/api/v2/banks/screen?${params}`;
}

async function fetchOne(
	request: WebMcpBankSearchRequest,
	fetcher: typeof fetch,
	context: WebMcpControllerContext,
	releaseGeneration: string | null
): Promise<{ banks: WebMcpBankSummary[]; total: number; asOf: string | null; truncated: boolean }> {
	const response = await fetcher(requestUrl(request, releaseGeneration), {
		signal: context.signal,
		headers: { accept: 'application/json' }
	});
	if (!response.ok) {
		const retryAfter = response.headers.get('retry-after');
		if (response.status === 409) {
			throw new WebMcpToolError(
				'stale_page_release',
				'The published data changed while this page was open. Reload the workspace before continuing.',
				{ httpStatus: 409, expectedReleaseGeneration: releaseGeneration },
				true
			);
		}
		if (response.status === 429) {
			throw new WebMcpToolError(
				'rate_limited',
				'Bank search is temporarily rate limited. Retry after the server-provided interval.',
				{ httpStatus: 429, retryAfter: retryAfter?.slice(0, 80) ?? null },
				true
			);
		}
		if (response.status >= 500) {
			throw new WebMcpToolError(
				'upstream_unavailable',
				`Bank search is temporarily unavailable (HTTP ${response.status}).`,
				{ httpStatus: response.status },
				true
			);
		}
		throw new WebMcpToolError(
			'invalid_request',
			`Bank search rejected the request (HTTP ${response.status}).`,
			{ httpStatus: response.status }
		);
	}
	const body = await response.json() as BankApiResponse;
	const values = Array.isArray(body.data) ? body.data : [];
	return {
		banks: values.map(mapRow).filter((item): item is WebMcpBankSummary => item !== null),
		total: Number.isSafeInteger(body.total) && (body.total as number) >= 0 ? body.total as number : values.length,
		asOf: textOrNull(body.asOf),
		truncated: body.truncated === true
	};
}

export interface CreateBrowserBankSearchOptions {
	fetch?: typeof fetch;
	getAsOf?: () => string | null;
	getReleaseGeneration?: () => string | null;
}

/** Browser adapter for the bounded deterministic latest-institution screen. */
export function createBrowserBankSearch(options: CreateBrowserBankSearchOptions = {}) {
	const fetcher = options.fetch ?? fetch;
	return async (
		request: WebMcpBankSearchRequest,
		context: WebMcpControllerContext
	): Promise<WebMcpBankSearchResult> => {
		const result = await fetchOne(
			request,
			fetcher,
			context,
			options.getReleaseGeneration?.() ?? null
		);
		const banks = result.banks.slice(0, request.limit);
		return {
			banks,
			total: result.total,
			sourceMode: 'live',
			asOf: result.asOf ?? options.getAsOf?.() ?? banks.find((bank) => bank.latestQuarter)?.latestQuarter ?? null,
			refreshedAt: null,
			truncated: result.truncated || result.total > banks.length || result.banks.length > banks.length
		};
	};
}
