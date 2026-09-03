# FDIC backfills

The extended FDIC loader refreshes one natural partition at a time. A partition can be repeated, resumed, inspected, and reconciled without treating a partially downloaded page set as public data.

## How publication works

Each run records its source endpoint, source total, first and last natural keys, retrieval time, checkpoint, and final row counts. Pages are written to `fdic_ingest_stage` under the run ID. A page advances the checkpoint only after its staged rows have been written.

Publication begins only when the number of rows retrieved equals the total reported by FDIC and the number of distinct staged natural keys also equals that total. Smaller partitions use one D1 batch for the typed-table upsert, stale-row deletion, publication record, completion, and stage cleanup. An interrupted or inconsistent run therefore cannot create a publication record.

SOD years and location snapshots are much larger—currently about 76,000 to 78,000 rows. They do not use one large publication batch. D1 limits an entire batch call to 30 seconds and recommends breaking large modifications into roughly 1,000-row chunks. Migration `0019_bounded_fdic_publication.sql` versions those two tables by source run. Repeated bounded steps materialize 1,000 rows, compare 1,000 prior keys for an exact stale count, atomically switch the small publication pointer, then remove the prior version and stage rows in 1,000-row chunks. Public reads keep following the old run until the pointer switch, so they never observe a partially materialized version. See Cloudflare's [current D1 limits and batching guidance](https://developers.cloudflare.com/d1/platform/limits/).

The Worker fetches 1,000 source rows per page. Staging writes pack up to 200 rows into one JSON-bound statement, so even the widest financial page uses about five data statements. `max_pages` is capped at five. This stays comfortably below D1's 1,000-query limit while keeping each request bounded.

The state machine is not coupled to the HTTP route. `runFDICPartition` accepts an `FDICIngestStore` and a page-fetch function, while `D1FDICIngestStore` is the current storage adapter. A future Queue or Workflow runner can invoke one page per task, continue only when `done` is false, and reuse the same lease, checkpoint, and idempotent stage keys. No Queue or Workflow resource is required for the current deployment; the authenticated HTTP endpoint and CLI remain the operational fallback.

The partition endpoint also uses the global D1 pipeline-stage lease and publication barrier. Before it mutates a live table, it closes admission for the ready release and drains active coordinated readers. A completed partition records a scoped `fdic-{dataset}:{partition}` entry under the caller's `X-Pipeline-Run-Id`; it never pretends that one partition completed the legacy full-financials stage.

Institution snapshots are smaller than SOD, but their wide 27,000-plus-row JSON publication is still too expensive for one D1 statement. Migration `0022_bounded_institution_publication.sql` adds the source-run index used by a separate in-place state machine. Each request upserts at most 1,000 certificates, then removes at most 1,000 keys belonging to the prior snapshot. Before it writes the snapshot publication record, it verifies the typed table's exact row count, unique certificate count, first and last keys, source run, snapshot date, and the still-complete staged key set. Stage cleanup is also limited to 1,000 rows per request.

The institution table keeps its `cert` primary key so existing screens and core pipeline upserts remain stable. That means its bounded materialization is an internal mixed state, unlike the versioned SOD and location tables. This state is never publicly observable: every bounded request must still own both the global stage lease and the partition lease, and it verifies that the D1 release gate remains `refreshing` before and after the step. Dynamic reads remain fail-closed until the complete pipeline is explicitly published. The institution publication pointer can advance only after exact reconciliation; the run remains active until stage cleanup finishes, so release readiness cannot reopen early.

## Partitions and natural keys

| Dataset | FDIC endpoint | Partition | Stored natural key |
| --- | --- | --- | --- |
| `annual-summary` | `/summary` | `year:class`, such as `2024:CB` or `2024:SI` | `stalp, year, charter_type` |
| `sod` | `/sod` | year | `uninumbr, year` |
| `history` | `/history` | process year, such as `2026` | FDIC's raw `ID` |
| `locations` | `/locations` | FDIC `RUNDATE` snapshot | `uninum` |
| `institutions` | `/institutions` | FDIC `RUNDATE` snapshot | `cert` |

Annual commercial-bank and savings-institution rows are deliberately separate. The loader does not choose one class when both exist. Their source ranges also differ: the live boundary probe currently reports CB from 1934 through 2025 and SI from 1984 through 2025. Initial planning discovers all four boundaries from `/summary` instead of assuming that both classes begin together or that the current calendar year is published. History rows keep `ID`, `UNINUM`, `FI_UNINUM`, `ACQ_UNINUM`, and `OUT_UNINUM` as reported; it does not infer certificate or institution-name mappings for those identifiers.

History is partitioned only by FDIC `PROCYEAR`. The FDIC [history field definition](https://api.fdic.gov/banks/docs/history_properties.yaml) describes `PROCDATE` as the date an institution change/event is processed, while `EFFDATE` is the date it took effect. Those ranges are not interchangeable: an event processed now can have an old effective date. A read-only source probe on 2026-08-30 found a 2025 process-year record with a 1999 effective year, and the full endpoint's process-year bounds were 1900 through 2026. Generating every `EFFYEAR × PROCYEAR` pair would therefore issue an O(year²) set of mostly empty requests and could still encourage callers to omit retroactive events. One process year is an exhaustive, linear partition and retains both years on every row.

The source-range checks use the documented [BankFind filter syntax](https://api.fdic.gov/banks/docs/) and bounded requests such as:

```text
GET /banks/history?fields=ID,EFFYEAR,PROCYEAR,EFFDATE,PROCDATE
  &filters=PROCYEAR:[1901 TO *]
  &sort_by=PROCYEAR&sort_order=ASC&limit=1
```

Empty history process years are valid and can be published with a source total of zero. This is different from normally non-empty financial, annual-summary, SOD, and snapshot partitions.

Locations and institutions are current-snapshot tables. A successful snapshot publication replaces the prior current snapshot and removes keys that are no longer present. The publication history remains available through the coverage endpoint, but an older snapshot's typed rows are not retained after a newer snapshot is published.

D1 is the hot serving layer, not the full SOD archive. Operational guidance loads only the latest supported SOD year into the branch table. Arbitrary one-year partitions remain available for a bounded repair or source probe. The separate [SOD lakehouse runbook](./sod-lakehouse.md) covers full historical extraction, R2 upload and publication, aggregate materialization, and hot-table pruning.

## Repeatable CLI runs

Start the Worker or SvelteKit server with the D1 and R2 bindings, set `PIPELINE_SECRET` in the environment or `.dev.vars`, and apply migrations through `0025_screenable_loan_to_deposit.sql` before starting a run. Migration 0019 adds versioned D1 publication for SOD and locations, migration 0022 bounds institution publication, migration 0023 adds release views, migration 0024 adds release attestations, and migration 0025 exposes the elected quarter's loan-to-deposit ratio to institution screens.

Production financial history does not use this generic partition CLI. Its sole canonical path is the quarter-reconciled core stage, which starts at 1992Q1, persists one durable quarter/page checkpoint, and reconciles the complete source total before release:

```sh
npm run backfill -- --only financials
```

For the initial annual-summary load, discover the current source bounds and generate only class-valid partitions:

```sh
npm run backfill:fdic -- annual-summary --initial --plan
npm run backfill:fdic -- annual-summary --initial
```

For a recurring annual refresh, resolve the latest year independently for CB and SI. `--latest` implies `--refresh`, and the first response replaces each alias with its resolved year for the rest of that resumable run:

```sh
npm run backfill:fdic -- annual-summary --latest --plan
npm run backfill:fdic -- annual-summary --latest
```

Load or refresh the current SOD hot table without hard-coding FDIC's latest supported year:

```sh
npm run backfill:fdic -- sod --latest
```

History's initial production fill is one bounded partition per process year. Print the 1900-through-current plan first, then run it. Completed years are no-ops and an interrupted active year resumes at its saved offset, so rerunning the same command is the recovery procedure:

```sh
npm run backfill:fdic -- history --initial --plan
npm run backfill:fdic -- history --initial
```

The quarterly refresh mode deliberately refreshes only the current and prior process years. The one-year overlap captures late corrections around year boundaries while keeping each scheduled run at two resumable partitions; `--quarterly` implies `--refresh`:

```sh
npm run backfill:fdic -- history --quarterly --plan
npm run backfill:fdic -- history --quarterly
```

For an explicit repair or audit window, use process years directly:

```sh
npm run backfill:fdic -- history --from 2024 --to 2026 --refresh
```

Current structure snapshots:

```sh
npm run backfill:fdic -- locations --snapshot latest
npm run backfill:fdic -- institutions --snapshot latest
```

If an institution run reached its source total under the pre-0022 code and then failed during publication, do not use `--refresh`. Apply migration 0022, roll out the matching Worker code while the publication gate remains closed, and repeat the same snapshot command. The loader recognizes that the active run is already fully staged and begins bounded publication without refetching FDIC. Reuse the original `BACKFILL_RUN_ID` so the orchestration completion ledger stays coherent. For example:

```sh
export BACKFILL_RUN_ID=original-run-id
npm run backfill:fdic -- institutions --snapshot 2026-08-28
```

Use `--plan` to print partitions without starting ingestion. Annual `--initial` is the deliberate exception to a fully offline plan: it makes four one-row FDIC requests to discover the first and latest CB and SI years. A generated plan is capped at 500 partitions by default, one partition is capped at 1,000 Worker calls by default, and every Worker call processes one source page or one bounded publication phase by default. The caps can be changed deliberately with `--max-partitions`, `--max-steps`, and `--max-pages`. The full history plan has only one partition per process year, so it remains below the default plan cap.

The CLI generates one pipeline run ID and prints it before doing work. Every bounded request in that invocation sends the same ID. For a plan resumed by a later CLI process, set an explicit value and reuse it through the final release publication so the completion ledger remains coherent:

```sh
export BACKFILL_RUN_ID=fdic-initial-2026-08-30
npm run backfill:fdic -- annual-summary --initial
npm run backfill:fdic -- history --initial
npm run backfill:fdic -- locations --snapshot latest
```

`--run-id` is the command-line equivalent of `BACKFILL_RUN_ID`.

An already published partition is a no-op. Add `--refresh` to create a new run; the CLI sends refresh only for the first call and resumes that run on later calls.

## Admin and read APIs

The authenticated mutation endpoint processes one bounded step:

```text
POST /api/v1/pipeline/fdic/backfill
  ?dataset=annual-summary
  &partition=2024:CB
  &max_pages=1
  &refresh=false
Authorization: Bearer $PIPELINE_SECRET
```

It returns HTTP 202 while source pages or bounded publication work remain and HTTP 200 after publication and cleanup. The result includes the run ID, checkpoint, source total, rows seen, published count, deleted stale count, key bounds, retrieval/publication times, `publication_phase`, and `rows_materialized`. SOD and locations use `materialize`, `compare`, `switch`, `cleanup-old`, `cleanup-stage`, and `complete`. Institutions use `materialize`, `compare`, `switch`, `cleanup-stage`, and `complete`.

Published coverage is public and bounded:

```text
GET /api/v1/fdic/coverage?dataset=financials&limit=100&offset=0
```

A published partition can be read with a maximum limit of 200:

```text
GET /api/v1/fdic/annual-summary?partition=2024:SI&state=VA
GET /api/v1/fdic/sod?partition=2024&state=VA&limit=100
GET /api/v1/fdic/history?partition=2026&cert=3510
GET /api/v1/fdic/locations?partition=2026-08-28&state=VA
GET /api/v1/fdic/institutions?partition=2026-08-28&state=VA
```

Reads are joined to the run ID in `fdic_dataset_publications`, so an unpublished or failed refresh cannot leak through the read API.

## Supported FDIC fields

The loader requests only fields represented by the current schema.

- Financials: `CERT`, `REPDTE`, `ASSET`, `DEP`, `EQ`, `LNLSNET`, `LNRE`, `LNCI`, `LNCON`, `SC`, `CHBAL`, `FREPO`, `TRADE`, `ORE`, `BKPREM`, `INTAN`, `OA`, `FREPP`, `OTHBOR`, `SUBND`, `TRADEL`, `ALLOTHL`, `NETINC`, `INTINC`, `EINTEXP`, `NIM`, `NONII`, `NONIX`, `ELNATR`, `NETINCQ`, `NIMQ`, `NONIIQ`, `NONIXQ`, `ELNATQ`, `IGLSECQ`, `ITAXQ`, `EXTRAQ`, `ROA`, `ROE`, `NIMY`, `EEFFR`, `RBCRWAJ`, `RBC1RWAJ`, `RBC1AAJ`, `EQV`, `NCLNLSR`, `LNATRESR`, `NTLNLSR`, `LNLSDEPR`, `OTHBFHLB`, `NUMEMP`.
- Annual summary: `ID`, `STALP`, `YEAR`, `CB_SI`, `ASSET`, `DEP`, `EQ`, `NETINC`, `NIM`, `NONII`, `NONIX`, `ELNATR`, `INTINC`, `EINTEXP`, `BANKS`, `BRANCHES`, `NUMEMP`, `LNLSNET`, `LNRE`, `LNCI`, `LNCON`, `SC`, `NCLNLS`, `LNATRES`.
- SOD: `ID`, `UNINUMBR`, `YEAR`, `CERT`, `NAMEBR`, `CITYBR`, `STALPBR`, `ZIPBR`, `CNTYNUMB`, `CNTYNAMB`, `DEPSUMBR`, `DEPDOM`, `ASSET`, `SIMS_LATITUDE`, `SIMS_LONGITUDE`, `BRSERTYP`, `BRNUM`.
- History: `ID`, `CERT`, `UNINUM`, `FI_UNINUM`, `EFFDATE`, `PROCDATE`, `CHANGECODE`, `CHANGECODE_DESC`, `ORG_ROLE_CDE`, `INSTNAME`, `ACQ_UNINUM`, `OUT_UNINUM`, `TRANSNUM`, `EFFYEAR`, `PROCYEAR`.
- Locations: `ID`, `UNINUM`, `CERT`, `NAME`, `OFFNAME`, `ADDRESS`, `ADDRESS2`, `CITY`, `STALP`, `ZIP`, `COUNTY`, `STCNTY`, `SERVTYPE`, `SERVTYPE_DESC`, `MAINOFF`, `LATITUDE`, `LONGITUDE`, `ESTYMD`, `CBSA`, `RUNDATE`.
- Institutions: `ID`, `CERT`, `RSSDID`, `NAME`, `CITY`, `STALP`, `ZIP`, `COUNTY`, `BKCLASS`, `REGAGNT`, `ACTIVE`, `ESTYMD`, `INSDATE`, `NAMEHCR`, `RSSDHCR`, `ASSET`, `DEP`, `OFFDOM`, `NUMEMP`, `RUNDATE`.

The canonical source contract is the [FDIC BankFind Suite API documentation](https://api.fdic.gov/banks/docs).

## Runtime checklist

1. Apply D1 migrations through `0022` locally and inspect the migration result.
2. Start the server with `DB`, `EXPORTS`, and `PIPELINE_SECRET` available.
3. Print the intended partitions with `--plan`.
4. Run the narrowest useful yearly or quarterly window first.
5. Check `/api/v1/fdic/coverage` for source totals, row totals, key bounds, and timestamps.
6. Sample a published partition through `/api/v1/fdic/{dataset}` before expanding the range.
7. After the SOD lake publication and hot prune, run `npm run backfill -- --only coverage-audit` with the strict release run ID. The audit pins the dynamic expected ranges, checks exact registry/count/aggregate equality, and verifies each registered R2 object and sidecar with bounded `HEAD` operations. Only that manifest hash can satisfy the same run's final publish.

No source rows or generated backfill data belong in Git. Migration, code, tests, and documentation can be committed; actual data stays in D1. Deployment is a separate release step.
