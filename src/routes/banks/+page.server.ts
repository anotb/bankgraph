import type { PageServerLoad } from './$types';
import { BANK_SCREEN_SORTS } from '$lib/bank-screen';

export interface ScreenRow {
	cert: number; name: string; state: string | null; city: string | null; active: number;
	total_assets: number | null; total_deposits: number | null; num_branches: number | null; num_employees: number | null;
	latest_repdte: string | null; latest_roa: number | null; latest_roe: number | null; latest_nim: number | null; latest_npl_ratio: number | null; latest_tier1_ratio: number | null;
	latest_loan_to_deposit_ratio: number | null;
}

const SORTS = new Set<string>(BANK_SCREEN_SORTS);

export const load: PageServerLoad = async ({ fetch, url }) => {
	const q = url.searchParams.get('q') ?? '';
	const state = url.searchParams.get('state') ?? '';
	const active = url.searchParams.get('active') ?? 'active';
	const sort = SORTS.has(url.searchParams.get('sort') ?? '') ? url.searchParams.get('sort')! : 'assets';
	const order = url.searchParams.get('order') === 'asc' ? 'asc' : 'desc';
	const page = Math.max(1, Number(url.searchParams.get('page') ?? '1') || 1);
	const assetMin = url.searchParams.get('asset_min');
	const assetMax = url.searchParams.get('asset_max');
	const limit = 50;
	const params = new URLSearchParams({ active, sort, order, limit: String(limit), offset: String((page - 1) * limit) });
	if (q) params.set('q', q.slice(0, 120));
	if (state) params.set('state', state);
	if (assetMin) params.set('asset_min', assetMin);
	if (assetMax) params.set('asset_max', assetMax);
	const res = await fetch(`/api/v2/banks/screen?${params}`);
	const body = res.ok ? ((await res.json()) as { data: ScreenRow[]; total: number; asOf: string | null }) : { data: [], total: 0, asOf: null };
	return { rows: body.data, total: body.total, asOf: body.asOf, q, state, active, sort, order, page, limit, assetMin, assetMax };
};
