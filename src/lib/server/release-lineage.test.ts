import { describe, expect, it } from 'vitest';
import {
	EXPECTED_RELEASE_GENERATION_HEADER,
	releaseLineage,
	stalePageReleaseResponse
} from './release-lineage';

const locals: App.Locals = {
	liveDataRelease: '20260630',
	liveDataGeneration: 'generation-42'
};

describe('dynamic release lineage fence', () => {
	it('keeps the expectation optional and accepts the active generation', () => {
		expect(stalePageReleaseResponse({
			locals,
			url: new URL('https://bankgraph.test/api/v1/compare')
		})).toBeNull();
		expect(stalePageReleaseResponse({
			locals,
			url: new URL('https://bankgraph.test/api/v1/compare?expected_release_generation=generation-42')
		})).toBeNull();
		expect(releaseLineage(locals)).toEqual({
			release: '20260630',
			release_generation: 'generation-42'
		});
	});

	it('returns the stable stale_page_release 409 before a dynamic read', async () => {
		const response = stalePageReleaseResponse({
			locals,
			url: new URL('https://bankgraph.test/api/v1/compare?expected_release_generation=generation-41')
		});

		expect(response?.status).toBe(409);
		expect(await response?.json()).toEqual({
			error: 'stale_page_release',
			expected_release_generation: 'generation-41',
			release: '20260630',
			release_generation: 'generation-42'
		});
	});

	it('also accepts the expected generation header', () => {
		const request = new Request('https://bankgraph.test/api/v2/system-brief', {
			headers: { [EXPECTED_RELEASE_GENERATION_HEADER]: 'generation-42' }
		});
		expect(stalePageReleaseResponse({ locals, request })).toBeNull();
	});
});
