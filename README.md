# Bankgraph

Bankgraph turns public U.S. banking data into an inspectable research workspace. Screen institutions, compare peers across quarters, trace a change to reported components, and keep the period, cohort, units, formulas, and sources attached to the result.

People and ChatGPT work in the same visible workspace. ChatGPT can build a Research board inside Bankgraph with live charts, exact tables, comparisons, and written takeaways. A person can then inspect the values, change the measures or banks, rearrange the answer, and ask the agent to continue from those edits.

Open the [live research board](https://bankgraph.anot-irky.workers.dev/b) or follow the [local verification guide](docs/demo.md). Bankgraph serves a data release only after its coverage and provenance checks pass.

## What you can investigate

- Search active and historical U.S. institutions, then screen the latest loaded filings by geography, size, and reported financial condition.
- Build peer cohorts, exclude institutions, compare several banks, and keep the comparison aligned across tables and charts.
- Trace an unusual movement from the industry or peer distribution to one bank's reported components.
- Study deposits, lending, profitability, credit quality, capital, failures, reported domestic-office counts, and macroeconomic context without joining raw files first.
- Build a Research board from live charts, exact tables, analytical results, and linked takeaways, then keep editing it with or without an agent.
- Compare the years before past bank failures with current reported trajectories. The result is a descriptive event study and similarity screen, not a failure forecast.
- Export selected values and retain the reporting period, source fields, cohort recipe, and methodology needed to reproduce the analysis.

## WebMCP: ChatGPT works on the board with you

In a supported browser, ChatGPT can use Bankgraph as its working surface instead of leaving the result in chat. It can search institutions, define a screen or peer cohort, compare reporting periods, inspect component changes, study multi-period patterns and financial composition, and compare the years before past bank failures with active institutions. It can turn that work into one coherent board: live charts, exact tables, maps, economic context, and concise takeaways tied to the views that support them.

The board is shared state. A person can rename, resize, rearrange, or focus a view; switch a chart between values and indexed movement; change a relationship or map; remove a bank; or add another view. The next WebMCP read sees those edits. ChatGPT can also load a curated board, clear the views while keeping the current banks and measures, restore the automatic arrangement, start the research over, and switch the whole site between day and night. Mutations use current workspace and presentation revisions, so an old retry cannot silently replace newer work.

Every visible view has a structured read. ChatGPT can read the exact values behind the chart it just built—including metric definitions, reporting dates, cohort context, pagination, and source metadata—without trying to infer numbers from pixels. The same read reflects a person's later changes to that view.

Agents provide analytical intent—banks, measures, periods, cohort definitions, and supported view types. Bankgraph retrieves the published values and renders its own interactive components. The tools do not accept arbitrary JavaScript, HTML, SQL, chart code, or agent-supplied numerical series. Read-only operations are identified, and agent-written takeaways are treated as untrusted plain text. Browsers without WebMCP keep the complete human interface. See [the site-tool catalog](docs/webmcp-catalog.md), [the verification guide](docs/webmcp-verification.md), and the [privacy note](PRIVACY.md), especially before sharing a workspace link.

## Data sources

Bankgraph uses public sources:

- The [FDIC BankFind Suite API](https://banks.data.fdic.gov/docs/) for institution records, quarterly financial filings, and failure and assistance transactions. The interface keeps failures and assistance separate, and institution records include headquarters location and the current reported domestic-office count.
- The [U.S. Treasury daily rate feed](https://home.treasury.gov/treasury-daily-interest-rate-xml-feed) for 2-year and 10-year par yields.
- The [BLS Public Data API](https://www.bls.gov/developers/) for unemployment and BLS's [official CPI bulk file](https://download.bls.gov/pub/time.series/cu/cu.data.1.AllItems) for CPI-U, including a clearly labeled 12-month inflation transform.
- The Federal Reserve Board's [H.15 download](https://www.federalreserve.gov/datadownload/Choose.aspx?rel=H15) for the monthly effective federal funds rate and [H.8 release](https://www.federalreserve.gov/releases/h8/about.htm) for weekly aggregate bank credit, lending categories, and deposits.

Financial statement amounts are stored in thousands of dollars unless a view says otherwise. Ratios retain their reported or documented derived units. Reporting dates are part of every time-series record; pipeline timestamps describe retrieval, not the date represented by a filing.

BankFind `DEP` is the institution-level total deposit field, including foreign-office deposits under the source definition. It is not branch-level Summary of Deposits data. `OFFDOM` counts domestic offices including headquarters; Bankgraph does not present it as a branch-only count.

The extended FDIC pipeline also publishes Annual Summary, office-location, and structure-history partitions. Summary of Deposits branch-year files live in R2, with published annual footprint and market aggregates plus the current branch snapshot in D1. When the required partitions are published, the workspace can show branch and deposit-market context and certificate-mapped structural events for the active bank. Public data routes retain partition and source metadata. The recorded demo fixture does not contain these extended datasets.

### Bundled recorded demo versus a live backfill

The repository bundles a real, recorded FDIC slice so a clean clone can show useful history without downloading the full BankFind corpus. It contains six named institutions across 12 quarters ending June 30, 2026. Those institution and financial rows are recorded source observations. It also contains Bankgraph-derived industry aggregates calculated from every institution returned by FDIC for each quarter. The manifest records the population count for every aggregate period. The aggregate rows are not an FDIC-published table, and the underlying full-population institution rows are not bundled.

The application never presents this fixture as live data and never substitutes it for a failed production read. Seed it deliberately with `node demo/fixtures/seed-local.mjs`. Its checked-in pin, retrieval time, source indexes, request URLs, populations, and checksums are in `demo/fixtures/fixture-pin.json` and `demo/fixtures/manifest.json`. No macro observations are bundled.

`npm run backfill` is a different path. It fills the application's standard institution, filing, failure, analytical, and originating-agency macro tables from live sources. If Cloudflare cannot retrieve a BLS or Federal Reserve window, the release runner submits that exact agency response through the authenticated pipeline route. CPI-U can fall back to BLS's official bulk file without spending public API quota. The Worker still checks the source transport, series, range, metadata, and observations before writing. For complete FDIC partitions across an explicit historical range, use `npm run backfill:fdic` as described in [the FDIC backfill runbook](docs/fdic-backfills.md). Both paths use the network, take longer than the fixture, and reflect source availability when they run. Read [the fixture guide](demo/fixtures/README.md) and [the data notice](DATA_NOTICE.md) before redistributing data.

A deployed instance can refresh institutions, quarterly filings, failures, derived analytics, and the direct-agency series through the private backend pipeline. `/api/v1/meta` reports the latest loaded reporting period, coverage, and pipeline state.

Read [Data and methodology](docs/data-and-methodology.md) before using the project for published analysis.

## Run Bankgraph locally

Use Node.js 22 and npm. Wrangler supplies local versions of Cloudflare D1, KV, and R2.

1. Install the locked dependencies.

   ```sh
   npm ci
   ```

2. Create the local secret file.

   ```sh
   cp .dev.vars.example .dev.vars
   ```

   On Windows PowerShell, use `Copy-Item .dev.vars.example .dev.vars`.

3. Apply the D1 schema.

   ```sh
   npm run db:migrate:local
   ```

4. Start the development server.

   ```sh
   npm run dev
   ```

The interface loads with empty states until data is present. To populate public FDIC data, leave the server running and start the resumable pipeline in another terminal:

```sh
npm run backfill
```

The FDIC and direct-agency data stages need no data-provider key. `.dev.vars` contains only local operational secrets and must not be committed.

For the smaller recorded demo instead of a full network backfill, run:

```sh
node demo/fixtures/seed-local.mjs
```

## Verify a change

Run the complete local release gate:

```sh
npm run release:check
```

The command checks types, runs the unit, integration, lake-operation, and critical browser suites, rejects high-severity production dependency advisories, builds the Cloudflare Worker, validates its deploy bundle, migrates an isolated D1 database, inserts synthetic test records, starts the built Worker, and verifies the home page and core APIs. It does not deploy or touch the normal local database.

To run only the critical browser suite, use:

```sh
npm run test:e2e
```

To inspect the current public release without database credentials, use:

```sh
npm run audit:data
```

## Deploy and operate it

The repository targets Cloudflare Workers with D1, KV, and R2 bindings. Follow [Deploy Bankgraph](docs/deployment.md) to create or connect resources, apply migrations, set secrets, verify the first data load, and enable the nightly refresh. The deployment guide separates commands that change remote state from local checks.

## Release provenance

Commit `b852f9b` records the product immediately before the WebMCP-era extension. The public release keeps that baseline intact and presents the current Bankgraph work as the next reviewable change. Owner-only review notes, recording material, and submission drafts stay outside the public branch.

## Important limits

Bankgraph is an analytical aid, not investment advice, a bank rating, or a substitute for regulatory filings. Public source data can be revised, delayed, incomplete, or affected by mergers and accounting changes. Peer-relative movement is descriptive, not proof of cause. Financial-condition indicators are transparent proxies, not confidential supervisory ratings.

The active-institution registry and latest-quarter reporting population are not identical, and some schedules do not apply to every institution type. Bankgraph preserves those nulls and reports the population used in each comparison. The [data-quality guide](docs/data-quality.md) explains the current gaps and includes a reproducible public audit.

The [near-term roadmap](docs/roadmap.md) records the remaining work that would materially improve repeat use, portability, and analytical depth.

Board state is stored in the browser. A copied live link puts a bounded copy of the analytical choices—including the research question and takeaway summaries—into the URL. The link replays those choices against the data published when it is opened; it is not a fixed record or a private storage channel. A research snapshot downloads the selected values, normalized financial rows, coverage, formulas, exact cohort, and release generation as a fixed local JSON file. Review [Privacy](PRIVACY.md) before sharing either artifact.

## License

Bankgraph's original code and documentation are available under the [Apache License 2.0](LICENSE). That grant does not relicense public-source observations or third-party material. See the [data notice](DATA_NOTICE.md) and [third-party notices](THIRD_PARTY_NOTICES.md).
