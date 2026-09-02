import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

/** Legacy route for the economy surface. */
export const load: PageServerLoad = () => { throw redirect(307, '/economy'); };
