import { jsonResponse } from '$lib/server/response';
import type { ReleaseLineage } from '$lib/types';

/** Optional query/header contract used to keep post-SSR reads on the page's release. */
export const EXPECTED_RELEASE_GENERATION_PARAM = 'expected_release_generation';
export const EXPECTED_RELEASE_GENERATION_HEADER = 'x-bankgraph-expected-release-generation';

export interface ReleaseFenceInput {
	locals?: App.Locals;
	url?: URL;
	request?: Request;
}

export function releaseLineage(locals?: App.Locals): ReleaseLineage {
	return {
		release: locals?.liveDataRelease ?? null,
		release_generation: locals?.liveDataGeneration ?? null
	};
}

function expectedReleaseGeneration({ url, request }: ReleaseFenceInput): string | null {
	const queryValue = url?.searchParams.get(EXPECTED_RELEASE_GENERATION_PARAM);
	const headerValue = request?.headers.get(EXPECTED_RELEASE_GENERATION_HEADER);
	// A query value is the canonical public contract. The header is accepted for
	// clients that cannot safely rewrite a request URL.
	return queryValue ?? headerValue ?? null;
}

/**
 * Reject a dynamic read when the page's generation no longer matches the
 * generation admitted by the publication barrier for this request.
 *
 * Omitting the expectation preserves the existing public API. Callers that do
 * provide it receive one stable, machine-readable 409 failure mode.
 */
export function stalePageReleaseResponse(input: ReleaseFenceInput): Response | null {
	const expected = expectedReleaseGeneration(input);
	if (expected === null || expected === input.locals?.liveDataGeneration) return null;

	return jsonResponse({
		error: 'stale_page_release',
		expected_release_generation: expected,
		...releaseLineage(input.locals)
	}, 409);
}

/** Add release identity to non-JSON artifacts without changing their columns. */
export function setReleaseLineageHeaders(response: Response, lineage: ReleaseLineage): Response {
	if (lineage.release !== null) response.headers.set('X-Bankgraph-Release', lineage.release);
	if (lineage.release_generation !== null) {
		response.headers.set('X-Bankgraph-Release-Generation', lineage.release_generation);
	}
	return response;
}
