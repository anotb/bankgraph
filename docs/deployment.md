# Deploy Bankgraph to Cloudflare

This runbook creates a Bankgraph Worker backed by D1, KV, and R2, then verifies the first public-data load. Creating resources, setting secrets, applying migrations, deploying, loading data, changing workflow settings, and rolling back a release all change remote state. Run the local release checks first.

## Prerequisites

You need:

- A Cloudflare account with Workers, D1, KV, and R2 enabled.
- Wrangler authenticated to the intended account.
- Node.js 22 and the repository's locked npm dependencies.
- A long random pipeline secret.

The checked-in `wrangler.jsonc` pins Cloudflare account `a80c76f9ab8e80a5df4d271920d14156` and targets the production Worker `bankgraph` with D1 database `bankgraph-prod` (`70cd3e25-4db2-4599-9bc0-0b1d944d11b7`), KV namespace `ac308512b4734853b3017bf283e58f80`, and R2 bucket `bankgraph-exports`. Resource identifiers are not credentials, but deploying against the wrong resource can overwrite the wrong dataset. Replace the account and every resource identifier before deploying a fork or separate environment.

Before any migration or deploy, prove that Wrangler is using the intended account and that the checked binding resolves there:

```sh
npx wrangler whoami
npx wrangler d1 execute DB --remote --command "SELECT 1 AS ok"
```

Stop if either command names the wrong account or returns a missing-database error. A successful dry run validates the bundle and configuration shape; it does not prove that a remote resource exists in the active account.

For an existing production target, `wrangler whoami` must report the account intended by the release owner and its account ID must match `wrangler.jsonc`. Do not record a personal login name in this public runbook.

## Verify the release locally

Install from the lockfile and run the complete gate:

```sh
npm ci
npm run release:check
```

The seeded smoke database lives under `.wrangler/ci-smoke`. The script clears only that directory. It does not use the ordinary local database or a remote binding.

## Create Cloudflare resources for a fork

Skip this section when the resources in `wrangler.jsonc` are already the intended production resources.

1. Create the D1 database.

   ```sh
   npx wrangler d1 create bankgraph-prod
   ```

2. Create the KV namespace.

   ```sh
   npx wrangler kv namespace create CACHE
   ```

3. Create the R2 export bucket.

   ```sh
   npx wrangler r2 bucket create bankgraph-exports
   ```

4. Put the returned identifiers in `wrangler.jsonc`. Keep the binding names `DB`, `CACHE`, and `EXPORTS`; the application code depends on those names.

5. Build and validate the resolved configuration.

   ```sh
   npm run build
   npm run deploy:dry-run
   ```

## Apply the production schema

Review the migration list before it changes the remote database:

```sh
npx wrangler d1 migrations list DB --remote
```

If the installed schema already contains `release_control`, close the live gate through the authenticated Worker before any migration or manual D1 write:

```sh
BACKFILL_URL=https://your-worker.example PIPELINE_SECRET=your-secret npm run maintenance:close
```

The command is idempotent, owns the same renewed stage lease as ingestion, and leaves the site explicitly degraded. For the first upgrade from a schema that predates `release_control`, deploy this fail-closed Worker version (public requests will return `503` while the table is absent), then apply the migrations. Do not continue if the maintenance command reports a lease conflict.

Disable the nightly workflow and any other ingestion runner before closing the gate, and keep them disabled for the entire migration or manual-write window. The close request releases its lease after it has durably closed the gate; that lease does not reserve a later operator shell session against another writer.

Apply the pending migrations:

```sh
npx wrangler d1 migrations apply DB --remote
```

Cloudflare captures a D1 backup when migrations are applied. Do not run the initial data pipeline until every migration succeeds.

The readiness endpoint requires publication schema marker `0024`. Migrations through 0024 advance that marker in order, so an interrupted publication-schema upgrade remains degraded. Migration 0025 only adds a release-elected field to an existing public view; it leaves the staged publication and attestation contract unchanged, so the marker remains `0024`.

The historical Summary of Deposits lake has a separate operator procedure in [Summary of Deposits storage](sod-lakehouse.md). Complete its checksum, manifest, and bounded-publication checks before registering a new R2 partition.

## Set production secrets

Set the pipeline credential in Cloudflare's encrypted secret store:

```sh
npx wrangler secret put PIPELINE_SECRET
```

`PIPELINE_SECRET` is the only required production secret. Do not put its value in `wrangler.jsonc`, a GitHub variable, a shell transcript, or a committed environment file.

Production does not configure or ship FRED credential ingestion. Macro updates use the provider-neutral `macro` stage with direct-agency sources from Treasury, BLS, and the Federal Reserve Board. Each request is bounded to one catalog series and one source window. BLS and Federal Reserve history use windows of no more than ten years; Treasury uses one year. If Cloudflare cannot retrieve a BLS or Federal Reserve window, `scripts/backfill.ts` retrieves the exact agency response on the release runner and submits it through the authenticated pipeline route. CPI-U can use BLS's official `cu.data.1.AllItems` bulk file when API quota is unavailable. The Worker accepts only the allowlisted transports, verifies the planned range and series metadata, and applies the same observation validation and bounded D1 write path.

`industry-history` derives a ten-year, 40-quarter banking-system aggregate window from the canonical institution financial rows. It processes one missing quarter per authenticated request, uses idempotent aggregate writes, and stops once the window is complete. The release runner repeats this bounded stage before `correlations`; it does not download another source or place a large aggregation in one Worker request.

## Deploy the Worker

Build and deploy the exact configured Worker and asset bundle:

```sh
npm run build
npx wrangler deploy
```

Record the production URL from Wrangler. If a custom domain is used, configure it after the workers.dev deployment passes the health checks below.

## Load the first dataset

Set the deployed URL for the local backfill command without writing it to the repository:

```sh
BACKFILL_URL=https://your-worker.example PIPELINE_SECRET=your-secret npm run backfill
```

On Windows PowerShell:

```powershell
$env:BACKFILL_URL = 'https://your-worker.example'
$env:PIPELINE_SECRET = 'your-secret'
npm run backfill
Remove-Item Env:BACKFILL_URL, Env:PIPELINE_SECRET
```

The financial-history, trends, and macro-history stages are bounded and resumable. The command prints one `BACKFILL_RUN_ID`; reuse that value when resuming so every chunk and the final strict publish belong to the same release generation. Financial history is limited to the canonical BankFind range beginning `19920331`. It advances through one reporting-quarter partition at a time, sorted by the unique `CERT` key within that quarter, with 1,000 source rows per page and at most five pages per request. The loader pins both the filtered global source total and each quarter's total, rejects count drift or a non-increasing page boundary, and marks the stage complete only after D1's natural-key count and exact first/latest quarters reconcile. This `npm run backfill -- --only financials` path is the sole production financial loader; do not also run the generic FDIC partition CLI for financials. The first compatible run removes older partial rows and resets checkpoints created by the former unfiltered loader before continuing. If FDIC changes the pinned scope during a long initial load, start a new run ID so the loader deliberately refreshes every quarter against the new source view. The first macro load walks every supported source year and can span more than one run. After it completes, normal scheduled macro refreshes fetch only the latest expected year.

When a macro run stops after earlier series have completed, resume at the failed series with `npm run backfill -- --only macro --macro-from BLS_CPI_U`, replacing the series ID as needed. Keep the same `BACKFILL_RUN_ID`. This avoids refreshing completed BLS series and spending their public API quota again.

Publication is an explicit final stage. Immediately before it, `coverage-audit` discovers the current source-valid boundaries and writes a same-run, SHA-256-addressed manifest. It requires annual CB coverage from 1934 through CB's latest source year, annual SI coverage from 1984 through SI's latest source year, history process years from 1900 through the later of the current calendar year and source latest, the current locations snapshot, and SOD R2 years from 1994 through source latest. Every source/stored count must agree. SOD must have one latest R2 pointer, one matching D1 hot publication, complete checksum-keyed aggregates, no stale aggregate revisions, and physical Parquet and sidecar objects in R2. The first population stays closed until every required stage succeeds. After launch, public quarterly reads remain pinned to the elected release while the routine pipeline builds a newer quarter. A failed routine run therefore leaves the prior complete release available. The orchestration command does not attempt `publish` until every preceding stage has succeeded for the same run ID. Publish re-runs the manifest checks and binds the elected run and manifest hash into the atomic D1 release state.

For a first population, complete the annual-summary, process-year history, current locations, and SOD lakehouse procedures with one explicit `BACKFILL_RUN_ID` before the core run reaches `coverage-audit`. The canonical financial command is:

```sh
npm run backfill -- --only financials
```

The extended commands and their dynamic planners are documented in [FDIC backfills](fdic-backfills.md) and [Summary of Deposits storage](sod-lakehouse.md). After those loads, `npm run backfill` runs the strict core stages, the manifest audit, and the explicit final publish. A standalone pre-publish check is also available:

```sh
npm run backfill -- --only coverage-audit
npm run backfill -- --only publish
```

Both commands must receive the same `BACKFILL_RUN_ID` as the completed core generation. The publish command polls `/api/v1/ready` up to 12 times at five-second intervals and fails if the elected generation never becomes ready.

When upgrading a database created before migration `0009_change_attribution.sql`, run `npm run backfill -- --reset --only financials` once after the migration. It repopulates the reported component fields used by quarter-change bridges. Bankgraph will show partial coverage and a residual until those source fields are loaded.

## Verify the deployed data

Inspect the metadata endpoint:

```sh
curl --fail --silent --show-error https://your-worker.example/api/v1/meta
```

Confirm all of the following before sharing the site:

- `active_count` is nonzero and plausible against the FDIC source in `/api/v1/meta`.
- `latest_quarter` matches the most recent financial reporting period loaded.
- `data_freshness` contains recent timestamps for the required pipeline stages.
- `financials`, `peer_stats`, `bank_trends`, `agg_industry`, and other required table counts are nonzero.
- A bank screen, a bank history, an industry view, and an export return data for the displayed period.

Then inspect the deployment readiness endpoint:

```sh
curl --fail --silent --show-error https://your-worker.example/api/v1/ready
```

It must return HTTP `200`, `status: "ready"`, a published release matching the latest complete financial quarter, and the same opaque generation in D1 and KV. HTTP `503` with `status: "degraded"` is an explicit stop signal: do not send traffic until the reported migration, dataset publication, binding, or cache-generation check is resolved.

Every mutating sync stage and bounded FDIC partition step owns the same D1 stage lease. Routine quarterly work writes to base tables behind `published_*` views, which select only data at or before `release_control.release`. The institution view projects its financial snapshot from that elected quarter instead of the in-place summary columns. The first population, migrations, manual D1 work, full `financials` rebuilds, `fix-dates`, and direct FDIC partition publication still close the authoritative gate before a live-table mutation.

A dynamic public request checks the release generation before rendering, then checks the same generation after its body is complete. Publication changes the release and generation in one D1 batch. A request that overlaps that switch is discarded with `503`; subsequent requests use the new release. Static assets and immutable, registered R2 lake objects do not take this dynamic-data fence.

KV is cache-only. Its generation pointer may remain stale in a remote Cloudflare location for about a minute or longer, so public cache keys use the generation admitted by D1 rather than trusting a KV read. Publication reserves one pending generation in D1, writes the KV pointer once, and atomically commits the D1 release marker. If an update fails before that commit, the prior elected release remains ready and retrying the same run ID reuses the pending generation. During the first population, the site remains degraded until the initial commit. Readiness can remain `503` briefly after publication while the diagnostic KV pointer propagates; never force the gate to `ready` by hand.

The read fence performs two indexed, single-row D1 primary reads per dynamic request and no D1 writes. Bankgraph intentionally does not opt these checks into D1 read replication: Cloudflare routes ordinary binding queries to the primary unless the Sessions API is used. Response bodies backed by D1 are completed before the second check. The only streamed exception is an immutable R2 object whose registered object key is not replaced in place.

The global stage lease is owner-fenced and renewed once a minute during long HTTP work. A lost owner cannot record completion or publish. A failed post-launch routine run leaves its candidate unpublished and the prior release available. A failed initial population or explicit maintenance operation remains degraded until it is repaired and published.

The pipeline timestamp proves that a stage ran. It does not prove that the upstream source published a newer reporting period. Treat the reporting period and retrieval time as separate checks.

## Enable the nightly refresh

In the GitHub repository settings, add:

- The Actions variable `SYNC_BASE_URL` with the deployed origin and no trailing slash.
- The Actions secret `PIPELINE_SECRET` with the same value stored in Cloudflare.

The `nightly-sync.yml` workflow refreshes institutions, the newest available quarterly filings, the institution snapshot, failures, current and historical derived analytics, approved direct-agency macro slices, audits the full extended FDIC manifest, and only then publishes. The workflow serializes runs and supplies one traceable run identifier to every private pipeline request. Ambiguous network errors and HTTP 409, 429, or 5xx responses receive at most five attempts with bounded exponential backoff; all other 4xx responses fail immediately. It polls readiness for at most 60 seconds after publish and never advances after a failed stage. A failed run does not replace or take down the last elected release.

Run the workflow manually once. Confirm each stage returns `200`, then check `/api/v1/meta` again. Keep the pipeline endpoint absent from WebMCP and other browser-discoverable tool catalogs.

## Durable ingestion growth path

The first production release keeps the authenticated, bounded HTTP stages and GitHub schedule because that path is testable end to end. D1 stage leases, partition checkpoints, per-run stage records, and idempotent keys are the durable state; the CLI remains an operator-controlled fallback. A partition plan must send one stable `X-Pipeline-Run-Id` across every bounded request. Canonical financial publication is authorized only by the quarter-reconciled `financials` or incremental `financials-latest` stage in that same run; scoped records from the generic partition endpoint are deliberately not an alternative release credential.

Cloudflare Workflows is the preferred next runner when a dedicated workflow is provisioned and verified on the production account. A workflow step can call the same provider-neutral FDIC partition function with one page per step, then continue only while the result reports `done: false`. Cloudflare Queues is useful later for high-volume fan-out, but its at-least-once delivery still requires the existing idempotent D1 keys and a dead-letter queue. Neither platform primitive replaces the publication or readiness checks.

Keep the HTTP/CLI runner during that transition. If a Workflow or Queue consumer is paused, unavailable, or rolled back, operators can resume the same D1 checkpoint through the current private endpoint without clearing successful data.

## Roll back a bad release

Use Cloudflare's Worker version rollback for application code. Restore D1 only when a migration or data write damaged production data; a code rollback does not reverse a schema change. Before restoring a database, stop the nightly workflow and record the last trustworthy reporting period and pipeline timestamp.
