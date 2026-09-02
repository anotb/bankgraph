<script lang="ts">
  import {
    METRICS,
    formatMetric,
    formatMetricExact,
    quarterLabel,
    valueAtPeriod,
    type WorkspaceBank,
    type WorkspaceMetric,
  } from "./workspace-data";
  import {
    createDistributionScale,
    createPeerComparator,
    descendingValueRank,
    positionOnDistributionScale,
    type PeerComparatorResult,
  } from "./workspace-distribution";

  type Observation = { bank: WorkspaceBank; value: number };
  type MarkCluster = {
    items: Observation[];
    position: number;
    lane: number;
  };
  type SelectedLabel = Observation & {
    position: number;
    lane: number;
    anchor: "start" | "center" | "end";
    comparator: PeerComparatorResult;
  };

  const TABLE_ROW_BATCH = 100;

  let {
    cohort,
    selected,
    metric,
    period,
    cursorIndex,
    activeCert,
    onFocus,
  }: {
    cohort: WorkspaceBank[];
    selected: WorkspaceBank[];
    metric: WorkspaceMetric;
    period: string | null;
    cursorIndex: number;
    activeCert: number | null;
    onFocus: (cert: number) => void;
  } = $props();

  function exactValue(bank: WorkspaceBank) {
    if (period) return valueAtPeriod(bank, metric, period);
    const fallback =
      bank.financials[Math.min(cursorIndex, bank.financials.length - 1)];
    return fallback ? valueAtPeriod(bank, metric, fallback.repdte) : null;
  }

  let metricDefinition = $derived(
    METRICS.find((definition) => definition.id === metric) ?? METRICS[0],
  );
  let cohortObservations = $derived(
    cohort
      .map((bank) => ({ bank, value: exactValue(bank) }))
      .filter((item): item is Observation => item.value !== null),
  );
  let peerMode = $derived(cohortObservations.length >= 2);
  let observations = $derived(
    (peerMode
      ? cohortObservations
      : selected
          .map((bank) => ({ bank, value: exactValue(bank) }))
          .filter((item): item is Observation => item.value !== null)
    ).toSorted(
      (a, b) => a.value - b.value || a.bank.name.localeCompare(b.bank.name),
    ),
  );
  let values = $derived(observations.map((item) => item.value));
  let scale = $derived(createDistributionScale(values, metric));
  let min = $derived(values[0] ?? 0);
  let max = $derived(values.at(-1) ?? 1);
  let median = $derived(
    values.length
      ? (values[Math.floor((values.length - 1) / 2)] +
          values[Math.ceil((values.length - 1) / 2)]) /
        2
      : null,
  );
  let q1 = $derived(
    values.length ? values[Math.floor((values.length - 1) * 0.25)] : null,
  );
  let q3 = $derived(
    values.length ? values[Math.ceil((values.length - 1) * 0.75)] : null,
  );

  function position(value: number) {
    return positionOnDistributionScale(value, scale);
  }

  function clusterMarks(items: Observation[]): MarkCluster[] {
    const groups: Array<{
      items: Observation[];
      firstPosition: number;
      position: number;
    }> = [];

    for (const item of items) {
      const itemPosition = position(item.value);
      const current = groups.at(-1);
      if (current && itemPosition - current.firstPosition <= 2.5) {
        current.items.push(item);
        current.position =
          current.items.reduce(
            (sum, member) => sum + position(member.value),
            0,
          ) / current.items.length;
      } else {
        groups.push({
          items: [item],
          firstPosition: itemPosition,
          position: itemPosition,
        });
      }
    }

    const laneEnds: number[] = [];
    return groups.map((group) => {
      let lane = laneEnds.findIndex(
        (lastPosition) => group.position - lastPosition >= 7,
      );
      if (lane < 0) {
        lane = laneEnds.length;
        laneEnds.push(group.position);
      } else {
        laneEnds[lane] = group.position;
      }
      return { items: group.items, position: group.position, lane };
    });
  }

  function layoutSelectedLabels(items: WorkspaceBank[]): SelectedLabel[] {
    const comparatorPeers = observations.map((item) => ({
      key: item.bank.cert,
      value: item.value,
    }));
    const candidates = items
      .map((bank) => ({ bank, value: exactValue(bank) }))
      .filter((item): item is Observation => item.value !== null)
      .map((item) => ({
        ...item,
        position: position(item.value),
        comparator: createPeerComparator(comparatorPeers, {
          key: item.bank.cert,
          value: item.value,
        }),
      }))
      .toSorted(
        (a, b) =>
          a.position - b.position || a.bank.name.localeCompare(b.bank.name),
      );
    const lanes: Array<Array<[number, number]>> = [];

    return candidates.map((item) => {
      const anchor =
        item.position < 24
          ? "start"
          : item.position > 76
            ? "end"
            : "center";
      const interval: [number, number] =
        anchor === "start"
          ? [item.position, Math.min(100, item.position + 30)]
          : anchor === "end"
            ? [Math.max(0, item.position - 30), item.position]
            : [item.position - 15, item.position + 15];
      let lane = lanes.findIndex((entries) =>
        entries.every(
          ([start, end]) => interval[1] + 2 < start || interval[0] - 2 > end,
        ),
      );
      if (lane < 0) {
        lane = lanes.length;
        lanes.push([]);
      }
      lanes[lane].push(interval);
      return { ...item, anchor, lane };
    });
  }

  let markClusters = $derived(clusterMarks(observations));
  let markLaneCount = $derived(
    Math.max(1, ...markClusters.map((cluster) => cluster.lane + 1)),
  );
  let selectedLabels = $derived(layoutSelectedLabels(selected));
  let labelLaneCount = $derived(
    Math.max(1, ...selectedLabels.map((item) => item.lane + 1)),
  );
  let labelTop = $derived(70 + markLaneCount * 30);
  let plotHeight = $derived(labelTop + labelLaneCount * 38 + 32);
  let tableRows = $derived(
    observations.toSorted(
      (a, b) => b.value - a.value || a.bank.name.localeCompare(b.bank.name),
    ),
  );
  let exactRowLimit = $state(TABLE_ROW_BATCH);
  let visibleTableRows = $derived(tableRows.slice(0, exactRowLimit));
  let hiddenTableRowCount = $derived(
    Math.max(0, tableRows.length - visibleTableRows.length),
  );
  let selectedCerts = $derived(new Set(selected.map((bank) => bank.cert)));
  let periodText = $derived(period ? quarterLabel(period) : "Selected period");

  $effect(() => {
    metric;
    period;
    observations.length;
    exactRowLimit = TABLE_ROW_BATCH;
  });

  function focusCluster(cluster: MarkCluster) {
    const activeIndex = cluster.items.findIndex(
      (item) => item.bank.cert === activeCert,
    );
    const nextIndex =
      activeIndex < 0 ? 0 : (activeIndex + 1) % cluster.items.length;
    onFocus(cluster.items[nextIndex].bank.cert);
  }

  function clusterText(cluster: MarkCluster) {
    if (cluster.items.length === 1) {
      const item = cluster.items[0];
      return `${item.bank.name}: ${formatMetric(item.value, metric)}`;
    }
    const low = cluster.items[0].value;
    const high = cluster.items.at(-1)?.value ?? low;
    const activeIndex = cluster.items.findIndex(
      (item) => item.bank.cert === activeCert,
    );
    const nextIndex =
      activeIndex < 0 ? 0 : (activeIndex + 1) % cluster.items.length;
    return `${cluster.items.length} banks from ${formatMetric(low, metric)} to ${formatMetric(high, metric)}. Next: ${cluster.items[nextIndex].bank.name}. Activate again to move through the group.`;
  }

  function exactDisplay(value: number) {
    return formatMetricExact(value, metric);
  }
</script>

<div class="distribution">
  <div class="distribution__head">
    <h2>{peerMode ? "Peer distribution" : "Selected-bank range"}</h2>
    <span title={scale.explanation}
      >{observations.length}
      {peerMode ? "comparable banks" : "selected banks"} · {periodText} · {scale.label}</span
    >
  </div>
  {#if observations.length}
    <p class="scale-note">{scale.explanation}</p>
    <dl
      class="distribution__summary"
      aria-label={`Exact distribution summary for ${metricDefinition.label}, ${periodText}`}
    >
      <div><dt>Q1</dt><dd>{q1 === null ? "—" : exactDisplay(q1)}</dd></div>
      <div><dt>Median</dt><dd>{median === null ? "—" : exactDisplay(median)}</dd></div>
      <div><dt>Q3</dt><dd>{q3 === null ? "—" : exactDisplay(q3)}</dd></div>
      <div><dt>Sample</dt><dd>{observations.length} banks</dd></div>
    </dl>
    <div
      class="distribution__plot"
      style={`min-height:${plotHeight}px`}
      role="group"
      aria-label={`${peerMode ? "Peer distribution" : "Selected bank range"} for ${metricDefinition.label}, ${periodText}. Q1 ${q1 === null ? "unavailable" : exactDisplay(q1)}, median ${median === null ? "unavailable" : exactDisplay(median)}, Q3 ${q3 === null ? "unavailable" : exactDisplay(q3)}, sample ${observations.length} banks, on a ${scale.label.toLowerCase()}`}
    >
      <div class="distribution__axis"></div>
      {#if peerMode && q1 !== null && q3 !== null}<div
          class="distribution__iqr"
          style={`left:${position(q1)}%;width:${Math.max(1, position(q3) - position(q1))}%`}
          title={`Middle 50%: ${formatMetric(q1, metric)} to ${formatMetric(q3, metric)}`}
        ></div>{/if}{#if median !== null}<div
          class="distribution__median"
          style={`left:${position(median)}%;height:${50 + markLaneCount * 30}px`}
        >
          <span>Median</span>
        </div>{/if}
      {#each markClusters as cluster}<button
          class="observation"
          class:selected={cluster.items.some((item) => selectedCerts.has(item.bank.cert))}
          class:active={cluster.items.some((item) => item.bank.cert === activeCert)}
          class:clustered={cluster.items.length > 1}
          type="button"
          style={`left:${cluster.position}%;top:${54 + cluster.lane * 30}px;--bank-color:${cluster.items.find((item) => selectedCerts.has(item.bank.cert))?.bank.color ?? "var(--workspace-violet)"}`}
          onclick={() => focusCluster(cluster)}
          title={clusterText(cluster)}
          aria-label={`Focus ${clusterText(cluster)}`}
          ><i></i>{#if cluster.items.length > 1}<span aria-hidden="true"
              >{cluster.items.length}</span
            >{/if}</button
        >{/each}
      <div class="selected-labels">
        {#each selectedLabels as item}<button
            class:active={item.bank.cert === activeCert}
            class:label--start={item.anchor === "start"}
            class:label--center={item.anchor === "center"}
            class:label--end={item.anchor === "end"}
            class:outside={item.comparator.membership === "off-cohort"}
            class:edge={item.comparator.placement.edge !== null}
            type="button"
            style={`left:${item.position}%;--bank-color:${item.bank.color};top:${labelTop + item.lane * 38}px`}
            onclick={() => onFocus(item.bank.cert)}
            title={`${item.bank.name}: ${formatMetric(item.value, metric)}. ${item.comparator.language.ariaLabel}`}
            aria-label={`Focus ${item.bank.name}, ${formatMetric(item.value, metric)}. ${item.comparator.language.ariaLabel}`}
            ><span aria-hidden="true"></span><b>{item.bank.name}</b><em
              >{formatMetric(item.value, metric)} · {item.comparator.placement.edge ? `${item.comparator.placement.label} · ` : ""}{item.comparator.language.positionLabel}</em
            ></button
          >{/each}
      </div>
      <div class="distribution__range">
        <span>{formatMetric(min, metric)}</span><span
          >{formatMetric(max, metric)}</span
        >
      </div>
    </div>

    <details class="exact-values">
      <summary>
        <span>Exact values and ranks</span>
        <small>{periodText} · {metricDefinition.source}</small>
      </summary>
      <div class="exact-values__scroller">
        <table>
          <caption>
            {peerMode ? "Peer cohort" : "Selected-bank"} values for {metricDefinition.label} in {periodText}. Highest value ranks first.
          </caption>
          <thead>
            <tr>
              <th scope="col">Rank</th>
              <th scope="col">Bank</th>
              <th scope="col">Exact value</th>
            </tr>
          </thead>
          <tbody>
            {#each visibleTableRows as item}<tr
                class:selected={selectedCerts.has(item.bank.cert)}
                class:active={item.bank.cert === activeCert}
              >
                <td>{descendingValueRank(values, item.value)} of {values.length}</td>
                <th scope="row">
                  <button
                    type="button"
                    onclick={() => onFocus(item.bank.cert)}
                    aria-current={item.bank.cert === activeCert ? "true" : undefined}
                  >
                    <span>{item.bank.name}</span>
                    <small>{item.bank.city}, {item.bank.state}</small>
                  </button>
                </th>
                <td>{exactDisplay(item.value)}</td>
              </tr>{/each}
          </tbody>
        </table>
      </div>
      {#if hiddenTableRowCount > 0}
        <button
          class="exact-values__show-all"
          type="button"
          onclick={() => (exactRowLimit = tableRows.length)}
        >Show all {tableRows.length} exact rows</button>
      {/if}
      <p class="exact-values__unit">
        {#if metricDefinition.unit === "usd_thousands"}FDIC reports monetary values in thousands of US dollars; the table expands them to dollars.{:else if metricDefinition.unit === "count"}Values are reported counts.{:else}Values are reported percentages.{/if}
      </p>
    </details>
  {:else}<div class="pane-state" role="status" aria-live="polite">
      <strong>No comparable values for this period.</strong><span
        >Choose another metric or reporting period.</span
      >
    </div>{/if}
</div>

<style>
  .distribution__head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 0.75rem;
    padding: 0.72rem 0.8rem;
    border-bottom: 1px solid var(--workspace-rule);
  }
  h2 {
    margin: 0;
    color: var(--workspace-ink);
    font-size: 13px;
    font-weight: 650;
  }
  .distribution__head span {
    color: var(--workspace-muted);
    font-size: 11px;
    text-align: end;
  }
  .scale-note {
    margin: 0;
    padding: 0.45rem 0.8rem 0;
    color: var(--workspace-faint);
    font-size: 11px;
    line-height: 1.4;
  }
  .distribution__summary {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    margin: 0;
    border-bottom: 1px solid var(--workspace-rule);
  }
  .distribution__summary div {
    min-width: 0;
    padding: 0.42rem 0.55rem;
    border-inline-end: 1px solid var(--workspace-rule-soft);
  }
  .distribution__summary div:last-child {
    border-inline-end: 0;
  }
  .distribution__summary dt,
  .distribution__summary dd {
    margin: 0;
  }
  .distribution__summary dt {
    color: var(--workspace-faint);
    font-size: 11px;
  }
  .distribution__summary dd {
    margin-top: 0.08rem;
    overflow: hidden;
    color: var(--workspace-ink);
    font: 11px var(--workspace-data-font);
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .distribution__plot {
    position: relative;
    overflow: hidden;
  }
  .distribution__axis {
    position: absolute;
    left: 6%;
    right: 6%;
    top: 54px;
    height: 1px;
    background: var(--workspace-rule);
  }
  .distribution__iqr {
    position: absolute;
    top: 47px;
    height: 14px;
    background: color-mix(in srgb, var(--workspace-violet) 22%, transparent);
    border-inline: 1px solid var(--workspace-violet);
  }
  .distribution__median {
    position: absolute;
    top: 12px;
    width: 1px;
    background: var(--workspace-violet);
  }
  .distribution__median span {
    position: absolute;
    inset-inline-start: 5px;
    top: 0;
    color: var(--workspace-violet);
    font: 11px var(--workspace-data-font);
  }
  .observation {
    position: absolute;
    width: 28px;
    height: 28px;
    padding: 0;
    border: 0;
    border-radius: 50%;
    background: transparent;
    color: var(--workspace-bg);
    transform: translate(-14px, -14px);
    cursor: pointer;
  }
  .observation i {
    position: absolute;
    left: 50%;
    top: 50%;
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--workspace-violet);
    opacity: 0.75;
    transform: translate(-50%, -50%);
  }
  .observation span {
    position: absolute;
    inset: 5px;
    display: grid;
    place-items: center;
    border-radius: 50%;
    background: var(--workspace-violet);
    color: var(--workspace-bg);
    font: 11px/1 var(--workspace-data-font);
    font-weight: 700;
  }
  .observation.clustered i {
    display: none;
  }
  .observation:hover i,
  .observation:focus-visible i {
    width: 10px;
    height: 10px;
  }
  .observation:hover span,
  .observation:focus-visible span {
    background: var(--workspace-cyan);
  }
  .observation.selected i,
  .observation.selected span {
    background: var(--bank-color);
    opacity: 1;
  }
  .observation.active {
    outline: 2px solid var(--workspace-cyan);
    outline-offset: 1px;
  }
  .selected-labels button {
    position: absolute;
    display: grid;
    grid-template-columns: 10px minmax(0, 1fr);
    width: clamp(7.5rem, 30%, 11rem);
    min-height: 32px;
    gap: 0 0.35rem;
    border: 0;
    background: transparent;
    color: var(--workspace-muted);
    text-align: start;
    cursor: pointer;
    padding: 0.2rem 0;
  }
  .selected-labels button.label--start {
    transform: translateX(0);
  }
  .selected-labels button.label--center {
    transform: translateX(-50%);
  }
  .selected-labels button.label--end {
    transform: translateX(-100%);
  }
  .selected-labels button > span {
    grid-row: 1/3;
    align-self: center;
    width: 9px;
    height: 9px;
    border: 2px solid var(--bank-color);
    border-radius: 50%;
    background: var(--workspace-bg);
  }
  .selected-labels button b,
  .selected-labels button em {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .selected-labels button b {
    font-size: 11px;
    font-weight: 600;
    line-height: 1.1;
  }
  .selected-labels button em {
    font: 11px var(--workspace-data-font);
    font-style: normal;
    color: var(--workspace-faint);
  }
  .selected-labels button:hover b,
  .selected-labels button:focus-visible b,
  .selected-labels button.active b {
    color: var(--workspace-cyan);
  }
  .selected-labels button.active > span {
    background: var(--bank-color);
  }
  .selected-labels button.outside {
    background: var(--workspace-bg-elevated);
    outline: 1px solid var(--workspace-rule-soft);
    outline-offset: 2px;
  }
  .selected-labels button.edge b {
    color: var(--workspace-orange);
  }
  .distribution__range {
    position: absolute;
    left: 6%;
    right: 6%;
    bottom: 8px;
    display: flex;
    justify-content: space-between;
    color: var(--workspace-faint);
    font: 11px var(--workspace-data-font);
    pointer-events: none;
  }
  .exact-values {
    border-top: 1px solid var(--workspace-rule);
  }
  .exact-values summary {
    min-height: 40px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    padding: 0 0.8rem;
    color: var(--workspace-ink);
    cursor: pointer;
    font-size: 11px;
    font-weight: 600;
  }
  .exact-values summary small {
    color: var(--workspace-faint);
    font: 11px var(--workspace-data-font);
    font-weight: 400;
  }
  .exact-values__scroller {
    max-height: 13rem;
    overflow: auto;
    border-top: 1px solid var(--workspace-rule);
    border-bottom: 1px solid var(--workspace-rule);
    scrollbar-color: var(--workspace-faint) var(--workspace-bg-soft);
  }
  table {
    width: 100%;
    border-collapse: collapse;
    color: var(--workspace-muted);
    font-size: 11px;
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
    padding: 0.3rem 0.55rem;
    border-bottom: 1px solid
      color-mix(in srgb, var(--workspace-rule) 72%, transparent);
    text-align: start;
    vertical-align: middle;
  }
  thead th {
    position: sticky;
    top: 0;
    z-index: 1;
    background: var(--workspace-bg-soft);
    color: var(--workspace-faint);
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  th:first-child,
  td:first-child {
    width: 4.5rem;
    white-space: nowrap;
  }
  th:last-child,
  td:last-child {
    text-align: end;
    white-space: nowrap;
  }
  tbody th {
    padding: 0;
    font-weight: 500;
  }
  tbody th button {
    width: 100%;
    min-height: 38px;
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: flex-start;
    border: 0;
    background: transparent;
    color: inherit;
    text-align: start;
    cursor: pointer;
    padding: 0.3rem 0.55rem;
  }
  tbody th button span,
  tbody th button small {
    max-width: 30ch;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  tbody th button span {
    color: var(--workspace-ink);
  }
  tbody th button small {
    color: var(--workspace-faint);
    font-size: 11px;
  }
  tbody tr.selected {
    background: color-mix(in srgb, var(--workspace-violet) 8%, transparent);
  }
  tbody tr.active {
    background: color-mix(in srgb, var(--workspace-cyan) 12%, transparent);
  }
  tbody th button:hover span,
  tbody th button:focus-visible span,
  tbody tr.active th button span {
    color: var(--workspace-cyan);
  }
  .exact-values__unit {
    margin: 0;
    padding: 0.45rem 0.8rem 0.55rem;
    color: var(--workspace-faint);
    font-size: 11px;
    line-height: 1.4;
  }
  .exact-values__show-all {
    width: 100%;
    min-height: 34px;
    border: 0;
    border-bottom: 1px solid var(--workspace-rule);
    background: transparent;
    color: var(--workspace-cyan);
    font: 11px var(--workspace-data-font);
    cursor: pointer;
  }
  .exact-values__show-all:hover,
  .exact-values__show-all:focus-visible {
    background: var(--workspace-selected);
  }
  .pane-state {
    min-height: 186px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 1rem;
    color: var(--workspace-muted);
    font-size: 11px;
  }
  .pane-state strong {
    color: var(--workspace-ink);
  }
  @media (max-width: 560px) {
    .distribution__head {
      align-items: flex-start;
      flex-direction: column;
      gap: 0.2rem;
    }
    .distribution__head span {
      text-align: start;
    }
    .selected-labels button {
      width: 34%;
    }
    th,
    td {
      padding-inline: 0.4rem;
    }
    tbody th button {
      padding-inline: 0.4rem;
    }
    tbody th button span,
    tbody th button small {
      max-width: 18ch;
    }
  }
  @media (max-width: 720px), (pointer: coarse) {
    .observation {
      width: 44px;
      height: 44px;
      transform: translate(-22px, -22px);
    }
    .selected-labels button,
    .exact-values summary,
    tbody th button,
    .exact-values__show-all {
      min-height: 44px;
    }
  }
</style>
