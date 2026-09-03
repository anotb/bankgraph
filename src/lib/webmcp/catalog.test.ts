import { describe, expect, it, vi } from "vitest";
import {
  createDefaultWorkspaceState,
  deserializeWorkspaceSearchParams,
  applyWorkspaceCommand,
  applyWorkspaceCommands,
  workspaceCommands,
  type WorkspaceCommand,
  type WorkspaceCommandOptions,
} from "$lib/workspace/index.js";
import { createWebMcpToolHost } from "./host.js";
import {
  createWorkspaceWebMcpToolCatalog,
  createWorkspaceWebMcpTools,
  WEBMCP_METRICS,
  type WebMcpCurrentComparisonResult,
  type WebMcpGeographyRequest,
  type WebMcpMetricRelationshipRequest,
  type WorkspaceCommandTarget,
  type WorkspaceWebMcpDependencies,
} from "./catalog.js";
import { cohortIdentityKey, paginationKey } from "./pagination.js";
import { MAX_WEBMCP_EXTENDED_ENVELOPE_CHARS } from "./envelope.js";
import { WEBMCP_NATURAL_LANGUAGE_FIXTURES } from "./eval-fixtures.js";
import type {
  ModelContextLike,
  ModelContextRegisterOptions,
  NativeModelContextTool,
} from "./types.js";

class FakeWorkspace implements WorkspaceCommandTarget {
  state = createDefaultWorkspaceState();
  executeCount = 0;
  execute(command: WorkspaceCommand, options: WorkspaceCommandOptions = {}) {
    this.executeCount += 1;
    const result = applyWorkspaceCommand(this.state, command, options);
    this.state = result.state;
    return result;
  }
  executeBatch(commands: readonly WorkspaceCommand[], options: WorkspaceCommandOptions = {}) {
    this.executeCount += 1;
    const result = applyWorkspaceCommands(this.state, commands, options);
    this.state = result.state;
    return result;
  }
}

class FakeModelContext implements ModelContextLike {
  active = new Map<string, NativeModelContextTool>();
  async registerTool(
    tool: NativeModelContextTool,
    options?: ModelContextRegisterOptions,
  ) {
    this.active.set(tool.name, tool);
    options?.signal?.addEventListener(
      "abort",
      () => this.active.delete(tool.name),
      { once: true },
    );
  }
}

function dependencies() {
  const workspace = new FakeWorkspace();
  const searchBanks = vi.fn(async (request: { limit: number; offset?: number }) => ({
    banks: [
      {
        cert: 26881,
        name: "SoFi Bank, National Association",
        state: "UT",
        city: "Cottonwood Heights",
        totalAssets: 46_568_000,
        latestQuarter: "20251231",
        metrics: {
          assets: 46_568_000,
          roa: 1.2,
          deposits: 29_900_000,
          nim: 5.8,
          roe: null,
          noncurrentLoanRatio: null,
          tier1Ratio: null,
          domesticOffices: null,
          employees: null,
        },
      },
      {
        cert: 628,
        name: "JPMorgan Chase Bank, National Association",
        state: "OH",
        city: "Columbus",
        totalAssets: 4_000_000_000,
        latestQuarter: "20251231",
        metrics: {
          assets: 4_000_000_000,
          roa: 1.1,
          deposits: 2_500_000_000,
          nim: 2.7,
          roe: null,
          noncurrentLoanRatio: null,
          tier1Ratio: null,
          domesticOffices: null,
          employees: null,
        },
      },
    ].slice(request.offset ?? 0, (request.offset ?? 0) + request.limit),
    total: 2,
    sourceMode: "live" as const,
    asOf: "2025Q4",
    refreshedAt: "2026-01-30T12:00:00Z",
    truncated: false,
  }));
  const inspectChange = vi.fn(async () => ({
    summary: "Assets increased by $5.3 billion.",
    components: [
      { label: "Net loans", change: 3_021_000, unit: "$000" },
      { label: "Cash", change: 1_885_000, unit: "$000" },
    ],
    bankChange: 5_318_000,
    peerMedianChange: 0.97,
    provenance: "FDIC Call Reports",
    sourceMode: "live" as const,
    asOf: "2025Q4",
    refreshedAt: "2026-01-30T12:00:00Z",
    truncated: false,
  }));
  const readMetricHistory = vi.fn(async (request: { certs: number[]; periods: number }) => ({
    periods: ["2025Q3", "2025Q4"].slice(-request.periods),
    series: request.certs.map((cert) => ({
      cert,
      name: cert === 26881 ? "SoFi Bank, National Association" : `Bank ${cert}`,
      values: [1.1, 1.2].slice(-request.periods),
    })),
    sourceMode: "live" as const,
    asOf: "2025Q4",
    refreshedAt: "2026-01-30T12:00:00Z",
    truncated: false,
  }));
  const cohortDefinition = {
    recipe: {
      name: "Regional peers",
      basis: "custom" as const,
      states: ["NC", "UT"],
      assetRange: { min: 1_000_000, max: 5_000_000_000 },
      active: "active" as const,
      metricConditions: [{ metric: "roa", operator: "gte" as const, value: 1, upperValue: null }],
      minimumPeers: 2,
      maximumPeers: 50,
    },
    excludedCerts: [],
    screenDefinitionHash: null,
    screenFilters: null,
  };
  const cohortDefinitionHash = paginationKey(cohortDefinition);
  const cohortHash = cohortIdentityKey({
    definitionHash: cohortDefinitionHash,
    memberCerts: [628, 3510, 26881],
    sourceAsOf: "20251231",
    releaseGeneration: "generation-42",
  });
  const readCurrentCohort = vi.fn(async () => ({
    members: [
      { cert: 628, name: "JPMorgan Chase Bank", state: "OH", assetBucket: 7, totalAssets: 4_000_000_000 },
      { cert: 3510, name: "Bank of America", state: "NC", assetBucket: 7, totalAssets: 3_200_000_000 },
      { cert: 26881, name: "SoFi Bank", state: "UT", assetBucket: 5, totalAssets: 46_568_000 },
    ],
    definition: cohortDefinition,
    definitionHash: cohortDefinitionHash,
    cohortHash,
    coverage: {
      status: "ready" as const,
      memberCount: 3,
      membersWithHistory: 3,
      membersWithRequiredPeriods: 3,
      requiredPeriods: ["20250930", "20251231"],
      earliestPeriod: "20250331",
      latestPeriod: "20251231",
    },
    sourceMode: "live" as const,
    sourceAsOf: "20251231",
    retrievedAt: "2026-01-30T12:00:00Z",
  }));
  const analyzeCohortTrends = vi.fn(async () => ({
    matches: [
      { cert: 3510, name: "Bank of America", state: "NC", assetBucket: 7, totalAssets: 3_200_000_000, changes: { dep: 2.5 } },
      { cert: 26881, name: "SoFi Bank", state: "UT", assetBucket: 5, totalAssets: 46_568_000, changes: { dep: 8.2 } },
    ],
    cohortCount: 3,
    comparableCount: 3,
    groups: [
      { key: "NC", label: "NC", matchingCount: 1, shareOfMatches: 0.5 },
      { key: "UT", label: "UT", matchingCount: 1, shareOfMatches: 0.5 },
    ],
    changeUnits: { dep: "percent_change" as const },
    definition: cohortDefinition,
    definitionHash: cohortDefinitionHash,
    cohortHash,
    coverage: { status: "ready" as const, from: "20250930", to: "20251231", missingCount: 0 },
    sourceMode: "live" as const,
    sourceAsOf: "20251231",
    retrievedAt: "2026-01-30T12:00:00Z",
  }));
  const readCurrentComparison = vi.fn(async (): Promise<WebMcpCurrentComparisonResult> => ({
    period: "2025Q4",
    metrics: (workspace.state.charts.find((chart) => chart.id === "linked-analysis")?.metrics ?? ["asset"])
      .filter((metric): metric is WebMcpCurrentComparisonResult["metrics"][number] =>
        ["asset", "roa", "nimy"].includes(metric)
      ),
    banks: [
      { cert: 628, name: "JPMorgan Chase Bank", state: "OH", values: { roa: 1.1, nimy: 2.7 } },
      { cert: 26881, name: "SoFi Bank", state: "UT", values: { roa: 1.2, nimy: 5.8 } },
    ].filter((bank) => workspace.state.selectedCerts.includes(bank.cert)),
    sourceMode: "live" as const,
    sourceAsOf: "20251231",
    retrievedAt: "2026-01-30T12:00:00Z",
  }));
  const analyzePeerDistribution = vi.fn(async () => ({
    metric: "roa" as const,
    period: "2025Q4",
    count: 3,
    missingCount: 0,
    statistics: { minimum: 0.9, p25: 1, median: 1.1, p75: 1.15, maximum: 1.2 },
    focusedBank: { cert: 26881, name: "SoFi Bank", state: "UT", value: 1.2, percentile: 100, rank: 1 },
    lowest: [{ cert: 3510, name: "Bank of America", state: "NC", value: 0.9 }],
    highest: [{ cert: 26881, name: "SoFi Bank", state: "UT", value: 1.2 }],
    sourceMode: "live" as const,
    sourceAsOf: "20251231",
    retrievedAt: "2026-01-30T12:00:00Z",
  }));
  const analyzeMetricRelationship = vi.fn(async (request: WebMcpMetricRelationshipRequest) => ({
    xMetric: request.xMetric,
    yMetric: request.yMetric,
    period: "2025Q4",
    method: "pearson_cross_sectional_levels" as const,
    correlation: -0.42,
    cohortCount: 3,
    comparableCount: 3,
    points: [
      { cert: 628, name: "JPMorgan Chase Bank", state: "OH", x: 2_500_000_000, y: 1.1 },
      { cert: 26881, name: "SoFi Bank", state: "UT", x: 29_900_000, y: 1.2 },
    ].slice(0, request.maxPoints),
    truncated: request.maxPoints < 3,
    sourceMode: "live" as const,
    sourceAsOf: "20251231",
    retrievedAt: "2026-01-30T12:00:00Z",
  }));
  const readGeographySummary = vi.fn(async (request: WebMcpGeographyRequest) => ({
    metric: request.metric,
    period: "2025Q4",
    cohortCount: 3,
    states: [
      { state: "NC", bankCount: 1, totalAssets: 3_200_000_000, metricMedian: 0.9, metricMean: 0.9 },
      { state: "OH", bankCount: 1, totalAssets: 4_000_000_000, metricMedian: 1.1, metricMean: 1.1 },
      { state: "UT", bankCount: 1, totalAssets: 46_568_000, metricMedian: 1.2, metricMean: 1.2 },
    ].slice(0, request.maxStates),
    omittedStateCount: Math.max(0, 3 - request.maxStates),
    sourceMode: "live" as const,
    sourceAsOf: "20251231",
    retrievedAt: "2026-01-30T12:00:00Z",
  }));
  const readWorkspaceMacroContext = vi.fn(async () => ({
    status: "ready" as const,
    series: [
      {
        id: "UST10Y",
        label: "10-year Treasury yield",
        unit: "percent",
        period: "2025-12-31",
        value: 4.24,
        priorPeriod: "2025-09-30",
        priorValue: 4.15,
        change: 0.09,
        source: "U.S. Department of the Treasury",
      },
    ],
    sourceMode: "live" as const,
    sourceAsOf: "20251231",
    retrievedAt: "2026-01-30T12:00:00Z",
  }));
  const deps: WorkspaceWebMcpDependencies = {
    workspace,
    getDataContext: () => ({
      sourceMode: "live",
      sourceAsOf: "20251231",
      retrievedAt: "2026-01-30T12:00:00Z",
      pageLoadedAt: "2026-01-30T12:00:01Z",
      release: "20251231",
      releaseGeneration: "generation-42",
      cohortHash,
    }),
    searchBanks,
    getScreenView: () => ({ sort: "assets", order: "desc" }),
    inspectChange,
    readMetricHistory,
    readCurrentCohort,
    analyzeCohortTrends,
    getCurrentCohortMemberCount: () => 3,
    readCurrentComparison,
    analyzePeerDistribution,
    analyzeMetricRelationship,
    readGeographySummary,
    readWorkspaceMacroContext,
    origin: () => "https://bankgraph.example",
  };
  return {
    deps,
    cohortHash,
    workspace,
    searchBanks,
    inspectChange,
    readMetricHistory,
    readCurrentCohort,
    analyzeCohortTrends,
    readCurrentComparison,
    analyzePeerDistribution,
    analyzeMetricRelationship,
    readGeographySummary,
    readWorkspaceMacroContext,
  };
}

function tool(deps: WorkspaceWebMcpDependencies, name: string) {
  const match = createWorkspaceWebMcpToolCatalog(deps)[name];
  if (!match) throw new Error(`Missing test tool ${name}`);
  return match;
}

const signal = new AbortController().signal;

describe("workspace WebMCP catalog", () => {
  it("binds cohort identity to sorted members and the published generation", () => {
    const base = {
      definitionHash: "definition-1",
      sourceAsOf: "20251231",
      releaseGeneration: "generation-42",
    };
    expect(cohortIdentityKey({ ...base, memberCerts: [26881, 628, 3510] }))
      .toBe(cohortIdentityKey({ ...base, memberCerts: [3510, 26881, 628] }));
    expect(cohortIdentityKey({ ...base, memberCerts: [628, 3510, 26881] }))
      .not.toBe(cohortIdentityKey({
        ...base,
        releaseGeneration: "generation-43",
        memberCerts: [628, 3510, 26881],
      }));
  });

  it("exposes every connected workspace operation without panel-dependent hiding", () => {
    const { deps, workspace } = dependencies();
    const tools = createWorkspaceWebMcpTools(deps, { page: "workspace" });
		expect(tools).toHaveLength(32);
    expect(tools.map((item) => item.name)).not.toEqual(
      expect.arrayContaining([
        expect.stringMatching(/sync|pipeline|admin|secret/i),
      ]),
    );
    expect(tools.map((item) => item.name)).toEqual([
      "bankgraph.get_context",
      "bankgraph.search_banks",
      "bankgraph.read_current_screen",
      "bankgraph.configure_screen",
      "bankgraph.configure_comparison",
      "bankgraph.configure_view",
      "bankgraph.set_peer_cohort",
      "bankgraph.read_current_cohort",
      "bankgraph.analyze_cohort_trends",
			"bankgraph.read_research_board",
			"bankgraph.read_board_block",
			"bankgraph.list_board_templates",
			"bankgraph.apply_board_template",
			"bankgraph.add_workspace_view",
      "bankgraph.plot_metric_history",
      "bankgraph.publish_exact_table",
      "bankgraph.upsert_takeaway",
      "bankgraph.arrange_research_board",
      "bankgraph.remove_board_blocks",
      "bankgraph.focus_board_block",
      "bankgraph.read_current_comparison",
      "bankgraph.analyze_peer_distribution",
			"bankgraph.rank_cohort_on_board",
      "bankgraph.analyze_metric_relationship",
      "bankgraph.read_geography_summary",
      "bankgraph.read_workspace_macro_context",
      "bankgraph.read_metric_history",
      "bankgraph.get_metric_method",
      "bankgraph.inspect_change",
      "bankgraph.investigate_bank",
      "bankgraph.update_research",
      "bankgraph.share_or_export",
    ]);
    expect(tools.find((item) => item.name === "bankgraph.analyze_cohort_trends")?.maxResultChars)
      .toBe(32_768);
    expect(tools.find((item) => item.name === "bankgraph.read_result_set")).toBeUndefined();

    for (const panel of [
      "screen",
      "map",
      "bank",
      "compare",
      "peers",
      "charts",
      "findings",
    ] as const) {
      deps.workspace.execute(workspaceCommands.setActivePanel(panel));
      expect(
        createWorkspaceWebMcpTools(deps, { page: "workspace" }).map(
          (item) => item.name,
        ),
      ).toEqual(tools.map((item) => item.name));
    }
  });

  it("advertises useful page sizes instead of one-record analytical reads", async () => {
    const {
      deps,
      workspace,
      searchBanks,
      readMetricHistory,
      analyzeMetricRelationship,
      readGeographySummary,
    } = dependencies();
    const context = { signal, scope: "test", toolName: "" };
    const schemas = createWorkspaceWebMcpToolCatalog(deps);
    expect(schemas["bankgraph.search_banks"].inputSchema.properties.limit)
      .toMatchObject({ minimum: 1, maximum: 50 });
    expect(schemas["bankgraph.read_current_screen"].inputSchema.properties.pageSize)
      .toMatchObject({ minimum: 1, maximum: 50 });
    expect(schemas["bankgraph.read_current_cohort"].inputSchema.properties.pageSize)
      .toMatchObject({ minimum: 1, maximum: 50 });
    expect(schemas["bankgraph.analyze_cohort_trends"].inputSchema.properties)
      .toMatchObject({
        pageSize: expect.objectContaining({ maximum: 50 }),
        groupPageSize: expect.objectContaining({ maximum: 56 }),
      });
    expect(schemas["bankgraph.read_result_set"].inputSchema.properties.pageSize)
      .toMatchObject({ minimum: 1, maximum: 100 });
    expect(schemas["bankgraph.read_metric_history"].inputSchema.properties.pageSize)
      .toMatchObject({ minimum: 1, maximum: 5 });
    expect(schemas["bankgraph.analyze_metric_relationship"].inputSchema.properties.maxPoints)
      .toMatchObject({ minimum: 1, maximum: 100 });
    expect(schemas["bankgraph.read_geography_summary"].inputSchema.properties.maxStates)
      .toMatchObject({ minimum: 1, maximum: 56 });

    await schemas["bankgraph.search_banks"].controller(
      { query: "", states: [], active: "active" },
      { ...context, toolName: "bankgraph.search_banks" },
    );
    expect(searchBanks).toHaveBeenLastCalledWith(
      expect.objectContaining({ limit: 25 }),
      expect.any(Object),
    );

    const cohort = await schemas["bankgraph.read_current_cohort"].controller(
      {},
      { ...context, toolName: "bankgraph.read_current_cohort" },
    );
    expect(cohort.data).toMatchObject({
      members: [{ cert: 628 }, { cert: 3510 }, { cert: 26881 }],
      pagination: { pageSize: 25, hasMore: false },
    });

    const history = await schemas["bankgraph.read_metric_history"].controller(
      { metric: "roa", certs: [1, 2, 3, 4, 5], periods: 2 },
      { ...context, toolName: "bankgraph.read_metric_history" },
    );
    expect(readMetricHistory).toHaveBeenLastCalledWith(
      expect.objectContaining({ certs: [1, 2, 3, 4, 5] }),
      expect.any(Object),
    );
    expect(history.data).toMatchObject({
      counts: { requestedBanks: 5, returnedBanks: 5, omittedBanks: 0 },
      pagination: { pageSize: 5, hasMore: false },
    });

    await schemas["bankgraph.analyze_metric_relationship"].controller(
      { xMetric: "dep", yMetric: "roa" },
      { ...context, toolName: "bankgraph.analyze_metric_relationship" },
    );
    expect(analyzeMetricRelationship).toHaveBeenLastCalledWith(
      expect.objectContaining({ maxPoints: 100 }),
      expect.any(Object),
    );

    await schemas["bankgraph.read_geography_summary"].controller(
      { metric: "roa" },
      { ...context, toolName: "bankgraph.read_geography_summary" },
    );
    expect(readGeographySummary).toHaveBeenLastCalledWith(
      expect.objectContaining({ maxStates: 56 }),
      expect.any(Object),
    );

    const trends = await schemas["bankgraph.analyze_cohort_trends"].controller(
      {
        from: "2025Q3",
        to: "2025Q4",
        conditions: [{ metric: "dep", operator: "gt", value: 0 }],
        groupBy: "state",
        ifRevision: workspace.state.revision,
      },
      { ...context, toolName: "bankgraph.analyze_cohort_trends" },
    );
    expect(trends.data).toMatchObject({
      pagination: { pageSize: 20 },
      groupPagination: { pageSize: 25 },
    });
  });

  it("shrinks a wide materialized page by serialized size without skipping the next cursor", async () => {
    const { deps } = dependencies();
    const cohort = await deps.readCurrentCohort!({
      signal,
      scope: "test",
      toolName: "bankgraph.read_current_cohort",
    });
    const metrics = ["asset", "dep", "roa", "nimy", "loanGrowth", "nclnlsr"] as const;
    const rows = Array.from({ length: 100 }, (_, index) => ({
      cert: 10_000 + index,
      name: `Bank ${index} `.padEnd(200, "N"),
      state: "UT",
      assetBucket: 7,
      totalAssets: 99_999_999_999_999,
      changes: Object.fromEntries(metrics.map((metric, metricIndex) => [
        metric,
        99_999_999 - metricIndex - index,
      ])),
    }));
    deps.getCurrentCohortMemberCount = () => rows.length;
    deps.analyzeCohortTrends = vi.fn(async (request) => ({
      matches: rows,
      cohortCount: rows.length,
      comparableCount: rows.length,
      groups: [{ key: "UT", label: "Utah", matchingCount: rows.length, shareOfMatches: 1 }],
      changeUnits: Object.fromEntries(metrics.map((metric) => [
        metric,
        metric === "asset" || metric === "dep" ? "percent_change" : "percentage_points",
      ])),
      definition: cohort.definition,
      definitionHash: cohort.definitionHash,
      cohortHash: cohort.cohortHash,
      coverage: { status: "ready" as const, from: request.from, to: request.to, missingCount: 0 },
      sourceMode: "live" as const,
      sourceAsOf: "20251231",
      retrievedAt: "2026-01-30T12:00:00Z",
    }));
    const modelContext = new FakeModelContext();
    const host = createWebMcpToolHost({ modelContext });
    await host.syncScope("workspace", createWorkspaceWebMcpTools(deps, { page: "workspace" }));
    const analysis = await modelContext.active.get("bankgraph.analyze_cohort_trends")!.execute({
      from: "2025Q3",
      to: "2025Q4",
      conditions: metrics.map((metric) => ({ metric, operator: "gt", value: -1 })),
      groupBy: "state",
      pageSize: 1,
      groupPageSize: 1,
      ifRevision: 0,
    }, { signal }) as { ok: boolean; data: { workspace: { resultId: string } } };
    expect(analysis.ok).toBe(true);
		await host.syncScope("workspace", createWorkspaceWebMcpTools(deps, { page: "workspace" }));

    const native = modelContext.active.get("bankgraph.read_result_set")!;
    const first = await native.execute({
      resultId: analysis.data.workspace.resultId,
      section: "rows",
      pageSize: 100,
    }, { signal }) as {
      ok: boolean;
      data: {
        rows: Array<{ cert: number }>;
        pagination: { pageSize: number; returnedCount: number; nextCursor: string };
      };
    };
    expect(first.ok).toBe(true);
    expect(JSON.stringify(first).length).toBeLessThanOrEqual(32_768);
    expect(first.data.rows.length).toBeGreaterThan(1);
    expect(first.data.rows.length).toBeLessThan(100);
    expect(first.data.pagination).toMatchObject({
      pageSize: first.data.rows.length,
      returnedCount: first.data.rows.length,
      nextCursor: expect.any(String),
    });

    const second = await native.execute(
      {
        resultId: analysis.data.workspace.resultId,
        section: "rows",
        pageSize: 100,
        cursor: first.data.pagination.nextCursor,
      },
      { signal },
    ) as { ok: boolean; data: { rows: Array<{ cert: number }> } };
    expect(second.ok).toBe(true);
    expect(second.data.rows[0].cert).toBe(10_000 + first.data.rows.length);
  });

  it("opens one revision-safe multi-metric bank investigation", async () => {
    const { deps, workspace, inspectChange, readWorkspaceMacroContext } = dependencies();
    const investigate = tool(deps, "bankgraph.investigate_bank");
    const result = await investigate.controller(
      {
        cert: 26881,
        comparisonCerts: [628],
        metrics: ["asset", "roa"],
        from: "2025Q3",
        to: "2025Q4",
        historyPeriods: 8,
        peerRelative: true,
        includeMacro: true,
        maxComponents: 2,
        depth: "pro",
        ifRevision: 0,
      },
      { signal, scope: "test", toolName: investigate.name },
    );

    expect(inspectChange).toHaveBeenCalledTimes(2);
    expect(readWorkspaceMacroContext).toHaveBeenCalledOnce();
    expect(workspace.state).toMatchObject({
      revision: 1,
      selectedCerts: [628, 26881],
      activeBank: 26881,
      activeMetric: "asset",
      activePanel: "compare",
      depth: "pro",
      asOfQuarter: "20251231",
      chartHistory: { from: "20240331", to: "20251231" },
      comparison: { mode: "custom", customQuarter: "20250930" },
    });
    expect(result).toMatchObject({
      summary: "Opened a 2-metric investigation for FDIC 26881 from Q3 2025 to Q4 2025.",
      data: {
        changed: true,
        subjectCert: 26881,
        metrics: [
          expect.objectContaining({ metric: "asset", change: 5_318_000 }),
          expect.objectContaining({ metric: "roa", change: 5_318_000 }),
        ],
        macro: expect.objectContaining({
          status: "ready",
          series: [expect.objectContaining({ id: "UST10Y" })],
        }),
        workspace: expect.objectContaining({ revision: 1, panel: "compare" }),
      },
    });
  });

  it("returns a bounded native success receipt after one max-size investigation commit", async () => {
    const { deps, workspace } = dependencies();
    deps.inspectChange = vi.fn(async () => ({
      summary: "s".repeat(420),
      components: Array.from({ length: 4 }, (_, index) => ({
        label: `${index}`.padEnd(120, "l"),
        change: 1e15 - index,
        unit: "u".repeat(40),
      })),
      bankChange: 1e15,
      peerMedianChange: -1e15,
      peerEvidence: {
        status: "ok" as const,
        cohortDefinition: "c".repeat(1_000),
        peerCount: 200,
        minimumPeerCount: 200,
        subjectPercentile: 100,
        subjectRank: 1,
        coverage: 1,
        warning: "w".repeat(280),
      },
      provenance: "p".repeat(500),
      structuralContext: {
        status: "events_present" as const,
        window: { from: "20250930", to: "20251231" },
        events: Array.from({ length: 4 }, (_, index) => ({
          date: `2025-10-0${index + 1}`,
          category: "acquisition" as const,
          description: "d".repeat(320),
          changeCode: 1_000_000,
        })),
        caution: "c".repeat(420),
        coverage: {
          processYearFrom: 2025,
          processYearTo: 2025,
          publishedPartitions: 1,
          mapping: "certificate_rows_only" as const,
        },
      },
      sourceMode: "live" as const,
      asOf: "2025Q4",
      refreshedAt: "2026-01-30T12:00:00Z",
      truncated: false,
    }));
    deps.readWorkspaceMacroContext = vi.fn(async () => ({
      status: "ready" as const,
      series: Array.from({ length: 8 }, (_, index) => ({
        id: `${index}`.padEnd(80, "i"),
        label: "l".repeat(160),
        unit: "u".repeat(80),
        period: "2025-12-31".padEnd(40, "p"),
        value: 1e12,
        priorPeriod: "2025-09-30".padEnd(40, "p"),
        priorValue: -1e12,
        change: 1e12,
        source: "s".repeat(240),
      })),
      sourceMode: "live" as const,
      sourceAsOf: "20251231",
      retrievedAt: "2026-01-30T12:00:00Z",
    }));
    const modelContext = new FakeModelContext();
    const host = createWebMcpToolHost({ modelContext });
    await host.syncScope(
      "workspace",
      createWorkspaceWebMcpTools(deps, { page: "workspace" }),
    );

    const output = await modelContext.active
      .get("bankgraph.investigate_bank")!
      .execute({
        cert: 26_881,
        comparisonCerts: [628, 3_510, 5_888, 35_156],
        metrics: ["asset", "dep", "roa", "nimy", "loanGrowth", "netinc"],
        from: "2025Q3",
        to: "2025Q4",
        historyPeriods: 12,
        peerRelative: true,
        includeMacro: true,
        maxComponents: 4,
        depth: "pro",
        question: "q".repeat(1_000),
        ifRevision: 0,
      }, { signal });

    expect(workspace.executeCount).toBe(1);
    expect(workspace.state.revision).toBe(1);
    expect(JSON.stringify(output).length).toBeLessThanOrEqual(32_768);
    expect(output).toMatchObject({
      ok: true,
      data: {
        changed: true,
        revision: 1,
        subjectCert: 26_881,
        metrics: expect.arrayContaining([
          expect.objectContaining({ metric: "asset", components: expect.any(Array) }),
        ]),
        macro: { status: "ready", series: expect.any(Array) },
        workspace: { revision: 1 },
      },
      meta: { truncated: false },
    });
  });

  it("adds diagnostics only when requested and omits attribution without an adapter", () => {
    const { deps } = dependencies();
    expect(
      createWorkspaceWebMcpTools(deps, {
        page: "workspace",
        includeDiagnostics: true,
      }).map((item) => item.name),
    ).toEqual(expect.arrayContaining(["bankgraph.webmcp_diagnostics"]));

    const withoutAttribution = { ...deps, inspectChange: undefined };
    expect(
      createWorkspaceWebMcpTools(withoutAttribution, {
        page: "workspace",
      }).map((item) => item.name),
    ).not.toContain("bankgraph.inspect_change");
    const withoutCohortReads = {
      ...deps,
      readCurrentCohort: undefined,
      analyzeCohortTrends: undefined,
    };
    expect(
      createWorkspaceWebMcpTools(withoutCohortReads, { page: "workspace" }).map(
        (item) => item.name,
      ),
    ).not.toEqual(expect.arrayContaining([
      "bankgraph.read_current_cohort",
      "bankgraph.analyze_cohort_trends",
    ]));
    expect(
      createWorkspaceWebMcpTools(deps, { page: "bank" }).map(
        (item) => item.name,
      ),
    ).not.toContain("bankgraph.webmcp_diagnostics");
  });

  it("marks every data-bearing read as untrusted and every mutation as non-read-only", () => {
    const { deps } = dependencies();
    const tools = createWorkspaceWebMcpTools(deps, { page: "workspace" });
    for (const item of tools) {
      if (
        item.name === "bankgraph.webmcp_diagnostics" ||
        item.name === "bankgraph.get_metric_method"
      )
        continue;
      expect(item.annotations.untrustedContentHint).toBe(true);
    }
    expect(tool(deps, "bankgraph.get_metric_method").annotations).toEqual({
      readOnlyHint: true,
      untrustedContentHint: false,
    });
    expect(tool(deps, "bankgraph.webmcp_diagnostics").annotations).toEqual({
      readOnlyHint: true,
      untrustedContentHint: false,
    });
    for (const name of [
      "bankgraph.configure_screen",
      "bankgraph.configure_comparison",
      "bankgraph.configure_view",
      "bankgraph.set_peer_cohort",
      "bankgraph.analyze_cohort_trends",
      "bankgraph.update_research",
      "bankgraph.share_or_export",
    ]) {
      expect(tool(deps, name).annotations.readOnlyHint).toBe(false);
    }
  });

  it("requires a freshly read revision for every workspace mutation", async () => {
    const { deps } = dependencies();
    const mutations = [
      "bankgraph.configure_screen",
      "bankgraph.configure_comparison",
      "bankgraph.configure_view",
      "bankgraph.set_peer_cohort",
      "bankgraph.analyze_cohort_trends",
      "bankgraph.update_research",
    ];
    for (const name of mutations) {
      expect(tool(deps, name).inputSchema.required).toContain("ifRevision");
    }
    const screen = tool(deps, "bankgraph.configure_screen");
    await expect(screen.controller({
      question: "NC banks",
      query: "",
      states: ["NC"],
      active: "active",
      conditions: [],
    }, { signal, scope: "test", toolName: screen.name }))
      .rejects.toThrow("ifRevision is required");

    const research = tool(deps, "bankgraph.update_research");
    const researchMutations = [
      { action: "remove_finding", id: "finding-1" },
      { action: "set_watchlist", cert: 26881, watched: true },
      {
        action: "upsert_finding",
        id: "finding-1",
        title: "Finding",
        note: "Evidence note",
        certs: [26881],
        metrics: ["roa"],
      },
    ];
    for (const input of researchMutations) {
      await expect(research.controller(
        input,
        { signal, scope: "test", toolName: research.name },
      )).rejects.toThrow("ifRevision is required");
    }
  });

  it("exposes a patch-style comparison schema with independent chart history", () => {
    const { deps } = dependencies();
    const comparison = tool(deps, "bankgraph.configure_comparison");
    expect(comparison.inputSchema.required).toEqual(["ifRevision"]);
    expect(comparison.inputSchema.properties).toMatchObject({
      bankMode: { enum: ["keep", "replace", "add", "remove"] },
      metricMode: { enum: ["keep", "replace", "add", "remove"] },
      comparisonMode: {
        enum: ["prior-quarter", "year-ago", "range-start", "custom"],
      },
      historyMode: { enum: ["keep", "set", "clear"] },
      rangeStartQuarter: expect.objectContaining({ pattern: expect.any(String) }),
      customQuarter: expect.objectContaining({ pattern: expect.any(String) }),
      historyFrom: expect.objectContaining({ pattern: expect.any(String) }),
      historyTo: expect.objectContaining({ pattern: expect.any(String) }),
    });
    expect(comparison.inputSchema.properties).not.toHaveProperty("periodKind");
    expect(comparison.inputSchema.properties).not.toHaveProperty("quarter");
  });

  it("adds banks and measures without making an agent restate the comparison", async () => {
    const { deps, workspace } = dependencies();
    const comparison = tool(deps, "bankgraph.configure_comparison");
    await comparison.controller({
      certs: [628, 3510],
      metrics: ["asset", "dep"],
      asOfQuarter: "2025Q4",
      comparisonMode: "year-ago",
      focusMode: "set",
      activeCert: 628,
      chartKind: "line",
      chartScale: "value",
      ifRevision: workspace.state.revision,
    }, { signal, scope: "test", toolName: comparison.name });

    const addedBank = await comparison.controller({
      bankMode: "add",
      certs: [7213],
      ifRevision: workspace.state.revision,
    }, { signal, scope: "test", toolName: comparison.name });
    expect(addedBank.data).toMatchObject({
      selectedCerts: [628, 3510, 7213],
      metrics: ["asset", "dep"],
      bankMode: "add",
      metricMode: "keep",
    });

    const addedMeasure = await comparison.controller({
      metricMode: "add",
      metrics: ["nclnlsr"],
      chartScale: "index",
      ifRevision: workspace.state.revision,
    }, { signal, scope: "test", toolName: comparison.name });
    expect(addedMeasure.data).toMatchObject({
      selectedCerts: [628, 3510, 7213],
      metrics: ["asset", "dep", "nclnlsr"],
      bankMode: "keep",
      metricMode: "add",
    });
  });

  it("inherits the published reporting period for a first incremental comparison edit", async () => {
    const { deps, workspace } = dependencies();
    workspace.executeBatch([
      workspaceCommands.setSelectedCerts([628, 3510]),
      workspaceCommands.setCharts([{
        id: "linked-analysis",
        title: "Linked bank analysis",
        kind: "line",
        metrics: ["asset"],
        certs: [628, 3510],
        scale: "value",
        stacked: false,
        visible: true,
      }]),
    ]);
    const comparison = tool(deps, "bankgraph.configure_comparison");
    const result = await comparison.controller({
      metricMode: "add",
      metrics: ["dep"],
      ifRevision: workspace.state.revision,
    }, { signal, scope: "test", toolName: comparison.name });

    expect(result.data).toMatchObject({
      asOfQuarter: "20251231",
      selectedCerts: [628, 3510],
      metrics: ["asset", "dep"],
    });
  });

  it("keeps chart history when omitted from the requested comparison and returns the exact pair", async () => {
    const { deps, workspace } = dependencies();
    workspace.execute(workspaceCommands.setChartHistory({
      from: "20200331",
      to: "20251231",
    }));
    const comparison = tool(deps, "bankgraph.configure_comparison");
    const result = await comparison.controller({
      certs: [628, 3510],
      metrics: ["roa", "nimy"],
      asOfQuarter: "2025Q4",
      comparisonMode: "year-ago",
      focusMode: "clear",
      chartKind: "line",
      chartScale: "value",
      ifRevision: workspace.state.revision,
    }, { signal, scope: "test", toolName: comparison.name });

    expect(workspace.state.revision).toBe(2);
    expect(workspace.state.chartHistory).toEqual({
      from: "20200331",
      to: "20251231",
    });
    expect(result.data).toMatchObject({
      changed: true,
      revision: 2,
      asOfQuarter: "20251231",
      comparisonMode: "year-ago",
      comparisonPair: {
        asOf: "20251231",
        compareWith: "20241231",
        mode: "year-ago",
      },
      chartHistory: { from: "20200331", to: "20251231" },
    });
    await expect(tool(deps, "bankgraph.get_context").controller(
      {},
      { signal, scope: "test", toolName: "bankgraph.get_context" },
    )).resolves.toMatchObject({
      data: {
        asOfQuarter: "20251231",
        comparisonMode: "year-ago",
        comparisonPair: {
          asOf: "20251231",
          compareWith: "20241231",
          mode: "year-ago",
        },
        chartHistory: { from: "20200331", to: "20251231" },
      },
    });

    const cleared = await comparison.controller({
      certs: [628, 3510],
      metrics: ["roa", "nimy"],
      asOfQuarter: "2025Q4",
      comparisonMode: "custom",
      customQuarter: "2025Q2",
      historyMode: "clear",
      focusMode: "clear",
      chartKind: "line",
      chartScale: "value",
      ifRevision: workspace.state.revision,
    }, { signal, scope: "test", toolName: comparison.name });
    expect(cleared.data).toMatchObject({
      changed: true,
      revision: 3,
      comparisonPair: {
        asOf: "20251231",
        compareWith: "20250630",
        mode: "custom",
      },
      chartHistory: { from: null, to: null },
    });
  });

  it("rejects unresolved comparison and partial history inputs before mutation", async () => {
    const { deps, workspace } = dependencies();
    const comparison = tool(deps, "bankgraph.configure_comparison");
    const base = {
      certs: [628],
      metrics: ["roa"],
      asOfQuarter: "2025Q4",
      focusMode: "clear",
      chartKind: "line",
      chartScale: "value",
      ifRevision: 0,
    };
    await expect(comparison.controller({
      ...base,
      comparisonMode: "range-start",
      historyMode: "keep",
    }, { signal, scope: "test", toolName: comparison.name }))
      .rejects.toThrow("rangeStartQuarter is required");
    await expect(comparison.controller({
      ...base,
      comparisonMode: "custom",
      customQuarter: "2025Q4",
      historyMode: "keep",
    }, { signal, scope: "test", toolName: comparison.name }))
      .rejects.toThrow("comparison quarter must be earlier");
    await expect(comparison.controller({
      ...base,
      comparisonMode: "prior-quarter",
      historyMode: "set",
      historyFrom: "2021Q1",
    }, { signal, scope: "test", toolName: comparison.name }))
      .rejects.toThrow("historyFrom and historyTo are required");
    await expect(comparison.controller({
      ...base,
      comparisonMode: "prior-quarter",
      historyMode: "keep",
      periodKind: "quarter",
    }, { signal, scope: "test", toolName: comparison.name }))
      .rejects.toThrow("unknown field periodKind");
    expect(workspace.executeCount).toBe(0);
  });

  it("validates the whole request before side effects and rejects stale revisions", async () => {
    const { deps, workspace } = dependencies();
    const screen = tool(deps, "bankgraph.configure_screen");
    await expect(
      screen.controller(
        {
          question: "",
          query: "",
          states: [],
          active: "active",
          conditions: [],
          surprise: true,
        },
        { signal, scope: "test", toolName: screen.name },
      ),
    ).rejects.toThrow("unknown field surprise");
    expect(workspace.executeCount).toBe(0);

    await screen.controller(
      {
        question: "",
        query: "",
        states: ["NC"],
        active: "active",
        conditions: [],
        ifRevision: 0,
      },
      { signal, scope: "test", toolName: screen.name },
    );
    await expect(
      screen.controller(
        {
          question: "",
          query: "",
          states: ["VA"],
          active: "active",
          conditions: [],
          ifRevision: 0,
        },
        { signal, scope: "test", toolName: screen.name },
      ),
    ).rejects.toThrow("current revision");
    expect(workspace.state.filters.states).toEqual(["NC"]);
  });

  it("stores screen ordering in the revisioned workspace state", async () => {
    const { deps, workspace, searchBanks } = dependencies();
    const configure = tool(deps, "bankgraph.configure_screen");
    await configure.controller(
      {
        question: "North Carolina banks by name",
        query: "",
        states: ["NC"],
        active: "active",
        conditions: [],
        sort: "name",
        order: "asc",
        ifRevision: 0,
      },
      { signal, scope: "test", toolName: configure.name },
    );
    expect(workspace.state.screenView).toEqual({ sort: "name", order: "asc" });

    const read = tool(deps, "bankgraph.read_current_screen");
    await read.controller(
      { pageSize: 1 },
      { signal, scope: "test", toolName: read.name },
    );
    expect(searchBanks).toHaveBeenLastCalledWith(
      expect.objectContaining({ sort: "name", order: "asc" }),
      expect.objectContaining({ signal }),
    );
  });

  it("rejects metrics outside each visible or evidence-backed capability before mutation", async () => {
    const { deps, workspace, inspectChange } = dependencies();
    const context = { signal, scope: "test", toolName: "" };
    const comparison = tool(deps, "bankgraph.configure_comparison");
    await expect(
      comparison.controller(
        {
          certs: [26881],
          metrics: ["not_a_metric"],
          asOfQuarter: "2025Q4",
          comparisonMode: "prior-quarter",
          historyMode: "keep",
          focusMode: "clear",
          chartKind: "line",
          chartScale: "value",
        },
        { ...context, toolName: comparison.name },
      ),
    ).rejects.toThrow("metrics[0] must be one of");
    await expect(
      comparison.controller(
        {
          certs: [26881],
          metrics: ["roa"],
          asOfQuarter: "2025Q4",
          comparisonMode: "prior-quarter",
          historyMode: "keep",
          focusMode: "clear",
          chartKind: "scatter",
          chartScale: "value",
        },
        { ...context, toolName: comparison.name },
      ),
    ).rejects.toThrow("chartKind must be one of line, area");

    const view = tool(deps, "bankgraph.configure_view");
    await expect(
      view.controller(
        {
          panel: "charts",
          metricFocusMode: "set",
          activeMetric: "not_a_metric",
          mapStates: [],
          mapCerts: [],
        },
        { ...context, toolName: view.name },
      ),
    ).rejects.toThrow("activeMetric must be one of");

    const inspect = tool(deps, "bankgraph.inspect_change");
    await expect(
      inspect.controller(
        {
          cert: 26881,
          metric: "not_a_metric",
          from: "2025Q3",
          to: "2025Q4",
          peerRelative: true,
          maxComponents: 5,
        },
        { ...context, toolName: inspect.name },
      ),
    ).rejects.toThrow("metric must be one of");

    const screen = tool(deps, "bankgraph.configure_screen");
    await expect(
      screen.controller(
        {
          question: "High ROA banks",
          query: "",
          states: [],
          active: "active",
          conditions: [{ metric: "roa", operator: "gt", value: 2 }],
          ifRevision: 0,
        },
        { ...context, toolName: screen.name },
      ),
    ).resolves.toMatchObject({ data: expect.objectContaining({ changed: true }) });
    expect(workspace.state.filters.metricConditions).toEqual([
      { metric: "roa", operator: "gt", value: 2, upperValue: null },
    ]);
    expect(inspectChange).not.toHaveBeenCalled();
  });

  it("is idempotent for repeated screen, comparison, and watchlist requests", async () => {
    const { deps, workspace } = dependencies();
    const context = { signal, scope: "test", toolName: "" };
    const screen = tool(deps, "bankgraph.configure_screen");
    const screenInput = {
      question: "NC banks",
      query: "",
      states: ["NC"],
      active: "active" as const,
      conditions: [],
      ifRevision: 0,
    };
    const first = await screen.controller(screenInput, {
      ...context,
      toolName: screen.name,
    });
    const second = await screen.controller({ ...screenInput, ifRevision: workspace.state.revision }, {
      ...context,
      toolName: screen.name,
    });
    expect(first.data).toMatchObject({ changed: true });
    expect(second.data).toMatchObject({ changed: false });

    const comparison = tool(deps, "bankgraph.configure_comparison");
    const comparisonInput = {
      certs: [26881, 628],
      metrics: ["roa", "nimy"],
      asOfQuarter: "2025Q4",
      comparisonMode: "range-start",
      rangeStartQuarter: "2025Q1",
      historyMode: "set",
      historyFrom: "2025Q1",
      historyTo: "2025Q4",
      focusMode: "clear",
      chartKind: "area",
      chartScale: "index",
      ifRevision: workspace.state.revision,
    };
    const comparisonFirst = await comparison.controller(comparisonInput, {
      ...context,
      toolName: comparison.name,
    });
    const comparisonSecond = await comparison.controller({
      ...comparisonInput,
      ifRevision: workspace.state.revision,
    }, {
      ...context,
      toolName: comparison.name,
    });
    expect(comparisonFirst.data).toMatchObject({ changed: true });
    expect(comparisonSecond.data).toMatchObject({ changed: false });
    expect(comparisonFirst.data).toMatchObject({
      asOfQuarter: "20251231",
      comparisonMode: "range-start",
      comparisonPair: {
        asOf: "20251231",
        compareWith: "20250331",
        mode: "range-start",
      },
      chartHistory: { from: "20250331", to: "20251231" },
    });
    expect(workspace.state.charts).toContainEqual(
      expect.objectContaining({
        id: "linked-analysis",
        kind: "area",
        scale: "index",
        stacked: false,
      }),
    );

    const research = tool(deps, "bankgraph.update_research");
    await research.controller(
      {
        action: "set_watchlist",
        cert: 26881,
        watched: true,
        ifRevision: workspace.state.revision,
      },
      { ...context, toolName: research.name },
    );
    const watchAgain = await research.controller(
      {
        action: "set_watchlist",
        cert: 26881,
        watched: true,
        ifRevision: workspace.state.revision,
      },
      { ...context, toolName: research.name },
    );
    expect(watchAgain.data).toMatchObject({
      changed: false,
      revision: workspace.state.revision,
    });
  });

  it("waits for selected-bank hydration before comparison success and immediate history reads", async () => {
    const { deps } = dependencies();
    let loaded = false;
    deps.ensureBanksLoaded = vi.fn(async () => {
      await Promise.resolve();
      loaded = true;
    });
    deps.readMetricHistory = vi.fn(async (request: { certs: number[] }) => {
      if (!loaded) throw new Error("history is still loading");
      return {
        periods: ["2025Q4"],
        series: request.certs.map((cert) => ({
          cert,
          name: `Bank ${cert}`,
          values: [1.2],
        })),
        sourceMode: "live" as const,
        asOf: "2025Q4",
        refreshedAt: null,
        truncated: false,
      };
    });
    const context = { signal, scope: "test", toolName: "" };
    const comparison = tool(deps, "bankgraph.configure_comparison");
    await comparison.controller(
      {
        certs: [99999],
        metrics: ["roa"],
        asOfQuarter: "2025Q4",
        comparisonMode: "prior-quarter",
        historyMode: "keep",
        focusMode: "set",
        activeCert: 99999,
        chartKind: "line",
        chartScale: "value",
        ifRevision: 0,
      },
      { ...context, toolName: comparison.name },
    );
    expect(deps.ensureBanksLoaded).toHaveBeenCalledWith(
      [99999],
      expect.objectContaining({ toolName: comparison.name }),
    );

    const history = tool(deps, "bankgraph.read_metric_history");
    await expect(
      history.controller(
        { metric: "roa", certs: [99999], periods: 4 },
        { ...context, toolName: history.name },
      ),
    ).resolves.toMatchObject({
      data: { series: [{ cert: 99999, values: [1.2] }] },
    });
  });

  it("binds agent-pinned findings to exact source, formula, release, and cohort lineage", async () => {
    const { deps, workspace, cohortHash } = dependencies();
    const research = tool(deps, "bankgraph.update_research");

    await research.controller(
      {
        action: "upsert_finding",
        id: "growth-finding",
        title: "Loan growth widened",
        note: "The selected bank moved faster than its current peer cohort.",
        certs: [26881],
        metrics: ["loanGrowth", "roa"],
        period: "2025Q4",
        source: "/workspace?bank=26881",
        ifRevision: 0,
      },
      { signal, scope: "test", toolName: research.name },
    );

    expect(workspace.state.findings[0].provenance).toEqual({
      source: "FDIC BankFind Financials",
      source_url: "https://api.fdic.gov/banks/docs/",
      source_as_of: "20251231",
      retrieved_at: "2026-01-30T12:00:00Z",
      release: "20251231",
      release_generation: "generation-42",
      source_fields: { loanGrowth: ["LNLSNET"], roa: ["ROA"] },
      formulas: {
        loanGrowth: "100 × (LNLSNET this quarter / LNLSNET four quarters earlier − 1)",
        roa: "Net Income / Average Total Assets",
      },
      cohort_hash: deps.getDataContext().cohortHash,
    });
  });

  it("does not commit an asynchronously prepared mutation after cancellation or a revision change", async () => {
    const { deps, workspace } = dependencies();
    let published = false;
    deps.prepareScreen = vi.fn(async () => {
      workspace.execute(workspaceCommands.setDepth("pro"));
      return {
        results: {
          total: 1,
          returned: 1,
          latestQuarter: "20251231",
          refreshedAt: null,
          queryRevision: "prepared-screen",
          truncated: false,
        },
        commit() { published = true; },
      };
    });
    const screen = tool(deps, "bankgraph.configure_screen");
    await expect(screen.controller(
      { question: "NC banks", query: "", states: ["NC"], active: "active", conditions: [], ifRevision: 0 },
      { signal, scope: "test", toolName: screen.name },
    )).rejects.toMatchObject({ code: "stale_revision" });
    expect(published).toBe(false);
    expect(workspace.state.filters.states).toEqual([]);

    const controller = new AbortController();
    deps.prepareScreen = vi.fn(async () => {
      controller.abort("cancelled by test");
      return { commit() { published = true; } };
    });
    await expect(screen.controller(
      { question: "UT banks", query: "", states: ["UT"], active: "active", conditions: [], ifRevision: workspace.state.revision },
      { signal: controller.signal, scope: "test", toolName: screen.name },
    )).rejects.toBe("cancelled by test");
    expect(workspace.state.filters.states).toEqual([]);
    expect(published).toBe(false);
  });

  it("replaces the peer recipe and exclusions as one revision-guarded operation", async () => {
    const { deps, workspace } = dependencies();
    const peers = tool(deps, "bankgraph.set_peer_cohort");
    const input = {
      name: "Well-capitalized regional banks",
      basis: "custom",
      states: ["NC", "UT"],
      active: "active",
      assetMin: 1_000_000,
      assetMax: 50_000_000,
      conditions: [
        { metric: "tier1Ratio", operator: "gte", value: 12 },
        { metric: "employees", operator: "gte", value: 100 },
      ],
      excludedCerts: [26881, 628],
      minimumPeers: 5,
      maximumPeers: 50,
      ifRevision: 0,
    };
    const first = await peers.controller(input, {
      signal,
      scope: "test",
      toolName: peers.name,
    });
    expect(workspace.state.peerRecipe.metricConditions).toEqual([
      { metric: "numemp", operator: "gte", value: 100, upperValue: null },
      {
        metric: "rbc1rwaj",
        operator: "gte",
        value: 12,
        upperValue: null,
      },
    ]);
    expect(workspace.state.excludedCerts).toEqual([628, 26881]);
    expect(first.data).toMatchObject({ changed: true, excludedCount: 2 });
    const revision = workspace.state.revision;
    const second = await peers.controller(
      { ...input, ifRevision: revision },
      { signal, scope: "test", toolName: peers.name },
    );
    expect(second.data).toMatchObject({
      changed: false,
      revision,
      excludedCount: 2,
    });
  });

  it("updates the same guided/pro adapter the UI reads", async () => {
    const { deps, workspace } = dependencies();
    const view = tool(deps, "bankgraph.configure_view");
    const result = await view.controller(
      {
        panel: "map",
        depth: "pro",
        metricFocusMode: "set",
        activeMetric: "nimy",
        mapStates: ["UT"],
        mapCerts: [26881],
        ifRevision: 0,
      },
      { signal, scope: "test", toolName: view.name },
    );
    expect(workspace.state.depth).toBe("pro");
    expect(workspace.state.activeMetric).toBe("nimy");
    expect(result.data).toMatchObject({
      changed: true,
      depth: "pro",
      activeMetric: "nimy",
    });
  });

  it("patches only supplied view fields and requires at least one change", async () => {
    const { deps, workspace } = dependencies();
    workspace.executeBatch([
      workspaceCommands.setActivePanel("bank"),
      workspaceCommands.setDepth("pro"),
      workspaceCommands.setActiveMetric("nimy"),
      workspaceCommands.setMapSelection({ states: ["UT"], certs: [26881] }),
    ]);
    const view = tool(deps, "bankgraph.configure_view");
    expect(view.inputSchema.required).toEqual(["ifRevision"]);
    expect(view.inputSchema.minProperties).toBe(2);

    await view.controller(
      { panel: "charts", ifRevision: workspace.state.revision },
      { signal, scope: "test", toolName: view.name },
    );
    expect(workspace.state).toMatchObject({
      activePanel: "charts",
      depth: "pro",
      activeMetric: "nimy",
      mapSelection: { states: ["UT"], certs: [26881] },
    });

    await view.controller(
      { mapStates: ["NC"], ifRevision: workspace.state.revision },
      { signal, scope: "test", toolName: view.name },
    );
    expect(workspace.state.mapSelection).toEqual({
      states: ["NC"],
      certs: [26881],
    });

    await expect(view.controller(
      { ifRevision: workspace.state.revision },
      { signal, scope: "test", toolName: view.name },
    )).rejects.toThrow("at least one of panel");
  });

  it("atomically removes comparison selections from peer exclusions", async () => {
    const { deps, workspace } = dependencies();
    workspace.execute(workspaceCommands.setExcludedCerts([26881, 777, 628]));
    const comparison = tool(deps, "bankgraph.configure_comparison");
    const result = await comparison.controller(
      {
        certs: [26881, 628],
        metrics: ["roa"],
        asOfQuarter: "2025Q4",
        comparisonMode: "prior-quarter",
        historyMode: "keep",
        focusMode: "set",
        activeCert: 26881,
        chartKind: "line",
        chartScale: "value",
        ifRevision: workspace.state.revision,
      },
      { signal, scope: "test", toolName: comparison.name },
    );

    expect(workspace.state.excludedCerts).toEqual([777]);
    expect(workspace.state.selectedCerts).toEqual([628, 26881]);
    expect(workspace.state.revision).toBe(2);
    expect(result.data).toMatchObject({
      changed: true,
      revision: 2,
      removedFromExclusions: [628, 26881],
    });
  });

  it("paginates complete cohort members and trend matches with definition-bound cursors", async () => {
    const { deps, workspace, readCurrentCohort, analyzeCohortTrends } = dependencies();
    const context = { signal, scope: "test", toolName: "" };
    const cohort = tool(deps, "bankgraph.read_current_cohort");
    expect(cohort.inputSchema.properties.pageSize).toMatchObject({
      type: "integer",
      minimum: 1,
      maximum: 50,
    });
    await expect(
      cohort.controller(
        { section: "states", pageSize: 51 },
        { ...context, toolName: cohort.name },
      ),
    ).rejects.toThrow("pageSize must be a finite number from 1 to 50");
    const first = await cohort.controller(
      { pageSize: 2 },
      { ...context, toolName: cohort.name },
    );
    expect(first.data).toMatchObject({
      counts: {
        cohort: 3,
        returned: 2,
        omitted: 1,
        withHistory: 3,
        withRequiredPeriods: 3,
      },
      members: [{ cert: 628 }, { cert: 3510 }],
      pagination: { hasMore: true, nextCursor: expect.any(String) },
      sourceAsOf: "20251231",
      retrievedAt: "2026-01-30T12:00:00Z",
    });
    const cohortCursor = (first.data as { pagination: { nextCursor: string } }).pagination.nextCursor;
    const second = await cohort.controller(
      { pageSize: 2, cursor: cohortCursor },
      { ...context, toolName: cohort.name },
    );
    expect(second.data).toMatchObject({
      members: [{ cert: 26881 }],
      pagination: { offset: 2, returnedCount: 1, hasMore: false, nextCursor: null },
    });
    const statePage = await cohort.controller(
      { section: "states", pageSize: 1 },
      { ...context, toolName: cohort.name },
    );
    expect(statePage.data).toMatchObject({
      section: "states",
      states: ["NC"],
      definition: { counts: { states: 2, conditions: 1, excludedCerts: 0 } },
      pagination: { returnedCount: 1, omittedCount: 1, nextCursor: expect.any(String) },
    });
    expect(readCurrentCohort).toHaveBeenCalledTimes(3);

    const trends = tool(deps, "bankgraph.analyze_cohort_trends");
    const trendResult = await trends.controller(
      {
        from: "2025Q3",
        to: "2025Q4",
        conditions: [{ metric: "dep", operator: "gt", value: 0 }],
        groupBy: "state",
        pageSize: 1,
        ifRevision: workspace.state.revision,
      },
      { ...context, toolName: trends.name },
    );
    expect(analyzeCohortTrends).toHaveBeenCalledWith(
      expect.objectContaining({ from: "20250930", to: "20251231" }),
      expect.objectContaining({ signal }),
    );
    expect(trendResult.data).toMatchObject({
      counts: { cohort: 3, comparable: 3, matching: 2, returned: 1, omitted: 1 },
      changeUnits: { dep: "percent_change" },
      matches: [{ cert: 3510, changes: { dep: 2.5 } }],
      pagination: { hasMore: true, nextCursor: expect.any(String) },
      workspace: {
        changed: true,
        revision: 1,
        resultId: expect.stringMatching(/^trend-[0-9a-f]{8}$/),
        resultRevision: 1,
        visibleRows: 2,
      },
      nextActions: [
        { tool: "bankgraph.build_board_from_result", input: { resultId: expect.stringMatching(/^trend-[0-9a-f]{8}$/) } },
        { tool: "bankgraph.read_result_set", input: { resultId: expect.stringMatching(/^trend-[0-9a-f]{8}$/) } },
      ],
    });
    expect(workspace.state.cohortTrendResult).toMatchObject({
      id: expect.stringMatching(/^trend-[0-9a-f]{8}$/),
      basedOnRevision: 0,
      publishedRevision: 1,
      from: "20250930",
      to: "20251231",
      conditions: [{ metric: "dep", operator: "gt", value: 0, upperValue: null }],
      metrics: ["dep"],
      counts: { cohort: 3, comparable: 3, matching: 2 },
      rows: [expect.objectContaining({ cert: 3510 }), expect.objectContaining({ cert: 26881 })],
    });

    const resultId = workspace.state.cohortTrendResult!.id;
    const reader = tool(deps, "bankgraph.read_result_set");
    const firstResultPage = await reader.controller(
      { resultId, section: "rows", pageSize: 1 },
      { ...context, toolName: reader.name },
    );
    expect(firstResultPage.data).toMatchObject({
      resultId,
      resultRevision: 1,
      workspaceRevision: 1,
      periods: { from: "20250930", to: "20251231" },
      definition: {
        conditions: [{ metric: "dep", operator: "gt", value: 0, upperValue: null }],
        groupBy: "state",
        peerRecipe: expect.objectContaining({ name: "Regional peers", basis: "custom" }),
        excludedCount: 0,
        cohortHash: expect.any(String),
      },
      coverage: { status: "ready", missingCount: 0 },
      rows: [{ cert: 3510, changes: { dep: 2.5 } }],
      pagination: { returnedCount: 1, hasMore: true, nextCursor: expect.any(String) },
      lineage: { releaseGeneration: "generation-42" },
    });
    const resultCursor = (firstResultPage.data as { pagination: { nextCursor: string } })
      .pagination.nextCursor;
    const secondResultPage = await reader.controller(
      { resultId, section: "rows", pageSize: 20, cursor: resultCursor },
      { ...context, toolName: reader.name },
    );
    expect(secondResultPage.data).toMatchObject({
      rows: [{ cert: 26881, changes: { dep: 8.2 } }],
      pagination: { offset: 1, returnedCount: 1, hasMore: false, nextCursor: null },
    });
    const groupResultPage = await reader.controller(
      { resultId, section: "groups", pageSize: 20 },
      { ...context, toolName: reader.name },
    );
    expect(groupResultPage.data).toMatchObject({
      groups: [
        { key: "NC", matchingCount: 1 },
        { key: "UT", matchingCount: 1 },
      ],
      pagination: { returnedCount: 2, hasMore: false },
    });
    expect(analyzeCohortTrends).toHaveBeenCalledTimes(1);
    expect(workspace.state.revision).toBe(1);
  });

  it("does not publish a cohort trend result over an intervening human edit", async () => {
    const { deps, workspace } = dependencies();
    const analyze = deps.analyzeCohortTrends!;
    deps.analyzeCohortTrends = async (request, context) => {
      const result = await analyze(request, context);
      workspace.execute(workspaceCommands.setQuestion("Human changed the workspace during the scan"));
      return result;
    };
    const trends = tool(deps, "bankgraph.analyze_cohort_trends");
    await expect(trends.controller(
      {
        from: "2025Q3",
        to: "2025Q4",
        conditions: [{ metric: "dep", operator: "gt", value: 0 }],
        groupBy: "state",
        ifRevision: 0,
      },
      { signal, scope: "test", toolName: trends.name },
    )).rejects.toMatchObject({ code: "stale_revision" });
    expect(workspace.state.question).toBe("Human changed the workspace during the scan");
    expect(workspace.state.cohortTrendResult).toBeNull();
  });

  it("rejects oversized WebMCP cohort analysis before calling history adapters", async () => {
    const { deps, readCurrentCohort, analyzeCohortTrends } = dependencies();
    deps.getCurrentCohortMemberCount = () => 201;
    const cohort = tool(deps, "bankgraph.read_current_cohort");
    await expect(
      cohort.controller({}, { signal, scope: "test", toolName: cohort.name }),
    ).rejects.toMatchObject({ code: "cohort_analysis_limit" });
    expect(readCurrentCohort).not.toHaveBeenCalled();

    const trends = tool(deps, "bankgraph.analyze_cohort_trends");
    await expect(
      trends.controller(
        {
          from: "2025Q3",
          to: "2025Q4",
          conditions: [{ metric: "dep", operator: "gt", value: 0 }],
          groupBy: "state",
        },
        { signal, scope: "test", toolName: trends.name },
      ),
    ).rejects.toMatchObject({ code: "cohort_analysis_limit" });
    expect(analyzeCohortTrends).not.toHaveBeenCalled();

    const peers = tool(deps, "bankgraph.set_peer_cohort");
    await expect(
      peers.controller(
        {
          name: "Too broad",
          basis: "custom",
          states: [],
          active: "active",
          conditions: [],
          excludedCerts: [],
          minimumPeers: 5,
          maximumPeers: 201,
          ifRevision: 0,
        },
        { signal, scope: "test", toolName: peers.name },
      ),
    ).rejects.toThrow("maximumPeers must be a finite number from 0 to 200");
  });

  it("reads bounded comparison, distribution, relationship, geography, and economic context", async () => {
    const {
      deps,
      workspace,
      readCurrentComparison,
      analyzePeerDistribution,
      analyzeMetricRelationship,
      readGeographySummary,
      readWorkspaceMacroContext,
    } = dependencies();
    workspace.executeBatch([
      workspaceCommands.setSelectedCerts([628, 26881]),
      workspaceCommands.setActiveBank(26881),
      workspaceCommands.setActiveMetric("roa"),
      workspaceCommands.upsertChart({
        id: "linked-analysis",
        title: "Linked analysis",
        kind: "line",
        metrics: ["roa", "nimy"],
        certs: [628, 26881],
        scale: "value",
        stacked: false,
        visible: true,
      }),
    ]);
    const context = { signal, scope: "test", toolName: "" };

    const comparison = await tool(deps, "bankgraph.read_current_comparison").controller(
      {},
      { ...context, toolName: "bankgraph.read_current_comparison" },
    );
    expect(comparison.data).toMatchObject({
      metrics: ["nimy", "roa"],
      banks: [{ cert: 628 }, { cert: 26881 }],
      counts: { selected: 2, returned: 2, missing: 0 },
      releaseGeneration: "generation-42",
    });
    expect(readCurrentComparison).toHaveBeenCalledOnce();

    const distribution = await tool(deps, "bankgraph.analyze_peer_distribution").controller(
      { metric: "roa" },
      { ...context, toolName: "bankgraph.analyze_peer_distribution" },
    );
    expect(distribution.data).toMatchObject({
      metric: "roa",
      count: 3,
      statistics: { median: 1.1 },
      focusedBank: { cert: 26881, rank: 1 },
    });
    expect(analyzePeerDistribution).toHaveBeenCalledWith(
      { metric: "roa" },
      expect.objectContaining({ signal }),
    );

    const relationship = await tool(deps, "bankgraph.analyze_metric_relationship").controller(
      { xMetric: "dep", yMetric: "roa", maxPoints: 2 },
      { ...context, toolName: "bankgraph.analyze_metric_relationship" },
    );
    expect(relationship.data).toMatchObject({
      xMetric: "dep",
      yMetric: "roa",
      method: "pearson_cross_sectional_levels",
      correlation: -0.42,
      interpretation: { tier: "small_sample_exploratory" },
      counts: { cohort: 3, comparable: 3, returned: 2 },
    });
    expect(analyzeMetricRelationship).toHaveBeenCalledWith(
      { xMetric: "dep", yMetric: "roa", maxPoints: 2 },
      expect.objectContaining({ signal }),
    );

    const geography = await tool(deps, "bankgraph.read_geography_summary").controller(
      { metric: "roa", maxStates: 2 },
      { ...context, toolName: "bankgraph.read_geography_summary" },
    );
    expect(geography.data).toMatchObject({
      metric: "roa",
      states: [{ state: "NC" }, { state: "OH" }],
      omittedStateCount: 1,
      truncated: true,
    });
    expect(readGeographySummary).toHaveBeenCalledWith(
      { metric: "roa", maxStates: 2 },
      expect.objectContaining({ signal }),
    );

    const macro = await tool(deps, "bankgraph.read_workspace_macro_context").controller(
      {},
      { ...context, toolName: "bankgraph.read_workspace_macro_context" },
    );
    expect(macro.data).toMatchObject({
      status: "ready",
      series: [{ id: "UST10Y", value: 4.24, change: 0.09 }],
    });
    expect(readWorkspaceMacroContext).toHaveBeenCalledOnce();
  });

  it("rejects a ready cohort when any member lacks a requested endpoint", async () => {
    const { deps, readCurrentCohort } = dependencies();
    const base = await readCurrentCohort();
    deps.readCurrentCohort = vi.fn(async () => ({
      ...base,
      coverage: {
        ...base.coverage,
        status: "ready" as const,
        membersWithRequiredPeriods: base.coverage.memberCount - 1,
      },
    }));
    const cohort = tool(deps, "bankgraph.read_current_cohort");

    await expect(
      cohort.controller(
        {},
        { signal, scope: "test", toolName: cohort.name },
      ),
    ).rejects.toThrow(
      "cannot report ready until every member has every required period",
    );
  });

  it("reads the exact live screen with complete records and revision-bound pagination", async () => {
    const { deps, workspace, searchBanks } = dependencies();
    const context = { signal, scope: "test", toolName: "bankgraph.read_current_screen" };
    const screen = tool(deps, "bankgraph.read_current_screen");
    const first = await screen.controller({ pageSize: 1 }, context);
    expect(searchBanks).toHaveBeenLastCalledWith(
      expect.objectContaining({ sort: "assets", order: "desc", limit: 1, offset: 0 }),
      expect.objectContaining({ signal }),
    );
    expect(first.data).toMatchObject({
      workspaceRevision: 0,
      definitionHash: expect.any(String),
      resultSetHash: expect.any(String),
      definition: {
        filters: { query: "", states: [], active: "active", conditions: [] },
        sort: "assets",
        order: "desc",
      },
      banks: [{
        cert: 26881,
        metrics: {
          assets: 46_568_000,
          deposits: 29_900_000,
          roa: 1.2,
          roe: null,
          nim: 5.8,
          noncurrentLoanRatio: null,
          tier1Ratio: null,
          domesticOffices: null,
          employees: null,
        },
      }],
      counts: { matching: 2, returned: 1, remaining: 1 },
      pagination: { offset: 0, hasMore: true, nextCursor: expect.any(String) },
      sourceAsOf: "2025Q4",
    });
    const cursor = (first.data as { pagination: { nextCursor: string } }).pagination.nextCursor;
    const second = await screen.controller({ pageSize: 1, cursor }, context);
    expect(second.data).toMatchObject({
      banks: [{ cert: 628 }],
      pagination: { offset: 1, returnedCount: 1, hasMore: false, nextCursor: null },
    });

    workspace.execute(workspaceCommands.setFilters({
      ...workspace.state.filters,
      states: ["NC"],
    }));
    await expect(screen.controller({ pageSize: 1, cursor }, context))
      .rejects.toThrow("cursor does not match the current tool request");
  });

  it("bounds bank search and change attribution results", async () => {
    const { deps, searchBanks, inspectChange } = dependencies();
    const search = tool(deps, "bankgraph.search_banks");
    const searchResult = await search.controller(
      {
        query: "bank",
        states: [],
        active: "any",
        conditions: [
          { metric: "roa", operator: "gte", value: 1 },
        ],
        sort: "roa",
        order: "desc",
        limit: 1,
      },
      { signal, scope: "test", toolName: search.name },
    );
    expect(searchBanks).toHaveBeenCalledWith(
      expect.objectContaining({
        conditions: [
          { metric: "roa", operator: "gte", value: 1, upperValue: null },
        ],
        sort: "roa",
        order: "desc",
        limit: 1,
      }),
      expect.objectContaining({ signal }),
    );
    expect(searchResult.data).toMatchObject({
      counts: { matching: 2, resultSet: 2, returned: 1, omitted: 1 },
      pagination: {
        offset: 0,
        pageSize: 1,
        returnedCount: 1,
        totalCount: 2,
        omittedCount: 1,
        hasMore: true,
        nextCursor: expect.any(String),
      },
      metricUnits: { roa: "percent" },
      metricFieldsTruncated: false,
      sourceScope: {
        provider: "FDIC BankFind",
        dataset: "institutions",
        basis: "latest values stored for each institution",
        balanceFields: ["ASSET", "DEP"],
      },
      sourceAsOf: "2025Q4",
      retrievedAt: "2026-01-30T12:00:00Z",
      pageLoadedAt: "2026-01-30T12:00:01Z",
      banks: [
        expect.objectContaining({ metrics: { roa: 1.2 } }),
      ],
    });

		await expect(search.controller(
			{
				query: "", states: [], active: "active", limit: 1,
				conditions: [{ metric: "latest_roa) OR 1=1 --", operator: "gt", value: 0 }]
			},
			{ signal, scope: "test", toolName: search.name },
		)).rejects.toThrow("conditions[0].metric must be one of assets");

    const inspect = tool(deps, "bankgraph.inspect_change");
    const changeResult = await inspect.controller(
      {
        cert: 26881,
        metric: "asset",
        from: "2025Q3",
        to: "2025Q4",
        peerRelative: true,
        maxComponents: 1,
      },
      { signal, scope: "test", toolName: inspect.name },
    );
    expect(inspectChange).toHaveBeenCalledOnce();
    expect(changeResult.data).toMatchObject({
      truncated: true,
      unit: "usd_thousands",
      peerUnit: "percent_change",
      method: "reported_endpoint_difference_with_asset_identity",
    });
  });

  it("returns the ranked metric and at most four distinct screen values with units", async () => {
    const { deps } = dependencies();
    const search = tool(deps, "bankgraph.search_banks");
    const result = await search.controller(
      {
        query: "",
        states: [],
        active: "active",
        conditions: [
          { metric: "assets", operator: "gte", value: 1 },
          { metric: "deposits", operator: "gte", value: 1 },
          { metric: "roa", operator: "gte", value: 0 },
          { metric: "nim", operator: "gte", value: 0 },
          { metric: "noncurrentLoanRatio", operator: "lte", value: 100 },
        ],
        sort: "employees",
        order: "desc",
        limit: 1,
      },
      { signal, scope: "test", toolName: search.name },
    );
    expect(result.data).toMatchObject({
      metricUnits: {
        employees: "count",
        assets: "usd_thousands",
        deposits: "usd_thousands",
        roa: "percent",
      },
      metricFieldsTruncated: true,
      omittedMetricFields: true,
      banks: [
        expect.objectContaining({
          metrics: {
            employees: null,
            assets: 46_568_000,
            deposits: 29_900_000,
            roa: 1.2,
          },
        }),
      ],
    });
  });

  it.each([
    ["asset", "usd_thousands", "exact_difference_identity", "percent_change"],
    ["dep", "usd_thousands", "exact_difference_identity", "percent_change"],
    ["roa", "percentage_points", "reported_endpoint_point_difference", null],
    ["nimy", "percentage_points", "reported_endpoint_point_difference", null],
    [
      "nclnlsr",
      "percentage_points",
      "reported_endpoint_point_difference",
      null,
    ],
    [
      "loanGrowth",
      "percentage_points",
      "derived_year_over_year_net_loan_growth_endpoint_point_difference",
      "percentage_points",
    ],
    [
      "lnlsdepr",
      "percentage_points",
      "exact_two_factor_shapley",
      "percentage_points",
    ],
    ["netinc", "usd_thousands", "exact_difference_identity", null],
  ] as const)(
    "reports the evidence contract for %s",
    async (metricName, unit, method, peerUnit) => {
      const { deps } = dependencies();
      deps.inspectChange = vi.fn(async () => ({
        summary: "Reported change.",
        components: [],
        bankChange: 1,
        peerMedianChange: null,
        unit,
        method,
        sourceMode: "live" as const,
        asOf: "2025Q4",
        refreshedAt: null,
        truncated: false,
      }));
      const inspect = tool(deps, "bankgraph.inspect_change");
      const result = await inspect.controller(
        {
          cert: 26881,
          metric: metricName,
          from: "2025Q3",
          to: "2025Q4",
          peerRelative: true,
          maxComponents: 8,
        },
        { signal, scope: "test", toolName: inspect.name },
      );
      expect(result.data).toMatchObject({ unit, method, peerUnit });
    },
  );

  it("formats attribution summaries for people while preserving exact numeric evidence", async () => {
    const { deps } = dependencies();
    const exactRoaChange = -0.041621113726884484;
    const exactPeerChange = 0.700090139319002;
    deps.inspectChange = vi.fn(async (request) => ({
      summary: `Raw adapter value ${request.metric}.`,
      components: [],
      bankChange: request.metric === "roa" ? exactRoaChange : 5_318_000,
      peerMedianChange: exactPeerChange,
      unit:
        request.metric === "roa"
          ? ("percentage_points" as const)
          : ("usd_thousands" as const),
      method:
        request.metric === "roa"
          ? "reported_endpoint_point_difference"
          : "reported_endpoint_difference_with_asset_identity",
      sourceMode: "live" as const,
      asOf: "20251231",
      refreshedAt: null,
      truncated: false,
    }));
    const inspect = tool(deps, "bankgraph.inspect_change");
    const context = { signal, scope: "test", toolName: inspect.name };
    const roa = await inspect.controller(
      {
        cert: 26881,
        metric: "roa",
        from: "2025Q3",
        to: "2025Q4",
        peerRelative: true,
        maxComponents: 4,
      },
      context,
    );
    expect(roa.summary).toBe(
      "FDIC 26881 return on assets changed by −0.04 pp from Q3 2025 to Q4 2025.",
    );
    expect(roa.data).toMatchObject({
      bankChange: exactRoaChange,
      peerMedianChange: exactPeerChange,
    });

    const assets = await inspect.controller(
      {
        cert: 26881,
        metric: "asset",
        from: "2025Q3",
        to: "2025Q4",
        peerRelative: true,
        maxComponents: 4,
      },
      context,
    );
    expect(assets.summary).toBe(
      "FDIC 26881 total assets changed by +$5.32B from Q3 2025 to Q4 2025. Peer median change: +0.70%.",
    );
    expect(assets.data).toMatchObject({
      bankChange: 5_318_000,
      peerMedianChange: exactPeerChange,
    });
  });

  it("reads aligned bounded history with exact units, source, missingness, and normalized quarter dates", async () => {
    const { deps, readMetricHistory } = dependencies();
    const history = tool(deps, "bankgraph.read_metric_history");
    const result = await history.controller(
      { metric: "roa", certs: [26881, 628], periods: 8, endingAt: "2025Q4" },
      { signal, scope: "test", toolName: history.name },
    );
    expect(readMetricHistory).toHaveBeenCalledWith(
      expect.objectContaining({
        metric: "roa",
        certs: [628, 26881],
        periods: 8,
        endingAt: "20251231",
      }),
      expect.objectContaining({ signal }),
    );
    expect(result.data).toMatchObject({
      metric: "roa",
      unit: "percent",
      source: expect.stringContaining("ROA"),
      frequency: "quarterly",
      periods: ["20250930", "20251231"],
      counts: {
        requestedBanks: 2,
        returnedBanks: 2,
        omittedBanks: 0,
        periods: 2,
        missingValues: 0,
      },
      sourceMode: "live",
      pagination: { hasMore: false, nextCursor: null },
    });
  });

  it("returns the published method and limitations for a visible metric", async () => {
    const { deps } = dependencies();
    const method = tool(deps, "bankgraph.get_metric_method");
    const result = await method.controller(
      { metric: "loanGrowth" },
      { signal, scope: "test", toolName: method.name },
    );
    expect(result.data).toMatchObject({
      metric: "loanGrowth",
      unit: "percent_yoy",
      source: expect.stringContaining("LNLSNET"),
      formula: expect.stringContaining("four quarters earlier"),
      frequency: "quarterly",
      limitations: expect.arrayContaining([expect.stringContaining("Unavailable")]),
      sourceMode: "live",
      truncated: false,
    });
  });

  it("distinguishes latest-institution screen balances from institution-quarter metric sources", async () => {
    const { deps } = dependencies();
    const method = tool(deps, "bankgraph.get_metric_method");
    for (const metric of ["asset", "dep"] as const) {
      const result = await method.controller(
        { metric },
        { signal, scope: "test", toolName: method.name },
      );
      expect(result.data).toMatchObject({
        metric,
        source: expect.stringContaining("BankFind Financials"),
        sourceAsOf: "20251231",
        retrievedAt: "2026-01-30T12:00:00Z",
        pageLoadedAt: "2026-01-30T12:00:01Z",
      });
    }
  });

  it("publishes a definition for every metric accepted anywhere in the tool surface", async () => {
    const { deps } = dependencies();
    const method = tool(deps, "bankgraph.get_metric_method");
    for (const metric of WEBMCP_METRICS) {
      const result = await method.controller(
        { metric },
        { signal, scope: "test", toolName: method.name },
      );
      expect(result.data).toMatchObject({
        requestedMetric: metric,
        metric: expect.any(String),
        label: expect.any(String),
        unit: expect.stringMatching(
          /^(usd_thousands|percent|percent_yoy|count)$/,
        ),
        source: expect.any(String),
        formula: expect.any(String),
        frequency: "quarterly",
        limitations: expect.any(Array),
      });
    }
  });

  it("rejects non-quarter-end dates and normalizes quarter labels before adapter calls", async () => {
    const { deps, inspectChange } = dependencies();
    const inspect = tool(deps, "bankgraph.inspect_change");
    await inspect.controller(
      { cert: 26881, metric: "asset", from: "2025Q3", to: "2025Q4", peerRelative: false, maxComponents: 2 },
      { signal, scope: "test", toolName: inspect.name },
    );
    expect(inspectChange).toHaveBeenCalledWith(
      expect.objectContaining({ from: "20250930", to: "20251231" }),
      expect.anything(),
    );
    await expect(
      inspect.controller(
        { cert: 26881, metric: "asset", from: "20259999", to: "20251231", peerRelative: false, maxComponents: 2 },
        { signal, scope: "test", toolName: inspect.name },
      ),
    ).rejects.toThrow("quarter-end YYYYMMDD");
  });

  it("refuses to mislabel a live adapter as recorded fixture data", async () => {
    const { deps } = dependencies();
    deps.getDataContext = () => ({
      sourceMode: "recorded",
      asOf: "2025Q4",
      refreshedAt: null,
    });
    const search = tool(deps, "bankgraph.search_banks");
    await expect(
      search.controller(
        { query: "", states: [], active: "active", limit: 1 },
        { signal, scope: "test", toolName: search.name },
      ),
    ).rejects.toThrow("does not match page sourceMode recorded");
  });

  it("registers through a fake modelContext and honors default and extended result budgets", async () => {
    const { deps, workspace } = dependencies();
    deps.inspectChange = vi.fn(async () => ({
      summary: "SoFi Bank's reported assets increased across the selected quarter.",
      components: [
        { label: "Net loans and leases", change: 3_021_000, unit: "$000" },
        { label: "Cash and balances due", change: 1_885_000, unit: "$000" },
        { label: "Securities", change: 708_000, unit: "$000" },
        { label: "Trading assets", change: -96_000, unit: "$000" },
        { label: "Premises and fixed assets", change: 41_000, unit: "$000" },
        { label: "Goodwill and other intangibles", change: 12_000, unit: "$000" },
        { label: "Other real estate owned", change: -4_000, unit: "$000" },
        { label: "Other assets", change: -249_000, unit: "$000" },
      ],
      bankChange: 5_318_000,
      peerMedianChange: 0.97,
      peerEvidence: {
        status: "ok" as const,
        cohortDefinition: "Active U.S. banks in the current screen with the focused bank removed from peer calculations.",
        cohortDefinitionHash: "18yalu1",
        cohortHash: "cohort-generation-42",
        cohortMemberCount: 50,
        peerCount: 49,
        minimumPeerCount: 10,
        subjectPercentile: 82,
        subjectRank: 9,
        coverage: 1,
        warning: null,
      },
      unit: "usd_thousands" as const,
      peerUnit: "percent_change" as const,
      method: "reported_endpoint_difference_with_asset_identity",
      provenance: "FDIC Call Report fields, exact reported endpoints, and the current member-bound peer cohort.",
      structuralContext: {
        status: "events_present" as const,
        window: { from: "20250930", to: "20251231" },
        events: [{
          date: "2025-10-01",
          category: "acquisition" as const,
          description: "A certificate-mapped structural event falls inside the comparison window.",
          changeCode: 223,
        }],
        caution: "A mapped structural event changes the institution perimeter but does not prove why any reported component moved.",
        coverage: {
          processYearFrom: 2025,
          processYearTo: 2025,
          publishedPartitions: 1,
          mapping: "certificate_rows_only" as const,
        },
      },
      sourceMode: "live" as const,
      asOf: "2025Q4",
      refreshedAt: "2026-01-30T12:00:00Z",
      truncated: false,
    }));
    const modelContext = new FakeModelContext();
    const host = createWebMcpToolHost({ modelContext });
    deps.getDiagnostics = () => host.getDiagnostics();
    const tools = createWorkspaceWebMcpTools(deps, {
      page: "workspace",
      includeDiagnostics: true,
    });
    const sync = await host.syncScope("workspace", tools);
    expect(sync.failed).toEqual({});
		expect(sync.registered).toHaveLength(33);
    const output = await modelContext.active
      .get("bankgraph.get_context")!
      .execute({}, { signal });
    expect(JSON.stringify(output).length).toBeLessThanOrEqual(MAX_WEBMCP_EXTENDED_ENVELOPE_CHARS);
    expect(output).toMatchObject({
      ok: true,
      data: expect.objectContaining({
        revision: 0,
        activeMetric: null,
        capabilities: expect.objectContaining({
          changeAttribution: true,
          metricHistory: true,
          currentScreen: true,
          currentCohort: true,
          cohortTrends: true,
          artifactExport: false,
        }),
      }),
    });
    const currentScreen = await modelContext.active
      .get("bankgraph.read_current_screen")!
      .execute({ pageSize: 2 }, { signal });
    expect(JSON.stringify(currentScreen).length).toBeLessThanOrEqual(32_768);
    expect(currentScreen).toMatchObject({
      ok: true,
      data: expect.objectContaining({
        workspaceRevision: 0,
        banks: [
          expect.objectContaining({ cert: 26881 }),
          expect.objectContaining({ cert: 628 }),
        ],
        counts: { matching: 2, returned: 2, remaining: 0 },
      }),
      meta: { truncated: false },
    });
    const cohort = await modelContext.active
      .get("bankgraph.read_current_cohort")!
      .execute({ pageSize: 2 }, { signal });
    expect(JSON.stringify(cohort).length).toBeLessThanOrEqual(32_768);
    expect(cohort).toMatchObject({
      ok: true,
      data: expect.objectContaining({
        members: [
          expect.objectContaining({ cert: 628 }),
          expect.objectContaining({ cert: 3510 }),
        ],
        pagination: expect.objectContaining({ nextCursor: expect.any(String) }),
      }),
      meta: { truncated: false },
    });
    const attribution = await modelContext.active
      .get("bankgraph.inspect_change")!
      .execute({
        cert: 26881,
        metric: "asset",
        from: "2025Q3",
        to: "2025Q4",
        peerRelative: true,
        maxComponents: 8,
      }, { signal });
    expect(JSON.stringify(attribution).length).toBeGreaterThan(1_400);
    expect(JSON.stringify(attribution).length).toBeLessThanOrEqual(3_600);
    expect(attribution).toMatchObject({
      ok: true,
      data: expect.objectContaining({
        components: expect.arrayContaining([
          expect.objectContaining({ label: "Net loans and leases" }),
        ]),
        peerEvidence: expect.objectContaining({ status: "ok", peerCount: 49 }),
      }),
      meta: { truncated: false },
    });
    const trends = await modelContext.active
      .get("bankgraph.analyze_cohort_trends")!
      .execute({
        from: "2025Q3",
        to: "2025Q4",
        conditions: [{ metric: "dep", operator: "gt", value: 0 }],
        groupBy: "state",
        pageSize: 1,
        ifRevision: 0,
      }, { signal });
    expect(JSON.stringify(trends).length).toBeLessThanOrEqual(32_768);
    expect(trends).toMatchObject({
      ok: true,
      data: expect.objectContaining({
        matches: [expect.objectContaining({ cert: 3510 })],
        pagination: expect.objectContaining({ nextCursor: expect.any(String) }),
      }),
      meta: { truncated: false },
    });
    const diagnostics = await modelContext.active
      .get("bankgraph.webmcp_diagnostics")!
      .execute({}, { signal });
    expect(JSON.stringify(diagnostics).length).toBeGreaterThan(1_400);
    expect(JSON.stringify(diagnostics).length).toBeLessThanOrEqual(5_200);
    expect(diagnostics).toMatchObject({
      ok: true,
      data: expect.objectContaining({
        feature: { available: true },
        registrations: expect.any(Array),
        events: expect.any(Array),
        truncated: true,
      }),
      meta: { truncated: false },
    });

    workspace.execute(workspaceCommands.setDepth("pro"));
    const stale = await modelContext.active
      .get("bankgraph.configure_view")!
      .execute({
        panel: "map",
        metricFocusMode: "keep",
        mapStates: [],
        mapCerts: [],
        ifRevision: 0,
      }, { signal });
    expect(stale).toMatchObject({
      ok: false,
      error: {
        code: "stale_revision",
        retryable: true,
        details: {
          expectedRevision: 0,
          currentRevision: 2,
          nextAction: "bankgraph.get_context",
        },
      },
      meta: { truncated: false },
    });
  });

  it("keeps structured revision and selection context after research state is added", async () => {
    const { deps, workspace } = dependencies();
    workspace.execute(
      workspaceCommands.upsertFinding({
        id: "context-finding",
        title: "Deposit funding moved faster than the selected peer group",
        note: "Private analyst note. ".repeat(100),
        certs: [26881],
        metrics: ["dep"],
        period: "2025Q4",
        source: "/banks/26881",
      }),
    );
    workspace.execute(workspaceCommands.setWatchlistDesired(26881, true));
    const expectedRevision = workspace.state.revision;
    const modelContext = new FakeModelContext();
    const host = createWebMcpToolHost({ modelContext });
    await host.syncScope(
      "workspace",
      createWorkspaceWebMcpTools(deps, { page: "workspace" }),
    );
    const output = await modelContext.active
      .get("bankgraph.get_context")!
      .execute({}, { signal });
    expect(JSON.stringify(output).length).toBeLessThanOrEqual(MAX_WEBMCP_EXTENDED_ENVELOPE_CHARS);
    expect(output).toMatchObject({
      ok: true,
      data: {
        revision: expectedRevision,
        sourceMode: "live",
        selectedCerts: [],
        asOfQuarter: null,
        comparisonMode: "prior-quarter",
        comparisonPair: null,
        chartHistory: { from: null, to: null },
        filters: expect.any(Object),
        counts: { findings: 1, watchlist: 1 },
      },
      meta: { truncated: false },
    });
  });

  it("shares only budgeted public finding summaries and discloses truncation", async () => {
    const { deps, workspace } = dependencies();
    workspace.execute(
      workspaceCommands.upsertFinding({
        id: "private-note",
        title: "Funding finding",
        note: `${"Public summary. ".repeat(20)}DO-NOT-SHARE-PRIVATE-SUFFIX`,
        certs: [26881],
        metrics: ["dep"],
        period: "2025Q4",
        source: "/banks/26881",
      }),
    );
    const share = tool(deps, "bankgraph.share_or_export");
    const result = await share.controller(
      { format: "share_link" },
      { signal, scope: "test", toolName: share.name },
    );
    const data = result.data as {
      url: string;
      truncated: boolean;
      shareMetadata: { findingNotesTruncated: number };
    };
    expect(decodeURIComponent(data.url)).not.toContain(
      "DO-NOT-SHARE-PRIVATE-SUFFIX",
    );
    expect(data).toMatchObject({
      truncated: true,
      shareMetadata: { findingNotesTruncated: 1 },
    });
  });

  it("discards a bank CSV when its workspace revision or release changes during creation", async () => {
    const revisionCase = dependencies();
    revisionCase.workspace.execute(workspaceCommands.setSelectedCerts([26881]));
    revisionCase.deps.createArtifact = vi.fn(async () => {
      revisionCase.workspace.execute(workspaceCommands.setQuestion("Changed during export"));
      return { filename: "banks.csv", contentType: "text/csv", content: "cert\n26881" };
    });
    const revisionExport = tool(revisionCase.deps, "bankgraph.share_or_export");
    await expect(
      revisionExport.controller(
        { format: "bank_csv" },
        { signal, scope: "test", toolName: revisionExport.name },
      ),
    ).rejects.toMatchObject({ code: "stale_revision" });

    const releaseCase = dependencies();
    releaseCase.workspace.execute(workspaceCommands.setSelectedCerts([26881]));
    const baseContext = releaseCase.deps.getDataContext;
    let generation = "generation-42";
    releaseCase.deps.getDataContext = () => ({
      ...baseContext(),
      releaseGeneration: generation,
    });
    releaseCase.deps.createArtifact = vi.fn(async () => {
      generation = "generation-43";
      return { filename: "banks.csv", contentType: "text/csv", content: "cert\n26881" };
    });
    const releaseExport = tool(releaseCase.deps, "bankgraph.share_or_export");
    await expect(
      releaseExport.controller(
        { format: "bank_csv" },
        { signal, scope: "test", toolName: releaseExport.name },
      ),
    ).rejects.toMatchObject({ code: "stale_page_release", retryable: true });
  });

  it("keeps complex share links and export references complete and structured", async () => {
    const { deps, workspace } = dependencies();
    workspace.execute(
      workspaceCommands.setQuestion(
        "How are funding, profitability, and credit quality moving across the selected banks?",
      ),
    );
    workspace.execute(workspaceCommands.setSelectedCerts([26881, 628]));
    workspace.execute(workspaceCommands.setAsOfQuarter("20251231"));
    workspace.execute(workspaceCommands.setComparison({
      mode: "year-ago",
      rangeStartQuarter: null,
      customQuarter: null,
    }));
    workspace.execute(workspaceCommands.setChartHistory({
      from: "20210331",
      to: "20251231",
    }));
    workspace.execute(
      workspaceCommands.upsertChart({
        id: "linked-analysis",
        title: "Linked analysis",
        kind: "line",
        metrics: ["nimy", "roa"],
        certs: [628, 26881],
        scale: "value",
        stacked: false,
        visible: true,
      }),
    );
    workspace.execute(workspaceCommands.setWatchlistDesired(26881, true));
    workspace.execute(
      workspaceCommands.setFindings(
        Array.from({ length: 6 }, (_, index) => ({
          id: `quarterly-finding-${index + 1}`,
          title: `Quarterly evidence ${index + 1}: deposits and margins moved against peers`,
          note:
            "Reported Call Report values show a measurable change. Review the linked series and peer median before drawing a conclusion.",
          certs: index % 2 === 0 ? [26881] : [628],
          metrics:
            index % 2 === 0 ? ["dep", "nimy"] : ["roa", "nclnlsr"],
          period: "2025Q4",
          source: `/workspace?bank=${index % 2 === 0 ? 26881 : 628}&period=2025Q4&finding=${index + 1}`,
        })),
      ),
    );
    const modelContext = new FakeModelContext();
    const host = createWebMcpToolHost({ modelContext });
    await host.syncScope(
      "workspace",
      createWorkspaceWebMcpTools(deps, { page: "workspace" }),
    );
    const native = modelContext.active.get("bankgraph.share_or_export")!;
    const share = (await native.execute(
      { format: "share_link" },
      { signal },
    )) as {
      ok: boolean;
      data: { url: string };
      meta: { truncated: boolean };
    };

    expect(share.ok).toBe(true);
    expect(share.meta.truncated).toBe(false);
    expect(share.data.url.length).toBeGreaterThan(1_400);
    expect(JSON.stringify(share).length).toBeLessThanOrEqual(32_768);
    const restored = deserializeWorkspaceSearchParams(
      new URL(share.data.url).search,
    );
    expect(restored.selectedCerts).toEqual(workspace.state.selectedCerts);
    expect(restored.findings.map((finding) => finding.id)).toEqual(
      workspace.state.findings.map((finding) => finding.id),
    );

    deps.createArtifact = vi.fn(async (request) => ({
      filename: request.format === "bank_csv" ? "banks.csv" : "workspace.json",
      contentType:
        request.format === "bank_csv" ? "text/csv" : "application/json",
      content:
        request.format === "bank_csv"
          ? "cert,bank,period\n26881,SoFi Bank,2025Q4"
          : '{"schemaVersion":16,"question":"Bank comparison"}',
      message: "Ready to download.",
    }));
    for (const format of ["bank_csv", "workspace_json"] as const) {
      const artifact = (await native.execute({ format }, { signal })) as {
        ok: boolean;
        data: { filename: string; contentType: string; content: string };
        meta: { truncated: boolean };
      };
      expect(artifact).toMatchObject({
        ok: true,
        data: {
          filename: expect.stringMatching(/\.(csv|json)$/),
          contentType: expect.stringMatching(/^(text\/csv|application\/json)/),
          content: expect.any(String),
        },
        meta: { truncated: false },
      });
      expect(JSON.stringify(artifact).length).toBeLessThanOrEqual(32_768);
    }
    expect(deps.createArtifact).toHaveBeenCalledWith(
      expect.objectContaining({
        format: "bank_csv",
        revision: workspace.state.revision,
        metrics: ["nimy", "roa"],
        releaseGeneration: "generation-42",
        certs: [628, 26881],
        comparisonPair: {
          asOf: "20251231",
          compareWith: "20241231",
          mode: "year-ago",
        },
        chartHistory: { from: "20210331", to: "20251231" },
      }),
      expect.objectContaining({ signal }),
    );
  });

  it("returns a bounded structured share-budget error through the native host", async () => {
    const { deps, workspace } = dependencies();
    workspace.execute(
      workspaceCommands.setFindings(
        Array.from({ length: 20 }, (_, index) => ({
          id: `unicode-${index}`,
          title: `Finding ${index}`,
          note: "😀".repeat(2_000),
          certs: [26881],
          metrics: ["roa"],
          period: "2025Q4",
          source: `/banks/26881?finding=${index}`,
        })),
      ),
    );
    workspace.execute(workspaceCommands.setActivePanel("findings"));
    const modelContext = new FakeModelContext();
    const host = createWebMcpToolHost({ modelContext });
    await host.syncScope(
      "workspace",
      createWorkspaceWebMcpTools(deps, { page: "workspace" }),
    );
    const output = await modelContext.active
      .get("bankgraph.share_or_export")!
      .execute({ format: "share_link" }, { signal });
    expect(output).toMatchObject({
      ok: false,
      error: {
        code: "workspace_share_budget_exceeded",
        retryable: false,
        details: expect.objectContaining({
          maxEncodedLength: 6_144,
          findingNotesTruncated: 20,
        }),
      },
    });
    expect(JSON.stringify(output).length).toBeLessThanOrEqual(1_400);
  });
});

describe("natural-language invocation fixtures", () => {
  it("target only registered semantic tools and preserves the explicit pipeline negative case", () => {
    const { deps } = dependencies();
    const names = new Set(Object.keys(createWorkspaceWebMcpToolCatalog(deps)));
    for (const fixture of WEBMCP_NATURAL_LANGUAGE_FIXTURES) {
      if (fixture.expectedTool === null) continue;
      expect(names.has(fixture.expectedTool), fixture.id).toBe(true);
      for (const step of fixture.expectedSequence ?? [fixture.expectedTool]) {
        expect(names.has(step), `${fixture.id}:${step}`).toBe(true);
      }
      expect(fixture.expectedInput, fixture.id).toBeTruthy();
    }
    expect(
      WEBMCP_NATURAL_LANGUAGE_FIXTURES.find(
        (item) => item.id === "no-pipeline-control",
      )?.expectedTool,
    ).toBeNull();
  });

  it("keeps every positive fixture executable against the published runtime contract", async () => {
    for (const fixture of WEBMCP_NATURAL_LANGUAGE_FIXTURES) {
      if (fixture.expectedTool === null || !fixture.expectedInput) continue;
      const { deps } = dependencies();
      const definition = tool(deps, fixture.expectedTool);
      let invocationInput = fixture.expectedInput;
      if (fixture.expectedSequence?.[0] === "bankgraph.get_context") {
        expect(fixture.expectedSequence.at(-1)).toBe(fixture.expectedTool);
        const contextTool = tool(deps, "bankgraph.get_context");
        const contextResult = await contextTool.controller({}, {
          signal,
          scope: `eval:${fixture.id}`,
          toolName: contextTool.name,
        });
        invocationInput = {
          ...invocationInput,
          ifRevision: (contextResult.data as { revision: number }).revision,
        };
      }
      await expect(
        definition.controller(invocationInput, {
          signal,
          scope: `eval:${fixture.id}`,
          toolName: definition.name,
        }),
      ).resolves.toMatchObject({
        summary: expect.any(String),
        data: expect.anything(),
      });
    }
  });
});
