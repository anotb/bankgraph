# Contributing to Bankgraph

Bankgraph benefits from corrections to data handling, metric definitions, accessibility, performance, browser behavior, and the research workflow. A contribution should make a public-data result easier to reproduce or the application safer to operate.

## Before opening a change

For a product or interface change, describe the research question it helps someone answer. For an analytical change, identify the source fields, units, time basis, formula, missing-value behavior, and a test case. For a data discrepancy, include the institution certificate number when relevant, reporting period, Bankgraph retrieval time, and the public originating-agency record used for comparison.

Do not include private datasets, credentials, downloaded production databases, or personal research notes.

## Set up the project

Follow the local procedure in the [README](README.md). The shortest verification path for a code change is:

```sh
npm ci
npm run release:check
```

The release check uses an isolated synthetic D1 database. Browser tests require a separate local server and run with `npm run test:e2e`.

To work on the interface against live published data without a local D1, point the dev server at a deployed Worker's public API. Server-side loads are rewritten in `src/hooks.server.ts` and browser fetches are proxied by Vite; the publication fence is skipped because the remote Worker applies it to every response.

```sh
BANKGRAPH_REMOTE_API=https://<worker>.workers.dev npm run dev
node scripts/atlas-agent-demo.mjs http://localhost:5173 ./output/atlas-demo
```

The second command drives the board through the WebMCP tool catalog with a `document.modelContext` shim and saves screenshots of each stage. New server routes cannot be exercised in this mode; deploy a preview version for those.

## Make an analytical change

An analytical pull request should:

- Prefer reported fields and deterministic calculations over generated claims.
- Keep missing data distinct from zero.
- Label dollars, percentages, percentage points, and basis points correctly.
- Preserve the reporting period and peer recipe in output.
- Reconcile additive decompositions or expose a named residual.
- Add focused tests for signs, units, period boundaries, missing fields, and small cohorts.
- Update [Data and methodology](docs/data-and-methodology.md) when interpretation changes.

## Make a WebMCP change

WebMCP tools operate the same workspace transitions as the visible interface. Keep schemas strict, results bounded, annotations accurate, and mutations absolute and revision-aware. Test registration cleanup, unsupported-browser behavior, cancellation, retries, stale revisions, and a natural-language invocation. The private data pipeline is not a browser tool.

## Submit the change

Keep the pull request focused and explain:

1. The user question or defect.
2. The evidence for the chosen behavior.
3. The tests and manual checks performed.
4. Any remaining limitation or migration concern.

Do not present a planned feature as complete. Screenshots are useful for a visual change, but they do not replace keyboard, responsive, and state-transition checks.

Unless a contribution states otherwise and the maintainers agree in writing, submitting it means you license it under the repository's Apache License 2.0 terms.
