import { describe, expect, it } from 'vitest';
import { MACRO_SERIES_BY_ID, parseBlsJson, parseBlsJsonRange, parseFrbCsv, parseFrbCsvRange, parseH8Csv, parseH8CsvRange, parseTreasuryXml } from './macro-sources';

describe('direct agency source parsers', () => {
  it('parses Treasury yields and derives the 10Y-2Y spread', () => {
    const xml = `
      <feed><entry><content><m:properties>
        <d:NEW_DATE>2026-01-02T00:00:00</d:NEW_DATE>
        <d:BC_10YEAR>4.25</d:BC_10YEAR><d:BC_2YEAR>3.75</d:BC_2YEAR>
      </m:properties></content></entry></feed>`;
    expect(parseTreasuryXml(xml, ['BC_10YEAR'])).toEqual([{ date: '2026-01-02', value: 4.25 }]);
    expect(parseTreasuryXml(xml, ['BC_10YEAR', 'BC_2YEAR'])).toEqual([
      { date: '2026-01-02', value: 0.5 }
    ]);
  });

  it('parses a bounded BLS history window from one public query', () => {
    const payload = {
      status: 'REQUEST_SUCCEEDED',
      message: [],
      Results: {
        series: [{
          seriesID: 'LNS14000000',
          data: [
            { year: '1950', period: 'M01', value: '6.5' },
            { year: '1949', period: 'M01', value: '4.3' },
            { year: '1948', period: 'M01', value: '3.4' }
          ]
        }]
      }
    };
    expect(parseBlsJsonRange(payload, 'LNS14000000', 1948, 1949, false)).toEqual([
      { date: '1948-01-01', value: 3.4 },
      { date: '1949-01-01', value: 4.3 }
    ]);
  });

  it('labels CPI level and year-over-year inflation as different semantics', () => {
    const payload = {
      status: 'REQUEST_SUCCEEDED',
      message: [],
      Results: {
        series: [{
          seriesID: 'CUUR0000SA0',
          data: [
            { year: '2026', period: 'M01', value: '315' },
            { year: '2025', period: 'M01', value: '300' }
          ]
        }]
      }
    };
    expect(parseBlsJson(payload, 'CUUR0000SA0', 2026, false)).toEqual([
      { date: '2026-01-01', value: 315 }
    ]);
    expect(parseBlsJson(payload, 'CUUR0000SA0', 2026, true)[0]).toEqual({
      date: '2026-01-01',
      value: 5.000000000000004
    });
  });

  it('parses the exact Federal Reserve H.15 monthly series and rejects another column', () => {
    const csv = [
      '"Series Description","Federal funds effective rate"',
      '"Time Period","RIFSPFF_N.M"',
      '2025-12,3.72',
      '2026-01,3.64'
    ].join('\n');
    expect(parseFrbCsv(csv, 2026)).toEqual([{ date: '2026-01-01', value: 3.64 }]);
    expect(parseFrbCsvRange(csv, 2025, 2026)).toEqual([
      { date: '2025-12-01', value: 3.72 },
      { date: '2026-01-01', value: 3.64 }
    ]);
    expect(() => parseFrbCsv(csv.replace('RIFSPFF_N.M', 'OTHER'), 2026)).toThrow(/did not match/);
  });

  it('parses an exact H.8 weekly column only after validating identifier, description, and USD millions', () => {
    const csv = [
      '"Series Description","Bank credit, all commercial banks, seasonally adjusted","Deposits, all commercial banks, seasonally adjusted"',
      '"Unit:","Currency","Currency"',
      '"Multiplier:","1000000","1000000"',
      '"Currency:","USD","USD"',
      '"Unique Identifier: ","H8/H8/B1001NCBA","H8/H8/B1058NCBA"',
      '"Time Period","B1001NCBA","B1058NCBA"',
      '2025-12-31,19000000.0,18500000.0',
      '2026-01-07,19021275.6,18645849.0'
    ].join('\n');
    expect(parseH8Csv(
      csv,
      2026,
      'B1058NCBA',
      'Deposits, all commercial banks, seasonally adjusted'
    )).toEqual([{ date: '2026-01-07', value: 18645849 }]);
    expect(parseH8CsvRange(
      csv,
      2025,
      2026,
      'B1058NCBA',
      'Deposits, all commercial banks, seasonally adjusted'
    )).toEqual([
      { date: '2025-12-31', value: 18500000 },
      { date: '2026-01-07', value: 18645849 }
    ]);
    expect(() => parseH8Csv(
      csv.replace('"1000000","1000000"', '"1000000","1"'),
      2026,
      'B1058NCBA',
      'Deposits, all commercial banks, seasonally adjusted'
    )).toThrow(/units did not match/);
    expect(() => parseH8Csv(csv, 2026, 'OTHER', 'Other')).toThrow(/series did not match/);
  });

  it('publishes the verified H.8 banking-condition catalog with exact weekly series semantics', () => {
    const expected = new Map([
      ['FRB_H8_BANK_CREDIT', 'H8/H8/B1001NCBA'],
      ['FRB_H8_LOANS_LEASES', 'H8/H8/B1020NCBA'],
      ['FRB_H8_CI_LOANS', 'H8/H8/B1023NCBA'],
      ['FRB_H8_REAL_ESTATE', 'H8/H8/B1026NCBA'],
      ['FRB_H8_CRE', 'H8/H8/B3219NCBA'],
      ['FRB_H8_CONSUMER', 'H8/H8/B1029NCBA'],
      ['FRB_H8_DEPOSITS', 'H8/H8/B1058NCBA']
    ]);
    for (const [id, sourceSeries] of expected) {
      expect(MACRO_SERIES_BY_ID.get(id)).toMatchObject({
        category: 'banking',
        sourceSeries,
        cadence: 'weekly',
        units: 'Millions of U.S. dollars',
        transform: 'Identity; estimated Wednesday level',
        seasonalAdjustment: 'Seasonally adjusted',
        frbRelease: 'H8'
      });
    }
  });

  it('records each exact official or derived history floor', () => {
    const expected = new Map([
      ['UST10Y', '1990-01-02'],
      ['UST2Y', '1990-01-02'],
      ['UST10Y2Y', '1990-01-02'],
      ['BLS_UNRATE', '1948-01-01'],
      ['BLS_CPI_U', '1913-01-01'],
      ['BLS_CPI_YOY', '1914-01-01'],
      ['FRB_FEDFUNDS', '1954-07-01'],
      ['FRB_H8_BANK_CREDIT', '1973-01-03'],
      ['FRB_H8_LOANS_LEASES', '1973-01-03'],
      ['FRB_H8_CI_LOANS', '1973-01-03'],
      ['FRB_H8_REAL_ESTATE', '1973-01-03'],
      ['FRB_H8_CRE', '2004-06-02'],
      ['FRB_H8_CONSUMER', '1973-01-03'],
      ['FRB_H8_DEPOSITS', '1973-01-03']
    ]);
    for (const [id, sourceStartDate] of expected) {
      expect(MACRO_SERIES_BY_ID.get(id)?.sourceStartDate).toBe(sourceStartDate);
    }
  });

  it('treats a constrained BLS response as failure instead of partial success', () => {
    expect(() => parseBlsJson({
      status: 'REQUEST_SUCCEEDED',
      message: ['Year range has been reduced'],
      Results: { series: [] }
    }, 'LNS14000000', 2026, false)).toThrow(/constrained result/);
  });
});
