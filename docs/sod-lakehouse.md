# Summary of Deposits storage

Bankgraph keeps the full FDIC Summary of Deposits history in R2 and the small, frequently read shapes in D1. This avoids turning the serving database into a copy of roughly 2.82 million branch-year records while preserving every row returned by the official source.

## What lives where

R2 is the record layer. Each FDIC SOD year is extracted without a `fields` projection, ordered locally by `YEAR` and the source `ID`, and written as Zstandard-compressed Parquet. `ID` remains populated and unique in early years where `UNINUMBR` is absent for some branches. The file includes every field returned by FDIC plus `_raw_json`, a canonical copy of each source record. A JSON manifest records the source queries and index identity, retrieval time, total and per-slice row counts, `YEAR` + `ID` key bounds, Arrow schema, compressed size, and SHA-256 checksum.

The data object name includes its checksum:

```text
lake/fdic/sod/v1/
  data/year=2024/sod-2024-<sha256>.parquet
  metadata/manifests/year=2024/<sha256>.json
  metadata/current/year=2024.json
  metadata/catalog-hint.json
```

The Parquet key registered in D1 is immutable. The stable `metadata/current` object is only a discovery pointer and is never used to serve a data download.

D1 contains:

- `fdic_lake_partitions`, the active R2 object, checksum, row count, and provenance for each year;
- `sod_state_year`, `sod_county_year`, and `sod_bank_year`, revision-safe historical rollups;
- one current SOD branch snapshot published through the bounded migration-0019 path; and
- `sod_latest_branches`, a view that exposes only that current snapshot for maps and search.

The Worker reads the rollups and current snapshot from D1. A one-year Parquet download is streamed with the `EXPORTS` R2 binding after D1 resolves the exact object key. It does not call R2 SQL, the R2 Data Catalog REST endpoint, or any Cloudflare control-plane API.

## Prepare the extractor

Use Python 3.11 or newer. Install PyArrow in a virtual environment rather than in the application dependency tree:

```sh
python -m venv .venv-lake
.venv-lake/bin/python -m pip install -r scripts/requirements-lakehouse.txt
```

On Windows PowerShell:

```powershell
python -m venv .venv-lake
.venv-lake\Scripts\python.exe -m pip install -r scripts\requirements-lakehouse.txt
```

The examples below use `python`. If the virtual environment is not activated, replace it with the virtual-environment interpreter.

Generated Parquet, manifests, aggregates, and D1 publication SQL live under `.data/fdic-sod-lake`. That directory is ignored by Git. Do not move generated source data into a tracked directory.

### Deterministic source pagination

The FDIC endpoint accepts one `sort_by` field, offset pagination, and at most 10,000 rows per request. Although every SOD response row carries an `ID`, the live endpoint does not map `ID` as a sortable field. Sorting directly by `ID` returns HTTP 400. Early SOD years also contain rows without `UNINUMBR`, so one offset stream sorted by `UNINUMBR` does not provide a unique order for the entire year.

The extractor therefore uses two disjoint filters supported by the official [BankFind filter syntax and SOD endpoint](https://api.fdic.gov/banks/docs/):

1. `YEAR:YYYY AND UNINUMBR:[1 TO *]` is paged in ascending `UNINUMBR` order. Every page must have the expected length, and `UNINUMBR` must be strictly increasing across page boundaries.
2. `YEAR:YYYY AND NOT UNINUMBR:*` is fetched once at the official 10,000-row maximum. The extractor fails before publication if the reported missing-value count exceeds that bound.

Both slices must report the same FDIC source-index name and creation time as the initial year-count request. Their totals must sum exactly to the unfiltered year total. Every row must match the requested year, the present/missing predicate, and a non-empty `ID`; `YEAR + ID` must be unique after the two slices are combined. The combined records are then sorted locally by `ID`. A changed index, total, page boundary, predicate, ordering, or key stops extraction instead of producing a partial partition.

A live boundary audit on 2026-08-30 found missing `UNINUMBR` values only from 1994 through 2010. The largest missing-value slice was 9,341 rows in 2006, below the current one-request limit. That observation is not treated as a permanent guarantee: the extractor still checks every reported slice total and fails if a future source revision crosses 10,000.

Manifests using this contract have `manifest_version: 2` and record both slice totals. An older local manifest is deliberately rejected; rerun that year with `--force` to rebuild it under the complete `YEAR + ID` contract.

## First historical load

Apply migrations through `0021_fdic_coverage_manifest.sql`, then extract the official range. The command works one year at a time and verifies an existing local partition before skipping it, so an interrupted run can be repeated.

```sh
npm run lake:sod -- extract --from 1994 --to latest
npm run lake:sod -- verify
```

Review `.data/fdic-sod-lake/bundle.json`, several year manifests, and the aggregate counts before publishing. In particular, every manifest must have equal `source.reported_total` and `row_count` values, and its two `source.slice_totals` values must add to that same count.

Before changing D1, stop or disable the nightly workflow so it cannot publish midway through this maintenance window. Uploading checksum-addressed R2 objects is safe while the site is live, but the D1 commands below deliberately refuse to run while `release_control.state` is `ready`.

Upload to local Wrangler state:

```sh
npm run lake:sod -- upload --local
```

Live Cloudflare resources:

```sh
npx wrangler whoami
npx wrangler d1 migrations list DB --remote
npm run lake:sod -- upload --remote
```

`upload --remote` changes live R2 state. The script uses the checked `bankgraph-exports` bucket by default; use `--bucket` only after checking a fork's Wrangler configuration.

Load only the newest SOD year through the bounded hot-table path. Its first request closes the release gate; the gate stays closed after the SOD command finishes.

```sh
npm run backfill:fdic -- sod --latest
```

For a deployed Worker, set `BACKFILL_URL` and `PIPELINE_SECRET` as described in the FDIC backfill runbook. Do not use a 1994-to-current SOD range with that D1 command.

With the gate now `refreshing`, publish the rollups and R2 pointer:

```sh
npm run lake:sod -- publish --local
npm run lake:sod -- publish --remote
```

Choose only the target being maintained. `publish` requires an explicit local/remote flag, checks the durable release gate, lands a complete aggregate revision, and changes the active checksum pointer last. It refuses a live `ready` gate.

Finally, remove any older branch-level SOD rows from D1. The prune first proves that the current published run has the complete expected row count, then deletes older rows in 5,000-row batches. It refuses to run when the current hot snapshot and lake pointer disagree.

```sh
npm run lake:sod -- prune-hot --local
npm run lake:sod -- prune-hot --remote
```

Choose the flag that matches the database you are maintaining; do not run both as one operation. Repeating the command is safe. If `--max-batches` is reached, rerun it with the same target.

Keep the gate closed until all direct D1 work is complete. Then run Bankgraph's normal complete refresh and strict `publish` stage, or manually run the disabled nightly workflow and wait for its final publish to succeed. The full local operator path is:

```sh
npm run backfill
```

That core run executes `coverage-audit` immediately before `publish`. The audit requires exact set equality between registered R2 years and the dynamically discovered FDIC range from 1994 through latest, equal source/stored counts, checksum-keyed aggregate totals for every year, zero stale aggregate revisions, exactly one current lake pointer at the latest year, and exactly one matching latest D1 hot publication. It also performs bounded R2 `HEAD` checks for every Parquet object and sidecar manifest. Its SHA-256 manifest is recorded as the owner scope for the same pipeline run, and publish re-verifies it before opening the D1 gate.

Do not reopen `release_control` with direct SQL. Re-enable the nightly schedule only after `/api/v1/ready` returns `200` with a matching D1 and KV generation.

## Annual refresh and source corrections

For the ordinary annual update, extract only the newest source year, then upload and publish that year. Read the year from the generated manifest before passing it to the next commands.

```sh
npm run lake:sod -- extract --latest-only
npm run lake:sod -- verify --year 2026
npm run lake:sod -- upload --year 2026 --remote
npm run backfill:fdic -- sod --latest
npm run lake:sod -- publish --year 2026 --remote
npm run lake:sod -- prune-hot --remote
npm run backfill
```

Replace `2026` with the manifest year. If FDIC revises an older year, use `extract --year YYYY --force`, review the new checksum and totals, then upload and publish only that year. A correction changes the D1 pointer after its complete new aggregate revision has landed; a failed partial publication leaves the prior checksum visible.

## Public read limits

The public surface is deliberately bounded:

- `/api/v1/fdic/sod/summary?level=state&year=2024` returns at most 500 state/year rows; `level=county` requires `state` or `county_fips`; `level=bank` accepts an exact `cert` when one bank's history is needed. `format=csv` exports the same bounded result.
- `/api/v1/fdic/sod/latest` requires `state`, `cert`, `q`, or a complete `west,south,east,north` bounding box and returns at most 500 current branches.
- `/api/v1/fdic/sod/manifest?year=2024` returns checksum and provenance for one year.
- `/api/v1/fdic/sod/export?year=2024` streams exactly one registered checksum-addressed Parquet file. It supports `HEAD`, conditional requests, and byte ranges.

There is no endpoint for an unfiltered all-years raw scan. Analysts who need the complete history should download explicit yearly partitions or use an external Parquet/Iceberg-capable engine.

## Cost controls

- Partition by year. Refresh or download only the years that changed.
- Keep historical branch rows out of D1; only rollups and the current branch snapshot belong there.
- Keep R2 data keys checksum-addressed. Never replace the object key in a published manifest with different bytes.
- Run `verify` before upload. Do not upload a partition whose local checksum or byte length has drifted.
- Use the standard R2 storage class for files served through the public export. Do not opt into a minimum-retention or retrieval-priced class without measuring the access pattern.
- Do not list or scan the R2 prefix from a public request. D1 is the object catalog for the Worker.
- Keep API limits and geographic/search requirements in place; maps should request their visible bounding box.
- Prune stale aggregate revisions after the active checksum moves. The generated publication SQL already does this for the year being updated.

## Optional Iceberg catalog

The layout is ordinary Parquet with Hive-style `year=YYYY` partitions. `metadata/catalog-hint.json` names the intended `fdic.sod` table and identity partition, but it is explicitly not Iceberg metadata.

If R2 Data Catalog is enabled later, create an Iceberg table from an operator environment and import the manifest-listed Parquet files with PyIceberg, Spark, Trino, or another standard engine. Keep that enablement and its credentials outside the Worker. Enabling the catalog must not change the D1 APIs, the registered R2 object keys, or the current update procedure. R2 SQL may then be useful for operator analysis, but it remains optional and must not become a request-path dependency.
