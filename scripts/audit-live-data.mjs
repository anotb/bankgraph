#!/usr/bin/env node

const DEFAULT_ORIGIN = 'https://bankgraph.app';
const PAGE_SIZE = 1_000;
const LARGE_BANK_ASSET_THRESHOLDS = [100_000, 1_000_000, 10_000_000];

function parseOrigin(raw) {
  const url = new URL(raw ?? DEFAULT_ORIGIN);
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Origin must use HTTP or HTTPS.');
  url.pathname = '/';
  url.search = '';
  url.hash = '';
  return url.toString().replace(/\/$/, '');
}

async function getJson(origin, path) {
  const response = await fetch(`${origin}${path}`, {
    headers: { accept: 'application/json', 'cache-control': 'no-cache' }
  });
  if (!response.ok) throw new Error(`${path} returned HTTP ${response.status}`);
  return response.json();
}

function countMissing(rows, field) {
  return rows.reduce((count, row) => count + (row[field] === null || row[field] === undefined ? 1 : 0), 0);
}

function share(numerator, denominator) {
  return denominator === 0 ? null : Number((numerator / denominator).toFixed(4));
}

async function loadActiveInstitutions(origin) {
  const rows = [];
  let total = Number.POSITIVE_INFINITY;
  for (let offset = 0; offset < total; offset += PAGE_SIZE) {
    const page = await getJson(
      origin,
      `/api/v2/banks/screen?active=active&sort=assets&order=desc&limit=${PAGE_SIZE}&offset=${offset}`
    );
    if (!Array.isArray(page.data) || !Number.isSafeInteger(page.total)) {
      throw new Error('Institution screen returned an unexpected response shape.');
    }
    total = page.total;
    rows.push(...page.data);
  }
  return { rows, total };
}

async function main() {
  const origin = parseOrigin(process.argv[2]);
  const [ready, meta, active] = await Promise.all([
    getJson(origin, '/api/v1/ready'),
    getJson(origin, '/api/v1/meta'),
    loadActiveInstitutions(origin)
  ]);

  const rows = active.rows;
  const uniqueCerts = new Set(rows.map((row) => row.cert));
  const latestPeriod = meta?.latest_quarter ?? meta?.dataset?.source_as_of ?? null;
  const withoutLatestFinancials = rows.filter(
    (row) => !row.latest_repdte || row.total_assets === null || row.total_assets === undefined
  );
  const reporters = rows.filter((row) => row.latest_repdte === latestPeriod && row.total_assets !== null);
  const tier1Populations = Object.fromEntries(
    LARGE_BANK_ASSET_THRESHOLDS.map((minimumAssets) => {
      const population = reporters.filter((row) => row.total_assets >= minimumAssets);
      const reported = population.filter(
        (row) => typeof row.latest_tier1_ratio === 'number' && row.latest_tier1_ratio >= 0
      );
      return [
        `assets_gte_${minimumAssets}_usd_thousands`,
        { population: population.length, reported: reported.length, shareReported: share(reported.length, population.length) }
      ];
    })
  );

  const validity = {
    duplicateCertificates: rows.length - uniqueCerts.size,
    nonpositiveAssets: reporters.filter((row) => !(row.total_assets > 0)).length,
    negativeDeposits: reporters.filter((row) => typeof row.total_deposits === 'number' && row.total_deposits < 0).length,
    malformedReportingPeriods: reporters.filter((row) => !/^\d{8}$/.test(String(row.latest_repdte))).length,
    noncurrentLoanRatioOutsideReportedPercentRange: reporters.filter(
      (row) => typeof row.latest_npl_ratio === 'number' && (row.latest_npl_ratio < 0 || row.latest_npl_ratio > 100)
    ).length
  };

  const report = {
    schemaVersion: 1,
    checkedAt: new Date().toISOString(),
    origin,
    release: {
      ready: ready?.ready ?? false,
      status: ready?.status ?? null,
      publishedGeneration: ready?.checks?.publicationState?.generation ?? null,
      cacheGeneration: ready?.checks?.cacheGeneration?.actual ?? null,
      generationsAgree:
        ready?.checks?.publicationState?.generation === ready?.checks?.cacheGeneration?.actual,
      latestFinancialPeriod: latestPeriod,
      sourceMode: meta?.dataset?.mode ?? null,
      financialHistoryStart: ready?.checks?.publishedRelease?.financialHistoryStart ?? null,
      financialRows: ready?.checks?.publishedRelease?.financialRowCount ?? null,
      coverageItems: ready?.checks?.publishedRelease?.coverageItemCount ?? null
    },
    population: {
      activeRegistryRecords: active.total,
      rowsFetched: rows.length,
      uniqueCertificates: uniqueCerts.size,
      latestQuarterReporters: reporters.length,
      withoutLatestFinancials: withoutLatestFinancials.length
    },
    completeness: {
      missingBranches: countMissing(rows, 'num_branches'),
      missingEmployees: countMissing(rows, 'num_employees'),
      missingRoa: countMissing(rows, 'latest_roa'),
      missingRoe: countMissing(rows, 'latest_roe'),
      missingNim: countMissing(rows, 'latest_nim'),
      missingNoncurrentLoanRatio: countMissing(rows, 'latest_npl_ratio'),
      missingTier1Ratio: countMissing(rows, 'latest_tier1_ratio'),
      tier1CoverageByAssetThreshold: tier1Populations
    },
    validity,
    activeRecordsWithoutLatestFinancials: withoutLatestFinancials.map(({ cert, name, city, state }) => ({
      cert,
      name,
      city,
      state
    })),
    interpretation: {
      activeRegistryRecords: 'FDIC institutions currently marked active; not every record files the same financial schedules.',
      nullMetrics: 'Null values remain null and metric filters exclude them. The audit does not impute or zero-fill missing reports.',
      units: 'Assets and deposits are FDIC USD thousands; ratios are reported percent.'
    }
  };

  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (!report.release.ready || report.release.status !== 'ready') process.exitCode = 1;
  if (Object.values(validity).some((value) => value !== 0)) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
