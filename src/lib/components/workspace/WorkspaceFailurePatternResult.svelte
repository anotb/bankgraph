<script lang="ts">
  import { untrack } from "svelte";
  import type {
    CurrentAnalogue,
    FailurePatternMetricId,
    FailurePatternsResponse,
  } from "$lib/server/analytics/failure-patterns";
  import {
    chartX,
    chartY,
    failureBandPaths,
    failureMedianPaths,
    failureSeriesDomain,
    sortFailureAnalogues,
    topFailureContributions,
    type FailureAnalogueSortDirection,
    type FailureAnalogueSortKey,
    type FailureChartGeometry,
  } from "./failure-pattern-result";

  type FailurePatternView = "both" | "event-study" | "analogues";

  let {
    result,
    view = "both",
    initialMetric = null,
    onFocusBank = () => {},
    onFocusMetric = () => {},
  }: {
    result: FailurePatternsResponse;
    view?: FailurePatternView;
    initialMetric?: FailurePatternMetricId | null;
    onFocusBank?: (cert: number) => void;
    onFocusMetric?: (metric: FailurePatternMetricId) => void;
  } = $props();

  const geometry: FailureChartGeometry = {
    width: 760,
    height: 258,
    left: 54,
    top: 22,
    right: 54,
    bottom: 38,
  };

  let selectedMetric = $state<FailurePatternMetricId | null>(
    untrack(() => initialMetric),
  );
  let inspectedPoint = $state<number | null>(null);
  let expandedCert = $state<number | null>(null);
  let sortKey = $state<FailureAnalogueSortKey>("rank");
  let sortDirection = $state<FailureAnalogueSortDirection>("asc");

  let selectedSeries = $derived(
    result.eventStudy.series.find((series) => series.metric === selectedMetric) ??
      result.eventStudy.series[0] ??
      null,
  );
  let domain = $derived(failureSeriesDomain(selectedSeries));
  let sortedAnalogues = $derived(
    sortFailureAnalogues(result.currentAnalogues.data, sortKey, sortDirection),
  );
  let hasHistoricalData = $derived(
    result.historicalCohort.withExactQuarterHistory > 0 &&
      result.eventStudy.series.some((series) =>
        series.points.some((point) => point.median !== null),
      ),
  );
  let failureX = $derived(geometry.width - geometry.right);

  $effect(() => {
    if (!selectedSeries) return;
    if (selectedMetric !== selectedSeries.metric) selectedMetric = selectedSeries.metric;
  });

  function selectMetric(metric: FailurePatternMetricId) {
    selectedMetric = metric;
    inspectedPoint = null;
    onFocusMetric(metric);
  }

  function setSort(key: FailureAnalogueSortKey) {
    if (sortKey === key) {
      sortDirection = sortDirection === "asc" ? "desc" : "asc";
      return;
    }
    sortKey = key;
    sortDirection = key === "coverage" ? "desc" : "asc";
  }

  function sortState(key: FailureAnalogueSortKey) {
    if (sortKey !== key) return "none";
    return sortDirection === "asc" ? "ascending" : "descending";
  }

  function formatPercent(value: number | null, signed = false) {
    if (value === null || !Number.isFinite(value)) return "—";
    return `${new Intl.NumberFormat("en-US", {
      maximumFractionDigits: 2,
      minimumFractionDigits: Math.abs(value) < 10 ? 2 : 1,
      signDisplay: signed ? "exceptZero" : "auto",
    }).format(value)}%`;
  }

  function formatDistance(value: number | null) {
    if (value === null || !Number.isFinite(value)) return "—";
    return value.toFixed(value < 10 ? 2 : 1);
  }

  function formatCoverage(value: number) {
    return `${(value * 100).toFixed(value >= 0.995 ? 0 : 1)}%`;
  }

  function formatDate(value: string | null) {
    if (!value) return "Period unavailable";
    const digits = value.replace(/\D/g, "");
    if (digits.length !== 8) return value;
    const year = digits.slice(0, 4);
    const month = Number(digits.slice(4, 6));
    const quarter = Math.ceil(month / 3);
    return `Q${quarter} ${year}`;
  }

  function relativeQuarterLabel(relativeQuarter: number, compact = false) {
    const quarters = Math.abs(relativeQuarter);
    return compact ? `${relativeQuarter}Q` : `${quarters} quarter${quarters === 1 ? "" : "s"} before failure`;
  }

  function gridValue(fraction: number) {
    return domain[1] - (domain[1] - domain[0]) * fraction;
  }

  function axisY(fraction: number) {
    return geometry.top + fraction * (geometry.height - geometry.top - geometry.bottom);
  }

  function analoguePlace(analogue: CurrentAnalogue) {
    return [analogue.city, analogue.state].filter(Boolean).join(", ") || "Location unavailable";
  }
</script>

<section class="failure-pattern" aria-labelledby="failure-pattern-title">
  <header class="failure-pattern__heading">
    <div>
      <h2 id="failure-pattern-title">How earlier bank failures developed—and which current paths look similar</h2>
      <p>
        Follow the median path into failures from {result.request.startYear}–{result.request.endYear}, then inspect active banks with similar reported trajectories.
      </p>
    </div>
    <div class="failure-pattern__scope" aria-label="Analysis scope">
      <span>{result.request.quarters} quarters</span>
      <span>{result.historicalCohort.withExactQuarterHistory.toLocaleString()} failed banks</span>
      <span>{result.currentAnalogues.returned.toLocaleString()} current matches</span>
      <span>{formatDate(result.currentAnalogues.asOf)}</span>
    </div>
  </header>

  <p class="failure-pattern__meaning">
    Similarity describes the shape of reported financial trajectories. It does not estimate whether a bank will fail.
  </p>

  {#if view !== "analogues"}
    <section class="event-study" aria-labelledby="event-study-title">
      <div class="section-heading">
        <div>
          <h3 id="event-study-title">The path before failure</h3>
          <p>Median across banks with a complete quarterly history; the shaded range covers the middle half.</p>
        </div>
        {#if selectedSeries}<span>{selectedSeries.unit}</span>{/if}
      </div>

      {#if hasHistoricalData}
        <div class="metric-tabs" role="tablist" aria-label="Failure pattern measure">
          {#each result.eventStudy.series as series}
            <button
              type="button"
              role="tab"
              aria-selected={selectedSeries?.metric === series.metric}
              class:active={selectedSeries?.metric === series.metric}
              onclick={() => selectMetric(series.metric)}
            >{series.label}</button>
          {/each}
        </div>
      {/if}

      {#if selectedSeries && hasHistoricalData}
        <div class="event-study__body">
          <div class="chart-scroll">
            <div class="chart-stage">
              <svg
                viewBox={`0 0 ${geometry.width} ${geometry.height}`}
                role="img"
                aria-labelledby="event-chart-title event-chart-description"
              >
                <title id="event-chart-title">{selectedSeries.label} before historical bank failures</title>
                <desc id="event-chart-description">Median and interquartile range across {result.historicalCohort.withExactQuarterHistory} failed banks. Exact values follow in a table.</desc>

                {#each [0, 0.25, 0.5, 0.75, 1] as fraction}
                  <line
                    x1={geometry.left}
                    x2={failureX}
                    y1={axisY(fraction)}
                    y2={axisY(fraction)}
                    class="gridline"
                  />
                  <text x={geometry.left - 8} y={axisY(fraction) + 4} text-anchor="end" class="axis-label">
                    {formatPercent(gridValue(fraction))}
                  </text>
                {/each}

                {#each failureBandPaths(selectedSeries, domain, geometry) as path}
                  <path d={path} class="range-band" />
                {/each}
                {#each failureMedianPaths(selectedSeries, domain, geometry) as path}
                  <path d={path} class="median-line" />
                {/each}

                <line
                  x1={failureX}
                  x2={failureX}
                  y1={geometry.top}
                  y2={geometry.height - geometry.bottom}
                  class="failure-line"
                />
                <text x={failureX} y={geometry.top - 8} text-anchor="middle" class="failure-label">failure</text>

                {#each selectedSeries.points as point, index}
                  {@const pointX = chartX(index, selectedSeries.points.length, geometry)}
                  <text x={pointX} y={geometry.height - 12} text-anchor="middle" class="axis-label">
                    {relativeQuarterLabel(point.relativeQuarter, true)}
                  </text>
                  {#if point.median !== null}
                    <g
                      role="button"
                      tabindex="0"
                      aria-label={`${relativeQuarterLabel(point.relativeQuarter)}: median ${formatPercent(point.median)}, middle half ${formatPercent(point.q25)} to ${formatPercent(point.q75)}, ${point.count} observations`}
                      onpointerenter={() => (inspectedPoint = index)}
                      onpointerleave={(event) => {
                        if (event.pointerType === "mouse") inspectedPoint = null;
                      }}
                      onfocus={() => (inspectedPoint = index)}
                      onblur={() => (inspectedPoint = null)}
                    >
                      <circle cx={pointX} cy={chartY(point.median, domain, geometry)} r="12" class="point-target" />
                      <circle
                        cx={pointX}
                        cy={chartY(point.median, domain, geometry)}
                        r={inspectedPoint === index ? 4 : 3}
                        class="median-point"
                        class:active={inspectedPoint === index}
                      />
                    </g>
                  {/if}
                {/each}
              </svg>

              {#if inspectedPoint !== null}
                {@const point = selectedSeries.points[inspectedPoint]}
                {#if point?.median !== null}
                  <div
                    class="chart-tooltip"
                    class:chart-tooltip--left={chartX(inspectedPoint, selectedSeries.points.length, geometry) > geometry.width * 0.62}
                    style={`left:${(chartX(inspectedPoint, selectedSeries.points.length, geometry) / geometry.width) * 100}%;top:${(chartY(point.median, domain, geometry) / geometry.height) * 100}%`}
                    role="tooltip"
                  >
                    <strong>{relativeQuarterLabel(point.relativeQuarter)}</strong>
                    <span>Median <b>{formatPercent(point.median)}</b></span>
                    <span>Middle half <b>{formatPercent(point.q25)} to {formatPercent(point.q75)}</b></span>
                    <small>{point.count} of {point.cohortCount} banks reported this measure</small>
                  </div>
                {/if}
              {/if}
            </div>
          </div>

          <div class="exact-table-wrap">
            <table class="exact-table">
              <caption>Exact {selectedSeries.label.toLowerCase()} values before historical bank failures</caption>
              <thead>
                <tr>
                  <th scope="col">Quarter</th>
                  <th scope="col">Median</th>
                  <th scope="col">Middle 50%</th>
                  <th scope="col">Banks</th>
                  <th scope="col">Coverage</th>
                </tr>
              </thead>
              <tbody>
                {#each selectedSeries.points as point, index}
                  <tr class:current={inspectedPoint === index}>
                    <th scope="row">
                      <button
                        type="button"
                        aria-pressed={inspectedPoint === index}
                        onclick={() => (inspectedPoint = inspectedPoint === index ? null : index)}
                      >{relativeQuarterLabel(point.relativeQuarter, true)}</button>
                    </th>
                    <td>{formatPercent(point.median)}</td>
                    <td>{formatPercent(point.q25)} – {formatPercent(point.q75)}</td>
                    <td>{point.count.toLocaleString()}</td>
                    <td>{formatCoverage(point.coverage)}</td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
        </div>
      {:else}
        <div class="empty-state">
          <strong>No complete historical paths were found.</strong>
          <span>Try a wider failure-year range or a shorter quarterly window.</span>
        </div>
      {/if}
    </section>
  {/if}

  {#if view !== "event-study"}
    <section class="analogues" aria-labelledby="analogues-title">
      <div class="section-heading">
        <div>
          <h3 id="analogues-title">Current trajectories with the closest shape</h3>
          <p>Lower distance means a closer multi-metric path. Coverage shows how much of the comparison was observed.</p>
        </div>
        <span>{result.currentAnalogues.withExactQuarterHistory.toLocaleString()} eligible banks</span>
      </div>

      {#if result.currentAnalogues.data.length}
        <div class="analogue-table-wrap">
          <table class="analogue-table">
            <caption>Active banks ranked by descriptive similarity to the historical pre-failure pattern</caption>
            <thead>
              <tr>
                <th scope="col" aria-sort={sortState("rank")}>
                  <button type="button" onclick={() => setSort("rank")}>Rank</button>
                </th>
                <th scope="col">Bank</th>
                <th scope="col" aria-sort={sortState("distance")}>
                  <button type="button" onclick={() => setSort("distance")}>Trajectory distance</button>
                </th>
                <th scope="col" aria-sort={sortState("coverage")}>
                  <button type="button" onclick={() => setSort("coverage")}>Coverage</button>
                </th>
                <th scope="col">Largest gaps from the pattern</th>
                <th scope="col"><span class="sr-only">Inspect comparison</span></th>
              </tr>
            </thead>
            <tbody>
              {#each sortedAnalogues as analogue (analogue.cert)}
                <tr class:expanded={expandedCert === analogue.cert}>
                  <td class="rank">#{analogue.rank}</td>
                  <th scope="row">
                    <button class="bank-focus" type="button" onclick={() => onFocusBank(analogue.cert)}>
                      <span>{analogue.name}</span>
                      <small>{analoguePlace(analogue)} · FDIC {analogue.cert}</small>
                    </button>
                  </th>
                  <td class="distance">
                    <strong>{formatDistance(analogue.coverageAdjustedDistance)}</strong>
                    <small>raw {formatDistance(analogue.distance)}</small>
                  </td>
                  <td class="coverage">
                    <span>{formatCoverage(analogue.coverage.ratio)}</span>
                    <small>{analogue.coverage.observedCells} / {analogue.coverage.referenceCells} comparable cells</small>
                  </td>
                  <td>
                    <div class="contribution-list">
                      {#if topFailureContributions(analogue).length}
                        {#each topFailureContributions(analogue) as feature}
                          <span title={`${feature.label}: ${(feature.squaredDistanceShare * 100).toFixed(1)}% of squared distance`}>
                            <i style={`--share:${Math.max(3, feature.squaredDistanceShare * 100)}%`}></i>
                            <b>{feature.label}</b>
                            <small>{(feature.squaredDistanceShare * 100).toFixed(1)}%</small>
                          </span>
                        {/each}
                      {:else}
                        <em>No measured gap</em>
                      {/if}
                    </div>
                  </td>
                  <td class="inspect-cell">
                    <button
                      type="button"
                      aria-expanded={expandedCert === analogue.cert}
                      onclick={() => (expandedCert = expandedCert === analogue.cert ? null : analogue.cert)}
                    >{expandedCert === analogue.cert ? "Close" : "Inspect"}</button>
                  </td>
                </tr>
                {#if expandedCert === analogue.cert}
                  <tr class="contribution-detail">
                    <td colspan="6">
                      <div class="contribution-detail__heading">
                        <strong>Where {analogue.name} differs from the historical path</strong>
                        <span>As of {formatDate(analogue.asOf)}</span>
                      </div>
                      <div class="contribution-detail__scroll">
                        <table>
                          <caption>Exact feature contributions to {analogue.name}'s trajectory distance</caption>
                          <thead>
                            <tr>
                              <th scope="col">Measure</th>
                              <th scope="col">Share of squared distance</th>
                              <th scope="col">Feature distance</th>
                              <th scope="col">Observed quarters</th>
                              <th scope="col">Coverage</th>
                            </tr>
                          </thead>
                          <tbody>
                            {#each [...analogue.featureContributions].sort((a, b) => b.squaredDistanceShare - a.squaredDistanceShare) as feature}
                              <tr>
                                <th scope="row">{feature.label}</th>
                                <td>{(feature.squaredDistanceShare * 100).toFixed(1)}%</td>
                                <td>{formatDistance(feature.rmsStandardizedDistance)}</td>
                                <td>{feature.observedPeriods} / {feature.expectedPeriods}</td>
                                <td>{formatCoverage(feature.coverage)}</td>
                              </tr>
                            {/each}
                          </tbody>
                        </table>
                      </div>
                    </td>
                  </tr>
                {/if}
              {/each}
            </tbody>
          </table>
        </div>
      {:else}
        <div class="empty-state">
          <strong>No current comparison is available.</strong>
          <span>The analysis needs complete current and historical quarterly paths for the selected window.</span>
        </div>
      {/if}
    </section>
  {/if}

  <footer class="failure-pattern__source">
    <span>FDIC Failures &amp; Assistance Transactions, Financials, and Institutions</span>
    <span>Historical paths end at the latest FDIC quarter before each failure</span>
    {#if result.provenance.sourceAsOf}<span>Current data through {formatDate(result.provenance.sourceAsOf)}</span>{/if}
  </footer>
</section>

<style>
  .failure-pattern {
    min-width: 0;
    container-type: inline-size;
    background: var(--workspace-bg, #06131d);
    color: var(--workspace-muted, #b8c6cc);
    font: 12px/1.45 Inter, system-ui, sans-serif;
  }
  .failure-pattern__heading {
    min-height: 68px;
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: start;
    gap: 0.55rem 1.2rem;
    padding: 0.72rem 0.85rem;
    border-bottom: 1px solid var(--workspace-rule, #29404e);
  }
  h2,
  h3,
  p {
    margin: 0;
  }
  h2 {
    color: var(--workspace-ink, #eef5f7);
    font-size: 13px;
    font-weight: 650;
    letter-spacing: 0;
  }
  h3 {
    color: var(--workspace-ink, #eef5f7);
    font-size: 13px;
    font-weight: 650;
  }
  .failure-pattern__heading p,
  .section-heading p {
    max-width: 72ch;
    margin-top: 0.14rem;
    color: var(--workspace-muted, #b8c6cc);
    font-size: 11px;
  }
  .failure-pattern__scope {
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: 0;
    border: 1px solid var(--workspace-rule, #29404e);
    font: 11px var(--workspace-data-font, "Geist Mono Variable", ui-monospace, monospace);
    font-variant-numeric: tabular-nums;
  }
  .failure-pattern__scope span {
    padding: 0.32rem 0.46rem;
    border-right: 1px solid var(--workspace-rule-soft, #19313e);
    color: var(--workspace-faint, #93a8b1);
    white-space: nowrap;
  }
  .failure-pattern__scope span:last-child {
    border-right: 0;
  }
  .failure-pattern__meaning {
    padding: 0.4rem 0.85rem;
    border-bottom: 1px solid var(--workspace-rule, #29404e);
    color: var(--workspace-orange, #ff875a);
    font-size: 11px;
  }
  .event-study,
  .analogues {
    min-width: 0;
    border-bottom: 1px solid var(--workspace-rule, #29404e);
  }
  .section-heading {
    min-height: 52px;
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 1rem;
    padding: 0.58rem 0.85rem;
    border-bottom: 1px solid var(--workspace-rule-soft, #19313e);
    background: var(--workspace-bg-elevated, #091a26);
  }
  .section-heading > span {
    flex: none;
    color: var(--workspace-faint, #93a8b1);
    font: 11px var(--workspace-data-font, "Geist Mono Variable", ui-monospace, monospace);
    font-variant-numeric: tabular-nums;
  }
  .metric-tabs {
    display: flex;
    overflow-x: auto;
    border-bottom: 1px solid var(--workspace-rule, #29404e);
    scrollbar-color: var(--workspace-rule, #29404e) transparent;
  }
  .metric-tabs button {
    flex: none;
    min-height: 34px;
    padding: 0.4rem 0.58rem;
    border: 0;
    border-right: 1px solid var(--workspace-rule-soft, #19313e);
    background: transparent;
    color: var(--workspace-muted, #b8c6cc);
    font: inherit;
    font-size: 11px;
    cursor: pointer;
  }
  .metric-tabs button:hover {
    color: var(--workspace-ink, #eef5f7);
  }
  .metric-tabs button.active {
    background: var(--workspace-selected, #0a2635);
    box-shadow: inset 0 -2px var(--workspace-cyan, #25cdf5);
    color: var(--workspace-cyan, #25cdf5);
  }
  .event-study__body {
    display: grid;
    grid-template-columns: minmax(0, 1.65fr) minmax(340px, 0.8fr);
    min-width: 0;
  }
  .chart-scroll {
    min-width: 0;
    overflow-x: auto;
    border-right: 1px solid var(--workspace-rule, #29404e);
    scrollbar-color: var(--workspace-rule, #29404e) transparent;
  }
  .chart-stage {
    position: relative;
    min-width: 620px;
  }
  svg {
    display: block;
    width: 100%;
    min-height: 250px;
    overflow: visible;
  }
  .gridline {
    stroke: var(--workspace-rule-soft, #19313e);
    stroke-width: 1;
  }
  .axis-label,
  .failure-label {
    fill: var(--workspace-faint, #93a8b1);
    font: 11px var(--workspace-data-font, "Geist Mono Variable", ui-monospace, monospace);
  }
  .failure-label {
    fill: var(--workspace-orange, #ff875a);
  }
  .range-band {
    fill: var(--workspace-violet, #a78be9);
    opacity: 0.18;
    pointer-events: none;
  }
  .median-line {
    fill: none;
    stroke: var(--workspace-violet, #a78be9);
    stroke-width: 2;
    pointer-events: none;
  }
  .failure-line {
    stroke: var(--workspace-orange, #ff875a);
    stroke-width: 1;
    stroke-dasharray: 4 4;
  }
  .point-target {
    fill: transparent;
    cursor: crosshair;
  }
  .median-point {
    fill: var(--workspace-bg, #06131d);
    stroke: var(--workspace-violet, #a78be9);
    stroke-width: 2;
    pointer-events: none;
  }
  .median-point.active,
  g[role="button"]:focus .median-point {
    stroke: var(--workspace-cyan, #25cdf5);
  }
  g[role="button"]:focus {
    outline: none;
  }
  .chart-tooltip {
    position: absolute;
    z-index: 3;
    display: grid;
    min-width: 190px;
    max-width: min(260px, calc(100% - 16px));
    gap: 0.1rem;
    padding: 0.48rem 0.55rem;
    border: 1px solid var(--workspace-rule, #29404e);
    background: var(--workspace-bg-elevated, #091a26);
    color: var(--workspace-muted, #b8c6cc);
    box-shadow: 0 18px 32px rgba(0, 0, 0, 0.34);
    font-size: 11px;
    pointer-events: none;
    transform: translate(12px, -50%);
  }
  .chart-tooltip--left {
    transform: translate(calc(-100% - 12px), -50%);
  }
  .chart-tooltip strong {
    color: var(--workspace-cyan, #25cdf5);
    font-family: var(--workspace-data-font, "Geist Mono Variable", ui-monospace, monospace);
  }
  .chart-tooltip b {
    color: var(--workspace-ink, #eef5f7);
    font: 600 11px var(--workspace-data-font, "Geist Mono Variable", ui-monospace, monospace);
  }
  .chart-tooltip small {
    color: var(--workspace-faint, #93a8b1);
  }
  .exact-table-wrap {
    max-height: 258px;
    overflow: auto;
    scrollbar-color: var(--workspace-rule, #29404e) transparent;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    font-variant-numeric: tabular-nums;
  }
  caption,
  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
    clip-path: inset(50%);
    white-space: nowrap;
    border: 0;
  }
  th,
  td {
    border-bottom: 1px solid var(--workspace-rule-soft, #19313e);
  }
  thead th {
    position: sticky;
    top: 0;
    z-index: 2;
    background: var(--workspace-bg-elevated, #091a26);
    color: var(--workspace-faint, #93a8b1);
    font-size: 11px;
    font-weight: 600;
    text-align: start;
  }
  .exact-table {
    min-width: 400px;
    font: 11px var(--workspace-data-font, "Geist Mono Variable", ui-monospace, monospace);
  }
  .exact-table th,
  .exact-table td {
    padding: 0.38rem 0.5rem;
    text-align: end;
    white-space: nowrap;
  }
  .exact-table th:first-child {
    text-align: start;
  }
  .exact-table tbody tr.current {
    background: var(--workspace-selected, #0a2635);
    color: var(--workspace-ink, #eef5f7);
  }
  .exact-table tbody tr.current th {
    box-shadow: inset 2px 0 var(--workspace-cyan, #25cdf5);
  }
  .exact-table button {
    min-height: 25px;
    padding: 0 0.18rem;
    border: 0;
    background: transparent;
    color: inherit;
    font: inherit;
    cursor: pointer;
  }
  .exact-table button:hover {
    color: var(--workspace-cyan, #25cdf5);
  }
  .analogue-table-wrap {
    max-height: clamp(16rem, calc(100vh - 15rem), 28rem);
    overflow: auto;
    overscroll-behavior: contain;
    scrollbar-color: var(--workspace-rule, #29404e) transparent;
    scrollbar-width: thin;
  }
  .analogue-table {
    min-width: 940px;
  }
  .analogue-table > thead th {
    padding: 0;
  }
  .analogue-table > thead th:not(:has(button)) {
    padding: 0.45rem 0.55rem;
  }
  .analogue-table > thead button {
    width: 100%;
    min-height: 38px;
    padding: 0.45rem 0.55rem;
    border: 0;
    background: transparent;
    color: inherit;
    font: inherit;
    font-weight: 600;
    text-align: start;
    cursor: pointer;
  }
  .analogue-table > thead th[aria-sort="ascending"] button,
  .analogue-table > thead th[aria-sort="descending"] button {
    box-shadow: inset 0 -1px var(--workspace-cyan, #25cdf5);
    color: var(--workspace-cyan, #25cdf5);
  }
  .analogue-table > tbody > tr:not(.contribution-detail):hover,
  .analogue-table > tbody > tr.expanded {
    background: var(--workspace-selected, #0a2635);
  }
  .analogue-table > tbody > tr.expanded > td:first-child {
    box-shadow: inset 2px 0 var(--workspace-cyan, #25cdf5);
  }
  .analogue-table > tbody > tr > td,
  .analogue-table > tbody > tr > th {
    padding: 0.42rem 0.55rem;
    color: var(--workspace-ink, #eef5f7);
    text-align: start;
    vertical-align: middle;
  }
  .analogue-table .rank,
  .analogue-table .distance,
  .analogue-table .coverage {
    font-family: var(--workspace-data-font, "Geist Mono Variable", ui-monospace, monospace);
  }
  .analogue-table .rank {
    width: 4.1rem;
    color: var(--workspace-faint, #93a8b1);
  }
  .bank-focus {
    display: grid;
    min-width: 190px;
    padding: 0;
    border: 0;
    background: transparent;
    color: var(--workspace-ink, #eef5f7);
    font: inherit;
    text-align: start;
    cursor: pointer;
  }
  .bank-focus:hover span,
  .bank-focus:focus-visible span {
    color: var(--workspace-cyan, #25cdf5);
  }
  .bank-focus small,
  .distance small,
  .coverage small {
    display: block;
    color: var(--workspace-faint, #93a8b1);
    font: 11px var(--workspace-data-font, "Geist Mono Variable", ui-monospace, monospace);
    font-weight: 400;
    white-space: nowrap;
  }
  .distance strong {
    font-weight: 600;
  }
  .contribution-list {
    display: grid;
    min-width: 245px;
    gap: 0.18rem;
  }
  .contribution-list > span {
    display: grid;
    grid-template-columns: 44px minmax(0, 1fr) auto;
    align-items: center;
    gap: 0.35rem;
    min-width: 0;
  }
  .contribution-list i {
    position: relative;
    display: block;
    height: 3px;
    background: var(--workspace-rule-soft, #19313e);
  }
  .contribution-list i::after {
    content: "";
    position: absolute;
    inset: 0 auto 0 0;
    width: min(var(--share), 100%);
    background: var(--workspace-violet, #a78be9);
  }
  .contribution-list b {
    overflow: hidden;
    color: var(--workspace-muted, #b8c6cc);
    font-size: 11px;
    font-weight: 400;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .contribution-list small {
    color: var(--workspace-faint, #93a8b1);
    font: 11px var(--workspace-data-font, "Geist Mono Variable", ui-monospace, monospace);
  }
  .contribution-list em {
    color: var(--workspace-faint, #93a8b1);
    font-size: 11px;
    font-style: normal;
  }
  .inspect-cell {
    width: 4rem;
  }
  .inspect-cell button {
    min-height: 28px;
    padding: 0.25rem 0.42rem;
    border: 1px solid var(--workspace-rule, #29404e);
    background: transparent;
    color: var(--workspace-muted, #b8c6cc);
    font: inherit;
    font-size: 11px;
    cursor: pointer;
  }
  .inspect-cell button:hover,
  .inspect-cell button[aria-expanded="true"] {
    border-color: var(--workspace-cyan, #25cdf5);
    color: var(--workspace-cyan, #25cdf5);
  }
  .contribution-detail > td {
    padding: 0 !important;
    background: var(--workspace-bg-elevated, #091a26);
  }
  .contribution-detail__heading {
    display: flex;
    justify-content: space-between;
    gap: 1rem;
    padding: 0.5rem 0.7rem;
    border-bottom: 1px solid var(--workspace-rule-soft, #19313e);
    color: var(--workspace-muted, #b8c6cc);
  }
  .contribution-detail__heading strong {
    color: var(--workspace-ink, #eef5f7);
    font-weight: 600;
  }
  .contribution-detail__heading span {
    font: 11px var(--workspace-data-font, "Geist Mono Variable", ui-monospace, monospace);
  }
  .contribution-detail__scroll {
    overflow-x: auto;
  }
  .contribution-detail table {
    min-width: 680px;
    font: 11px var(--workspace-data-font, "Geist Mono Variable", ui-monospace, monospace);
  }
  .contribution-detail th,
  .contribution-detail td {
    padding: 0.34rem 0.55rem;
  }
  .contribution-detail td:not(:first-child),
  .contribution-detail thead th:not(:first-child) {
    text-align: end;
  }
  .contribution-detail tbody th {
    color: var(--workspace-muted, #b8c6cc);
    font-weight: 400;
  }
  .empty-state {
    min-height: 180px;
    display: grid;
    place-content: center;
    gap: 0.15rem;
    padding: 1.5rem;
    color: var(--workspace-muted, #b8c6cc);
    text-align: center;
  }
  .empty-state strong {
    color: var(--workspace-ink, #eef5f7);
    font-weight: 600;
  }
  .failure-pattern__source {
    display: flex;
    gap: 0.85rem;
    padding: 0.46rem 0.7rem;
    overflow-x: auto;
    border-top: 1px solid var(--workspace-rule-soft, #19313e);
    color: var(--workspace-faint, #93a8b1);
    font: 11px var(--workspace-data-font, "Geist Mono Variable", ui-monospace, monospace);
    scrollbar-color: var(--workspace-rule, #29404e) transparent;
  }
  .failure-pattern__source span {
    flex: none;
  }
  button:focus-visible,
  g[role="button"]:focus-visible {
    outline: 2px solid var(--workspace-cyan, #25cdf5);
    outline-offset: 2px;
  }
  @container (max-width: 920px) {
    .failure-pattern__heading {
      grid-template-columns: minmax(0, 1fr);
    }
    .failure-pattern__scope {
      justify-self: start;
    }
    .event-study__body {
      grid-template-columns: minmax(0, 1fr);
    }
    .chart-scroll {
      border-right: 0;
      border-bottom: 1px solid var(--workspace-rule, #29404e);
    }
    .exact-table-wrap {
      max-height: 230px;
    }
  }
  @container (max-width: 560px) {
    .failure-pattern__heading {
      padding: 0.65rem 0.7rem;
    }
    .failure-pattern__scope {
      max-width: 100%;
      flex-wrap: nowrap;
      overflow-x: auto;
    }
    .failure-pattern__meaning,
    .section-heading {
      padding-inline: 0.7rem;
    }
    .section-heading {
      flex-direction: column;
      gap: 0.22rem;
    }
    .chart-stage {
      min-width: 600px;
    }
    .failure-pattern__source {
      gap: 0.65rem;
    }
  }
  @media (pointer: coarse) {
    .metric-tabs button,
    .bank-focus,
    .inspect-cell button,
    .exact-table button,
    .analogue-table > thead button {
      min-height: 44px;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    *,
    *::before,
    *::after {
      scroll-behavior: auto !important;
    }
  }
</style>
