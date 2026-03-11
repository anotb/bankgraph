import type { PageServerLoad } from './$types';
import type { PeerComparison } from '$lib/types';

export const load: PageServerLoad = async ({ parent, fetch }) => {
	const { bank } = await parent();

	try {
		const res = await fetch(`/api/v1/banks/${bank.cert}/peers?metrics=roa,roe,nimy,eeffr,nclnlsr,rbcrwaj,lnlsdepr`);
		if (!res.ok) {
			return { peers: null };
		}
		const peers: PeerComparison = await res.json();
		return { peers };
	} catch {
		return { peers: null };
	}
};
