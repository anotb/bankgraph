import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

/** The live banking-system surface is the front page. */
export const load: PageServerLoad = () => { throw redirect(307, '/'); };
