import type { PageServerLoad } from './$types';
import type { RiskResponse, AnomalyResponse } from '$lib/types';

export const load: PageServerLoad = async ({ parent, fetch }) => {
	const { bank } = await parent();

	const [riskResult, anomalyResult] = await Promise.all([
		fetch(`/api/v1/banks/${bank.cert}/risk`).then(async (res) => {
			if (!res.ok) return null;
			return (await res.json()) as RiskResponse;
		}).catch(() => null),
		fetch(`/api/v1/banks/${bank.cert}/anomalies`).then(async (res) => {
			if (!res.ok) return null;
			return (await res.json()) as AnomalyResponse;
		}).catch(() => null)
	]);

	return {
		risk: riskResult,
		anomalies: anomalyResult
	};
};
