<script lang="ts">
  import type {
    CohortChangeAnalysisResult,
    FinancialCompositionAnalysisResult,
    TemporalPatternAnalysisResult,
    WorkspaceAnalysisResult,
  } from "$lib/workspace";
  import { formatMetric, formatMetricChange, quarterLabel } from "./workspace-data";
  import { researchMetricDefinition, type ResearchMetric } from "$lib/research-metrics";

  type StandardAnalysisResult = Exclude<WorkspaceAnalysisResult, { kind: "failure_pattern" }>;

  let {
    result,
    currentCohortHash,
    currentSelectedCerts,
    currentRevision,
    embedded = false,
    onFocus,
    onFocusMetric,
    onClear,
  }: {
    result: StandardAnalysisResult;
    currentCohortHash: string;
    currentSelectedCerts: number[];
    currentRevision: number;
    embedded?: boolean;
    onFocus: (cert: number) => void;
    onFocusMetric: (metric: ResearchMetric) => void;
    onClear: () => void;
  } = $props();

  let selectedMetric = $state<ResearchMetric | null>(null);
  let transitionMetric = $derived.by(() => {
    if (result.kind !== "cohort_change") return null;
    return result.transition.metrics.find((metric) => metric.metric === selectedMetric)
      ?? result.transition.metrics[0]
      ?? null;
  });
  let isCurrent = $derived.by(() => {
    if (result.population.membershipBasis === "current_workspace_members") {
      return result.population.cohortHash === currentCohortHash;
    }
    if (result.kind !== "financial_composition") return false;
    if (result.population.membershipBasis === "current_selected_bank") {
      return result.memberCerts.length === 1 && currentSelectedCerts.includes(result.memberCerts[0]);
    }
    return result.memberCerts.length === currentSelectedCerts.length
      && result.memberCerts.every((cert, index) => cert === [...currentSelectedCerts].sort((left, right) => left - right)[index]);
  });

  let populationLabel = $derived(
    result.population.membershipBasis === "current_workspace_members"
      ? "current workspace cohort"
      : result.population.membershipBasis === "current_selected_bank"
        ? "selected bank"
        : "current bank selection",
  );

  function value(value: number | null, metric: ResearchMetric): string {
    return value === null ? "—" : formatMetric(value, metric);
  }

  function change(value: number | null, metric: ResearchMetric): string {
    return formatMetricChange(value, metric);
  }

  function resultKindLabel(item: StandardAnalysisResult): string {
    if (item.kind === "cohort_change") return "Cohort change";
    if (item.kind === "temporal_pattern") return "Multi-quarter pattern";
    return "Financial composition";
  }

  function periodLabel(item: StandardAnalysisResult): string {
    if (item.kind === "cohort_change") return `${quarterLabel(item.spec.from)} → ${quarterLabel(item.spec.to)}`;
    if (item.kind === "temporal_pattern") {
      if (item.spec.periodWindow) return `${quarterLabel(item.spec.periodWindow.startPeriod)} → ${quarterLabel(item.spec.periodWindow.endPeriod)}`;
      return `${item.spec.requiredPeriods.length} selected quarters`;
    }
    return item.spec.compareFrom
      ? `${quarterLabel(item.spec.compareFrom)} → ${quarterLabel(item.spec.period)}`
      : quarterLabel(item.spec.period);
  }

  function patternLabel(item: TemporalPatternAnalysisResult): string {
    const pattern = item.spec.pattern;
    if (pattern.kind === "direction_count") return `${pattern.direction} in at least ${pattern.atLeast} intervals`;
    if (pattern.kind === "consecutive_streak") return `${pattern.minimumIntervals}-interval ${pattern.direction} streak`;
    if (pattern.kind === "cumulative_change") return `cumulative change ${pattern.operator} ${pattern.threshold}`;
    if (pattern.kind === "change_acceleration") return `${pattern.direction} in at least ${pattern.atLeast} intervals`;
    return `crossed ${pattern.direction} ${pattern.threshold}`;
  }

  function compositionParts(item: FinancialCompositionAnalysisResult) {
    const snapshot = "to" in item.analysis ? item.analysis.to : item.analysis;
    return [...snapshot.components, snapshot.residual]
      .filter((component) => component.sharePercent !== null)
      .map((component) => ({ id: component.id, label: component.label, share: component.sharePercent! }));
  }

  function trajectory(evaluation: TemporalPatternAnalysisResult["rows"][number]["evaluations"][number]): string {
    const points = evaluation.series.points.filter((point): point is { period: string; value: number } => point.value !== null);
    if (points.length < 2) return "";
    const values = points.map((point) => point.value);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min || 1;
    return points.map((point, index) => {
      const x = (index / (points.length - 1)) * 100;
      const y = 25 - ((point.value - min) / range) * 22;
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    }).join(" ");
  }
</script>

<div class="analysis-result" class:stale={!isCurrent}>
  {#if !embedded}<header>
    <div>
      <div class="analysis-result__identity">
        <span>{resultKindLabel(result)}</span>
        <strong>{result.title}</strong>
      </div>
      <p>
        {periodLabel(result)} · {result.population.analyzedCount.toLocaleString()} {result.population.analyzedCount === 1 ? "bank" : "banks"}
        · {populationLabel}
      </p>
    </div>
    <div class="analysis-result__actions">
      {#if !isCurrent}<span class="analysis-result__stale">Workspace changed</span>{/if}
      <span>r{result.publishedRevision} / {currentRevision}</span>
      <button type="button" onclick={onClear} aria-label="Remove this analysis from the workspace">Remove</button>
    </div>
  </header>{/if}

  {#if result.kind === "cohort_change"}
    <div class="analysis-result__metric-tabs" role="tablist" aria-label="Analyzed measures">
      {#each result.transition.metrics as metric}
        <button
          type="button"
          role="tab"
          aria-selected={transitionMetric?.metric === metric.metric}
          onclick={() => {
            selectedMetric = metric.metric;
            onFocusMetric(metric.metric);
          }}
        >{metric.label}</button>
      {/each}
    </div>
    {#if transitionMetric}
      <div class="change-summary">
        <div class="breadth" aria-label={`${transitionMetric.breadth.increasing} increased, ${transitionMetric.breadth.decreasing} decreased, ${transitionMetric.breadth.unchanged} unchanged`}>
          <span class="breadth__increase" style={`width:${transitionMetric.breadth.increasingShare}%`}></span>
          <span class="breadth__unchanged" style={`width:${transitionMetric.breadth.unchangedShare}%`}></span>
          <span class="breadth__decrease" style={`width:${transitionMetric.breadth.decreasingShare}%`}></span>
        </div>
        <dl>
          <div><dt>Increased</dt><dd>{transitionMetric.breadth.increasing} · {transitionMetric.breadth.increasingShare.toFixed(1)}%</dd></div>
          <div><dt>Unchanged</dt><dd>{transitionMetric.breadth.unchanged} · {transitionMetric.breadth.unchangedShare.toFixed(1)}%</dd></div>
          <div><dt>Decreased</dt><dd>{transitionMetric.breadth.decreasing} · {transitionMetric.breadth.decreasingShare.toFixed(1)}%</dd></div>
          <div><dt>Paired coverage</dt><dd>{transitionMetric.coverage.paired} / {transitionMetric.coverage.cohort}</dd></div>
          <div><dt>Median change</dt><dd>{change(transitionMetric.distribution.primaryChange.median, transitionMetric.metric)}</dd></div>
          <div><dt>Top 5 movement</dt><dd>{transitionMetric.movement.concentration.top5Share.toFixed(1)}%</dd></div>
        </dl>
      </div>
      {#if transitionMetric.additiveMatchedTotals}
        <div class="matched-totals">
          <span>Matched totals</span>
          <strong>{value(transitionMetric.additiveMatchedTotals.opening, transitionMetric.metric)}</strong>
          <span>→</span>
          <strong>{value(transitionMetric.additiveMatchedTotals.closing, transitionMetric.metric)}</strong>
          <span>{change(transitionMetric.additiveMatchedTotals.percentChange, transitionMetric.metric)}</span>
        </div>
      {/if}
      <div class="analysis-result__split">
        <div class="analysis-table-wrap">
          <table>
            <caption>{transitionMetric.topMovers.interpretation === "metric_movers" ? "Largest metric movers" : "Largest contributors to matched total change"}</caption>
            <thead><tr><th>Bank</th><th>From</th><th>To</th><th>Change</th><th>Gross movement</th></tr></thead>
            <tbody>
              {#each [...transitionMetric.topMovers.increases, ...transitionMetric.topMovers.decreases] as bank}
                <tr>
                  <th><button type="button" onclick={() => onFocus(Number(bank.id))}>{bank.name}</button><small>{bank.state ?? "—"} · FDIC {bank.id}</small></th>
                  <td>{value(bank.opening, transitionMetric.metric)}</td>
                  <td>{value(bank.closing, transitionMetric.metric)}</td>
                  <td class:positive={bank.change > 0} class:negative={bank.change < 0}>{change(bank.primaryChange, transitionMetric.metric)}</td>
                  <td>{bank.shareOfGrossMovement.toFixed(1)}%</td>
                </tr>
              {:else}
                <tr><td colspan="5">No paired bank changed on this measure.</td></tr>
              {/each}
            </tbody>
          </table>
        </div>
        {#if result.transition.groups.length}
          <div class="analysis-table-wrap analysis-table-wrap--groups">
            <table>
              <caption>Movement by {result.spec.groupBy === "state" ? "headquarters state" : "opening asset bucket"}</caption>
              <thead><tr><th>Group</th><th>Banks</th><th>Gross movement</th></tr></thead>
              <tbody>
                {#each result.transition.groups as group}
                  {@const groupMetric = group.metrics.find((metric) => metric.metric === transitionMetric?.metric)}
                  {#if groupMetric}
                    <tr><th>{group.label}</th><td>{groupMetric.paired}</td><td>{groupMetric.shareOfMetricGrossMovement.toFixed(1)}%</td></tr>
                  {/if}
                {/each}
              </tbody>
            </table>
          </div>
        {/if}
      </div>
    {/if}
  {:else if result.kind === "temporal_pattern"}
    <div class="pattern-summary">
      <strong>{patternLabel(result)}</strong>
      <span>{result.counts.matched} matched</span>
      <span>{result.counts.notMatched} did not match</span>
      <span>{result.counts.insufficientData} lacked enough observations</span>
    </div>
    <div class="analysis-table-wrap">
      <table>
        <caption>Matched banks and exact trigger periods</caption>
        <thead><tr><th>Bank</th><th>Measure</th><th>Trajectory</th><th>Triggers</th><th>Coverage</th></tr></thead>
        <tbody>
          {#each result.rows as bank}
            {#each bank.evaluations as evaluation, index}
              <tr>
                {#if index === 0}
                  <th rowspan={bank.evaluations.length}><button type="button" onclick={() => onFocus(bank.cert)}>{bank.name}</button><small>{bank.state ?? "—"} · FDIC {bank.cert}</small></th>
                {/if}
                <td><button type="button" onclick={() => onFocusMetric(evaluation.metric)}>{researchMetricDefinition(evaluation.metric).shortLabel}</button></td>
                <td>
                  {#if trajectory(evaluation)}
                    <svg class="trajectory" viewBox="0 0 100 28" role="img" aria-label={`${researchMetricDefinition(evaluation.metric).label} from ${evaluation.endpoints.start.value ?? "missing"} to ${evaluation.endpoints.end.value ?? "missing"}`}>
                      <line x1="0" y1="26" x2="100" y2="26"></line>
                      <polyline points={trajectory(evaluation)}></polyline>
                    </svg>
                  {:else}—{/if}
                </td>
                <td>{evaluation.triggerPeriods.map(quarterLabel).join(", ") || "—"}</td>
                <td>{evaluation.coverage.observedPeriodCount} / {evaluation.coverage.requiredPeriodCount}</td>
              </tr>
            {/each}
          {:else}
            <tr><td colspan="5">No bank in this cohort matched the declared pattern.</td></tr>
          {/each}
        </tbody>
      </table>
    </div>
  {:else}
    {@const snapshot = "to" in result.analysis ? result.analysis.to : result.analysis}
    {@const parts = compositionParts(result)}
    <div class="composition-summary">
      <div class="composition-bar" aria-label={`${snapshot.label} shares`}>
        {#each parts as part, index}
          <button
            type="button"
            class:residual={part.id.includes("residual") || part.id.includes("difference")}
            style={`width:${Math.max(0, part.share)}%;--part-index:${index}`}
            title={`${part.label}: ${part.share.toFixed(2)}%`}
          ><span>{part.share >= 8 ? `${part.label} ${part.share.toFixed(1)}%` : ""}</span></button>
        {/each}
      </div>
      <p>{result.scopeLabel} · {snapshot.coverage.completeReporters} complete of {snapshot.coverage.distinctReporters} reporters · {snapshot.reconciliation.status.replaceAll("_", " ")}</p>
    </div>
    <div class="analysis-table-wrap">
      <table>
        <caption>{snapshot.label} · ratios of sums over the same complete reporters</caption>
        <thead><tr><th>Component</th>{#if "to" in result.analysis}<th>{quarterLabel(result.spec.compareFrom!)}</th>{/if}<th>{quarterLabel(result.spec.period)}</th>{#if "to" in result.analysis}<th>Share change</th>{/if}<th>Source</th></tr></thead>
        <tbody>
          {#if "to" in result.analysis}
            {#each [...result.analysis.components, result.analysis.residual] as component}
              <tr>
                <th>{component.label}<small>{component.definition}</small></th>
                <td>{component.fromSharePercent === null ? "—" : `${component.fromSharePercent.toFixed(2)}%`}</td>
                <td>{component.toSharePercent === null ? "—" : `${component.toSharePercent.toFixed(2)}%`}</td>
                <td class:positive={component.shareChangePercentagePoints !== null && component.shareChangePercentagePoints > 0} class:negative={component.shareChangePercentagePoints !== null && component.shareChangePercentagePoints < 0}>{component.shareChangePercentagePoints === null ? "—" : `${component.shareChangePercentagePoints > 0 ? "+" : ""}${component.shareChangePercentagePoints.toFixed(2)} pp`}</td>
                <td>{"sourceField" in component ? component.sourceField : "Residual"}</td>
              </tr>
            {/each}
          {:else}
            {#each [...result.analysis.components, result.analysis.residual] as component}
              <tr>
                <th>{component.label}<small>{component.definition}</small></th>
                <td>{component.sharePercent === null ? "—" : `${component.sharePercent.toFixed(2)}%`}</td>
                <td>{"sourceField" in component ? component.sourceField : "Residual"}</td>
              </tr>
            {/each}
          {/if}
        </tbody>
      </table>
    </div>
  {/if}

  {#if !embedded}<footer>
    <span>{isCurrent ? `Matches the ${populationLabel}` : "The cohort or selection changed after this analysis"}</span>
    <span>{result.lineage.sourceAsOf ? `Data through ${quarterLabel(result.lineage.sourceAsOf)}` : "Data period unavailable"}</span>
    <span>{result.id}</span>
  </footer>{/if}
</div>

<style>
  .analysis-result { min-width: 0; color: var(--workspace-ink); background: var(--workspace-bg-elevated); }
  .analysis-result > header { min-height: 54px; display: flex; align-items: center; justify-content: space-between; gap: .8rem; padding: .65rem .8rem; border-bottom: 1px solid var(--workspace-rule); }
  .analysis-result__identity { display: flex; align-items: baseline; gap: .65rem; }
  .analysis-result__identity > span, .analysis-result__actions, footer { color: var(--workspace-muted); font: 500 .69rem/1.4 var(--workspace-data-font); }
  .analysis-result__identity strong { font-size: .88rem; font-weight: 650; }
  header p { margin: .15rem 0 0; color: var(--workspace-muted); font-size: .72rem; }
  .analysis-result__actions { display: flex; align-items: center; gap: .5rem; white-space: nowrap; }
  button { border: 0; border-radius: 0; color: inherit; background: transparent; font: inherit; cursor: pointer; }
  button:hover, button:focus-visible { color: var(--workspace-cyan); }
  .analysis-result__actions button { min-height: 30px; padding: .25rem .45rem; border: 1px solid var(--workspace-rule); }
  .analysis-result__stale { color: var(--workspace-orange); }
  .analysis-result__metric-tabs { display: flex; overflow-x: auto; border-bottom: 1px solid var(--workspace-rule-soft); scrollbar-color: var(--workspace-rule) var(--workspace-bg-elevated); scrollbar-width: thin; }
  .analysis-result__metric-tabs button { flex: 0 0 auto; min-height: 34px; padding: .35rem .7rem; border-right: 1px solid var(--workspace-rule-soft); color: var(--workspace-muted); font: 500 .7rem/1.3 var(--workspace-data-font); }
  .analysis-result__metric-tabs button[aria-selected="true"] { color: var(--workspace-cyan); background: var(--workspace-selected); box-shadow: inset 0 -1px var(--workspace-cyan); }
  .change-summary { padding: .65rem .8rem; border-bottom: 1px solid var(--workspace-rule-soft); }
  .breadth { display: flex; height: 8px; background: var(--workspace-rule-soft); overflow: hidden; }
  .breadth span { min-width: 0; }
  .breadth__increase { background: var(--workspace-positive); }
  .breadth__unchanged { background: var(--workspace-violet); }
  .breadth__decrease { background: var(--workspace-orange); }
  dl { display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); gap: 1px; margin: .5rem 0 0; background: var(--workspace-rule-soft); }
  dl div { min-width: 0; padding: .38rem .45rem; background: var(--workspace-bg-elevated); }
  dt { color: var(--workspace-muted); font-size: 11px; }
  dd { margin: .1rem 0 0; font: 500 .72rem/1.35 var(--workspace-data-font); font-variant-numeric: tabular-nums; }
  .matched-totals, .pattern-summary { display: flex; align-items: center; gap: .65rem; padding: .45rem .8rem; border-bottom: 1px solid var(--workspace-rule-soft); color: var(--workspace-muted); font-size: .7rem; }
  .matched-totals strong { color: var(--workspace-ink); font: 500 .72rem/1.4 var(--workspace-data-font); }
  .analysis-result__split { display: grid; grid-template-columns: minmax(0, 1fr) minmax(250px, .35fr); }
  .analysis-table-wrap {
    min-width: 0;
    max-height: clamp(14rem, calc(100vh - 15rem), 28rem);
    overflow: auto;
    overscroll-behavior: contain;
    scrollbar-color: var(--workspace-rule) var(--workspace-bg-elevated);
    scrollbar-width: thin;
  }
  .analysis-table-wrap + .analysis-table-wrap { border-left: 1px solid var(--workspace-rule); }
  table { width: 100%; min-width: 640px; border-collapse: collapse; font-size: .7rem; }
  caption { padding: .45rem .8rem; text-align: left; color: var(--workspace-muted); border-bottom: 1px solid var(--workspace-rule-soft); }
  th, td { padding: .42rem .55rem; text-align: right; border-bottom: 1px solid var(--workspace-rule-soft); font-variant-numeric: tabular-nums; }
  th:first-child, td:first-child { text-align: left; }
  thead th { position: sticky; top: 0; z-index: 1; color: var(--workspace-muted); background: var(--workspace-bg-elevated); font: 500 .65rem/1.3 var(--workspace-data-font); }
  tbody th { font-weight: 500; }
  tbody th button, tbody td button { padding: 0; text-align: left; }
  tbody small { display: block; margin-top: .1rem; color: var(--workspace-muted); font: 400 .62rem/1.35 var(--workspace-data-font); }
  .positive { color: var(--workspace-positive); }
  .negative { color: var(--workspace-orange); }
  .pattern-summary strong { color: var(--workspace-ink); }
  .pattern-summary span + span { padding-left: .65rem; border-left: 1px solid var(--workspace-rule); }
  .trajectory { display: block; width: 108px; height: 30px; color: var(--workspace-cyan); }
  .trajectory line { stroke: var(--workspace-rule); stroke-width: 1; }
  .trajectory polyline { fill: none; stroke: currentColor; stroke-width: 1.5; vector-effect: non-scaling-stroke; }
  .composition-summary { padding: .65rem .8rem; border-bottom: 1px solid var(--workspace-rule-soft); }
  .composition-bar { display: flex; min-height: 42px; overflow: hidden; background: var(--workspace-rule-soft); }
  .composition-bar button { min-width: 2px; padding: 0 .3rem; overflow: hidden; color: var(--workspace-bg); background: color-mix(in srgb, var(--workspace-cyan) calc(92% - var(--part-index) * 8%), var(--workspace-violet)); border-right: 1px solid var(--workspace-bg-elevated); font: 600 .63rem/1.2 var(--workspace-data-font); white-space: nowrap; }
  .composition-bar button.residual { color: var(--workspace-ink); background: var(--workspace-rule); }
  .composition-summary p { margin: .35rem 0 0; color: var(--workspace-muted); font-size: .68rem; }
  footer { display: flex; flex-wrap: wrap; gap: .45rem 1rem; padding: .45rem .8rem; border-top: 1px solid var(--workspace-rule); }
  .stale { box-shadow: inset 0 1px var(--workspace-orange); }

  @media (max-width: 980px) {
    dl { grid-template-columns: repeat(3, minmax(0, 1fr)); }
    .analysis-result__split { grid-template-columns: 1fr; }
    .analysis-table-wrap + .analysis-table-wrap { border-left: 0; border-top: 1px solid var(--workspace-rule); }
  }
  @media (max-width: 620px) {
    .analysis-result > header { align-items: flex-start; }
    .analysis-result__identity { display: block; }
    .analysis-result__identity > span { display: block; margin-bottom: .15rem; }
    .analysis-result__actions > span:not(.analysis-result__stale) { display: none; }
    dl { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .pattern-summary { align-items: flex-start; flex-wrap: wrap; }
    .pattern-summary strong { width: 100%; }
    .pattern-summary span + span { padding-left: 0; border-left: 0; }
    .composition-bar { min-width: 620px; }
    .composition-summary { overflow-x: auto; }
  }
</style>
