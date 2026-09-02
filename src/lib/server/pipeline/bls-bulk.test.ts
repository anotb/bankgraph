import { describe, expect, it } from 'vitest';
import { parseBlsBulkRange } from './bls-bulk';
import { parseBlsJsonRange } from './macro-sources';

describe('BLS bulk range adapter', () => {
  it('selects the exact series and requested years while excluding annual averages', () => {
    const bulk = [
      'series_id\tyear\tperiod\tvalue\tfootnote_codes',
      'CUUR0000SA0\t2022\tM12\t296.797\t',
      'CUUR0000SA0\t2022\tM13\t292.655\t',
      'CUUR0000SA0\t2023\tM01\t299.170\t',
      'CUUR0000SA0\t2024\tM01\t308.417\t',
      'CUSR0000SA0\t2023\tM01\t300.536\t'
    ].join('\n');

    const payload = parseBlsBulkRange(bulk, 'CUUR0000SA0', 2023, 2023);
    expect(parseBlsJsonRange(payload, 'CUUR0000SA0', 2023, 2023, false)).toEqual([
      { date: '2023-01-01', value: 299.17 }
    ]);
  });

  it('rejects an empty requested slice', () => {
    expect(() => parseBlsBulkRange('', 'CUUR0000SA0', 2023, 2023)).toThrow(
      /contained no CUUR0000SA0 observations/
    );
  });
});
