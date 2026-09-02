# Bank Data demo fixture

This is a small, real slice of Bankgraph's public-data foundation. It gives a clean clone enough history to open a useful multi-bank workspace without an API key or a full FDIC backfill.

The fixture follows six institutions across 12 quarters, from September 2023 through June 2026:

- JPMorgan Chase
- Bank of America
- Wells Fargo
- Capital One
- SoFi Bank
- Southern Bank, a North Carolina community-bank comparator

The bank and financial statement rows are recorded FDIC BankFind Suite observations. They cover only those six named institutions and aren't a stand-in for a national institution population. The industry rows are deterministic aggregates computed separately from the complete FDIC response for each fixture quarter. `manifest.json` and `pipeline_state` record both scopes, their as-of periods, and their population counts. The fixture contains no illustrative or model-generated source rows.

The manifest and local `demo_fixture_mode` marker both identify this as a recorded snapshot. Additional markers identify the institution selection and the separately derived full-reporting-population aggregates. The seed does not create a pipeline run or publication record and does not present the six-bank slice as a live refresh.

## Seed a clean clone

From the repository root:

```sh
node demo/fixtures/seed-local.mjs
```

The script applies local D1 migrations, then upserts the fixture. It is safe to run more than once. It does not read an environment file or send data over the network.

## Verify it

```sh
node demo/fixtures/verify-demo.mjs
node --test demo/fixtures/fixture.test.mjs
```

The checks cover row counts, a complete common reporting window, file hashes, recorded-snapshot labeling, obvious secret patterns, and repeatable seeding.

## Advance the recorded quarter

The quarterly release has one source of truth: `fixture-pin.json`. It fixes the FDIC reporting quarter, selected certificates, history length, and fixture ID. Verification fails if the recorded outputs drift from that pin.

For a quarterly update:

1. Confirm that BankFind has published the target quarter for every selected institution.
2. In `fixture-pin.json`, advance `reportingQuarter` and update the quarter labels in `fixtureId`. Change the bank set or `quarterCount` only for an intentional release change.
3. Run `npm run fixture:update`. This is the networked step. It replaces `fdic-demo.json`, `bank-data-demo.sql`, and `manifest.json` from the official API.
4. Review the pin, reporting window, source indexes, response counts, request URLs, retrieval time, and the three generated-file diffs.
5. Run `npm run fixture:verify` and `npm run demo:verify`. Commit the pin and all generated outputs together.

The extractor makes a bounded set of requests to the official API: the selected institutions, the pinned financial-statement window, and the full institution set for those dates so it can rebuild industry benchmarks. It refuses to move to a newer quarter simply because one has appeared upstream. It records the exact request URLs, retrieval time, response counts, FDIC index names, and the pin checksum in `manifest.json`.

Pass `--source <sqlite-file>` to the extractor only for a deliberate local investigation; that output does not carry an official API retrieval record and is not release-ready. For a source-independent release check, run `npm run fixture:verify`; comparing a committed snapshot to a changing live endpoint would not be deterministic.

All monetary fields retain the FDIC convention of thousands of U.S. dollars. Ratios retain their source units. Some income-statement fields are year-to-date because that is how the underlying call report field is defined; downstream analysis must quarterize those fields before describing a quarter-only change.

Source: [FDIC BankFind Suite API](https://api.fdic.gov/banks) and its [API documentation](https://api.fdic.gov/banks/docs). The API describes the data as publicly available but does not state a separate open-data license. [FDIC website policies](https://www.fdic.gov/policies) still apply, including their warning that third-party material may have separate rights. The repository's code license does not change the status of the source data.

There are deliberately no made-up macro observations. The fixture leaves that layer empty until live or backfilled originating-agency macro observations are available and labeled with their own provenance.
