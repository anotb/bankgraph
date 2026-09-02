import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

/** The measures catalog now lives under Data & methods. */
export const load: PageServerLoad = ({ url }) => {
	throw redirect(308, `/methods${url.search}`);
};