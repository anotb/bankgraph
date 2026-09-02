import { describe, expect, it } from 'vitest';
import { load } from '../../routes/compare/+page.server';

async function readRedirect(url: string): Promise<{ status: number; location: string }> {
	try {
		await load({ url: new URL(url) } as never);
		throw new Error('Expected the legacy compare route to redirect');
	} catch (error) {
		return error as { status: number; location: string };
	}
}

describe('compare page server load', () => {
	it('redirects the legacy comparison route to the Atlas peer-comparison board', async () => {
		const result = await readRedirect('https://example.test/compare');

		expect(result).toEqual({
			status: 307,
			location: '/b?template=peer_comparison'
		});
	});

	it('preserves encoded board state while dropping obsolete comparison parameters', async () => {
		const result = await readRedirect(
			'https://example.test/compare?certs=10,20&ws=shared-state&wv=wide-view&wm=metric-state'
		);

		expect(result).toEqual({
			status: 307,
			location: '/b?template=peer_comparison&ws=shared-state&wv=wide-view&wm=metric-state'
		});
	});
});
