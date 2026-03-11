import type { PageServerLoad } from './$types';
import type { MacroResponse } from '$lib/types';

export interface MacroSeriesData {
  [seriesId: string]: MacroResponse | null;
}

const SERIES_IDS = [
  'FEDFUNDS', 'DGS10', 'DGS2', 'T10Y2Y', 'MORTGAGE30US',
  'UNRATE', 'GDP', 'CPIAUCSL',
  'TOTBKCR', 'DRCCLACBS',
  'USREC'
];

export const load: PageServerLoad = async ({ fetch }) => {
  const results = await Promise.all(
    SERIES_IDS.map(async (id) => {
      try {
        const res = await fetch(`/api/v1/macro/${id}`);
        if (!res.ok) return [id, null] as const;
        const data: MacroResponse = await res.json();
        // Return null if series has no data points
        if (!data.data || data.data.length === 0) return [id, null] as const;
        return [id, data] as const;
      } catch {
        return [id, null] as const;
      }
    })
  );

  const series: MacroSeriesData = {};
  for (const [id, data] of results) {
    series[id] = data;
  }

  return { series };
};
