<script lang="ts">
  import { untrack } from "svelte";
  import type {
    CohortTrendResultSet,
    MetricCondition,
  } from "$lib/workspace";
  import {
    METRICS,
    formatMetric,
    quarterLabel,
  } from "./workspace-data";
  import {
    cohortTrendOperatorLabel,
    cohortTrendResultIsCurrent,
    sortCohortTrendRows,
    type CohortTrendSortDirection,
    type CohortTrendSortKey,
  } from "./cohort-trend-result";

  let {
    result,
    currentCohortHash,
    currentRevision,
    onFocus,
    onClear,
  }: {
    result: CohortTrendResultSet;
    currentCohortHash: string | null;
    currentRevision: number;
    onFocus: (cert: number) => void;
    onClear: () => void;
  } = $props();

  const initialMetric = untrack(() => result.metrics[0]);
  let sortKey = $state<CohortTrendSortKey>(
    initialMetric
      ? (`change:${initialMetric}` as CohortTrendSortKey)
      : "name",
  );
  let sortDirection = $state<CohortTrendSortDirection>("desc");
  let effectiveSortKey = $derived.by<CohortTrendSortKey>(() => {
    if (!sortKey.startsWith("change:")) return sortKey;
    const metric = sortKey.slice("change:".length);
    return result.metrics.includes(metric)
      ? sortKey
      : result.metrics[0]
        ? (`change:${result.metrics[0]}` as CohortTrendSortKey)
        : "name";
  });
  let resultIsCurrent = $derived(
    cohortTrendResultIsCurrent(result, currentCohortHash),
  );
  let sortedRows = $derived(
    sortCohortTrendRows(result.rows, effectiveSortKey, sortDirection),
  );

  function metricLabel(metric: string) {
    return (
      METRICS.find((definition) => definition.id === metric)?.shortLabel ??
      metric
    );
  }

  function unitLabel(metric: string) {
    const unit = result.changeUnits[metric];
    if (unit === "percentage_points") return "pp change";
    if (unit === "percent_change") return "% change";
    return "absolute change";
  }

  function formatChange(value: number | null, metric: string) {
    if (value === null) return "—";
    const unit = result.changeUnits[metric];
    if (unit === "percentage_points") return `${value > 0 ? "+" : ""}${value.toFixed(2)} pp`;
    if (unit === "percent_change") return `${value > 0 ? "+" : ""}${value.toFixed(2)}%`;
    return new Intl.NumberFormat("en-US", {
      maximumFractionDigits: 2,
      signDisplay: "exceptZero",
    }).format(value);
  }

  function conditionText(condition: MetricCondition) {
    const first = formatChange(condition.value, condition.metric);
    if (condition.operator === "between" && condition.upperValue !== null) {
      return `${metricLabel(condition.metric)} ${first} to ${formatChange(condition.upperValue, condition.metric)}`;
    }
    return `${metricLabel(condition.metric)} ${cohortTrendOperatorLabel(condition.operator)} ${first}`;
  }

  function setSort(key: CohortTrendSortKey) {
    if (sortKey === key) {
      sortDirection = sortDirection === "asc" ? "desc" : "asc";
      return;
    }
    sortKey = key;
    sortDirection = key === "name" || key === "state" ? "asc" : "desc";
  }

  function sortState(key: CohortTrendSortKey) {
    if (effectiveSortKey !== key) return "none";
    return sortDirection === "asc" ? "ascending" : "descending";
  }
</script>

<div class="result-set">
  <header class="result-set__heading">
    <div>
      <span class="result-set__eyebrow">Cohort change screen</span>
      <h2>{result.counts.matching} banks match</h2>
      <p>
        {quarterLabel(result.from)} to {quarterLabel(result.to)} ·
        {result.counts.comparable} of {result.counts.cohort} banks comparable ·
        grouped by {result.groupBy === "state" ? "headquarters state" : "opening asset bucket"}
      </p>
    </div>
    <div class="result-set__identity">
      <span>{result.id}</span>
      <small>published r{result.publishedRevision} · workspace r{currentRevision}</small>
      <button type="button" onclick={onClear}>Clear result</button>
    </div>
  </header>

  {#if !resultIsCurrent}
    <p class="result-set__stale" role="status">
      The peer cohort has changed since this result was calculated. These rows remain tied to {result.cohortHash}.
    </p>
  {/if}

  <div class="result-set__conditions" aria-label="Applied change conditions">
    {#each result.conditions as condition}
      <span>{conditionText(condition)}</span>
    {/each}
  </div>

  {#if result.groups.length}
    <div class="result-set__groups" aria-label="Matching-bank concentration">
      {#each result.groups as group}
        <div>
          <span>{group.label}</span>
          <strong>{group.matchingCount}</strong>
          <small>{(group.shareOfMatches * 100).toFixed(1)}%</small>
        </div>
      {/each}
    </div>
  {/if}

  <div class="result-set__table-wrap">
    <table>
      <caption>
        Exact cohort change screen from {quarterLabel(result.from)} to {quarterLabel(result.to)}. Activate a bank to add it to the linked workspace.
      </caption>
      <thead>
        <tr>
          <th scope="col" aria-sort={sortState("name")}>
            <button type="button" onclick={() => setSort("name")}>Bank</button>
          </th>
          <th scope="col" aria-sort={sortState("state")}>
            <button type="button" onclick={() => setSort("state")}>State</button>
          </th>
          <th scope="col" aria-sort={sortState("totalAssets")}>
            <button type="button" onclick={() => setSort("totalAssets")}>Latest assets</button>
          </th>
          {#each result.metrics as metric}
            {@const key = `change:${metric}` as CohortTrendSortKey}
            <th scope="col" aria-sort={sortState(key)}>
              <button type="button" onclick={() => setSort(key)}>
                {metricLabel(metric)}<small>{unitLabel(metric)}</small>
              </button>
            </th>
          {/each}
        </tr>
      </thead>
      <tbody>
        {#each sortedRows as row}
          <tr>
            <th scope="row">
              <button type="button" onclick={() => onFocus(row.cert)}>
                <span>{row.name}</span><small>FDIC {row.cert}</small>
              </button>
            </th>
            <td>{row.state ?? "—"}</td>
            <td>{formatMetric(row.totalAssets, "asset")}</td>
            {#each result.metrics as metric}
              {@const change = row.changes[metric] ?? null}
              <td class:negative={(change ?? 0) < 0}>{formatChange(change, metric)}</td>
            {/each}
          </tr>
        {/each}
      </tbody>
    </table>
  </div>

  <footer class="result-set__lineage">
    <span>{result.coverage.status === "ready" ? "Complete endpoint coverage" : `${result.coverage.missingCount} banks lack one or both endpoints`}</span>
    <span>{result.peerRecipe.name || "Current bank screen"} · {result.peerRecipe.basis} basis · {result.excludedCount} excluded</span>
    <span>cohort {result.cohortHash}</span>
    <span>{result.sourceAsOf ? `source through ${quarterLabel(result.sourceAsOf)}` : "source period unavailable"}</span>
  </footer>
</div>

<style>
  .result-set {
    min-width: 0;
    color: var(--workspace-muted);
    font-size: 11px;
  }
  .result-set__heading {
    min-height: 64px;
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 1rem;
    padding: 0.68rem 0.8rem;
    border-bottom: 1px solid var(--workspace-rule);
  }
  .result-set__eyebrow {
    color: var(--workspace-cyan);
    font: 11px var(--workspace-data-font);
    text-transform: uppercase;
    letter-spacing: 0.055em;
  }
  h2,
  p {
    margin: 0;
  }
  h2 {
    margin-top: 0.1rem;
    color: var(--workspace-ink);
    font-size: 13px;
    font-weight: 650;
  }
  .result-set__heading p {
    margin-top: 0.12rem;
    color: var(--workspace-faint);
  }
  .result-set__identity {
    display: grid;
    justify-items: end;
    gap: 0.08rem;
    color: var(--workspace-faint);
    font: 11px var(--workspace-data-font);
  }
  .result-set__identity button {
    margin-top: 0.18rem;
    padding: 0.24rem 0.4rem;
    border: 1px solid var(--workspace-rule);
    background: transparent;
    color: var(--workspace-muted);
    cursor: pointer;
  }
  .result-set__identity button:hover,
  .result-set__identity button:focus-visible {
    border-color: var(--workspace-cyan);
    color: var(--workspace-cyan);
  }
  .result-set__stale {
    padding: 0.42rem 0.8rem;
    border-bottom: 1px solid var(--workspace-orange);
    color: var(--workspace-orange);
  }
  .result-set__conditions {
    display: flex;
    gap: 0;
    overflow-x: auto;
    border-bottom: 1px solid var(--workspace-rule);
  }
  .result-set__conditions span {
    flex: none;
    padding: 0.42rem 0.62rem;
    border-right: 1px solid var(--workspace-rule-soft);
    color: var(--workspace-ink);
    font: 11px var(--workspace-data-font);
  }
  .result-set__groups {
    display: flex;
    overflow-x: auto;
    border-bottom: 1px solid var(--workspace-rule);
  }
  .result-set__groups div {
    flex: 0 0 8rem;
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 0 0.4rem;
    padding: 0.38rem 0.55rem;
    border-right: 1px solid var(--workspace-rule-soft);
  }
  .result-set__groups span {
    overflow: hidden;
    color: var(--workspace-faint);
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .result-set__groups strong {
    color: var(--workspace-ink);
    font: 11px var(--workspace-data-font);
  }
  .result-set__groups small {
    grid-column: 1 / -1;
    color: var(--workspace-violet);
    font: 11px var(--workspace-data-font);
  }
  .result-set__table-wrap {
    max-height: 22rem;
    overflow: auto;
    scrollbar-color: var(--workspace-faint) var(--workspace-bg);
  }
  table {
    width: 100%;
    min-width: 650px;
    border-collapse: collapse;
    font-variant-numeric: tabular-nums;
  }
  caption {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }
  th,
  td {
    padding: 0.34rem 0.55rem;
    border-bottom: 1px solid var(--workspace-rule-soft);
    text-align: start;
  }
  thead th {
    position: sticky;
    top: 0;
    z-index: 2;
    padding: 0;
    background: var(--workspace-bg-elevated);
  }
  thead button {
    width: 100%;
    min-height: 38px;
    padding: 0.34rem 0.55rem;
    border: 0;
    background: transparent;
    color: var(--workspace-faint);
    text-align: start;
    cursor: pointer;
  }
  thead th[aria-sort="ascending"] button,
  thead th[aria-sort="descending"] button {
    color: var(--workspace-cyan);
    box-shadow: inset 0 -1px 0 var(--workspace-cyan);
  }
  thead button small {
    display: block;
    margin-top: 0.06rem;
    color: var(--workspace-faint);
    font: 11px var(--workspace-data-font);
    font-weight: 400;
  }
  tbody th {
    padding: 0;
    font-weight: 500;
  }
  tbody th button {
    width: 100%;
    min-height: 42px;
    display: grid;
    padding: 0.3rem 0.55rem;
    border: 0;
    background: transparent;
    color: var(--workspace-ink);
    text-align: start;
    cursor: pointer;
  }
  tbody th button:hover span,
  tbody th button:focus-visible span {
    color: var(--workspace-cyan);
  }
  tbody th small {
    color: var(--workspace-faint);
    font: 11px var(--workspace-data-font);
  }
  tbody td {
    color: var(--workspace-ink);
    font: 11px var(--workspace-data-font);
    text-align: end;
    white-space: nowrap;
  }
  tbody td:nth-child(2) {
    text-align: start;
  }
  tbody td.negative {
    color: var(--workspace-orange);
  }
  .result-set__lineage {
    display: flex;
    gap: 0.8rem;
    padding: 0.42rem 0.55rem;
    overflow-x: auto;
    border-top: 1px solid var(--workspace-rule);
    color: var(--workspace-faint);
    font: 11px var(--workspace-data-font);
  }
  .result-set__lineage span {
    flex: none;
  }
  @media (max-width: 560px) {
    .result-set__heading {
      flex-direction: column;
    }
    .result-set__identity {
      width: 100%;
      grid-template-columns: minmax(0, 1fr) auto;
      justify-items: start;
      align-items: center;
    }
    .result-set__identity small {
      grid-column: 1;
    }
    .result-set__identity button {
      grid-column: 2;
      grid-row: 1 / 3;
    }
  }
  @media (pointer: coarse) {
    thead button,
    tbody th button,
    .result-set__identity button {
      min-height: 44px;
    }
  }
</style>
