import { describe, expect, it } from 'vitest';
import { load } from '../../routes/workspace/+page.server';

async function readRedirect(url: string): Promise<{ status: number; location: string }> {
	try {
		await load({ url: new URL(url) } as never);
		throw new Error('Expected the legacy workspace route to redirect');
	} catch (error) {
		return error as { status: number; location: string };
	}
}

describe('workspace page server load', () => {
	it('redirects to the Atlas board and carries forward shared workspace state', async () => {
		const result = await readRedirect(
			'https://bankgraph.test/workspace?demo=recorded&ws=shared-state&wv=board-view&wm=metric-state'
		);

		expect(result).toEqual({
			status: 307,
			location: '/b?ws=shared-state&wv=board-view&wm=metric-state'
		});
	});
});
