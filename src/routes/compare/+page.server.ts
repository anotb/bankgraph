import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

/** Legacy route: this surface is now a board. Shared workspace state carries over. */
export const load: PageServerLoad = ({ url }) => {
	const target = new URL('/b?template=peer_comparison', url.origin);
	for (const key of ['ws', 'wv', 'wm']) {
		const value = url.searchParams.get(key);
		if (value) target.searchParams.set(key, value);
	}
	throw redirect(307, target.pathname + target.search);
};