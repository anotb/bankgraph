<script lang="ts">
  import {
    METRICS,
    formatMetric,
    formatMetricChange,
    metricChange,
    valueAtPeriod,
    type WorkspaceBank,
    type WorkspaceMetric,
  } from "./workspace-data";

  let {
    banks,
    metrics,
    dates,
    period,
    compareWith,
    activeCert,
    activeMetric,
    watchedCerts,
    onFocus,
    onFocusMetric,
    onToggleBank,
    onWatch,
  }: {
    banks: WorkspaceBank[];
    metrics: WorkspaceMetric[];
    dates: string[];
    period: string | null;
    compareWith: string | null;
    activeCert: number | null;
    activeMetric: WorkspaceMetric;
    watchedCerts: number[];
    onFocus: (cert: number) => void;
    onFocusMetric: (cert: number, metric: WorkspaceMetric) => void;
    onToggleBank: (cert: number) => void;
    onWatch: (cert: number) => void;
  } = $props();

  let matrixElement: HTMLDivElement | undefined = $state();
  let canScrollBackward = $state(false);
  let canScrollForward = $state(false);
  let focusedCert = $state<number | null>(null);
  let rowTabStop = $derived(
    banks.some((bank) => bank.cert === focusedCert)
      ? focusedCert
      : banks.some((bank) => bank.cert === activeCert)
        ? activeCert
        : (banks[0]?.cert ?? null),
  );

  function change(bank: WorkspaceBank, metric: WorkspaceMetric): string {
    const start = valueAtPeriod(bank, metric, compareWith);
    const end = valueAtPeriod(bank, metric, period);
    return formatMetricChange(metricChange(start, end, metric), metric);
  }

  function focusRow(cert: number) {
    focusedCert = cert;
    requestAnimationFrame(() => {
      matrixElement
        ?.querySelector<HTMLElement>(`tr[data-bank-cert="${cert}"]`)
        ?.focus();
    });
  }

  function updateScrollState() {
    if (!matrixElement) return;
    canScrollBackward = matrixElement.scrollLeft > 2;
    canScrollForward =
      matrixElement.scrollLeft + matrixElement.clientWidth <
      matrixElement.scrollWidth - 2;
  }

  function scrollMetrics(direction: -1 | 1) {
    if (!matrixElement) return;
    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    matrixElement.scrollBy({
      left: direction * Math.max(220, matrixElement.clientWidth * 0.62),
      behavior: reduceMotion ? "auto" : "smooth",
    });
  }

  $effect(() => {
    metrics.length;
    banks.length;
    if (!matrixElement) return;
    const frame = requestAnimationFrame(updateScrollState);
    const observer = new ResizeObserver(updateScrollState);
    observer.observe(matrixElement);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  });

  function handleRowKeydown(
    event: KeyboardEvent,
    bank: WorkspaceBank,
    index: number,
  ) {
    if (event.target !== event.currentTarget) return;
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onFocus(bank.cert);
      return;
    }
    const nextIndex =
      event.key === "ArrowDown"
        ? Math.min(banks.length - 1, index + 1)
        : event.key === "ArrowUp"
          ? Math.max(0, index - 1)
          : event.key === "Home"
            ? 0
            : event.key === "End"
              ? banks.length - 1
              : -1;
    if (nextIndex < 0 || nextIndex === index) return;
    event.preventDefault();
    focusRow(banks[nextIndex].cert);
  }
</script>

<div class="matrix-navigation" aria-label="Matrix column navigation">
  <span>{metrics.length} measures{canScrollBackward || canScrollForward ? " · scroll for more" : ""}</span>
  <div>
    <button
      type="button"
      disabled={!canScrollBackward}
      aria-label="Show earlier matrix columns"
      onclick={() => scrollMetrics(-1)}
    ><svg viewBox="0 0 16 16" aria-hidden="true"><path d="m10.5 3-5 5 5 5" /></svg></button>
    <button
      type="button"
      disabled={!canScrollForward}
      aria-label="Show later matrix columns"
      onclick={() => scrollMetrics(1)}
    ><svg viewBox="0 0 16 16" aria-hidden="true"><path d="m5.5 3 5 5-5 5" /></svg></button>
  </div>
</div>
<div
  class="matrix"
  role="region"
  aria-label="Bank comparison matrix"
  bind:this={matrixElement}
  onscroll={updateScrollState}
>
  <table
    role="grid"
    aria-label="Exact bank values by selected metric"
    aria-rowcount={banks.length + 1}
    aria-colcount={metrics.length + 3}
    style={`--metric-count:${metrics.length}`}
  >
    <thead>
      <tr>
        <th class="check"><span class="sr-only">Selected</span></th>
        <th class="bank-col">Bank</th>
        {#each metrics as metric}
          {@const definition = METRICS.find((item) => item.id === metric)!}
          <th class:active-column={metric === activeMetric}
            ><button
              type="button"
              aria-pressed={metric === activeMetric}
              onclick={() =>
                onFocusMetric(activeCert ?? banks[0]?.cert ?? 0, metric)}
              ><span>{definition.shortLabel}</span
              ><small>{definition.displayUnit} · comparison change</small
              ></button
            ></th
          >
        {/each}
        <th class="actions"><span class="sr-only">Actions</span></th>
      </tr>
    </thead>
    <tbody>
      {#each banks as bank, index (bank.cert)}
        <tr
          class:active={bank.cert === activeCert}
          data-bank-cert={bank.cert}
          tabindex={bank.cert === rowTabStop ? 0 : -1}
          aria-selected={bank.cert === activeCert}
          aria-label={`${bank.name}, ${bank.city}, ${bank.state}. Use Up and Down Arrow to move between banks; Enter or Space to focus this bank.`}
          onfocus={() => (focusedCert = bank.cert)}
          onkeydown={(event) => handleRowKeydown(event, bank, index)}
          onclick={() => onFocus(bank.cert)}
        >
          <td class="check"
            ><button
              type="button"
              onclick={(event) => {
                event.stopPropagation();
                onToggleBank(bank.cert);
              }}
              aria-label={`Remove ${bank.name} from comparison`}
              ><span style={`--bank-color:${bank.color}`}></span></button
            ></td
          >
          <td class="bank-col"
            ><strong>{bank.name}</strong><small
              >{bank.city}, {bank.state} · FDIC {bank.cert}</small
            ></td
          >
          {#each metrics as metric}
            {@const current = valueAtPeriod(bank, metric, period)}
            {@const delta = change(bank, metric)}
            <td
              class="metric-cell"
              class:active-column={metric === activeMetric}
              ><button
                type="button"
                onclick={(event) => {
                  event.stopPropagation();
                  onFocusMetric(bank.cert, metric);
                }}
                aria-label={`${bank.name}, ${metric}: ${formatMetric(current, metric)}, comparison change ${delta}`}
                ><b>{formatMetric(current, metric)}</b><small
                  class:negative={delta.startsWith("−")}>{delta}</small
                ></button
              ></td
            >
          {/each}
          <td class="actions"
            ><button
              type="button"
              class:watched={watchedCerts.includes(bank.cert)}
              onclick={(event) => {
                event.stopPropagation();
                onWatch(bank.cert);
              }}
              aria-label={watchedCerts.includes(bank.cert)
                ? `Remove ${bank.name} from watchlist`
                : `Watch ${bank.name}`}
              title={watchedCerts.includes(bank.cert)
                ? "Watching"
                : "Add to watchlist"}
              ><svg viewBox="0 0 24 24" aria-hidden="true"
                ><path
                  d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9L12 3Z"
                /></svg
              ></button
            ></td
          >
        </tr>
      {/each}
    </tbody>
  </table>
</div>

<style>
  .matrix-navigation {
    min-height: 34px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    padding: 0.25rem 0.55rem;
    border-bottom: 1px solid var(--workspace-rule-soft);
    color: var(--workspace-faint);
    font: 11px var(--workspace-data-font);
  }
  .matrix-navigation > div {
    display: flex;
    gap: 0.25rem;
  }
  .matrix-navigation button {
    width: 28px;
    height: 26px;
    display: grid;
    place-items: center;
    padding: 0;
    border: 1px solid var(--workspace-rule);
    background: transparent;
    color: var(--workspace-muted);
    cursor: pointer;
  }
  .matrix-navigation button:hover:not(:disabled),
  .matrix-navigation button:focus-visible {
    border-color: var(--workspace-cyan);
    color: var(--workspace-cyan);
  }
  .matrix-navigation button:disabled {
    opacity: 0.35;
    cursor: default;
  }
  .matrix-navigation svg {
    width: 14px;
    height: 14px;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.5;
  }
  .matrix {
    min-width: 0;
    max-height: 358px;
    overflow: auto;
    scrollbar-color: var(--workspace-rule) var(--workspace-bg);
  }
  table {
    width: 100%;
    border-collapse: separate;
    border-spacing: 0;
    min-width: max(760px, calc(270px + var(--metric-count) * 132px));
  }
  th {
    position: sticky;
    top: 0;
    z-index: 2;
    height: 44px;
    padding: 0.4rem 0.55rem;
    background: var(--workspace-bg-elevated);
    border-bottom: 1px solid var(--workspace-rule);
    border-right: 1px solid var(--workspace-rule-soft);
    color: var(--workspace-muted);
    text-align: right;
    font-size: 11px;
    font-weight: 600;
    white-space: nowrap;
  }
  th:not(.check):not(.bank-col):not(.actions) {
    min-width: 132px;
  }
  th span,
  th small {
    display: block;
  }
  th small {
    color: var(--workspace-faint);
    font-size: 11px;
    font-weight: 450;
  }
  th.bank-col {
    left: 32px;
    z-index: 4;
    text-align: left;
    min-width: 200px;
  }
  th.check {
    left: 0;
    z-index: 4;
    width: 32px;
  }
  th.actions {
    width: 38px;
  }
  th > button {
    width: 100%;
    padding: 0;
    border: 0;
    background: transparent;
    color: inherit;
    text-align: right;
    cursor: pointer;
  }
  th.active-column {
    box-shadow: inset 0 -2px var(--workspace-cyan);
    color: var(--workspace-cyan);
  }
  td {
    height: 48px;
    padding: 0.42rem 0.55rem;
    border-bottom: 1px solid var(--workspace-rule-soft);
    border-right: 1px solid var(--workspace-rule-soft);
    color: var(--workspace-ink);
    text-align: right;
    font: 11px var(--workspace-data-font);
    white-space: nowrap;
  }
  tbody tr {
    cursor: pointer;
  }
  tbody tr:focus-visible {
    outline: 2px solid var(--workspace-cyan);
    outline-offset: -2px;
  }
  tbody tr:hover td,
  tbody tr.active td {
    background: var(--workspace-selected);
  }
  tbody tr.active td:first-child {
    box-shadow: inset 2px 0 var(--workspace-cyan);
  }
  td.bank-col,
  td.check {
    position: sticky;
    z-index: 1;
    background: var(--workspace-bg);
  }
  td.check {
    left: 0;
  }
  td.bank-col {
    left: 32px;
    text-align: left;
    font-family: var(--workspace-ui-font);
  }
  td.bank-col strong {
    display: block;
    max-width: 210px;
    overflow: hidden;
    text-overflow: ellipsis;
    color: var(--workspace-ink);
    font-size: 11px;
    font-weight: 580;
  }
  td.bank-col small {
    display: block;
    color: var(--workspace-faint);
    font-size: 11px;
  }
  .metric-cell {
    padding: 0;
  }
  .metric-cell > button {
    width: 100%;
    height: 47px;
    padding: 0.42rem 0.55rem;
    border: 0;
    background: transparent;
    color: inherit;
    text-align: right;
    cursor: pointer;
  }
  .metric-cell.active-column > button {
    background: color-mix(in srgb, var(--workspace-cyan) 6%, transparent);
  }
  .metric-cell b,
  .metric-cell small {
    display: block;
  }
  .metric-cell b {
    color: var(--workspace-ink);
    font-weight: 560;
  }
  .metric-cell small {
    color: var(--workspace-positive);
    font-size: 11px;
  }
  .metric-cell small.negative {
    color: var(--workspace-orange);
  }
  .check button,
  .actions button {
    display: inline-grid;
    place-items: center;
    width: 26px;
    height: 26px;
    border: 0;
    background: transparent;
    color: var(--workspace-faint);
    cursor: pointer;
  }
  .check button span {
    width: 9px;
    height: 9px;
    border-radius: 50%;
    background: var(--bank-color);
  }
  .actions button svg {
    width: 14px;
    height: 14px;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.6;
  }
  .actions button:hover,
  .actions button.watched {
    color: var(--workspace-cyan);
  }
  @media (max-width: 720px) {
    .matrix {
      max-height: none;
    }
    th.bank-col,
    td.bank-col {
      min-width: 164px;
    }
    td.bank-col strong {
      max-width: 160px;
    }
  }
  @media (max-width: 720px), (pointer: coarse) {
    th.check,
    td.check,
    th.actions,
    td.actions {
      width: 44px;
      padding-inline: 0;
    }
    th.bank-col,
    td.bank-col {
      left: 44px;
    }
    th > button,
    .check button,
    .actions button {
      min-width: 44px;
      min-height: 44px;
    }
  }
</style>
