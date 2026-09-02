# Bankgraph product record

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Bankgraph serves people who need to understand a U.S. bank, the banking system, or what bank behavior says about the economy: analysts, investors, researchers, journalists, bank operators, students, and interested members of the public. They use it to find institutions, compare them on consistent definitions, investigate a change, build a defensible view, and share the evidence. It must be a place professionals return to for ongoing work and a place a curious reader can use without first learning bank regulation.

## Product purpose

Bankgraph is an analysis workspace for U.S. banking data. It turns FDIC filings and economic data from originating U.S. agencies into searchable institutions, comparable metrics, historical context, peer cohorts, maps, screens, and deterministic explanations of quarter-to-quarter change.

The product succeeds when a person can answer a serious bank or banking-system question without downloading and joining raw files, return when new filings arrive, and continue from the same research state. An agent must operate that same live workspace without creating a separate or opaque analysis state.

## Positioning

Bankgraph combines a public-data research terminal with a shared human-agent workspace. The distinctive mechanism is not an AI summary layered over a dashboard: every screen, cohort, comparison, chart, finding, and workspace action is a semantic operation that a person or WebMCP agent can perform against the same state. Analytical claims remain traceable to deterministic calculations and source fields.

## Operating context

Typical work starts with a bank, geography, public question, reporting event, or multi-condition screen. The researcher narrows a universe, edits a peer cohort, compares institutions across metrics and time, inspects distributions and component movements, pins findings, and saves or exports a workspace. A shared link must preserve enough state to reproduce the view while making clear which workspace text it exposes in the URL. Backend refreshes update the data without turning ingestion or publication controls into product features.

## Capabilities and constraints

- Preserve the existing SvelteKit, Svelte 5, TypeScript, ECharts, Cloudflare Workers, D1, KV, and public-data foundations where they remain useful.
- Human use and WebMCP use are equally important. WebMCP tools must call the same state transitions and analytical services as the visible interface, expose useful current context, use tight schemas, bound their output, and return verification state.
- Core analysis includes institution search, multi-condition screening, map-based selection, custom peer cohorts and exclusions, comparisons, configurable charts, metric history, change attribution, peer-relative movement, anomaly drilldowns, watchlists, research findings, saved/shareable workspaces, and exports.
- Change attribution must use reported components and explicit formulas. Language may explain a calculation, but a language model must not invent or compute the underlying financial result.
- Data provenance, reporting periods, units, revisions, missing values, cohort construction, and methodology must remain visible.
- Read-only exploration should be frictionless. Saved state changes must be safe, idempotent where retries are possible, and reversible when practical.
- Keep the public demo useful without API keys. Any optional AI provider must degrade to deterministic product behavior.
- Show ordinary as-of periods, sources, and material coverage limits where they change an interpretation. Do not build a separate publication-control product around them.
- Provide progressive depth rather than separate simplified and professional products. **Guided** depth frames a real question, explains analytical choices in plain language, and keeps advanced controls available but quiet. **Pro** depth exposes the full linked analytical matrix, cohort recipe, normalization, formulas, and source fields. Both depths use the same data, state, and calculations.
- Default to multi-bank, multi-metric, and multi-period relationships when the question calls for them. A single quarter or oversized metric may be selected for inspection, but must not become the product's organizing pattern.
- Preserve accessibility, responsive operation, keyboard workflows, testability, and performance despite higher analytical density.
- The product name used throughout the release is **Bankgraph**. The broader “Bank Data 2.0” phrase describes this release direction rather than a separate product name.
- Original code and documentation use Apache License 2.0, and the configured deployment target is Cloudflare Workers.

## Brand commitments

Use **Bankgraph** in the product. Public writing must be human, precise, calm, and specific. Avoid generic AI language, unsupported superlatives, sales pressure, financial advice, and the posture of a proprietary trading terminal. Treat safety and confirmations as product engineering, not the story.

The interface may replace the incumbent visual system. It must offer the range and fluency people associate with a serious market-data terminal without copying Bloomberg's costume. Avoid generic SaaS cards, giant hero metrics, examiner or working-paper metaphors, decorative AI summaries, and one-off story panels. The visual world is a linked research instrument: selections propagate across tables, histories, distributions, maps, decompositions, findings, and provenance.

## Evidence on hand

- The repository contains working FDIC institution and financial ingestion, direct-agency macro ingestion, industry aggregates, failures, bank financials, peers, risk scoring, anomalies, comparisons, maps, exports, keyboard navigation, and automated tests.
- No customer claims, usage figures, testimonials, proprietary data, or investment-performance claims are available. Public materials must not invent them.

## Product principles

1. Put the research question before the dashboard.
2. Make every number inspectable and every comparison reproducible.
3. Give people and agents one visible workspace, not parallel products.
4. Use density to reveal relationships, then provide a clear path into detail.
5. Prefer deterministic analysis and honest limits over generated confidence.
6. Design for repeat use: saved work, watchlists, live updates, durable URLs, keyboard flow, and fast return paths matter as much as the first impression.
7. Let the same evidence support different depths. Plain-language interpretation must always lead to the underlying comparison, formula, source fields, and exact values.
8. “Live” describes the experience: charts, points, rows, cohorts, periods, maps, findings, and evidence are operable and linked. No analytical view ships as decorative scenery.

## Accessibility & inclusion

Target WCAG 2.2 AA for core workflows. Do not rely on color alone, preserve readable tabular numbers and text alternatives for charts, support keyboard operation and reduced motion, keep focus visible, and make essential analytical workflows usable at narrow mobile widths.
