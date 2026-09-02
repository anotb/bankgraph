# What comes next

Bankgraph is useful without an account and keeps working when WebMCP is unavailable. The current release concentrates on a fast public research board, deterministic analysis, and a shared human-agent workflow. These are the next improvements worth carrying forward.

## Shared and repeatable research

- Put layout choices, view-specific settings, and appearance into shared board links. The current link preserves the analytical state, but not every local presentation choice.
- Make analysis-backed boards portable. Failure studies and other larger results are cached in the browser; a link opened in a different browser may need to run the analysis again.
- Add optional account storage for named boards, watchlists, and “what changed since my last visit?” updates. Browser-local work should remain available without signing in.
- Give agent-led batch removal and template replacement the same visible undo history as direct manipulation.

## Deeper analysis

- Move the largest multi-quarter cohort jobs to bounded server-side queries. Interactive browser analysis is currently limited to 200 loaded institutions; server-backed failure research already covers the full eligible universe.
- Extend reported component attribution beyond the measures with a defensible accounting bridge today. A larger metric dictionary should preserve source fields, units, and explicit residuals rather than infer missing components.
- Add branch-market and structural-event views when the published Summary of Deposits and structure-history partitions support the requested period and institution.
- Add release-to-release monitoring for saved cohorts and watched banks, while keeping the original board reproducible.

## Board interaction

- Add a touch-native way to reorder views on phones and tablets.
- Let people duplicate a configured view and apply its settings to a new bank or measure.
- Add compact keyboard commands for adding a view, switching anchors, focusing a result, and returning to the board.

## Operations

- Measure one complete production refresh before enabling a daily schedule. The public read path is inexpensive on the current Cloudflare plan; the full write cost of a quarterly refresh still needs one observed run.
- Keep browser compatibility notes current while WebMCP remains an evolving browser API.

This list is deliberately limited to work that improves repeat use, analytical depth, or the shared board. It is not a holding area for decorative features.
