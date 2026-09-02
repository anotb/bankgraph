<script lang="ts">
  import { tick } from "svelte";
  import {
    METRICS,
    formatMetric,
    quarterLabel,
    type WorkspaceBank,
    type WorkspaceMetric,
  } from "./workspace-data";
  import {
    trendHistoryRows,
    trendValueAtPeriod,
  } from "./workspace-trend-data";
  import { formatExactChartDate } from "$lib/components/charts/time-series-interaction";

  let {
    banks,
    metric,
    dates,
    cursorIndex,
    kind = "line",
    scale = "value",
    compact = false,
    onCursor,
    onFocus,
    onKind,
    onScale,
  }: {
    banks: WorkspaceBank[];
    metric: WorkspaceMetric;
    dates: string[];
    cursorIndex: number;
    kind?: "line" | "area";
    scale?: "value" | "index";
    compact?: boolean;
    onCursor: (index: number) => void;
    onFocus: (cert: number) => void;
    onKind?: (kind: "line" | "area") => void;
    onScale?: (scale: "value" | "index") => void;
  } = $props();

  const height = 236;
  let plotWidth = $state(720);
  let width = $derived(Math.max(520, Math.round(plotWidth || 720)));
  const plot = { left: 58, top: 20, right: 34, bottom: 34 };
  let definition = $derived(METRICS.find((item) => item.id === metric)!);
  function plottedValue(
    bank: WorkspaceBank,
    period: string,
  ): number | null {
    return trendValueAtPeriod(bank, metric, period, dates, scale);
  }
  let historyRows = $derived(trendHistoryRows(banks, metric, dates, scale));
  let historyElement = $state<HTMLDivElement>();
  let points = $derived(
    banks
      .flatMap((bank) =>
        dates.map((period) => plottedValue(bank, period)),
      )
      .filter((value): value is number => value != null),
  );
  let min = $derived(points.length ? Math.min(...points) : 0);
  let max = $derived(points.length ? Math.max(...points) : 1);
  let span = $derived(Math.max(max - min, Math.abs(max) * 0.04, 1));
  let pointCount = $derived(Math.max(dates.length, 1));
  let safeCursorIndex = $derived(
    Math.max(0, Math.min(pointCount - 1, cursorIndex)),
  );
  let inspectedPoint = $state<{
    cert: number;
    index: number;
    value: number;
  } | null>(null);
  let inspectedBank = $derived(
    inspectedPoint
      ? banks.find((bank) => bank.cert === inspectedPoint?.cert) ?? null
      : null,
  );

  function inspectPoint(bank: WorkspaceBank, index: number, value: number) {
    inspectedPoint = { cert: bank.cert, index, value };
  }

  function stopInspectingPoint(cert: number, index: number) {
    if (inspectedPoint?.cert === cert && inspectedPoint.index === index) {
      inspectedPoint = null;
    }
  }

  function activatePoint(bank: WorkspaceBank, index: number, value: number) {
    inspectPoint(bank, index, value);
    onFocus(bank.cert);
    onCursor(index);
  }

  function activatePointFromKeyboard(
    event: KeyboardEvent,
    bank: WorkspaceBank,
    index: number,
    value: number,
  ) {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    activatePoint(bank, index, value);
  }

  $effect(() => {
    safeCursorIndex;
    void tick().then(() => {
      historyElement
        ?.querySelector<HTMLElement>('tr[data-current="true"]')
        ?.scrollIntoView({ block: "nearest", inline: "nearest" });
    });
  });

  function x(index: number) {
    return (
      plot.left +
      (index / Math.max(pointCount - 1, 1)) * (width - plot.left - plot.right)
    );
  }
  function y(value: number) {
    return (
      plot.top +
      ((max + span * 0.08 - value) / (span * 1.16)) *
        (height - plot.top - plot.bottom)
    );
  }
  function path(bank: WorkspaceBank) {
    let drawing = false;
    return dates
      .map((period, index) => {
        const value = plottedValue(bank, period);
        if (value == null) {
          drawing = false;
          return "";
        }
        const command = drawing ? "L" : "M";
        drawing = true;
        return `${command} ${x(index)} ${y(value)}`;
      })
      .join(" ");
  }
  function areaPath(bank: WorkspaceBank) {
    const segments: Array<Array<{ index: number; value: number }>> = [];
    let segment: Array<{ index: number; value: number }> = [];
    dates.forEach((period, index) => {
      const value = plottedValue(bank, period);
      if (value === null) {
        if (segment.length) segments.push(segment);
        segment = [];
      } else {
        segment.push({ index, value });
      }
    });
    if (segment.length) segments.push(segment);
    const baseline = height - plot.bottom;
    return segments
      .filter((items) => items.length >= 2)
      .map(
        (items) =>
          `M ${x(items[0].index)} ${baseline} ${items
            .map((item) => `L ${x(item.index)} ${y(item.value)}`)
            .join(" ")} L ${x(items.at(-1)!.index)} ${baseline} Z`,
      )
      .join(" ");
  }
  function axisValue(value: number) {
    return scale === "index" ? `${value.toFixed(0)}` : formatMetric(value, metric);
  }
  function chooseRangeCursor(event: Event) {
    onCursor(Number((event.currentTarget as HTMLInputElement).value));
  }
</script>

<div class="trend">
  <div class="trend__heading" class:trend__heading--compact={compact}>
    <div>
      <h2>{compact ? definition.label : `${definition.label} across selected banks`}</h2>
      <p>
        {scale === "index" ? "Index · first visible observation = 100" : definition.displayUnit}
        {#if !compact}· select a period or bank to synchronize the workspace{/if}
      </p>
    </div>
    <div class="trend__controls" role="group" aria-label="Chart display">
      <button aria-pressed={kind === "line"} class:active={kind === "line"} type="button" onclick={() => onKind?.("line")}>Line</button>
      <button aria-pressed={kind === "area"} class:active={kind === "area"} type="button" onclick={() => onKind?.("area")}>Area</button>
      <button aria-pressed={scale === "value"} class:active={scale === "value"} type="button" onclick={() => onScale?.("value")}>Value</button>
      <button aria-pressed={scale === "index"} class:active={scale === "index"} type="button" onclick={() => onScale?.("index")}>Index</button>
    </div>
    <div class="trend__legend" role="group" aria-label="Selected banks">
      {#each banks as bank}
        <button
          type="button"
          onclick={() => onFocus(bank.cert)}
          title={`Focus ${bank.name}`}
        >
          <span style={`--bank-color:${bank.color}`}></span>{bank.name.split(
            ",",
          )[0]}
        </button>
      {/each}
    </div>
  </div>
  {#if dates.length > 0 && points.length > 0}
    <div class="trend__chart-scroll">
      <div class="trend__plot" bind:clientWidth={plotWidth}>
        <svg
          class="trend__canvas"
          viewBox={`0 0 ${width} ${height}`}
          role="group"
          aria-label={`${definition.label} history. Select a point to inspect its exact date and value; use the reporting-period control to move every series together.`}
        >
      {#each [0, 0.25, 0.5, 0.75, 1] as fraction}
        {@const lineY = plot.top + fraction * (height - plot.top - plot.bottom)}
        <line
          x1={plot.left}
          x2={width - plot.right}
          y1={lineY}
          y2={lineY}
          class="gridline"
        />
        <text
          x={plot.left - 8}
          y={lineY + 4}
          text-anchor="end"
          class="axis-label"
          >{axisValue(max + span * 0.08 - fraction * span * 1.16)}</text
        >
      {/each}
      {#each dates as period, index}
        {#if index === 0 || index === pointCount - 1 || index % 2 === 1}
          <text
            x={x(index)}
            y={height - 10}
            text-anchor={index === 0 ? "start" : index === pointCount - 1 ? "end" : "middle"}
            class="axis-label">{quarterLabel(period)}</text
          >
        {/if}
      {/each}
      <line
        x1={x(safeCursorIndex)}
        x2={x(safeCursorIndex)}
        y1={plot.top}
        y2={height - plot.bottom}
        class="cursor"
      />
      {#each banks as bank}
        <a
          href="#matrix-title"
          onclick={(event) => {
            event.stopPropagation();
            onFocus(bank.cert);
          }}
          aria-label={`Focus ${bank.name}`}
        >
          {#if kind === "area"}<path
              d={areaPath(bank)}
              fill={bank.color}
              class="area-series"
            />{/if}<path
            d={path(bank)}
            fill="none"
            stroke={bank.color}
            stroke-width="2"
            class="series"
          />
        </a>
        {#each dates as period, index}{@const pointValue = plottedValue(
            bank,
            period,
          )}{#if pointValue != null}<g
              role="button"
              tabindex={index === safeCursorIndex ? 0 : -1}
              onclick={(event) => {
                event.stopPropagation();
                activatePoint(bank, index, pointValue);
              }}
              onkeydown={(event) => activatePointFromKeyboard(event, bank, index, pointValue)}
              onpointerenter={() => inspectPoint(bank, index, pointValue)}
              onpointerleave={(event) => {
                if (event.pointerType === "mouse") stopInspectingPoint(bank.cert, index);
              }}
              onfocus={() => inspectPoint(bank, index, pointValue)}
              onblur={() => stopInspectingPoint(bank.cert, index)}
              aria-label={`${bank.name}, ${quarterLabel(period)}: ${axisValue(pointValue)}${scale === "index" ? " index" : ""}`}
              ><circle
                cx={x(index)}
                cy={y(pointValue)}
                r="10"
                class="point-target"
                fill="transparent"
              /><circle
                cx={x(index)}
                cy={y(pointValue)}
                r={index === safeCursorIndex ? "3.6" : "3"}
                class="point-marker"
                class:cursor-point={index === safeCursorIndex}
                fill={index === safeCursorIndex
                  ? "var(--workspace-bg)"
                  : "transparent"}
                stroke={bank.color}
                stroke-width={index === safeCursorIndex ? "2" : "0"}
                pointer-events="none"
              /></g
            >{/if}{/each}
      {/each}
        </svg>
        {#if inspectedPoint && inspectedBank}
          <div
            class="trend__tooltip"
            class:trend__tooltip--left={x(inspectedPoint.index) > width * 0.62}
            class:trend__tooltip--below={y(inspectedPoint.value) < height * 0.3}
            style={`left:${(x(inspectedPoint.index) / width) * 100}%;top:${(y(inspectedPoint.value) / height) * 100}%`}
            role="tooltip"
          >
            <strong>{formatExactChartDate(dates[inspectedPoint.index])}</strong>
            <span>{inspectedBank.name}</span>
            <b>{axisValue(inspectedPoint.value)}</b>
            <small>{scale === "index" ? "Index · first visible observation = 100" : definition.displayUnit}</small>
          </div>
        {/if}
      </div>
    </div>

    <div class="trend__period">
      <label for="trend-period-slider">Reporting period</label>
      <input
        id="trend-period-slider"
        type="range"
        min="0"
        max={Math.max(pointCount - 1, 0)}
        step="1"
        value={safeCursorIndex}
        aria-valuetext={dates[safeCursorIndex]
          ? quarterLabel(dates[safeCursorIndex])
          : "No period"}
        oninput={chooseRangeCursor}
      />
      <output for="trend-period-slider" class="data-mono">
        {dates[safeCursorIndex]
          ? quarterLabel(dates[safeCursorIndex])
          : "No period"}
      </output>
    </div>

    <details class="trend__data" class:trend__data--compact={compact} open={!compact}>
      <summary>Exact values</summary>
      <div class="trend__history" bind:this={historyElement}>
        <table>
        <caption>
          Exact {definition.label.toLowerCase()} history for selected banks
        </caption>
        <thead>
          <tr>
            <th scope="col">Period</th>
            {#each banks as bank}
              <th scope="col">{bank.name.split(",")[0]}</th>
            {/each}
          </tr>
        </thead>
        <tbody>
          {#each historyRows as row, index}
            <tr
              class:current={index === safeCursorIndex}
              data-current={index === safeCursorIndex}
            >
              <th scope="row">
                <button
                  type="button"
                  aria-current={index === safeCursorIndex ? "date" : undefined}
                  aria-label={`Select ${quarterLabel(row.period)}`}
                  onclick={() => onCursor(index)}
                >{quarterLabel(row.period)}</button>
              </th>
              {#each row.values as item}
                <td>
                  {item.value === null ? "—" : axisValue(item.value)}
                </td>
              {/each}
            </tr>
          {/each}
        </tbody>
        </table>
      </div>
    </details>
  {:else}
    <div class="pane-state">
      <strong>History is still loading.</strong><span
        >Current levels remain available in the cohort table.</span
      >
    </div>
  {/if}
</div>

<style>
  .trend {
    min-width: 0;
    container-type: inline-size;
  }
  .trend__heading {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: flex-start;
    gap: 0.55rem 0.8rem;
    padding: 0.75rem 0.85rem 0.45rem;
    border-bottom: 1px solid var(--workspace-rule);
  }
  .trend__heading--compact {
    padding-block: 0.58rem 0.42rem;
  }
  .trend__heading > div:first-child {
    min-width: 0;
  }
  h2 {
    margin: 0;
    font-size: 13px;
    font-weight: 650;
    color: var(--workspace-ink);
  }
  p {
    margin: 0.16rem 0 0;
    max-width: 62ch;
    color: var(--workspace-muted);
    font-size: 11px;
    line-height: 1.4;
  }
  .trend__legend {
    grid-column: 1 / -1;
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-start;
    gap: 0.25rem 0.65rem;
    max-width: none;
  }
  .trend__controls {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    flex-wrap: wrap;
    gap: 0.2rem;
  }
  .trend__controls button {
    min-height: 26px;
    padding: 0 0.4rem;
    border: 1px solid var(--workspace-rule);
    background: transparent;
    color: var(--workspace-muted);
    font-size: 11px;
    cursor: pointer;
  }
  .trend__controls button.active {
    border-color: var(--workspace-cyan);
    color: var(--workspace-cyan);
  }
  .trend__controls button:focus-visible,
  .trend__legend button:focus-visible,
  .trend__history button:focus-visible {
    outline: 2px solid var(--workspace-cyan);
    outline-offset: 2px;
  }
  .area-series {
    opacity: 0.1;
    pointer-events: none;
  }
  .trend__legend button {
    display: inline-flex;
    align-items: center;
    gap: 0.34rem;
    padding: 2px 0;
    border: 0;
    background: transparent;
    color: var(--workspace-muted);
    font-size: 11px;
    cursor: pointer;
    white-space: nowrap;
  }
  .trend__legend button:hover {
    color: var(--workspace-ink);
  }
  .trend__legend span {
    width: 12px;
    height: 2px;
    background: var(--bank-color);
  }
  .trend__chart-scroll {
    overflow-x: auto;
    overscroll-behavior-inline: contain;
  }
  .trend__plot {
    position: relative;
    width: 100%;
    min-width: 0;
  }
  svg {
    display: block;
    width: 100%;
    height: 236px;
    cursor: crosshair;
    overflow: hidden;
  }
  .trend__canvas {
    display: block;
    width: 100%;
    background: transparent;
    color: inherit;
    cursor: crosshair;
  }
  .trend__tooltip {
    position: absolute;
    z-index: 2;
    display: grid;
    min-width: 150px;
    max-width: min(250px, calc(100% - 16px));
    gap: 2px;
    padding: 0.48rem 0.55rem;
    border: 1px solid var(--workspace-rule);
    background: var(--workspace-bg-elevated);
    color: var(--workspace-ink);
    box-shadow: 0 18px 32px rgba(0, 0, 0, 0.34);
    font-size: 11px;
    line-height: 1.35;
    pointer-events: none;
    transform: translate(12px, -50%);
  }
  .trend__tooltip--left {
    transform: translate(calc(-100% - 12px), -50%);
  }
  .trend__tooltip--below {
    transform: translate(12px, 12px);
  }
  .trend__tooltip--left.trend__tooltip--below {
    transform: translate(calc(-100% - 12px), 12px);
  }
  .trend__tooltip strong,
  .trend__tooltip b {
    font-family: var(--workspace-data-font);
    font-variant-numeric: tabular-nums;
  }
  .trend__tooltip strong {
    color: var(--workspace-cyan);
    font-weight: 600;
  }
  .trend__tooltip span,
  .trend__tooltip small {
    overflow-wrap: anywhere;
    color: var(--workspace-muted);
  }
  .trend__tooltip b {
    margin-top: 2px;
    font-size: 12px;
    font-weight: 650;
  }
  .gridline {
    stroke: var(--workspace-rule-soft);
    stroke-width: 1;
  }
  .axis-label {
    fill: var(--workspace-faint);
    font: 11px var(--workspace-data-font);
  }
  .cursor {
    stroke: var(--workspace-cyan);
    stroke-width: 1;
    stroke-dasharray: 4 4;
  }
  .series {
    cursor: pointer;
  }
  .series:hover {
    stroke-width: 3;
  }
  .point-target {
    opacity: 0;
    cursor: pointer;
  }
  .point-marker:not(.cursor-point) {
    opacity: 0;
  }
  g[role="button"]:hover .point-marker,
  g[role="button"]:focus .point-marker {
    opacity: 1;
    stroke-width: 2;
  }
  .trend__period {
    display: grid;
    grid-template-columns: auto minmax(110px, 1fr) auto;
    align-items: center;
    gap: 0.65rem;
    min-height: 42px;
    padding: 0.45rem 0.85rem;
    border-top: 1px solid var(--workspace-rule-soft);
    border-bottom: 1px solid var(--workspace-rule-soft);
    color: var(--workspace-muted);
    font-size: 11px;
  }
  .trend__period label {
    color: var(--workspace-ink);
    font-weight: 600;
  }
  .trend__period input {
    width: 100%;
    accent-color: var(--workspace-cyan);
    cursor: ew-resize;
  }
  .trend__period input:focus-visible {
    outline: 2px solid var(--workspace-cyan);
    outline-offset: 3px;
  }
  .trend__period output {
    min-width: 4.3rem;
    color: var(--workspace-cyan);
    text-align: end;
  }
  .trend__history {
    max-height: 176px;
    overflow: auto;
    overscroll-behavior: contain;
  }
  .trend__data {
    min-width: 0;
  }
  .trend__data:not(.trend__data--compact) > summary {
    display: none;
  }
  .trend__data--compact {
    border-top: 1px solid var(--workspace-rule-soft);
  }
  .trend__data--compact > summary {
    min-height: 36px;
    display: flex;
    align-items: center;
    padding: 0.35rem 0.85rem;
    color: var(--workspace-muted);
    font: 600 11px/1.35 var(--workspace-data-font);
    cursor: pointer;
    list-style-position: inside;
  }
  .trend__data--compact > summary:hover,
  .trend__data--compact > summary:focus-visible {
    color: var(--workspace-cyan);
  }
  .trend__data--compact > summary:focus-visible {
    outline: 2px solid var(--workspace-cyan);
    outline-offset: -2px;
  }
  table {
    width: 100%;
    min-width: 460px;
    border-collapse: collapse;
    font: 11px var(--workspace-data-font);
    font-variant-numeric: tabular-nums;
  }
  caption {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
    clip-path: inset(50%);
    white-space: nowrap;
  }
  th,
  td {
    padding: 0.36rem 0.55rem;
    border-bottom: 1px solid var(--workspace-rule-soft);
    text-align: end;
    white-space: nowrap;
  }
  thead th {
    position: sticky;
    top: 0;
    z-index: 1;
    background: var(--workspace-bg-elevated);
    color: var(--workspace-muted);
    font-weight: 600;
  }
  th:first-child,
  td:first-child {
    position: sticky;
    left: 0;
    text-align: start;
  }
  tbody th {
    background: var(--workspace-bg);
  }
  tbody tr.current th,
  tbody tr.current td {
    background: var(--workspace-selected);
    color: var(--workspace-ink);
  }
  tbody tr.current th {
    box-shadow: inset 2px 0 0 var(--workspace-cyan);
  }
  .trend__history button {
    min-height: 24px;
    padding: 0 0.2rem;
    border: 0;
    background: transparent;
    color: inherit;
    font: inherit;
    cursor: pointer;
  }
  .trend__history button:hover {
    color: var(--workspace-cyan);
  }
  .pane-state {
    min-height: 220px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    color: var(--workspace-muted);
    font-size: 12px;
  }
  .pane-state strong {
    color: var(--workspace-ink);
  }
  @container (max-width: 520px) {
    .trend__heading {
      grid-template-columns: minmax(0, 1fr);
    }
    .trend__controls {
      justify-content: flex-start;
    }
    .trend__legend {
      grid-column: 1;
    }
  }
  @media (max-width: 760px) {
    .trend__legend {
      margin-top: 0.15rem;
    }
    .trend__canvas {
      min-width: 610px;
    }
    .trend__plot {
      min-width: 610px;
    }
    svg {
      height: 220px;
    }
    .trend__period {
      grid-template-columns: 1fr auto;
    }
    .trend__period input {
      grid-column: 1 / -1;
      grid-row: 2;
    }
  }
</style>
