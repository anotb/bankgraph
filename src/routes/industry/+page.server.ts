import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

/** Legacy route: system analysis now lives on the front page. */
export const load: PageServerLoad = () => { throw redirect(307, '/'); };
