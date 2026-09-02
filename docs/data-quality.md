# Data quality and coverage

Bankgraph preserves reported nulls, records source periods, and publishes a new release only after its coverage and provenance checks pass. It does not turn a missing report into zero or silently substitute an older value for the current quarter.

## Reproduce the public audit

Run the bounded audit against the current deployment:

```sh
npm run audit:data
```

Pass another origin to check a preview or local Worker:

```sh
node scripts/audit-live-data.mjs https://your-preview.example
```

The script reads `/api/v1/ready`, `/api/v1/meta`, and the paginated active-institution screen. It checks release readiness, generation agreement, institution uniqueness, current-quarter coverage, field completeness, and basic range validity. It makes read-only HTTP requests and prints JSON so the result can be saved or compared without adding a generated report to the repository.

## Current coverage notes

The production audit on August 31, 2026 found 4,238 active FDIC registry records. Of those, 4,228 included a June 30, 2026 financial snapshot. Ten active records had no latest-quarter financial row. Bankgraph keeps those institutions discoverable by name, but a screen that depends on a missing metric excludes them.

The standard Tier 1 risk-based capital ratio was available for 2,428 of the 4,228 current-quarter reporters. The remaining 1,800 gaps are explained by reporting basis: 1,790 institutions elected the Community Bank Leverage Ratio framework and ten were foreign branches. The Tier 1 leverage ratio is available for all 4,228 current-quarter reporters. Bankgraph does not impute a risk-based ratio when the standard schedule does not apply.

Bankgraph's quarterly financial schema is curated. It publishes 49 measures from a BankFind dictionary with 2,365 properties, so a field that is absent from Bankgraph is not necessarily absent from the public record. The source already carries high-value measures that the product does not yet project, including granular commercial real estate, uninsured and brokered deposits, available-for-sale and held-to-maturity securities positions, and maturity or repricing buckets. Those are product coverage gaps, not inherent source limits.

The same audit found no duplicate certificates, nonpositive reported assets, negative deposits, malformed reporting periods, or noncurrent-loan ratios outside the reported percentage range. A deterministic sample of institutions across asset sizes also reconciled the Q1-to-Q2 2026 asset, funding, and quarterly-income component bridges. Small disclosed residuals remain visible rather than being assigned to an invented driver.

The initial banking-system aggregate load covered 16 quarters even though institution financials extend to 1992. That limited the predeclared economy relationships to 12 year-over-year changes. The bounded `industry-history` stage now derives the latest 40 aggregate quarters from financial rows already in D1, one quarter per request, before the correlation stage runs. This is a derived-data repair rather than a new source ingestion. The Economy page keeps aligned points and exact values visible for every window. Coefficients calculated from two pairs are labeled mechanical only, those from three through 11 pairs exploratory, and those from 12 or more descriptive. Every coefficient carries its exact common window and observation count.

## Boundaries that matter

- “Active institutions” describes the FDIC registry population. “Latest-quarter reporters” describes institutions with a financial row for the selected quarter. Those counts can differ.
- Structural events are linked conservatively by FDIC certificate. The source includes alternate institution identifiers for almost every remaining history row, but this release does not yet perform the role-aware entity resolution needed to place them safely on a bank timeline.
- Peer comparisons use only institutions with the requested metric. The result reports the cohort definition and observed count so missing values do not disappear from the methodology.
- Economic relationships are descriptive calculations over originating-agency series. They are not causal attribution.
- FDIC and economic series can be revised after publication. Every response carries its source period and release lineage so a later result can be distinguished from an earlier one.

See [Data and methodology](data-and-methodology.md) for metric definitions, calculations, and source lineage.
