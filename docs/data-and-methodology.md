# Data and methodology

Bankgraph is designed to make a public-data result reproducible. A chart or explanation is not enough on its own: the reporting period, unit, source field, cohort, exclusions, and calculation must remain available to the reader.

## Source coverage

The application ingests these public datasets:

| Dataset | Source | Natural time basis | Main uses |
| --- | --- | --- | --- |
| Institutions | FDIC BankFind Suite | Current institution records | Identity, charter, status, headquarters location, regulator, `OFFDOM` domestic-office count, and latest snapshot |
| Financials | FDIC BankFind Suite | Quarterly reports | Balance sheet, income, profitability, capital, credit quality, liquidity, and change analysis |
| Annual Summary | FDIC BankFind Suite | Calendar year | Long-run U.S. banking-system assets, deposits, loans, institutions, branches, and employment |
| Summary of Deposits | FDIC BankFind Suite | Annual June 30 snapshot | Institution branch footprints, county deposit markets, and local deposit share |
| Locations | FDIC BankFind Suite | Current office snapshot | Office identity, service type, address, and coordinates through the public data API |
| Structure history | FDIC BankFind Suite | Effective and processing date | Mergers, acquisitions, closures, charter changes, and other institution events |
| Failures and assistance | FDIC BankFind Suite | Transaction effective date | Failure history, assistance transactions, insurance fund, transaction method, and acquiring institution context |
| Economic and banking-system series | U.S. Treasury, BLS, and Federal Reserve Board | Daily, weekly, or monthly, depending on the source | Yields, the yield-curve spread, unemployment, CPI-U, inflation, the effective federal funds rate, and H.8 aggregate credit and funding levels |

The canonical quarterly financial series begins March 31, 1992, the supported BankFind product boundary used by this application. The filtered source returned 1,140,484 rows on August 30, 2026; that count grows as quarters are published and is checked at run time rather than hard-coded as a permanent total. Initial ingestion pins that filtered cardinality and latest quarter, pages each quarter separately in deterministic `CERT` order, and rejects cardinality/latest-quarter drift, truncation, or duplicate/reordered page boundaries. It does not claim a content snapshot when FDIC revises a value without changing those source bounds. Completion requires the D1 `(cert, repdte)` natural-key count and exact first/latest quarters to reconcile to the pinned source view. Earlier rows are not blended into trends, peer statistics, risk screens, or releases: ingestion filters them out, the pipeline removes any remnants from older interrupted loaders, and publication fails closed if an earlier reporting date remains. Rows beyond the pinned latest quarter and non-quarter reporting dates are also removed before reconciliation. This avoids presenting materially sparse pre-1992 fields, including capital measures such as `RBC1RWAJ`, as comparable coverage.

The release schema deliberately projects a small financial dictionary rather than every BankFind property. Bankgraph currently publishes 49 quarterly measures from a source dictionary with 2,365 properties. A missing Bankgraph measure can therefore be an ingestion choice rather than a source limitation. The public source includes more detailed commercial real estate, deposit-insurance and brokered-funding, securities-position, maturity, repricing, and portfolio-category fields. Bankgraph keeps that boundary explicit so product coverage is not mistaken for the limit of the public record.

The workspace map groups banks by headquarters state. It is a headquarters view, not a branch map. Branch footprint history and county deposit-market share come from the separately ingested Summary of Deposits series and appear in the active bank's linked context panel. The full branch-year history is retained as immutable R2 partitions; published D1 aggregates and the current branch snapshot support bounded public reads. Office locations, Annual Summary rows, and structure-history partitions are also ingested and served through the public data API.

Structure history requires an additional mapping caveat. Some FDIC history rows carry a certificate number, while others identify institutions through `UNINUM`, `FI_UNINUM`, acquiring-entity, or outgoing-entity fields. Of 14,088 loaded history rows without a certificate, 14,040 can be linked to the institution registry through one of those alternate identifiers. The current quarter-change check still uses only rows mapped directly to the selected certificate because the remaining work is role-aware entity resolution, not a simple join. “No mapped event” therefore means no certificate-linked merger, acquisition, closure, or charter event was found inside that comparison window. It does not mean the source contains no related event under another identifier. The response reports published process-year coverage so an unavailable history load is distinct from a completed check with no mapped event.

Two easily confused BankFind fields deserve explicit treatment:

- `OFFDOM` is the reported number of domestic offices, including headquarters. The application schema retains the historical column name `num_branches`, but public copy calls the value **domestic offices**; it is not a branch-only inventory.
- `DEP` is the quarterly institution-level total deposit field and includes foreign-office deposits in the BankFind definition. It is not the annual Summary of Deposits allocation by branch and must not be interpreted as local-market deposits.

The glossary separates each source definition from Bankgraph's product interpretation. A familiar display label never overrides the scope of the requested BankFind field.

The homepage's consecutive-quarter net-loan movement uses `LNLSNET`, the FDIC net-loans-and-leases field. It includes only institutions with a non-null `LNLSNET` value in both exact quarters and shows the matched population alongside current- and prior-period field coverage. The FDIC Quarterly Banking Profile's total-loan headline can differ because QBP uses its own total-loan definition and reporting population. Treat the figures as two related measures of the quarter, each tied to its stated definition and population.

The Banking system change radar applies the same exact-quarter matching separately to `ASSET`,
`DEP`, and `LNLSNET`. Breadth counts banks whose reported dollar balance increased, decreased, or
was unchanged. The median is the bank-level percentage change among matched banks with a nonzero
opening value. Contributor tables rank the largest dollar increases and reductions; each share uses
total absolute movement across the matched metric population as its denominator. New and departing
reporters are excluded from the radar, and the displayed population can differ by metric when a field
is missing.

### Income statement period basis

Five FDIC income-statement measures arrive in both single-quarter and calendar-year-to-date forms. Bankgraph stores each source field separately:

| Single quarter | Year to date | Measure |
| --- | --- | --- |
| `NETINCQ` | `NETINC` | Net income |
| `NIMQ` | `NIM` | Net interest income |
| `NONIIQ` | `NONII` | Noninterest income |
| `NONIXQ` | `NONIX` | Noninterest expense |
| `ELNATQ` | `ELNATR` | Provision for credit losses |

Bankgraph uses the reported `*Q` field for quarter-to-quarter trends and same-period comparisons when it is available. The year-to-date field remains available for cumulative analysis, full-year results, and comparisons with the same reporting quarter in another year. First-quarter values can match because the year-to-date period begins with that quarter; later-quarter values are not interchangeable. Labels, exports, the field glossary, and source metadata retain the period basis and exact BankFind field name.

`INTINC` interest income and `EINTEXP` interest expense are also calendar-year-to-date fields. Bankgraph labels them that way and does not present them as single-quarter measures because the ingestion catalog does not include reported quarter-only companions for those fields.

Bankgraph is not an independent source of bank filings. When a number is material to a published conclusion, verify it against the linked FDIC record and the institution's filing.

### Failures and assistance

The FDIC source combines failures and assistance transactions. Bankgraph preserves the source classification from `RESTYPE`, shows true failures by default, and provides a separate assistance view. The combined view does not relabel assistance transactions as failures. `RESTYPE1` supplies the transaction method, `SAVR` identifies the insurance fund, and `BIDNAME` supplies the acquiring institution when the source reports one.

Failure rows use the FDIC API's `ID` as their natural key. A certificate number identifies an institution, not a transaction: it can be missing, and the same certificate can appear on more than one source row. Exports therefore include the FDIC source ID and retain every source row.

The FDIC `COST` field is an estimated loss in thousands of dollars. It estimates unrecoverable principal after expected receivership recoveries; it is not the amount of assistance provided or cash paid out. Estimated-loss coverage is incomplete for FDIC-insured failures before 1986 and FSLIC-insured failures from 1934 through 1988.

`GET /api/v1/industry/failures` defaults to `type=failure`. Use `type=assistance` for assisted transactions or `type=all` for every source row, including any row whose classification is unavailable. API and export results are bounded with `limit` (default 100, maximum 5,000) and `offset`; responses report the total matching row count.

### Direct economic sources

Bankgraph connects to the agencies that originate each enabled economic series. It does not connect to, cache, or store FRED content, and it does not accept a FRED key. Earlier FRED network code remains only as a disabled compatibility boundary. Migration `0015_direct_macro_sources.sql` removes observations from the retired tables before creating provider-neutral storage. This choice avoids relying on a distributor whose current terms are not compatible with this AI-connected application.

Treasury, BLS, and Federal Reserve Board series are normally fetched by the Worker. If Cloudflare cannot retrieve a BLS or Federal Reserve window, the authenticated release runner retrieves the exact series and years requested by the Worker. It uses the BLS API for unemployment. For CPI-U, it can use BLS's official all-items bulk file when the public API quota is unavailable. Federal Reserve uploads retain the Board's CSV metadata rows, including the series identifier, description, unit, multiplier, and currency. The runner sends a payload under 256 KB. The Worker rejects another provider, a derived series, a different date range, unexpected metadata, invalid observations, or an unrecognized transport. CPI metadata points to the bulk file that contains the published series.

The current catalog is deliberately small enough to audit:

| Bankgraph ID | Agency series and endpoint | Available from | Stored unit and cadence | Transform |
| --- | --- | --- | --- | --- |
| `UST10Y` | Treasury `BC_10YEAR`, `https://home.treasury.gov/resource-center/data-chart-center/interest-rates/pages/xml?data=daily_treasury_yield_curve&field_tdr_date_value={year}` | 1990-01-02 | Percent per year, daily | Identity |
| `UST2Y` | Treasury `BC_2YEAR`, same yearly XML feed | 1990-01-02 | Percent per year, daily | Identity |
| `UST10Y2Y` | Treasury `BC_10YEAR` and `BC_2YEAR`, same yearly XML feed | 1990-01-02 | Percentage points, daily | 10-year yield minus 2-year yield on the same date |
| `BLS_UNRATE` | BLS `LNS14000000`, `POST https://api.bls.gov/publicAPI/v2/timeseries/data/` | 1948-01-01 | Percent, monthly | Identity; source is seasonally adjusted |
| `BLS_CPI_U` | BLS `CUUR0000SA0`, `cu.data.1.AllItems` | 1913-01-01 | Index, 1982–84=100, monthly | Identity; source is not seasonally adjusted |
| `BLS_CPI_YOY` | Derived from BLS `CUUR0000SA0` in the same bulk file | 1914-01-01 | Percent change from 12 months earlier, monthly | `100 × (CPI[t] / CPI[t-12] − 1)` |
| `FRB_FEDFUNDS` | Board H.15 `H15/H15/RIFSPFF_N.M`, `https://www.federalreserve.gov/datadownload/Output.aspx?rel=H15&series=40afb80a445c5903ca2c4888e40f3f1f&filetype=csv&label=include&layout=seriescolumn` | 1954-07-01 | Percent per year, monthly average | Identity |
| `FRB_H8_BANK_CREDIT` | Board H.8 `H8/H8/B1001NCBA`, H.8 package endpoint below | 1973-01-03 | Millions of U.S. dollars, weekly | Identity; estimated Wednesday level, seasonally adjusted |
| `FRB_H8_LOANS_LEASES` | Board H.8 `H8/H8/B1020NCBA`, same endpoint | 1973-01-03 | Millions of U.S. dollars, weekly | Identity; estimated Wednesday level, seasonally adjusted |
| `FRB_H8_CI_LOANS` | Board H.8 `H8/H8/B1023NCBA`, same endpoint | 1973-01-03 | Millions of U.S. dollars, weekly | Identity; estimated Wednesday level, seasonally adjusted |
| `FRB_H8_REAL_ESTATE` | Board H.8 `H8/H8/B1026NCBA`, same endpoint | 1973-01-03 | Millions of U.S. dollars, weekly | Identity; estimated Wednesday level, seasonally adjusted |
| `FRB_H8_CRE` | Board H.8 `H8/H8/B3219NCBA`, same endpoint | 2004-06-02 | Millions of U.S. dollars, weekly | Identity; estimated Wednesday level, seasonally adjusted |
| `FRB_H8_CONSUMER` | Board H.8 `H8/H8/B1029NCBA`, same endpoint | 1973-01-03 | Millions of U.S. dollars, weekly | Identity; estimated Wednesday level, seasonally adjusted |
| `FRB_H8_DEPOSITS` | Board H.8 `H8/H8/B1058NCBA`, same endpoint | 1973-01-03 | Millions of U.S. dollars, weekly | Identity; estimated Wednesday level, seasonally adjusted |

The Treasury feed documentation is at `https://home.treasury.gov/treasury-daily-interest-rate-xml-feed`. Treasury-produced data are federal government works; the catalog points to `https://www.usa.gov/government-copyright` and preserves agency attribution. The feed page does not publish a separate data license, so users should recheck any material identified as third-party.

BLS permits secondary use under `https://www.bls.gov/developers/termsOfService.htm`. Its required access date is stored as `retrieved_at`, and Bankgraph carries the required warning that BLS cannot vouch for data or analyses after retrieval. BLS also identifies its publications as public domain, except for identified third-party images, at `https://www.bls.gov/bls/linksite.htm`.

The Federal Reserve Board states at `https://www.federalreserve.gov/disclaimer.htm` that Board website information is public domain unless otherwise indicated and asks users to cite the Board. Bankgraph does not use Board seals or logos.

The H.8 series use the Board's keyless, preformatted all-commercial-bank seasonally adjusted package at `https://www.federalreserve.gov/datadownload/Output.aspx?rel=H8&series=fce2318909bacbc8ce268096deddd180&from=01/01/{year}&to=12/31/{year}&filetype=csv&label=include&layout=seriescolumn`. Bankgraph validates the requested column's exact H.8 identifier and description and requires the Board metadata rows `Unit: Currency`, `Multiplier: 1000000`, and `Currency: USD` before storing the published numeric value as millions of U.S. dollars.

H.8 is an estimated weekly aggregate balance sheet, not a census of individual bank filings. "All commercial banks" includes domestically chartered commercial banks, U.S. branches and agencies of foreign banks, and Edge Act and agreement corporations; it excludes International Banking Facilities, thrifts, credit unions, and consumer finance companies. The Board says the reporting panel represents about 90 percent of commercial-bank assets and benchmarks the estimates to Call Reports. The loans-and-leases series includes the allowance for credit losses and loans held in trading accounts, and excludes federal funds sold and reverse repurchase agreements, loans to commercial banks, and unearned income. The commercial-real-estate aggregate covers its published construction and land development, farmland, multifamily, and nonfarm nonresidential components.

Weekly levels are Wednesday observations, seasonal factors can be revised annually, and historical estimates can change with benchmarking, accounting adjustments, mergers, and panel shifts. On `https://www.federalreserve.gov/datadownload/Choose.aspx?rel=H8`, the Board has announced that its Data Download Program's package builder will be removed in November 2026 ahead of eventual DDP retirement. The verified preformatted output remains available now, but this is an operational dependency: Bankgraph fails closed if its identifier or unit metadata changes and must move only to another official Board endpoint when DDP is retired.

Each sync request handles one allowlisted series and one bounded source window. Treasury uses one calendar year. BLS and Federal Reserve history use no more than ten years per request. A new series starts at the exact availability floor above and advances through authoritative windows. If stored coverage begins later than the source floor, the loader walks backward first. Every successful slice updates coverage and its cursor, so a runtime limit, source quota, or network interruption can resume without replaying completed windows. Once full history is present, a normal run fetches only the latest expected source year. Each slice replaces its date range atomically, reconciling revisions and withdrawals without manufacturing weekend, holiday, or unpublished monthly observations. The floor slice must begin on the recorded first observation date. Constrained, empty, malformed, truncated-floor, or non-2xx responses record a failed state and return a non-success HTTP status.

The public catalog endpoint, `GET /api/v1/macro`, returns the agency, exact series, source availability and rights URLs, unit, transform, seasonal treatment, cadence, retrieval time, observed-through date, and stored coverage. `GET /api/v1/macro/{series_id}` defaults to a ten-year read window and never returns more than 5,000 points; that response bound does not limit stored ingestion history.

### Macro and bank co-movement

The macro page reports four predeclared relationships: effective federal funds rate with median net interest margin, unemployment with the median noncurrent loan ratio, the 10-year minus 2-year Treasury spread with median return on assets, and the 10-year Treasury yield with median net interest margin. It does not test every available pair or search for the lag or window with the largest correlation. Daily and monthly macro observations are averaged within each calendar quarter. Bankgraph then calculates each series' change from the same quarter one year earlier and aligns the two changes in the same quarter. Pearson's correlation coefficient is calculable from two nonconstant pairs, and Bankgraph makes that coefficient available with an interpretation tier. Two-pair results are labeled mechanical only, results from three through 11 pairs are labeled small-sample and exploratory, and results from 12 or more pairs receive the ordinary descriptive label. Exact points, observation count, and window remain visible. Missing comparison quarters are not bridged.

Year-over-year differencing reduces correlations driven only by two level series trending over time. It also compares FDIC year-to-date performance ratios with the same reporting quarter in the prior year, avoiding a mechanical comparison between a fourth-quarter full-year ratio and the following first-quarter ratio. The resulting coefficient describes historical co-movement. It is not a test of causation, a forecast, or evidence that one series leads the other.

GDP is not currently loaded. The BEA API requires a key that was not supplied for this deployment, and Bankgraph will not route around that requirement. A future GDP series must state whether it is a current-dollar level, chained-dollar level, year-over-year change, or quarter-over-quarter change at a seasonally adjusted annual rate. The removed chart mixed a GDP level with growth language; Bankgraph does not make that substitution. CPI-U is likewise an index level, while `BLS_CPI_YOY` is the separately calculated inflation rate.

## Time, units, and freshness

FDIC financial records use the report date supplied by the source, stored as `YYYYMMDD`. Dollar amounts are stored in thousands of dollars unless the field or view says otherwise. Ratio fields use their documented source unit; derived views label percentages, percentage points, and basis points separately.

Four time labels answer different questions:

- **Source as of / reporting period** identifies the quarter or date represented by the observation; it is data freshness, not a job timestamp.
- **Retrieved at** records when Bankgraph fetched the source observation or recorded fixture.
- **Pipeline stage updated at** records when a sync stage last changed state. A recent stage timestamp does not make an old reporting period current.
- **Page loaded at** records when the displayed metadata was assembled so a reader can judge it against the other three values.

The interface and `/api/v1/meta` expose the latest loaded reporting period, table coverage, and pipeline state. A recent pipeline run can legitimately return the same quarter when an agency has not published the next observation. Operational checks must inspect coverage, `observed_through`, and the reporting period, not only a green workflow run.

The committed demo is deliberately split into two scopes. Institution pages, screens, financial histories, and state/regulator distributions use six named recorded institutions. Separately, `agg_industry` contains Bankgraph-derived aggregates computed from every institution returned for each recorded FDIC reporting period. The interface labels both populations and counts; it does not use the six-bank selection to make a national distribution or system-brief claim.

## Screening and comparisons

Screens apply explicit filters to the institution universe. Bank status, state, size, metric bounds, and ordering remain part of the workspace state so a shared result can be reconstructed. Missing values do not pass a numeric condition unless the condition explicitly includes them.

Peer results show the cohort recipe, reporting period, and usable observation count. Asset-relative peers use each bank's `asset_bucket` from the financial row for that same quarter; historical charts do not apply today's size bucket backward. Current percentiles use exact same-period ranks. Historical percentile lines are estimates interpolated from stored P10/P25/median/P75/P90 breakpoints and are labeled as estimates with their usable N.

Bankgraph reports the number of usable observations and does not treat a missing field as zero. Small or incomplete cohorts should be broadened transparently or marked insufficient rather than presented with false precision.

## Change and anomaly analysis

Change analysis starts with reported components and deterministic arithmetic. Additive balance-sheet bridges reconcile the opening value, reported component changes, and closing value. Ratio decompositions expose the numerator, denominator, formula, and unit. Quarterly income analysis uses quarterly fields when available; if a year-to-date field must be converted, the comparison requires consecutive reports in the same fiscal year and identifies the conversion.

Peer-relative movement and anomaly detection answer whether a value or change is unusual in a stated comparison set. They do not establish management intent, economic cause, misconduct, or future performance. Bankgraph keeps rarity separate from direction: an unusual improvement and an unusual deterioration are both unusual.

Explanatory text can summarize these calculations, but it cannot substitute for them. The values, comparison, and provenance should be visible without asking a language model.

## Derived financial-condition indicators

These financial-condition indicators are public-data proxies. Higher scores represent stronger values under the disclosed method. They are not confidential CAMELS ratings, regulatory determinations, credit ratings, or predictions of failure. The capital view is a deterministic screen of available reported ratios against disclosed reference thresholds; it is not an official Prompt Corrective Action classification. In particular, the Tier 1 leverage ratio does not supply the tangible-equity measure needed to infer the official critically undercapitalized category.

Missing capital, asset-quality, earnings, or liquidity inputs remain null; they are not replaced with neutral or healthy scores. Asset quality, earnings, and liquidity use exact empirical ranks within the bank's same-quarter FDIC-derived asset bucket. Tied values receive the midpoint of their shared cohort positions; Bankgraph does not fit a normal distribution to these ratios.

The Analytical Composite requires at least three of four components. When three are available, the interface labels the result as partial and divides the weighted sum by the weights of those three components. A result based on fewer than three components is suppressed. The history chart appears only when every displayed quarter uses the same component set. Each peer-ranked component is recalibrated against its same-quarter cohort, so a change over time can reflect movement in the bank, the cohort, or both.

## Structural breaks and revisions

Mergers, charter conversions, acquisitions, accounting changes, and reporting changes can create real breaks in a bank's time series. The pipeline ingests FDIC structure history by process year, but not every row maps directly to an FDIC certificate and a mapped event cannot establish economic comparability by itself. An automated line or decomposition therefore cannot decide whether two corporate periods are comparable.

The source can revise historical records. The ingestion pipeline upserts observations by their natural keys, so a later refresh can change an earlier value. Saved workspaces and live links preserve analytical choices, not a permanent copy of every source row. Opening a live link resolves those choices against the release published at that time. For a fixed record, download a research snapshot: it carries the selected values, normalized financial rows, explicit missingness, formulas and source fields, exact cohort, retrieval time, and published release generation in one local JSON file.

## Reproducing a result

For a result used outside the application, retain:

1. The live workspace URL for the analytical choices and the downloaded research snapshot for fixed values.
2. The institution certificate numbers, reporting range, filters, and cohort exclusions.
3. The metric definitions, units, and formulas.
4. The exported observations and retrieval timestamp.
5. The upstream FDIC or originating-agency reference used for verification.

Report uncertainty directly. Do not convert a descriptive peer relationship into a causal claim, and do not infer bank safety from one metric or one quarter.
