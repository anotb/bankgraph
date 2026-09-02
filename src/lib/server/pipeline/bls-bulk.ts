export const BLS_CPI_BULK_URL =
  'https://download.bls.gov/pub/time.series/cu/cu.data.1.AllItems';

interface BlsBulkObservation {
  year: string;
  period: string;
  value: string;
}

export function parseBlsBulkRange(
  text: string,
  sourceSeries: string,
  startYear: number,
  endYear: number
): unknown {
  const data: BlsBulkObservation[] = [];
  for (const line of text.split(/\r?\n/)) {
    const [seriesId, year, period, value] = line.trim().split(/\s+/);
    const numericYear = Number(year);
    if (
      seriesId !== sourceSeries
      || !/^M(?:0[1-9]|1[0-2])$/.test(period ?? '')
      || !Number.isInteger(numericYear)
      || numericYear < startYear
      || numericYear > endYear
      || !Number.isFinite(Number(value))
    ) continue;
    data.push({ year, period, value });
  }
  if (data.length === 0) {
    throw new Error(
      `Official BLS bulk data contained no ${sourceSeries} observations for ${startYear}-${endYear}`
    );
  }
  return {
    status: 'REQUEST_SUCCEEDED',
    message: [],
    Results: { series: [{ seriesID: sourceSeries, data }] }
  };
}
