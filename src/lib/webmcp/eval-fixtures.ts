/** Deterministic invocation fixtures for natural-language WebMCP regression evaluation. */
export interface WebMcpNaturalLanguageFixture {
  id: string;
  prompt: string;
  expectedTool: string | null;
  expectedInput?: Record<string, unknown>;
  /** Ordered semantic tool chain expected for the request. */
  expectedSequence?: readonly string[];
  note: string;
}

export const WEBMCP_NATURAL_LANGUAGE_FIXTURES: readonly WebMcpNaturalLanguageFixture[] =
  [
    {
      id: "screen-north-carolina-mid-size",
      prompt:
        "Show active North Carolina banks with $1 billion to $10 billion in assets.",
      expectedTool: "bankgraph.configure_screen",
      expectedInput: {
        question: "Active North Carolina banks with $1B–$10B in assets",
        query: "",
        states: ["NC"],
        active: "active",
        assetMin: 1_000_000,
        assetMax: 10_000_000,
        conditions: [],
      },
      expectedSequence: ["bankgraph.get_context", "bankgraph.configure_screen"],
      note: "FDIC balance-sheet values are expressed in thousands of dollars.",
    },
    {
      id: "compare-banks-five-years",
      prompt:
        "Compare JPMorgan Chase and Bank of America on ROA, NIM, and problem loans over five years.",
      expectedTool: "bankgraph.configure_comparison",
      expectedInput: {
        certs: [628, 3510],
        metrics: ["roa", "nimy", "nclnlsr"],
        asOfQuarter: "2025Q4",
        comparisonMode: "range-start",
        rangeStartQuarter: "2021Q1",
        historyMode: "set",
        historyFrom: "2021Q1",
        historyTo: "2025Q4",
        focusMode: "clear",
        chartKind: "line",
        chartScale: "value",
      },
      expectedSequence: [
        "bankgraph.get_context",
        "bankgraph.configure_comparison",
      ],
      note: "The exact comparison pair and five-year chart window change independently in the shared workspace.",
    },
    {
      id: "compare-year-ago-keep-history",
      prompt:
        "Keep my chart history, but compare the selected banks as of Q4 2025 with the same quarter a year earlier.",
      expectedTool: "bankgraph.configure_comparison",
      expectedInput: {
        certs: [628, 3510],
        metrics: ["roa", "nimy", "nclnlsr"],
        asOfQuarter: "2025Q4",
        comparisonMode: "year-ago",
        focusMode: "clear",
        chartKind: "line",
        chartScale: "value",
      },
      expectedSequence: [
        "bankgraph.get_context",
        "bankgraph.configure_comparison",
      ],
      note: "Omitting chart boundaries preserves the visible history while changing the exact analytical pair.",
    },
    {
      id: "watchlist-idempotency",
      prompt: "Put SoFi Bank on my watchlist.",
      expectedTool: "bankgraph.update_research",
      expectedInput: { action: "set_watchlist", cert: 26881, watched: true },
      expectedSequence: ["bankgraph.get_context", "bankgraph.update_research"],
      note: "Calling this fixture twice must return changed false on the second call.",
    },
    {
      id: "inspect-change",
      prompt:
        "Why did SoFi Bank’s assets change from Q3 to Q4 2025, and was that unusual for peers?",
      expectedTool: "bankgraph.inspect_change",
      expectedInput: {
        cert: 26881,
        metric: "asset",
        from: "2025Q3",
        to: "2025Q4",
        peerRelative: true,
        maxComponents: 8,
      },
      note: "The result must come from deterministic components and a stated peer cohort.",
    },
    {
      id: "investigate-bank-multi-metric",
      prompt:
        "Investigate what changed at Zions from Q1 to Q2 2026 across assets, deposits, loan growth, net interest margin, return on assets, and noncurrent loans. Show eight quarters of history, compare the movements with the current peers, check mapped structural events, and include economic context.",
      expectedTool: "bankgraph.investigate_bank",
      expectedInput: {
        cert: 2270,
        comparisonCerts: [],
        metrics: ["asset", "dep", "loanGrowth", "nimy", "roa", "nclnlsr"],
        from: "2026Q1",
        to: "2026Q2",
        historyPeriods: 8,
        peerRelative: true,
        includeMacro: true,
        maxComponents: 3,
        depth: "pro",
      },
      expectedSequence: ["bankgraph.get_context", "bankgraph.investigate_bank"],
      note: "One semantic operation prepares the visible workspace and returns bounded, source-backed evidence across several analytical dimensions.",
    },
    {
      id: "guided-view",
      prompt: "Keep the data selection but show me the guided map view.",
      expectedTool: "bankgraph.configure_view",
      expectedInput: {
        panel: "map",
        depth: "guided",
        metricFocusMode: "keep",
        mapStates: [],
        mapCerts: [],
      },
      expectedSequence: ["bankgraph.get_context", "bankgraph.configure_view"],
      note: "Depth is a shared workspace preference, not a separate agent-only state.",
    },
    {
      id: "read-current-screen",
      prompt:
        "Read every bank in the screen I have open now, starting with the first 25.",
      expectedTool: "bankgraph.read_current_screen",
      expectedInput: { pageSize: 25 },
      note: "The result returns complete records and an opaque cursor tied to the exact live screen definition and revision.",
    },
    {
      id: "read-roa-history",
      prompt:
        "Give me the last eight quarters of reported ROA for SoFi and JPMorgan Chase.",
      expectedTool: "bankgraph.read_metric_history",
      expectedInput: { metric: "roa", certs: [26881, 628], periods: 8 },
      note: "The result contains aligned exact values and explicit nulls for missing observations.",
    },
    {
      id: "read-current-peer-cohort",
      prompt: "Show me the exact peer cohort and its data coverage.",
      expectedTool: "bankgraph.read_current_cohort",
      expectedInput: { pageSize: 25 },
      note: "The cursor is bound to the exact cohort definition so a later workspace edit cannot silently continue an older page.",
    },
    {
      id: "analyze-cohort-deposit-trend",
      prompt:
        "Which current peers grew deposits by more than 2% from Q3 to Q4 2025, grouped by state?",
      expectedTool: "bankgraph.analyze_cohort_trends",
      expectedInput: {
        from: "2025Q3",
        to: "2025Q4",
        conditions: [{ metric: "dep", operator: "gt", value: 2 }],
        groupBy: "state",
        pageSize: 20,
        groupPageSize: 25,
      },
      expectedSequence: ["bankgraph.get_context", "bankgraph.analyze_cohort_trends"],
      note: "Deposit movement uses percent change; the complete bounded result is published into the visible shared workspace while the tool response stays paginated.",
    },
    {
      id: "read-workspace-comparison",
      prompt: "Read the bank comparison I have open now.",
      expectedTool: "bankgraph.read_current_comparison",
      expectedInput: {},
      note: "The result uses the selected banks, visible measures, period, and elected release already shown in the workspace.",
    },
    {
      id: "analyze-peer-roa-distribution",
      prompt: "Where does the focused bank sit in the current peer ROA distribution?",
      expectedTool: "bankgraph.analyze_peer_distribution",
      expectedInput: { metric: "roa" },
      note: "The result returns deterministic quartiles, rank, and bounded tail records from the current cohort.",
    },
    {
      id: "analyze-deposit-roa-relationship",
      prompt: "How are deposits and ROA related across the peer cohort?",
      expectedTool: "bankgraph.analyze_metric_relationship",
      expectedInput: { xMetric: "dep", yMetric: "roa", maxPoints: 100 },
      note: "The tool reports the exact comparable sample and bank points, calculates Pearson correlation from two nonconstant pairs, and labels mechanical or small-sample results explicitly.",
    },
    {
      id: "read-cohort-geography",
      prompt: "Summarize peer ROA by headquarters state.",
      expectedTool: "bankgraph.read_geography_summary",
      expectedInput: { metric: "roa", maxStates: 56 },
      note: "The result provides exact state counts and deterministic aggregate measures.",
    },
    {
      id: "read-workspace-economic-context",
      prompt: "Read the economic series shown beside this bank analysis.",
      expectedTool: "bankgraph.read_workspace_macro_context",
      expectedInput: {},
      note: "The result preserves direct-agency sources and makes no causal claim about bank movements.",
    },
    {
      id: "explain-loan-growth-method",
      prompt:
        "How does Bankgraph calculate loan growth, and what source field does it use?",
      expectedTool: "bankgraph.get_metric_method",
      expectedInput: { metric: "loanGrowth" },
      note: "The answer comes from the published metric contract rather than generated prose.",
    },
    {
      id: "no-pipeline-control",
      prompt: "Run the FDIC sync pipeline now.",
      expectedTool: null,
      note: "No site tool may expose ingestion, secrets, administration, or pipeline mutation.",
    },
  ];

export const WEBMCP_ROUTE_NATURAL_LANGUAGE_FIXTURES: readonly WebMcpNaturalLanguageFixture[] =
  [
    {
      id: "route-bank-directory-read",
      prompt:
        "Read the filters and first ten banks on the directory page I have open.",
      expectedTool: "bankgraph.read_bank_directory",
      expectedInput: { limit: 10 },
      note: "The contextual tool reads the URL-backed filters and the same page of results as the visible table.",
    },
    {
      id: "route-bank-directory-open-bank",
      prompt:
        "Open FDIC certificate 3511 from these directory results in the research workspace.",
      expectedTool: "bankgraph.open_directory_bank",
      expectedInput: { cert: 3511 },
      note: "The certificate must appear on the current visible page before the tool can change workspace state.",
    },
    {
      id: "route-bank-directory-open-screen",
      prompt:
        "Carry this filtered bank directory into the research workspace as my current screen and peer cohort.",
      expectedTool: "bankgraph.open_directory_screen",
      expectedInput: {},
      note: "The handoff uses the shared workspace reducer and preserves the directory's question, filters, and ordering.",
    },
    {
      id: "route-bank-profile",
      prompt:
        "On this bank page, read the institution profile and latest reported measures.",
      expectedTool: "bankgraph.read_bank_profile",
      expectedInput: {},
      note: "The contextual tool reads the bank already open in the browser.",
    },
    {
      id: "route-bank-peers",
      prompt:
        "On this peer page, show this bank’s ROA rank and its last eight percentile observations.",
      expectedTool: "bankgraph.read_bank_peer_position",
      expectedInput: { metric: "roa", limit: 8 },
      note: "The current rank uses exact same-period peers; the history reports its quantile-estimation method.",
    },
    {
      id: "route-bank-system-context",
      prompt:
        "For the bank selected in the workspace, read its five most recent branch-footprint years with source coverage.",
      expectedTool: "bankgraph.read_bank_system_context",
      expectedInput: { section: "footprint", limit: 5 },
      note: "The contextual tool reads the same SOD and annual-history response as the visible institution context panel.",
    },
    {
      id: "route-industry-trend",
      prompt:
        "From this industry page, read eight quarters of bank count, assets, ROA, and NIM for community banks.",
      expectedTool: "bankgraph.read_industry_evidence",
      expectedInput: {
        section: "trend",
        segment: "community",
        metrics: ["bank_count", "total_assets", "median_roa", "median_nim"],
        limit: 8,
      },
      note: "The tool reads the same aggregate rows as the industry charts.",
    },
    {
      id: "route-industry-change-radar",
      prompt:
        "On the banking-system page, show whether deposit growth was broad or concentrated and name the institutions with the largest additions and reductions.",
      expectedTool: "bankgraph.read_industry_evidence",
      expectedInput: {
        section: "change_radar",
        radarMetric: "total_deposits",
      },
      note:
        "The tool reads the same matched-bank breadth, totals, contributors, population, period, and method shown in the quarterly change radar.",
    },
    {
      id: "route-failure-timeline",
      prompt:
        "Read the recent failure timeline from the failure view I have open.",
      expectedTool: "bankgraph.read_failure_evidence",
      expectedInput: { section: "timeline", limit: 8 },
      note: "The response preserves the active failure, assistance, or combined record filter.",
    },
    {
      id: "route-macro-sources",
      prompt:
        "Give me the six latest Fed funds, 10-year Treasury, and unemployment observations with their official sources.",
      expectedTool: "bankgraph.read_macro_evidence",
      expectedInput: {
        seriesIds: ["FRB_FEDFUNDS", "UST10Y", "BLS_UNRATE"],
        limit: 6,
      },
      note: "Each series keeps its agency, source-series code, observation date, units, and retrieval date.",
    },
    {
      id: "route-current-comparison",
      prompt:
        "Read the last eight quarters of ROA for the banks in the comparison I have open.",
      expectedTool: "bankgraph.read_current_comparison",
      expectedInput: { metric: "roa", limit: 8 },
      note: "The tool reads the current human bank selection, metric selection, and date range.",
    },
    {
      id: "route-open-workspace",
      prompt:
        "Carry this comparison into the research workspace so I can keep working there.",
      expectedTool: "bankgraph.open_in_workspace",
      expectedInput: {},
      note: "The route handoff uses the shared workspace reducer and persisted browser state.",
    },
  ];
