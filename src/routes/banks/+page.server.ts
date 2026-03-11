import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import type { BankListResponse } from '$lib/types';

export const load: PageServerLoad = async ({ url, fetch }) => {
  // Forward all search params to the API endpoint
  const params = new URLSearchParams();

  const q = url.searchParams.get('q');
  const state = url.searchParams.get('state');
  const assetMin = url.searchParams.get('asset_min');
  const assetMax = url.searchParams.get('asset_max');
  const active = url.searchParams.get('active');
  const sort = url.searchParams.get('sort');
  const order = url.searchParams.get('order');
  const page = url.searchParams.get('page');
  const limit = url.searchParams.get('limit');

  if (q) params.set('q', q);
  if (state) params.set('state', state);
  if (assetMin) params.set('asset_min', assetMin);
  if (assetMax) params.set('asset_max', assetMax);
  if (active !== null) params.set('active', active);
  if (sort) params.set('sort', sort);
  if (order) params.set('order', order);
  if (page) params.set('page', page);
  if (limit) params.set('limit', limit);

  const res = await fetch(`/api/v1/banks?${params.toString()}`);

  if (!res.ok) {
    const body = await res.json().catch(() => null) as { error?: string } | null;
    throw error(res.status, body?.error ?? 'Failed to load banks');
  }

  const result: BankListResponse = await res.json();

  return {
    banks: result.data,
    total: result.total,
    page: result.page,
    limit: result.limit,
    params: {
      q: q || '',
      state: state || '',
      asset_min: assetMin || '',
      asset_max: assetMax || '',
      active: active ?? '1',
      sort: sort || 'assets',
      order: order || 'desc'
    }
  };
};
