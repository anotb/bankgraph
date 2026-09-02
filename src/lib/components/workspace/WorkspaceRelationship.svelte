<script lang="ts">
  import {
    METRICS,
    formatMetric,
    quarterLabel,
    valueAtPeriod,
    type WorkspaceBank,
    type WorkspaceMetric,
  } from "./workspace-data";
  let {
    cohort,
    selected,
    xMetric,
    yMetric,
    period,
    cursorIndex,
    activeCert,
    onFocus,
  }: {
    cohort: WorkspaceBank[];
    selected: WorkspaceBank[];
    xMetric: WorkspaceMetric;
    yMetric: WorkspaceMetric;
    period: string | null;
    cursorIndex: number;
    activeCert: number | null;
    onFocus: (cert: number) => void;
  } = $props();
  const width = 520;
  const height = 220;
  const inset = { left: 44, right: 16, top: 18, bottom: 32 };
  let effectivePeriod = $derived(
    period ??
      selected[0]?.financials[
        Math.min(cursorIndex, selected[0].financials.length - 1)
      ]?.repdte ??
      cohort[0]?.financials[
        Math.min(cursorIndex, cohort[0].financials.length - 1)
      ]?.repdte ??
      null,
  );
  function point(bank: WorkspaceBank) {
    const x = valueAtPeriod(bank, xMetric, effectivePeriod);
    const y = valueAtPeriod(bank, yMetric, effectivePeriod);
    return x === null || y === null ? null : { bank, x, y };
  }
  let cohortPoints = $derived(
    cohort
      .map(point)
      .filter(
        (item): item is { bank: WorkspaceBank; x: number; y: number } =>
          item !== null,
      ),
  );
  let peerMode = $derived(cohortPoints.length >= 2);
  let points = $derived(
    peerMode
      ? cohortPoints
      : selected
          .map(point)
          .filter(
            (item): item is { bank: WorkspaceBank; x: number; y: number } =>
              item !== null,
          ),
  );
  let selectedCerts = $derived(new Set(selected.map((bank) => bank.cert)));
  let xMin = $derived(Math.min(...points.map((item) => item.x), 0));
  let xMax = $derived(Math.max(...points.map((item) => item.x), 1));
  let yMin = $derived(Math.min(...points.map((item) => item.y), 0));
  let yMax = $derived(Math.max(...points.map((item) => item.y), 1));
  function x(value: number) {
    return (
      inset.left +
      ((value - xMin) / Math.max(xMax - xMin, 1)) *
        (width - inset.left - inset.right)
    );
  }
  function y(value: number) {
    return (
      inset.top +
      (1 - (value - yMin) / Math.max(yMax - yMin, 1)) *
        (height - inset.top - inset.bottom)
    );
  }
  let xLabel = $derived(
    METRICS.find((item) => item.id === xMetric)?.shortLabel ?? xMetric,
  );
  let yLabel = $derived(
    METRICS.find((item) => item.id === yMetric)?.shortLabel ?? yMetric,
  );
  let periodText = $derived(
    effectivePeriod ? quarterLabel(effectivePeriod) : "Period unavailable",
  );
  let exactTableOpen = $state(false);
</script>

<div class="relationship">
  <div class="relationship__head">
    <div>
      <h2>{peerMode ? "Screen relationship" : "Selected-bank comparison"} · {periodText}</h2>
      <p>{xLabel} × {yLabel} · exact bank-period grain</p>
    </div>
    <span>{points.length} comparable</span>
  </div>
  {#if points.length > 1}<svg
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={`${peerMode ? "Relationship" : "Dot comparison"} between ${xLabel} and ${yLabel} for ${points.length} banks in ${periodText}`}
      >{#each [0, 0.5, 1] as tick}<line
          x1={inset.left}
          x2={width - inset.right}
          y1={inset.top + tick * (height - inset.top - inset.bottom)}
          y2={inset.top + tick * (height - inset.top - inset.bottom)}
          class="grid"
        />{/each}<text x={inset.left} y={height - 9} class="axis"
        >{formatMetric(xMin, xMetric)}</text
      ><text
        x={width - inset.right}
        y={height - 9}
        text-anchor="end"
        class="axis">{formatMetric(xMax, xMetric)}</text
      >{#each points as item}<a
          class="point-link"
          href="#matrix-title"
          onclick={() => onFocus(item.bank.cert)}
          aria-label={`Focus ${item.bank.name} in ${periodText}: ${xLabel} ${formatMetric(item.x, xMetric)}, ${yLabel} ${formatMetric(item.y, yMetric)}`}
          ><circle class="point-hit" cx={x(item.x)} cy={y(item.y)} r="12" />
          <circle
            class="point-visible"
            cx={x(item.x)}
            cy={y(item.y)}
            r={item.bank.cert === activeCert
              ? 6
              : selectedCerts.has(item.bank.cert)
                ? 4.5
                : 3.5}
            fill={item.bank.cert === activeCert
              ? item.bank.color
              : "var(--workspace-bg)"}
            stroke={selectedCerts.has(item.bank.cert)
              ? item.bank.color
              : "var(--workspace-violet)"}
            stroke-width={selectedCerts.has(item.bank.cert) ? 2 : 1.2}
          />{#if selectedCerts.has(item.bank.cert) || item.bank.cert === activeCert}<text
              x={x(item.x) + 7}
              y={y(item.y) + 3}
              class:active={item.bank.cert === activeCert}
              >{item.bank.name.split(",")[0]}</text
            >{/if}</a
        >{/each}</svg
    >
    <p class="relationship__note">
      {peerMode
        ? `Screen cohort shown (n=${points.length}). Selected banks are labeled; choose any point to add and focus that bank.`
        : `Selected banks shown (n=${points.length}). The screen has fewer than two banks with both measures.`}
    </p>
    <details bind:open={exactTableOpen}>
      <summary>Exact values</summary>
      {#if exactTableOpen}
        <div class="exact-table">
          <table>
            <caption>Exact {xLabel} and {yLabel} values by bank for {periodText}</caption>
            <thead><tr><th scope="col">Bank</th><th scope="col">{xLabel}</th><th scope="col">{yLabel}</th></tr></thead
            ><tbody
              >{#each points as item}<tr
                  ><th scope="row"
                    ><button type="button" onclick={() => onFocus(item.bank.cert)}
                      >{item.bank.name}</button
                    ></th
                  ><td>{formatMetric(item.x, xMetric)}</td><td
                    >{formatMetric(item.y, yMetric)}</td
                  ></tr
                >{/each}</tbody
            >
          </table>
        </div>
      {/if}
    </details>{:else}<div class="pane-state" role="status" aria-live="polite">
      <strong>Two comparable values are required.</strong><span
        >Choose another metric or reporting period.</span
      >
    </div>{/if}
</div>

<style>
  .relationship__head {
    display: flex;
    justify-content: space-between;
    gap: 0.6rem;
    padding: 0.7rem 0.8rem;
    border-bottom: 1px solid var(--workspace-rule);
  }
  h2 {
    margin: 0;
    color: var(--workspace-ink);
    font-size: 13px;
    font-weight: 650;
  }
  p {
    margin: 0.1rem 0 0;
    color: var(--workspace-muted);
    font-size: 11px;
  }
  .relationship__head > span {
    color: var(--workspace-violet);
    font: 11px var(--workspace-data-font);
  }
  svg {
    display: block;
    width: 100%;
    min-height: 210px;
  }
  .grid {
    stroke: var(--workspace-rule-soft);
  }
  .axis {
    fill: var(--workspace-faint);
    font: 11px var(--workspace-data-font);
  }
  .point-hit {
    fill: transparent;
  }
  a text {
    fill: var(--workspace-muted);
    font: 11px var(--workspace-ui-font);
  }
  a text.active,
  a:hover text {
    fill: var(--workspace-cyan);
  }
  .relationship__note {
    padding: 0 0.8rem 0.5rem;
  }
  details {
    border-top: 1px solid var(--workspace-rule-soft);
  }
  summary {
    padding: 0.45rem 0.8rem;
    color: var(--workspace-muted);
    font-size: 11px;
    cursor: pointer;
  }
  .exact-table {
    max-height: 160px;
    overflow: auto;
  }
  table {
    width: 100%;
    border-collapse: collapse;
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
    padding: 0.35rem 0.55rem;
    border-top: 1px solid var(--workspace-rule-soft);
    color: var(--workspace-muted);
    font: 11px var(--workspace-data-font);
    text-align: right;
  }
  th:first-child,
  td:first-child {
    text-align: left;
  }
  tbody th button {
    padding: 0;
    border: 0;
    background: transparent;
    color: var(--workspace-ink);
    font: 11px var(--workspace-ui-font);
    cursor: pointer;
  }
  .pane-state {
    min-height: 210px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    color: var(--workspace-muted);
    font-size: 11px;
  }
  .pane-state strong {
    color: var(--workspace-ink);
  }
  @media (max-width: 720px), (pointer: coarse) {
    .point-hit {
      r: 22px;
    }
    summary,
    tbody th button {
      min-height: 44px;
    }
  }
</style>
