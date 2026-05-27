import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import type { BankListResponse } from '$lib/types';
import { getDB, queryAll } from '$lib/server/db';

export const load: PageServerLoad = async ({ url, fetch, platform }) => {
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

  // Fetch sparkline data (last 8 quarters of ROA) for listed banks
  let sparklines: Record<number, (number | null)[]> = {};

  const certs = result.data.map(b => b.cert);
  if (certs.length > 0) {
    try {
      const db = getDB(platform);
      const placeholders = certs.map(() => '?').join(',');
      // Bound to the latest 8 quarters per cert in SQL (windowed) rather than
      // fetching every quarter and slicing in JS. Already chronological (rn ASC reversed).
      const sparklineData = await queryAll<{ cert: number; repdte: string; roa: number | null }>(
        db,
        `SELECT cert, repdte, roa FROM (
          SELECT cert, repdte, roa,
            ROW_NUMBER() OVER (PARTITION BY cert ORDER BY repdte DESC) as rn
          FROM financials
          WHERE cert IN (${placeholders})
        ) WHERE rn <= 8
        ORDER BY cert, repdte ASC`,
        certs
      );

      for (const row of sparklineData) {
        if (!sparklines[row.cert]) sparklines[row.cert] = [];
        sparklines[row.cert].push(row.roa);
      }
    } catch {
      // If DB query fails (e.g. dev mode without D1), return empty sparklines
    }
  }

  return {
    banks: result.data,
    total: result.total,
    page: result.page,
    limit: result.limit,
    sparklines,
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
