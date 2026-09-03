import { describe, expect, it } from "vitest";
import type {
  Financial,
  Institution,
  MacroResponse,
} from "$lib/types/index.js";
import { workspaceCommands } from "$lib/workspace/index.js";
import { validateToolDefinition } from "./schema.js";
import { WEBMCP_ROUTE_NATURAL_LANGUAGE_FIXTURES } from "./eval-fixtures.js";
import {
  createBankDirectoryRouteTools,
  createBankFinancialRouteTools,
  createBankProfileRouteTools,
  createBankRiskRouteTools,
  createBankSystemContextTools,
  createCompareRouteTools,
  createIndustryRouteTools,
  createMacroRouteTools,
  createTestRouteWorkspaceBridge,
  type BankDirectoryRouteData,
} from "./route-catalog.js";

const bank: Institution = {
  cert: 3511,
  rssd_id: 480228,
  name: "Example National Bank",
  city: "Columbus",
  state: "OH",
  zip: "43215",
  county: "Franklin",
  charter_class: "N",
  regulator: "OCC",
  active: 1,
  established_date: "19000101",
  insured_date: "19340101",
  holding_company: "Example Bancorp",
  hc_rssd_id: 123,
  asset_tier: 6,
  total_assets: 250_000_000,
  total_deposits: 190_000_000,
  num_branches: 900,
  num_employees: 20_000,
  latest_repdte: "20260630",
  latest_roa: 1.2,
  latest_roe: 11,
  latest_nim: 3.4,
  latest_npl_ratio: 0.7,
  latest_tier1_ratio: 13.1,
};

const directoryBank = { ...bank, latest_loan_to_deposit_ratio: 84.6 };

function bankDirectory(
  overrides: Partial<BankDirectoryRouteData> = {},
): BankDirectoryRouteData {
  return {
    banks: [directoryBank, { ...directoryBank, cert: 777, name: "Second Community Bank", state: "NC" }],
    total: 42,
    page: 2,
    limit: 25,
    release: "2026Q2",
    releaseGeneration: "release-2026-08-30",
    params: {
      q: "community",
      state: "OH,NC",
      asset_min: "1000000",
      asset_max: "10000000",
      active: "1",
      sort: "nim",
      order: "asc",
    },
    ...overrides,
  };
}

function financial(repdte: string, asset: number, roa: number): Financial {
  return {
    cert: bank.cert,
    repdte,
    asset,
    dep: asset * 0.8,
    eq: asset * 0.1,
    eqv: null,
    lnlsnet: asset * 0.6,
    lnre: null,
    lnci: null,
    lncon: null,
    sec: null,
    netinc: null,
    intinc: null,
    eintexp: null,
    nim: null,
    nonii: null,
    nonix: null,
    elnatr: null,
    roa,
    roe: null,
    nimy: 3.2,
    eeffr: null,
    nclnlsr: null,
    lnatresr: null,
    nco_ratio: null,
    rbcrwaj: null,
    rbc1rwaj: null,
    rbc1aaj: null,
    lnlsdepr: null,
    othbfhlb: null,
    asset_bucket: 6,
    numemp: null,
  };
}

function tool(
  tools: ReturnType<typeof createBankProfileRouteTools>,
  name: string,
) {
  const match = tools.find((item) => item.name === name);
  if (!match) throw new Error(`Missing ${name}`);
  return match;
}

function context(name: string) {
  return {
    signal: new AbortController().signal,
    scope: "test",
    toolName: name,
  };
}

describe("route-scoped WebMCP catalog", () => {
  it("keeps route invocation fixtures aligned with registered contextual tools", () => {
    const bridge = createTestRouteWorkspaceBridge([]);
    const financials = [financial("20260331", 100, 1)];
    const names = new Set(
      [
        ...createBankDirectoryRouteTools(bankDirectory(), bridge),
        ...createBankProfileRouteTools(bank, null, bridge),
        ...createBankFinancialRouteTools(bank, financials, bridge, ["roa"]),
        ...createIndustryRouteTools(
          {
            allSegment: { segment: "all", data: [] },
            communitySegment: null,
            regionalSegment: null,
            largeSegment: null,
            failureCount: 0,
            recentFailures: [],
            assetTiers: [],
            topStates: [],
            regulators: [],
          },
          bridge,
        ),
        ...createMacroRouteTools({ series: {}, correlations: [] }, bridge),
        ...createCompareRouteTools(
          [bank],
          ["roa"],
          null,
          { from: "", to: "" },
          bridge,
        ),
      ].map((definition) => definition.name),
    );
    names.add("bankgraph.read_bank_peer_position");
    names.add("bankgraph.read_failure_evidence");
    names.add("bankgraph.read_bank_system_context");
    for (const fixture of WEBMCP_ROUTE_NATURAL_LANGUAGE_FIXTURES) {
      expect(
        fixture.expectedTool && names.has(fixture.expectedTool),
        fixture.id,
      ).toBe(true);
      expect(fixture.expectedInput, fixture.id).toBeTruthy();
    }
  });

  it("publishes tight, annotated definitions for every contextual factory", () => {
    const opened: string[] = [];
    const bridge = createTestRouteWorkspaceBridge(opened);
    const definitions = [
      ...createBankDirectoryRouteTools(bankDirectory(), bridge),
      ...createBankProfileRouteTools(
        bank,
        { critical: 1, warning: 2, info: 3 },
        bridge,
      ),
      ...createBankFinancialRouteTools(
        bank,
        [financial("20260331", 100, 1)],
        bridge,
        ["asset", "roa"],
      ),
      ...createIndustryRouteTools(
        {
          allSegment: { segment: "all", data: [] },
          communitySegment: null,
          regionalSegment: null,
          largeSegment: null,
          failureCount: 0,
          recentFailures: [],
          assetTiers: [],
          topStates: [],
          regulators: [],
        },
        bridge,
      ),
    ];
    for (const definition of definitions) {
      expect(() => validateToolDefinition(definition)).not.toThrow();
      expect(definition.annotations.untrustedContentHint).toBe(true);
    }
  });

  it("reads the exact directory filters, ordering, page, and bounded visible rows", async () => {
    const tools = createBankDirectoryRouteTools(
      bankDirectory(),
      createTestRouteWorkspaceBridge([]),
    );
    expect(tool(tools, "bankgraph.read_bank_directory").annotations).toEqual({
      readOnlyHint: true,
      untrustedContentHint: true,
    });
    expect(tool(tools, "bankgraph.open_directory_bank").annotations).toEqual({
      readOnlyHint: false,
      untrustedContentHint: true,
    });
    expect(tool(tools, "bankgraph.open_directory_screen").annotations).toEqual({
      readOnlyHint: false,
      untrustedContentHint: true,
    });
    const result = await tool(
      tools,
      "bankgraph.read_bank_directory",
    ).controller({ limit: 1 }, context("bankgraph.read_bank_directory"));

    expect(result.data).toMatchObject({
      filters: {
        query: "community",
        states: ["OH", "NC"],
        active: "active",
        assetMinUsdThousands: 1_000_000,
        assetMaxUsdThousands: 10_000_000,
      },
      ordering: { sort: "nim", order: "asc" },
      pagination: {
        page: 2,
        pageSize: 25,
        total: 42,
        visible: 2,
        returned: 1,
        resultsTruncated: true,
      },
      banks: [{ cert: bank.cert, name: bank.name, rankOnPage: 1, loanToDepositPercent: 84.6 }],
      source: {
        publisher: "Federal Deposit Insurance Corporation",
        reportingPeriod: "20260630",
        release: "2026Q2",
        releaseGeneration: "release-2026-08-30",
      },
    });
  });

  it("opens only a bank visible in the current directory page", async () => {
    const opened: string[] = [];
    const bridge = createTestRouteWorkspaceBridge(opened);
    const tools = createBankDirectoryRouteTools(bankDirectory(), bridge);

    expect(() =>
      tool(tools, "bankgraph.open_directory_bank").controller(
        { cert: 999_999 },
        context("bankgraph.open_directory_bank"),
      ),
    ).toThrow(/not a result on the current visible directory page/);

    const result = await tool(
      tools,
      "bankgraph.open_directory_bank",
    ).controller({ cert: bank.cert }, context("bankgraph.open_directory_bank"));

    expect(opened).toEqual(["/b"]);
    expect(bridge.workspace.state).toMatchObject({
      activeBank: bank.cert,
      selectedCerts: [bank.cert],
      activePanel: "bank",
      activeMetric: "asset",
    });
    expect(result.data).toMatchObject({
      changed: true,
      workspacePath: "/b",
      activeBank: bank.cert,
    });
    const repeat = await tool(
      tools,
      "bankgraph.open_directory_bank",
    ).controller({ cert: bank.cert }, context("bankgraph.open_directory_bank"));
    expect(repeat.data).toMatchObject({ changed: false, activeBank: bank.cert });
  });

  it("opens the current directory recipe as an idempotent workspace screen and peer basis", async () => {
    const opened: string[] = [];
    const bridge = createTestRouteWorkspaceBridge(opened);
    bridge.workspace.execute(workspaceCommands.setExcludedCerts([111, 222]));
    bridge.workspace.execute(
      workspaceCommands.setMapSelection({ states: ["TX"], certs: [111] }),
    );
    const tools = createBankDirectoryRouteTools(bankDirectory(), bridge);
    const definition = tool(tools, "bankgraph.open_directory_screen");

    const first = await definition.controller(
      {},
      context("bankgraph.open_directory_screen"),
    );
    const second = await definition.controller(
      {},
      context("bankgraph.open_directory_screen"),
    );

    expect(bridge.workspace.state).toMatchObject({
      question:
        "What does the data show for active banks matching “community” in OH, NC with assets from $1 billion to $10 billion?",
      filters: {
        query: "community",
        states: ["NC", "OH"],
        active: "active",
        assetRange: { min: 1_000_000, max: 10_000_000 },
        metricConditions: [],
      },
      screenView: { sort: "nim", order: "asc" },
      results: {
        total: 42,
        returned: 2,
        latestQuarter: "20260630",
        queryRevision: "release-2026-08-30",
        truncated: true,
      },
      peerRecipe: { basis: "screen", maximumPeers: 50 },
      mapSelection: { states: [], certs: [] },
      excludedCerts: [],
      activePanel: "screen",
    });
    expect(first.data).toMatchObject({
      changed: true,
      clearedExcludedCerts: [111, 222],
    });
    expect(second.data).toMatchObject({ changed: false, clearedExcludedCerts: [] });
    expect(opened).toEqual(["/b", "/b"]);
  });

  it("reads the bank visible on the route with source and units", async () => {
    const tools = createBankProfileRouteTools(
      bank,
      { critical: 1, warning: 2, info: 3 },
      createTestRouteWorkspaceBridge([]),
    );
    const result = await tool(tools, "bankgraph.read_bank_profile").controller(
      {},
      context("bankgraph.read_bank_profile"),
    );
    expect(result.data).toMatchObject({
      bank: { cert: bank.cert, name: bank.name, active: true },
      latestMetrics: { assetsUsdThousands: 250_000_000, roaPercent: 1.2 },
      anomalyCounts: { critical: 1 },
      source: {
        publisher: "Federal Deposit Insurance Corporation",
        reportingPeriod: "20260630",
      },
    });
  });

  it("reads bounded branch, market, system, and structural context with exact coverage", async () => {
    const contextData = {
      cert: bank.cert,
      footprint: Array.from({ length: 15 }, (_, index) => ({
        year: 2011 + index,
        branches: 100 + index,
        mainOffices: 1,
        states: 4,
        counties: 20,
        deposits: 1_000_000 + index,
        source: {
          objectSha256: "b".repeat(64),
          manifestKey: `fdic/sod/${2011 + index}/manifest.json`,
          retrievedAt: "2026-08-01T08:00:00Z",
        },
      })),
      markets: [
        {
          countyFips: "39049",
          county: "Franklin",
          state: "OH",
          branches: 20,
          bankDeposits: 500_000,
          marketDeposits: 2_000_000,
          depositShare: 25,
          competingBanks: 8,
        },
      ],
      structuralHistory: [
        {
          id: "event-1",
          date: "20240501",
          category: "merger",
          description: "Merger event",
          institutionName: bank.name,
          organizationRole: "survivor",
          changeCode: 221,
        },
      ],
      industry: [
        {
          year: 2024,
          assets: 24_000_000_000,
          deposits: 18_000_000_000,
          loans: 12_000_000_000,
          banks: 4_500,
          branches: 75_000,
          employees: 2_000_000,
          sources: [
            {
              charterType: "CB" as const,
              sourceRunId: "annual-2024-cb",
              sourceRetrievedAt: "2026-08-01T09:00:00Z",
              publishedAt: "2026-08-01T10:00:00Z",
            },
            {
              charterType: "SI" as const,
              sourceRunId: "annual-2024-si",
              sourceRetrievedAt: "2026-08-01T09:05:00Z",
              publishedAt: "2026-08-01T10:05:00Z",
            },
          ],
        },
      ],
      coverage: {
        sodYear: 2025,
        sodRetrievedAt: "2026-08-01",
        annualFrom: 1934,
        annualTo: 2024,
        historyRetrievedAt: "2026-08-02",
        historyProcessYearFrom: 1900,
        historyProcessYearTo: 2026,
        historyPartitions: 127,
      },
      provenance: {
        source: "FDIC BankFind Suite",
        sourceUrl: "https://api.fdic.gov/banks/docs/",
        monetaryUnit: "usd_thousands",
        footprintGrain: "institution_year",
        marketGrain: "county_current_sod",
        industryGrain: "usa_year",
        publicationGeneration: "release-2026-08-30",
        sodCurrent: {
          year: 2025,
          objectSha256: "a".repeat(64),
          manifestKey: "fdic/sod/2025/manifest.json",
          lakeRetrievedAt: "2026-08-01T08:00:00Z",
          sourceRunId: "sod-2025-run",
          sourceRetrievedAt: "2026-08-01T07:55:00Z",
          publishedAt: "2026-08-01T09:00:00Z",
        },
      },
    };
    const tools = createBankSystemContextTools(contextData, bank.name);
    const result = await tool(
      tools,
      "bankgraph.read_bank_system_context",
    ).controller(
      { section: "footprint", fromYear: 2015, toYear: 2025, limit: 3 },
      context("bankgraph.read_bank_system_context"),
    );
    expect(result.data).toMatchObject({
      bank: { cert: bank.cert, name: bank.name },
      section: "footprint",
      requestedYears: { from: 2015, to: 2025 },
      evidence: [
        { year: 2023 },
        { year: 2024 },
        {
          year: 2025,
          source: {
            objectSha256: "b".repeat(64),
            manifestKey: "fdic/sod/2025/manifest.json",
          },
        },
      ],
      coverage: { sodYear: 2025, annualFrom: 1934, historyPartitions: 127 },
      provenance: {
        source: "FDIC BankFind Suite",
        monetaryUnit: "usd_thousands",
        publicationGeneration: "release-2026-08-30",
        sodCurrent: {
          objectSha256: "a".repeat(64),
          sourceRunId: "sod-2025-run",
        },
      },
    });
  });

  it("opens route evidence after atomically removing selected certs from exclusions", async () => {
    const opened: string[] = [];
    const bridge = createTestRouteWorkspaceBridge(opened);
    bridge.workspace.execute(workspaceCommands.setExcludedCerts([bank.cert, 777]));
    const tools = createBankProfileRouteTools(bank, null, bridge);
    const result = await tool(
      tools,
      "bankgraph.open_bank_in_workspace",
    ).controller({}, context("bankgraph.open_bank_in_workspace"));
    expect(opened).toEqual(["/b"]);
    expect(bridge.workspace.state.activeBank).toBe(bank.cert);
    expect(bridge.workspace.state.selectedCerts).toEqual([bank.cert]);
    expect(bridge.workspace.state.excludedCerts).toEqual([777]);
    expect(bridge.workspace.state.findings).toEqual([
      expect.objectContaining({
        id: `bank-${bank.cert}-profile`,
        certs: [bank.cert],
        metrics: ["asset", "dep", "nclnlsr", "nimy", "roa"],
      }),
    ]);
    expect(bridge.workspace.state.activeMetric).toBe("asset");
    expect(bridge.workspace.state.charts).toEqual([
      expect.objectContaining({
        metrics: ["asset", "dep", "nclnlsr", "nimy", "roa"],
      }),
    ]);
    expect(result.data).toMatchObject({
      changed: true,
      workspacePath: "/b",
      removedFromExclusions: [bank.cert],
      metrics: ["asset", "dep", "roa", "nimy", "nclnlsr"],
    });
  });

  it("hands risk evidence to the workspace with canonical research metrics", async () => {
    const bridge = createTestRouteWorkspaceBridge([]);
    const tools = createBankRiskRouteTools(bank, null, null, [], bridge);

    const result = await tool(
      tools,
      "bankgraph.open_risk_in_workspace",
    ).controller({}, context("bankgraph.open_risk_in_workspace"));

    expect(result.data).toMatchObject({
      metrics: ["rbc1rwaj", "nclnlsr", "roa"],
    });
    expect(bridge.workspace.state).toMatchObject({
      activeMetric: "rbc1rwaj",
      findings: [{ metrics: ["nclnlsr", "rbc1rwaj", "roa"] }],
      charts: [{ metrics: ["nclnlsr", "rbc1rwaj", "roa"] }],
    });
  });

  it("bounds financial history by requested metrics and periods", async () => {
    const rows = [
      financial("20250331", 80, 0.8),
      financial("20250630", 90, 0.9),
      financial("20250930", 100, 1),
      financial("20251231", 110, 1.1),
    ];
    const tools = createBankFinancialRouteTools(
      bank,
      rows,
      createTestRouteWorkspaceBridge([]),
      ["asset"],
    );
    const result = await tool(
      tools,
      "bankgraph.read_bank_financial_history",
    ).controller(
      { metrics: ["asset", "roa"], limit: 2 },
      context("bankgraph.read_bank_financial_history"),
    );
    expect(result.data).toMatchObject({
      metrics: ["asset", "roa"],
      rows: [
        { reportingPeriod: "20250930", asset: 100, roa: 1 },
        { reportingPeriod: "20251231", asset: 110, roa: 1.1 },
      ],
    });
  });

  it("maps supported raw financial fields and drops unsupported fields before handoff", async () => {
    const bridge = createTestRouteWorkspaceBridge([]);
    const tools = createBankFinancialRouteTools(
      bank,
      [financial("20260630", 120, 1.2)],
      bridge,
      ["lnre", "netincq", "nim", "asset", "dep", "nclnlsr"],
    );

    const result = await tool(
      tools,
      "bankgraph.open_financials_in_workspace",
    ).controller({}, context("bankgraph.open_financials_in_workspace"));

    expect(result.data).toMatchObject({
      metrics: ["netinc", "asset", "dep", "nclnlsr"],
    });
    expect(bridge.workspace.state).toMatchObject({
      activeMetric: "netinc",
      findings: [{ metrics: ["asset", "dep", "nclnlsr", "netinc"] }],
      charts: [{ metrics: ["asset", "dep", "nclnlsr", "netinc"] }],
    });
  });

  it("uses a null active metric when a raw financial handoff has no research metrics", async () => {
    const bridge = createTestRouteWorkspaceBridge([]);
    const tools = createBankFinancialRouteTools(
      bank,
      [financial("20260630", 120, 1.2)],
      bridge,
      ["lnre", "nimq", "noniiq"],
    );

    await tool(
      tools,
      "bankgraph.open_financials_in_workspace",
    ).controller({}, context("bankgraph.open_financials_in_workspace"));

    expect(bridge.workspace.state.activeMetric).toBeNull();
    expect(bridge.workspace.state.findings[0]?.metrics).toEqual([]);
    expect(bridge.workspace.state.charts).toEqual([]);
  });

  it("reads only requested industry measures from the selected segment", async () => {
    const tools = createIndustryRouteTools(
      {
        allSegment: null,
        communitySegment: {
          segment: "community",
          data: [
            {
              repdte: "20260630",
              metrics: { bank_count: 3_900, median_roa: 1.1, total_assets: 5 },
            },
            {
              repdte: "20260331",
              metrics: { bank_count: 3_950, median_roa: 1.0, total_assets: 4 },
            },
          ],
        },
        regionalSegment: null,
        largeSegment: null,
        failureCount: 500,
        recentFailures: [],
        assetTiers: [],
        topStates: [],
        regulators: [],
      },
      createTestRouteWorkspaceBridge([]),
    );
    const result = await tool(
      tools,
      "bankgraph.read_industry_evidence",
    ).controller(
      {
        section: "trend",
        segment: "community",
        metrics: ["bank_count", "median_roa"],
        limit: 1,
      },
      context("bankgraph.read_industry_evidence"),
    );
    expect(result.data).toMatchObject({
      segment: "community",
      rows: [
        { reportingPeriod: "20260630", bank_count: 3_900, median_roa: 1.1 },
      ],
    });
  });

  it("reads the visible quarterly change radar with population, contributors, method, and workspace path", async () => {
    const tools = createIndustryRouteTools(
      {
        allSegment: { segment: "all", data: [{ repdte: "20260630", metrics: {} }] },
        communitySegment: null,
        regionalSegment: null,
        largeSegment: null,
        failureCount: 0,
        recentFailures: [],
        assetTiers: [],
        topStates: [],
        regulators: [],
        systemBrief: {
          changeRadar: {
            version: "bankgraph-system-change-radar-v1",
            period: { current: "20260630", prior: "20260331" },
            population: {
              definition: "same_institution_reporting_exact_consecutive_quarters",
              currentReportingInstitutions: 4_238,
              priorReportingInstitutions: 4_251,
              matchedInstitutions: 4_220,
              entriesAndExits: "excluded_from_breadth_and_contributors",
            },
            metrics: [
              {
                id: "total_deposits",
                label: "Total deposits",
                field: "DEP",
                unit: "usd_thousands",
                population: { eligible: 4_219, percentChangeEligible: 4_219 },
                breadth: {
                  increasing: 2_300,
                  decreasing: 1_900,
                  unchanged: 19,
                  increasingShare: 54.51,
                  decreasingShare: 45.03,
                  unchangedShare: 0.45,
                  medianPercentChange: 0.18,
                },
                matchedTotals: {
                  prior: 20_000_000_000,
                  current: 20_200_000_000,
                  change: 200_000_000,
                  percentChange: 1,
                },
                contributors: {
                  method: "share_of_gross_absolute_matched_bank_change",
                  grossMovement: 500_000_000,
                  limitPerDirection: 5,
                  increases: [
                    {
                      cert: 3511,
                      name: "Example National Bank",
                      state: "OH",
                      change: 50_000_000,
                      shareOfGrossMovement: 10,
                    },
                  ],
                  decreases: [],
                },
              },
            ],
            source: {
              dataset: "FDIC BankFind Financials",
              grain: "institution_quarter",
              monetaryUnit: "usd_thousands",
              method: "Match exact consecutive institution-quarter filings.",
            },
          },
        },
      },
      createTestRouteWorkspaceBridge([]),
    );
    const result = await tool(
      tools,
      "bankgraph.read_industry_evidence",
    ).controller(
      { section: "change_radar", radarMetric: "total_deposits" },
      context("bankgraph.read_industry_evidence"),
    );

    expect(result.data).toMatchObject({
      available: true,
      period: { current: "20260630", prior: "20260331" },
      population: { matchedInstitutions: 4_220 },
      metric: {
        id: "total_deposits",
        breadth: { increasing: 2_300, decreasing: 1_900 },
        contributors: { increases: [{ cert: 3511 }] },
      },
      source: { dataset: "FDIC BankFind Financials" },
      workspace: { route: "/b" },
    });
    expect((result.data as { workspace: { href: string } }).workspace.href).toContain("/b?");
  });

  it("preserves direct-agency provenance in macro reads", async () => {
    const macro: MacroResponse = {
      series_id: "UST10Y",
      title: "10-Year Treasury",
      category: "rates",
      source_agency: "U.S. Department of the Treasury",
      source_series: "BC_10YEAR",
      source_url: "https://example.test/data",
      source_page_url: "https://example.test/page",
      rights_url: "https://example.test/rights",
      rights_note: "Public data",
      cadence: "daily",
      frequency: "daily",
      units: "Percent",
      transform: "none",
      seasonal_adjustment: "none",
      retrieved_at: "2026-08-30T12:00:00Z",
      observed_through: "2026-08-29",
      coverage: { start: "1990-01-01", end: "2026-08-29" },
      query: {
        from: "2016-01-01",
        to: "2026-08-29",
        limit: 5000,
        default_window_years: 10,
      },
      data: [
        { date: "2026-08-28", value: 4.2 },
        { date: "2026-08-29", value: 4.3 },
      ],
    };
    const tools = createMacroRouteTools(
      { series: { UST10Y: macro }, correlations: [] },
      createTestRouteWorkspaceBridge([]),
    );
    const result = await tool(
      tools,
      "bankgraph.read_macro_evidence",
    ).controller(
      { seriesIds: ["UST10Y"], limit: 1 },
      context("bankgraph.read_macro_evidence"),
    );
    expect(result.data).toMatchObject({
      series: [
        {
          observations: [{ date: "2026-08-29", value: 4.3 }],
          source: {
            agency: "U.S. Department of the Treasury",
            series: "BC_10YEAR",
            url: "https://example.test/page",
          },
        },
      ],
    });
  });

  it("hands bank macro evidence to the workspace with canonical research metrics", async () => {
    const bridge = createTestRouteWorkspaceBridge([]);
    const tools = createMacroRouteTools(
      { series: {}, correlations: [] },
      bridge,
      bank,
    );

    const result = await tool(
      tools,
      "bankgraph.open_in_workspace",
    ).controller({}, context("bankgraph.open_in_workspace"));

    expect(result.data).toMatchObject({
      metrics: ["roa", "nimy", "nclnlsr"],
    });
    expect(bridge.workspace.state).toMatchObject({
      activeMetric: "roa",
      findings: [{ metrics: ["nclnlsr", "nimy", "roa"] }],
      charts: [{ metrics: ["nclnlsr", "nimy", "roa"] }],
    });
  });

  it("keeps small-sample macro coefficients available with an interpretation tier", async () => {
    const tools = createMacroRouteTools(
      {
        series: {},
        correlations: [{
          metric_a: "FRB_FEDFUNDS",
          metric_b: "median_nim",
          window_start: "2025-01-01",
          window_end: "2025-04-01",
          observations: 2,
          correlation: 1,
          lag_quarters: 0,
          alignment_direction: "contemporaneous" as const,
          method: "pearson_yoy_change_contemporaneous" as const,
          computed_at: "2026-08-30T12:00:00Z",
        }],
      },
      createTestRouteWorkspaceBridge([]),
    );

    const result = await tool(
      tools,
      "bankgraph.read_macro_bank_relationships",
    ).controller({}, context("bankgraph.read_macro_bank_relationships"));

    expect(result.data).toMatchObject({
      relationships: [{
        observations: 2,
        correlation: 1,
        interpretation: { tier: "mechanical_only", label: "Mechanical only" },
      }],
    });
  });

  it("reads the comparison selection instead of a parallel tool-only state", async () => {
    const rows = [
      financial("20260331", 100, 1),
      financial("20260630", 120, 1.2),
    ];
    const tools = createCompareRouteTools(
      [bank],
      ["roa"],
      {
        certs: [bank.cert],
        metrics: ["roa"],
        data: { [bank.cert]: rows },
        provenance: {
          source: "FDIC BankFind",
          source_url: "https://banks.data.fdic.gov",
          source_as_of: "20260630",
          retrieved_at: "2026-08-30T12:00:00Z",
          release: "2026Q2",
          release_generation: "test",
          source_fields: { roa: ["ROA"] },
          formulas: {},
          cohort_hash: null,
        },
      },
      { from: "20260331", to: "20260630" },
      createTestRouteWorkspaceBridge([]),
    );
    const result = await tool(
      tools,
      "bankgraph.read_current_comparison",
    ).controller(
      { metric: "roa", limit: 2 },
      context("bankgraph.read_current_comparison"),
    );
    expect(result.data).toMatchObject({
      metric: "roa",
      banks: [
        {
          cert: bank.cert,
          history: [
            { reportingPeriod: "20260331", value: 1 },
            { reportingPeriod: "20260630", value: 1.2 },
          ],
        },
      ],
    });
  });

  it("maps supported compare fields and drops unsupported raw fields before handoff", async () => {
    const bridge = createTestRouteWorkspaceBridge([]);
    const tools = createCompareRouteTools(
      [bank],
      ["netincq", "nimq", "noniiq", "nclnlsr"],
      null,
      { from: "", to: "" },
      bridge,
    );

    const result = await tool(
      tools,
      "bankgraph.open_in_workspace",
    ).controller({}, context("bankgraph.open_in_workspace"));

    expect(result.data).toMatchObject({
      metrics: ["netinc", "nclnlsr"],
    });
    expect(bridge.workspace.state).toMatchObject({
      activeMetric: "netinc",
      findings: [{ metrics: ["nclnlsr", "netinc"] }],
      charts: [{ metrics: ["nclnlsr", "netinc"] }],
    });
  });
});
