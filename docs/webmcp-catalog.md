# WebMCP site-tool catalog

The site-tool layer is an experimental, progressively enhanced client API. Unsupported browsers
continue to use the normal UI and HTTP APIs; WebMCP availability is never required for rendering.

## Infrastructure catalog

| Export                                             | Purpose                                                                                                                                                                                                                                                                         |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `createWebMcpToolHost()`                           | Creates a dynamic registry with route scopes, duplicate protection, diagnostics, and bounded result handling.                                                                                                                                                                   |
| `WebMcpHost.svelte`                                | Top-level lifecycle component. It reconciles a route's tool definitions and removes them when the route unmounts.                                                                                                                                                               |
| `WebMcpDiagnostics.svelte`                         | Debug panel showing browser API availability, origin isolation, route registration state, registered names, timing, and the latest registration or error.                                                                                                                       |
| `detectWebMcp()`                                   | Safely feature-detects `document.modelContext.registerTool`.                                                                                                                                                                                                                    |
| `createResultEnvelope()` / `createErrorEnvelope()` | Produces canonical JSON-safe envelopes capped at 1,400 characters by default. Paged analytical reads and complete artifact references can declare a 32,768-character ceiling; variable-row tools automatically reduce a page to the largest set of complete records that fits. Encoded workspace state keeps its separate 6,144-character browser limit. |
| `validateToolDefinition()`                         | Enforces the deliberately small, bounded JSON Schema subset.                                                                                                                                                                                                                    |

Routes supply stable metadata plus a live `controller`. The host registers the current imperative
shape and calls the latest controller even when a Svelte update creates a new function. This keeps
idempotent updates from churning the browser registry.

```svelte
<script lang="ts">
	import { WebMcpHost } from '$lib/components/webmcp/index.js';
	import type { WebMcpToolDefinition } from '$lib/webmcp/index.js';

	const tools: WebMcpToolDefinition[] = [{
		name: 'bank_search',
		title: 'Search banks',
		description: 'Search banks by a short institution or location query.',
		inputSchema: {
			type: 'object',
			properties: { query: { type: 'string', minLength: 1, maxLength: 120 } },
			required: ['query'],
			additionalProperties: false
		},
		annotations: { readOnlyHint: true, untrustedContentHint: false },
		controller: async ({ query }, { signal }) => {
			const response = await fetch(`/api/v1/banks?q=${encodeURIComponent(String(query))}`, { signal });
			return { summary: 'Matching banks.', data: await response.json() };
		}
	}];
</script>

<WebMcpHost scope="banks" {tools} />
```

Add `?webmcp=debug` to a route that mounts `WebMcpHost` to show the diagnostics panel. The query
parameter only reveals state; it does not enable a browser experiment, install an agent, or change
the page's bank data. A component can still pass `showDiagnostics` for a test harness.

Every definition must explicitly set both annotations. Set `untrustedContentHint: true` whenever a
result can contain institution-authored, user-authored, or third-party text. The browser-owned
execution signal must be passed to cancellable work. Controllers return `{ summary, data }`; the
host turns thrown non-cancellation errors into canonical error envelopes because native callback
rejections currently surface to callers only as a generic execution error.

The current imperative dictionary has `name`, optional `title`, `description`, optional
`inputSchema`, `execute`, and optional `annotations`. This implementation intentionally does not
send or assume `outputSchema`.

Primary reference: [WebMCP Community Group draft](https://webmachinelearning.github.io/webmcp/).

## Bankgraph board catalog

The `/b` route registers the tools that are useful for the current board and its available data
adapters. `bankgraph.webmcp_diagnostics` is added only when `webmcp=debug` is present. Moving to a
contextual route removes the board scope and registers that page's smaller local catalog instead.
The catalog is intentionally contextual, so its count can change as a route gains or loses a real
capability.

The tool surface has three layers. State tools read and change the same workspace a person sees.
Analysis tools run deterministic work over Bankgraph's published data. Board tools place the result
on the page as a live chart, exact table, comparison, or takeaway that a person can edit.

### Workspace state and direct reads

| Tool | What it does |
| --- | --- |
| `bankgraph.get_context` | Reads the current question, screen, bank selection, periods, peers, views, takeaways, watchlist, data date, and workspace revision. |
| `bankgraph.search_banks` | Searches up to the first 1,000 ranked institution matches and returns complete records in cursor pages. |
| `bankgraph.configure_screen` | Replaces the question, activity, location, asset, latest-metric, and result-ordering screen recipe. |
| `bankgraph.read_current_screen` | Reads the visible screen recipe and its ranked matches through revision-bound cursor pages. |
| `bankgraph.configure_comparison` | Chooses banks, measures, period, history presentation, comparison basis, and bank focus. |
| `bankgraph.set_peer_cohort` | Defines a reproducible cohort and its exact exclusions. |
| `bankgraph.read_current_cohort` | Reads the cohort definition, coverage, freshness, and complete members with cursor pagination. |
| `bankgraph.read_current_comparison` | Reads exact values for the selected banks, measures, and reporting period. |
| `bankgraph.analyze_peer_distribution` | Calculates quartiles, missing coverage, focused-bank rank, and both distribution tails. |
| `bankgraph.analyze_metric_relationship` | Calculates a bounded cross-sectional relationship with exact bank points and sample counts. |
| `bankgraph.read_geography_summary` | Summarizes the current cohort by headquarters state. |
| `bankgraph.read_workspace_macro_context` | Reads the direct-agency economic series shown beside the bank analysis. |
| `bankgraph.read_metric_history` | Reads aligned quarterly values for one measure and up to ten banks over 40 periods. |
| `bankgraph.get_metric_method` | Reads the published source field, unit, formula, frequency, and limitations for a measure. |
| `bankgraph.inspect_change` | Attributes a reported change to available components and peer-relative movement. |
| `bankgraph.investigate_bank` | Opens the one-bank board and returns linked history, components, peer movement, structural context, and optional economic context. |
| `bankgraph.update_research` | Adds or removes a finding, or changes a bank's watchlist status. |
| `bankgraph.share_or_export` | Creates a live workspace link, public workspace-state JSON, or release-fenced CSV. |

### Higher-level analysis

| Tool | What it does |
| --- | --- |
| `bankgraph.analyze_cohort_trends` | Finds current cohort members that satisfy one to six change conditions and groups the result by state or opening asset range. |
| `bankgraph.read_result_set` | Pages the exact rows and groups from a visible cohort-trend result without rerunning it. |
| `bankgraph.analyze_cohort_change` | Compares up to six measures across any two reporting quarters for a fixed cohort, including breadth, distributions, totals, movement, concentration, and movers. |
| `bankgraph.find_temporal_patterns` | Finds repeated increases or decreases, streaks, cumulative moves, acceleration or deceleration, and threshold crossings across multiple quarters. |
| `bankgraph.analyze_financial_composition` | Compares asset, funding, or loan composition for one bank, selected banks, or the current cohort. |
| `bankgraph.analyze_failure_patterns` | Builds a historical failure event study and ranks the full eligible active-bank universe by descriptive trajectory similarity. It does not estimate failure probability. |
| `bankgraph.read_analysis_result` | Pages the stored rows, groups, components, members, or series from a published analysis result. |

### Shared research board

| Tool | What it does |
| --- | --- |
| `bankgraph.read_research_board` | Reads the visible order, resolved strips, focus, theme, titles, widths, semantic bindings, and both revisions. |
| `bankgraph.read_board_block` | Reads the primary structured data behind one visible view. Optional sections page exact rows, series, components, or analogues, up to 200 records. |
| `bankgraph.list_board_templates` | Lists the six curated starting points shown to people, including the required bank, cohort, or measure context. |
| `bankgraph.apply_board_template` | Appends or replaces the board with an Atlas template built from the current selections. |
| `bankgraph.add_workspace_view` | Adds or replaces a live view of the current comparison matrix, metric history, peer distribution, change attribution, metric relationship, headquarters geography, economic context, or bank context. |
| `bankgraph.plot_metric_history` | Adds a live bank-history chart from certificates, measures, dates, and presentation choices. |
| `bankgraph.publish_exact_table` | Adds a horizontally scrollable bank-by-measure table tied to fixed endpoints or the current comparison. |
| `bankgraph.publish_result_view` | Places another view of an existing analysis result without recomputing it. |
| `bankgraph.upsert_takeaway` | Adds or edits a plain-text takeaway tied to one or more board views. |
| `bankgraph.update_board_block` | Renames a view, changes its width, or switches to a compatible presentation. |
| `bankgraph.arrange_research_board` | Reorders every view and updates focus in one workspace revision. |
| `bankgraph.configure_board_view` | Changes one view's resolved role, size, height, presentation, follow-or-pin behavior, economic series, relationship axes, map mode, or attribution mode. |
| `bankgraph.remove_board_blocks` | Removes one or more views by stable ID. Retries are safe. |
| `bankgraph.clear_research_board` | Removes every view while keeping the current banks, cohort, measures, and periods. |
| `bankgraph.reset_board_layout` | Keeps the views and restores the automatic strip arrangement. |
| `bankgraph.reset_research_board` | Starts over with a fresh research board while preserving the watchlist. |
| `bankgraph.focus_board_block` | Changes the shared focused view; the next agent read sees a person's focus change. |
| `bankgraph.set_appearance` | Sets the whole site to day or night mode idempotently. |

Every board mutation uses one of four persistent widths on the 12-column human board: `quarter`
(3 columns), `half` (6), `three_quarter` (9), or `full` (12). Existing analysis calls keep their
view-dependent defaults when `boardSpan` is omitted: compact views default to `half`, while dense
`both`, `small_multiples`, `timeline`, and `exact_table` views default to `full`.

A `workspace_view` block stores only its semantic live binding. Its `binding.view` is one of
`comparison_matrix`, `metric_history`, `peer_distribution`, `change_attribution`,
`metric_relationship`, `headquarters_geography`, `economic_context`, or `bank_context`. The rendered
values follow the current shared workspace state; the block does not persist snapshot rows or add a
second source of truth.

`investigate_bank` is the high-level entry point for a bank-change question. It accepts two consecutive
reporting quarters and two to six published measures, prepares four to 12 quarters of visible
history, and opens the same bank, metric, period, and attribution state a person can edit. Its result
keeps each measure separate, names the method and units, limits component lists, reports peer movement
when available, and labels economic observations as context rather than cause. Lower-level tools remain
available when an agent needs to page full history, inspect another distribution, save a finding, or export.

Comparison and view tools use the same research metric registry as the workspace. It covers balance
sheet, profitability, funding, credit, capital, and operating scale. A comparison can show up to six
metrics at once, and another metric can replace any visible column without losing the bank, period,
or cohort context. Change inspection remains narrower because it only accepts measures with a
deterministic endpoint or component method. Assets, quarterly net income, and loan-to-deposit results
include their available component bridges; every result names its calculation method and units. The
workspace screen applies name, headquarters state, activity, asset bounds, and up to 12 conditions
using metrics stored on the latest institution snapshot. Board tools accept semantic choices that
Bankgraph can render from published data. They do not accept arbitrary JavaScript, HTML, SQL, chart
code, or caller-supplied numerical series.

The board stores its order, titles, widths, focus, source bindings, live workspace-view bindings, and
compact result references in the workspace state. Materialized analysis results live in a
content-addressed browser repository and are checked before they are read. The version 3 live-link
codec carries these reproducible semantic specifications and short takeaways, not a large copied
result payload; its existing history, table, analysis, and takeaway tuples remain compatible.

Layout and view-specific choices have a separate presentation revision. Operations that can replace
or reconfigure a board require both the workspace revision and presentation revision. This prevents
an agent from overwriting a person's layout change after reading older state. Setting an already
active theme is a safe no-op and does not require a revision.

Assets and deposits use FDIC USD thousands in requests and results: `10,000,000` means $10 billion.
Reported ratios use percent, while changes in those ratios use percentage points. Monetary balances
use percent change in cohort-trend conditions; quarterly net income uses its change in thousands of
dollars. Employee changes use percent and the current domestic-office snapshot has no invented
history. `loanGrowth` is a
derived year-over-year rate at each endpoint; attribution and cohort-trend tools therefore report the
difference between those rates in percentage points. It is not the quarter-to-quarter percent change
in the net-loan balance. Reporting periods
accept quarter-end `YYYYMMDD` values or `YYYYQn`; quarter labels are normalized to `0331`, `0630`,
`0930`, or `1231`, and other calendar dates are rejected.

Search and the current screen return 25 complete bank records by default and accept up to 50. Search
can traverse the first 1,000 ranked matches and returns at most four distinct condition or ranking
measures in each record: the ranked measure first, then condition measures in request order. `counts`
distinguishes the full match set from the traversable ranked set. `pagination` reports the effective page size, returned,
omitted, `hasMore`, and a request-bound `nextCursor`. When a requested page would exceed the 32,768-
character serialized envelope, the controller reduces only the number of complete records and advances
the cursor by exactly the number returned. It never emits a partial record or asks the caller to guess a
smaller page while a complete smaller page can fit. A sort by name needs no extra metric because the
institution name is already returned.

`read_current_cohort` defaults to 25-member pages and accepts up to 50 complete section records. Its `section` input can page recipe states,
recipe conditions, exclusions, and—when the peer basis is the current screen—the screen's states and
conditions. The scalar definition and per-section counts stay on every page, while the definition hash
binds every cursor to the exact recipe and screen.

`analyze_cohort_trends` defaults to 20 matching-bank records and 25 concentration groups and accepts up
to 50 banks and 56 groups. `read_result_set` defaults to 50 rows or groups and accepts up to 100. These
tools apply the same serialized-size fit before returning, preserve independent stable cursors, and
report returned and omitted counts from the actual fitted page. Analyses that run over the current
browser-hydrated cohort currently support up to 200 banks. That is a browser computation boundary,
not a D1 or dataset limit. Server-side failure-pattern analysis ranks the full eligible active-bank
universe before returning the requested display rows.

The bank screen reads the stored BankFind `institutions` snapshot. Its ASSET and DEP values are the
latest values stored for each institution. Metric history, change attribution, and the published metric
method use BankFind `financials` institution-quarter fields ASSET and DEP. Responses keep those scopes
separate and return `sourceAsOf`, `retrievedAt`, and `pageLoadedAt`; a selected chart range never replaces
the source reporting date.

No catalog contains an ingestion, administration, secret, or pipeline-mutation tool. Financial
results and workspace notes are marked as untrusted content. Every mutation accepts an optional
`ifRevision`, validates its complete high-level operation before changing state, and reports
`changed`, `revision`, `sourceMode`, `sourceAsOf`, `retrievedAt`, and `pageLoadedAt`. Multi-command
operations commit through one batch revision. Async screen, peer, and bank-history preparation finishes
before that commit, checks cancellation and the captured revision again, and publishes prepared data
before returning success.

### Route integration contract

The Atlas board and WebMCP adapters receive the same `Board`, `BoardData`, and underlying workspace
store. A person's control change updates the same semantic binding an agent reads; an agent mutation
updates the rendered board immediately. There is no separate agent dashboard or copied chart data.

```svelte
<script lang="ts">
	import { WorkspaceWebMcp } from '$lib/components/webmcp';
	import { createBrowserBankSearch, type WorkspaceWebMcpDependencies } from '$lib/webmcp';
	import { createWorkspaceStore } from '$lib/workspace';

	const workspace = createWorkspaceStore();
	const dependencies: WorkspaceWebMcpDependencies = {
		workspace,
		getDataContext: () => ({
			sourceMode: data.sourceMode,
			sourceAsOf: data.sourceAsOf,
			retrievedAt: data.retrievedAt,
			pageLoadedAt: data.pageLoadedAt
		}),
		searchBanks: createBrowserBankSearch({ getAsOf: () => data.sourceAsOf }),
		inspectChange: (request, { signal }) => analysis.inspectChange(request, { signal }),
		readMetricHistory: (request, { signal }) => analysis.readMetricHistory(request, { signal }),
		prepareScreen: (filters, context) => analysis.prepareScreen(filters, context),
		preparePeerCohort: (recipe, excluded, context) => analysis.preparePeerCohort(recipe, excluded, context),
		readCurrentCohort: (context) => analysis.readCurrentCohort(context),
		analyzeCohortTrends: (request, context) => analysis.analyzeCohortTrends(request, context),
		createArtifact: (request, { signal }) => artifacts.create(request, { signal })
	};
</script>

<WorkspaceWebMcp {dependencies} page="workspace" />
```

`sourceMode` is mandatory and must be either `live` or `recorded`. A fixture adapter must return
`recorded`; it must never reuse the browser bank-search adapter, which deliberately reports `live`.
The HTTP bank-search adapter issues one bounded v2 screen read. Route-owned attribution and artifact
adapters must pass through the browser execution signal and return bounded, provenance-bearing
results.

`searchBanks` must return exact latest values in `bank.metrics` for each public screen metric. This is
required for both live and recorded adapters so an agent can verify why each bank matched and which
value determined its rank. Missing reported observations use `null`.

The metric-history adapter receives one allowlisted metric, one to ten FDIC certificates, a count
from 1 to 40, and an optional normalized quarter-end `endingAt`. It returns ascending quarter-end
periods and one aligned value array per requested bank, using `null` for missing observations. It
also returns `sourceMode` and source freshness; it reads the same live or recorded workspace rows
shown in the interface. The tool returns all requested bank series by default; callers can still
request a smaller cursor page explicitly.

Relationship reads accept up to 100 exact bank points, geography reads accept all 56 supported state
and territory codes, and peer distributions accept up to 10 exact banks in each tail. Each result says
when the returned rows are only a subset of the comparable population.

Native failures resolve as bounded envelopes with stable codes. Invalid caller input is
`invalid_input`; stale optimistic writes are `stale_revision` and tell the caller to read context;
missing optional adapters are `capability_unavailable`; malformed adapter output is
`adapter_contract_violation`; transient HTTP and loading failures are marked retryable and include a
short `nextAction` or retry interval.

## Contextual research routes

Bankgraph also registers tools for the specialized page that is open. These tools read the same
server-loaded rows and client selections as the visible charts and tables. Moving to another page
removes the old page scope.

| Page | Contextual tools |
| --- | --- |
| Institutions | `bankgraph.read_bank_directory`, `bankgraph.open_directory_bank`, `bankgraph.open_directory_screen` |
| Economy | `bankgraph.read_macro_evidence`, `bankgraph.read_macro_bank_relationships`, `bankgraph.open_in_workspace` |
| Research board and bank profile | The full workspace and board catalog listed above. |

Page reads require a series only when it narrows a potentially large result. Responses include the
active filters or chart window, reporting period, units, and responsible public-data publisher.
Bank names and public-source metadata are marked as untrusted content. The Data and methods page is
static reference material rather than mutable analytical state, so it does not register a duplicate
page catalog; the research board exposes `bankgraph.get_metric_method` for computational definitions.

The open-in-workspace tools are local browser mutations. They use `workspaceCommands` and the
persisted `createWorkspaceStore()` state, then navigate to `/b`. A bank, comparison, metric,
period, and finding therefore appear in the same workspace that the person can continue editing.
These tools do not write to D1, R2, or any source dataset.

Live-link and public workspace-state tools use the workspace codec's public-share representation. Full private finding notes are
never handed to an artifact adapter. Share URLs do contain bounded workspace state, including finding
titles and shortened notes and sources. The adapter receives that encoded query string and truncation
metadata, not text beyond those limits. Anyone with a share URL can read the state it contains. An
over-budget workspace returns `workspace_share_budget_exceeded` with the encoded and maximum lengths
instead of a partial URL.

A live link preserves analytical choices, not values: opening it resolves those choices against the
then-current published release. The workspace's human Export menu separately downloads a fixed data
snapshot with selected values, normalized financial rows, missingness, calculation recipes, cohort
membership, and the release generation. Bankgraph does not claim that download is a hosted or revocable
permalink.
