# Data notice

The Apache License 2.0 in this repository covers Bankgraph's original software and documentation contributions. It does not grant rights in third-party material or in public-source observations merely because those observations are bundled with, processed by, or exported from the software.

## Recorded FDIC demo data

`demo/fixtures/fdic-demo.json` and the corresponding rows in `demo/fixtures/bank-data-demo.sql` contain a bounded recording of observations retrieved from the FDIC BankFind Suite API. The six institution histories are source observations. The industry rows are Bankgraph calculations made from the complete FDIC financials response for each recorded quarter; they are not an FDIC-published table and cannot be reconstructed from the six-institution slice alone.

The fixture manifest records the selected institutions, reporting periods, retrieval time, source indexes, request URLs, population counts, transformations, and checksums. The fixture is included so a clean clone can be demonstrated without credentials or a full data download. It is not a live feed, a complete copy of BankFind, or a substitute for checking the current agency record.

The FDIC describes BankFind data as publicly available, but its API documentation does not state a separate open-data license. FDIC website policies apply, and individual records or linked material may include content with separate rights. No additional license to FDIC names, seals, trademarks, or third-party material is implied. See the [FDIC BankFind API documentation](https://api.fdic.gov/banks/docs) and [FDIC website policies](https://www.fdic.gov/policies).

## Other public sources

Bankgraph can retrieve observations from the U.S. Treasury, Bureau of Labor Statistics, and Federal Reserve Board at runtime. Those live or backfilled observations are not bundled in the recorded demo fixture. Each publisher's current terms, notices, and source definitions continue to apply.

## Reuse and attribution

When redistributing the recorded fixture or an export, keep the reporting period, source fields, units, retrieval context, and this notice with it. Recheck the originating source and its current terms for the intended use. The repository's Apache license remains available for Bankgraph's original code, schema, documentation, and transformations to the extent the repository contributors can license them; it does not change the legal status of the underlying source observations.
