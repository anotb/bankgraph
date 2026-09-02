import type { PageServerLoad } from './$types';
import { load as loadSystem } from '../+page.server';

/** The banking system surface shares the front page's data. */
export const load: PageServerLoad = (event) => loadSystem(event as unknown as Parameters<typeof loadSystem>[0]);
