# Bank Data Showcase — Design Spec

Date: 2026-08-21
Status: Approved by user directive ("EVERYTHING", full autonomy, no gates)
Execution: persona-based ox-alpha subagents, develop → review → verify loops per phase.

## Mission

Turn the existing FDIC bank-data explorer into the one-stop, viral-worthy showcase for
exploring all US bank data — historical (1934→) and latest — with an AI analyst on top.
Every phase must ship something screenshotable.

## Locked decisions

- Stack: keep SvelteKit 2 + Svelte 5 + Tailwind 4 + ECharts on Cloudflare Workers (D1/KV/R2).
- AI: yes. Workers AI free tier default via `env.AI` + AI Gateway; BYOK Anthropic/OpenAI;
  OpenRouter as additional provider. Guardrailed text-to-SQL; LLM never computes numbers.
- Scope: all three phases (viral core, data depth, AI analyst). No de-scoping.
- Deployment: Cloudflare free tier preferred; keep within D1 10GB / KV / Workers limits.
- Autonomy: user pre-approves all design decisions; personas decide fine-grained calls.

## Hero features (ship order)

1. **Bank Wrapped** — Spotify-style recap cards per bank (year + quarter variants), 9:16
   stat cards, one stat per card, auto-generated OG images (satori + resvg on Workers,
   immutable cache, pre-warm top banks) so X/Discord embeds look perfect. "Share this
   bank" client-side stat-card PNG with rank badge + sparkline + backlink.
2. **The Century View** — industry aggregates 1934→today (Depression → S&L → GFC → 2023),
   failure history explorer, deposit market share maps (SOD 1994+), branch maps (76k
   locations), M&A/merger timelines (`/history`), 40-year per-bank financial charts
   (backfill to 1984/1992 via bulk CSV).
3. **Ask the Data** — AI analyst chat over D1: text-to-SQL with SELECT-only validator,
   table allowlist, 500-row cap, per-IP rate limit, streaming responses, example queries.
   Plus nightly "what changed this quarter" narratives (rule-based skeleton, LLM polish
   of prose only), cached in KV, refreshed with data.
4. **Risk Score v2 (credibility anchor)** — 6 fixed metrics (uninsured share, brokered
   share, securities/assets, 3-yr asset growth, 4-qtr NIM trend, equity/assets), robust
   median/MAD z-scores vs size band (<$1B, $1–10B, >$10B), winsorized ±5, composite 0–100.
   Public **backtest tab**: score the 2023 failure wave (SVB, Signature, First Republic)
   and show they ranked in the top percentiles beforehand.

## Data foundation (new ingests, all keyless FDIC APIs)

- `/summary` annual aggregates 1934+ → `annual_summary`
- `/sod` branch deposit market share 1994+ (last 10 years first) → `sod`
- `/locations` 76k branches with lat/lng → `locations`
- `/history` M&A/structure events → `history_events`
- Financial backfill: curated ~40-column wide table (never 1,100 vars; D1 100-col cap),
  to 1992 via API pagination, 1984 via RIS bulk CSV if feasible
- Sync hygiene: `sync_state` checkpoints, idempotent upserts on natural keys,
  trailing-2-quarter re-pull (FDIC revises), row-count + Σ-assets reconciliation,
  GitHub Actions runner does heavy lifting, Worker endpoint stays thin/authed

## AI layer

- One `env.AI` binding + AI Gateway; provider registry: workers-ai (default/free),
  anthropic (BYOK), openai (BYOK), openrouter (BYOK or free-tier models).
- Text-to-SQL: schema DDL in cached system prompt → model emits SQL → validate
  (SELECT-only regex + EXPLAIN, table allowlist, LIMIT cap) → execute on read-only
  semantics → render table + chart suggestion. Never expose write paths.
- Narratives: nightly batch, KV-cached until data refresh; LLM rewrites lede/so-what
  only; numbers always from computed templates.
- Cost: free tier first; gateway caching; batch where possible.

## Design system

- Dark-mode-first, 3-layer surfaces: bg `#0B0E14`, surface `#11151C`, elevated `#1A2028`;
  text `#E6EAF0` / `#9AA4B2`; **amber accent** (`#F5A623` family); light theme mirrors hues.
- Type: Inter (UI, tabular-nums everywhere) + Geist Mono (stat readouts, IDs, slashed zero).
  Scale 12/13/14/16/20/28/40.
- Charts: Okabe-Ito categorical, Viridis sequential, blue-orange diverging (never red-green
  alone); direct labels; grayscale-legible.
- Motion: View Transitions crossfade; bank-row→detail shared-element morph; number tickers;
  200–300ms springs; `prefers-reduced-motion` respected; layout-mirroring skeletons.
- A11y: WCAG 2.2 AA — dual-render charts (`role="img"` + visually-hidden table), focus
  not obscured by tooltips, 24px targets, `aria-live` filter counts, mobile card-collapse
  tables below 640px.

## Virality engineering

- `/og/[...path]` 1200×630 dynamic OG per bank/view; `Cache-Control: immutable`; pre-warm
  top 500 banks at deploy.
- Share stat-card generator (client canvas → PNG download/copy) with backlink badge.
- RSS `/feed.xml` (failures + notable updates). Permalinks for every view.
- Launch kit page + assets: Show HN title/first-comment draft, X thread visuals,
  r/dataisbeautiful [OC] methodology comment, PH copy.

## Performance

- Workers Cache + SWR (`max-age=300, stale-while-revalidate=3600`) on pages/API; KV 3-tier
  in front of D1; prerender home/industry/glossary; ECharts lazy per-chart; initial JS
  ≤150KB gz; HTML ≤100KB gz; OG images never block render.

## Testing & verification

- Keep vitest unit tests green; expand for risk score, SQL validator, OG route, sync idempotency.
- Playwright smoke on critical paths (home → bank → wrapped → ask).
- `npm run ci` (typecheck + test + build) must pass after each phase before review signoff.

## Phasing

- **Phase 1 — Foundation & credibility**: design system + app shell; data foundation
  (summary/locations/history/sod + backfill); risk score v2 + backtest tab. Screenshotable:
  redesigned app + backtest page.
- **Phase 2 — Viral core & depth**: Bank Wrapped cards, OG images, share cards, century
  view, SOD maps, branch maps, M&A timelines, 40-year charts. Screenshotable: Wrapped.
- **Phase 3 — Alive & launch**: AI analyst chat, auto-narratives everywhere, RSS, launch
  kit, perf/a11y final pass. Screenshotable: Ask-the-Data demo.

## Agent orchestration model

Per phase: parallel develop workers on independent workstreams → reviewer agent on the
full phase diff (defect-first) → fix workers → `npm run ci` + Playwright verify → next
phase. All subagents are ox-alpha (ocx-self). Personas (e.g., "The Skeptic", "The
Showman", "The Cartographer") decide naming/tone/cuts autonomously.

## Binding branding decisions (persona panel, 2026-08-21)

| Decision | Value |
|---|---|
| Product name | **Bankgraph** (runner-up: Ledgerline) |
| Tagline | "Explore every U.S. bank, from 1934 to today." |
| Badge | bankgraph.app |
| Risk score name | **Fragility Index** (SVB Score vetoed by Skeptic) |
| Recap feature | **Year in Review** (avoids Spotify "Wrapped" mark) |
| AI chat feature | **Ask the Data** |

Phase-1 cuts (binding): defer 76k branch-location ingest UI, defer 1984 CSV backfill
(ship 1992+ via API), defer motion polish beyond shell basics to Phase 3. One recorded
dissent (Showman: motion timing). All user-facing strings live in
`src/lib/config/branding.ts` for single-file swap.
