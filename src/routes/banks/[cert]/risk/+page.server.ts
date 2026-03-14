import type { PageServerLoad } from './$types';
import type { RiskResponse, AnomalyResponse } from '$lib/types';

export type RiskHistoryPoint = {
	repdte: string;
	composite: number | null;
	capital: number | null;
	asset_quality: number | null;
	earnings: number | null;
	liquidity: number | null;
};

export const load: PageServerLoad = async ({ parent, fetch }) => {
	const { bank } = await parent();

	const [riskResult, anomalyResult, historyResult] = await Promise.all([
		fetch(`/api/v1/banks/${bank.cert}/risk`).then(async (res) => {
			if (!res.ok) return null;
			return (await res.json()) as RiskResponse;
		}).catch(() => null),
		fetch(`/api/v1/banks/${bank.cert}/anomalies`).then(async (res) => {
			if (!res.ok) return null;
			return (await res.json()) as AnomalyResponse;
		}).catch(() => null),
		fetch(`/api/v1/banks/${bank.cert}/risk/history?limit=8`).then(async (res) => {
			if (!res.ok) return [];
			const json = (await res.json()) as { history: RiskHistoryPoint[] };
			return json.history ?? [];
		}).catch(() => [] as RiskHistoryPoint[])
	]);

	return {
		risk: riskResult,
		anomalies: anomalyResult,
		riskHistory: historyResult
	};
};
