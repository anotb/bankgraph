<script lang="ts">
  import {
    attributionModeForMetric,
    buildRecordedQuarterBrief,
    inspectReportedMetricChange,
    withWorkspacePeerContext,
    type AdditiveBridge,
    type AttributionMode,
    type MetricChangeInspection,
    type PeerMovement,
    type WorkspaceQuarterBrief,
  } from "./workspace-attribution";
  import { buildWorkspaceEndpointPeerMovement } from "./workspace-cohort";
  import {
    METRICS,
    formatMetric,
    formatMetricChange,
    quarterLabel,
    valueAt,
    type WorkspaceBank,
    type WorkspaceMetric,
  } from "./workspace-data";
  let {
    bank,
    cohort,
    metric,
    cursorIndex,
    period,
    compareWith,
    sourceMode,
    cohortDefinition,
    cohortDefinitionHash,
    cohortHash,
    minimumPeerCount,
    onInspect,
  }: {
    bank: WorkspaceBank | null;
    cohort: WorkspaceBank[];
    metric: WorkspaceMetric;
    cursorIndex: number;
    period: string | null;
    compareWith: string | null;
    sourceMode: "live" | "recorded";
    cohortDefinition: string;
    cohortDefinitionHash: string;
    cohortHash: string;
    minimumPeerCount: number;
    onInspect?: (detail: {
      mode: AttributionMode;
      label: string;
      change: number | null;
      formula: string;
      source: string;
    }) => void;
  } = $props();
  let brief = $state<WorkspaceQuarterBrief | null>(null);
  let status = $state<"idle" | "loading" | "ready" | "error">("idle");
  let errorMessage = $state("");
  let selectedDriver = $state<string | null>(null);
  let mode = $state<AttributionMode>("assets");
  let lastMetric = $state<string | null>(null);
  let reload = $state(0);
  let metricDefinition = $derived(
    METRICS.find((definition) => definition.id === metric) ?? METRICS[0],
  );
  let activeIndex = $derived(
    bank
      ? period
        ? bank.financials.findIndex((row) => row.repdte === period)
        : cursorIndex
      : -1,
  );
  let comparisonIndex = $derived(
    bank && compareWith
      ? bank.financials.findIndex((row) => row.repdte === compareWith)
      : activeIndex - 1,
  );
  let fromRow = $derived(
    bank && comparisonIndex >= 0 ? bank.financials[comparisonIndex] : null,
  );
  let toRow = $derived(
    bank && activeIndex >= 0 ? bank.financials[activeIndex] : null,
  );
  let reportedEndpoints = $derived.by(() => {
    if (!bank || activeIndex < 0 || comparisonIndex < 0)
      return { from: null, to: null };
    return {
      from: valueAt(bank, metric, comparisonIndex),
      to: valueAt(bank, metric, activeIndex),
    };
  });
  $effect(() => {
    if (metric !== lastMetric) {
      mode = attributionModeForMetric(metric);
      lastMetric = metric;
      selectedDriver = null;
    }
  });
  $effect(() => {
    const currentBank = bank;
    const currentCohort = cohort;
    const currentDefinition = cohortDefinition;
    const currentDefinitionHash = cohortDefinitionHash;
    const currentCohortHash = cohortHash;
    const currentMinimumPeerCount = minimumPeerCount;
    const trigger = reload;
    if (!currentBank) {
      brief = null;
      status = "idle";
      return;
    }
    const index = activeIndex;
    if (sourceMode === "recorded") {
      brief = buildRecordedQuarterBrief(currentBank, currentCohort, index, {
        cohortDefinition: currentDefinition,
        cohortDefinitionHash: currentDefinitionHash,
        cohortHash: currentCohortHash,
        minimumPeerCount: currentMinimumPeerCount,
        comparisonFrom: compareWith,
      });
      status = "ready";
      return;
    }
    const to = currentBank.financials[index]?.repdte;
    const from = currentBank.financials[comparisonIndex]?.repdte;
    if (!to || !from) {
      brief = null;
      status = "idle";
      return;
    }
    const controller = new AbortController();
    status = "loading";
    errorMessage = "";
    void (async () => {
      try {
        const response = await fetch(
          `/api/v1/banks/${currentBank.cert}/quarter-brief?from=${from}&to=${to}`,
          { signal: controller.signal },
        );
        if (!response.ok)
          throw new Error(
            response.status === 404
              ? "The bank or reporting period was not found."
              : "The quarter brief could not be loaded.",
          );
        const serverBrief = (await response.json()) as WorkspaceQuarterBrief;
        brief = withWorkspacePeerContext(
          serverBrief,
          currentBank,
          currentCohort,
          index,
          {
            cohortDefinition: currentDefinition,
            cohortDefinitionHash: currentDefinitionHash,
            cohortHash: currentCohortHash,
            minimumPeerCount: currentMinimumPeerCount,
            comparisonFrom: from,
          },
        );
        status = "ready";
      } catch (error) {
        if ((error as Error).name !== "AbortError") {
          brief = null;
          status = "error";
          errorMessage = (error as Error).message;
        }
      }
    })();
    return () => controller.abort();
  });
  let additive = $derived.by((): AdditiveBridge | null => {
    if (!brief?.bridges) return null;
    if (mode === "assets") return brief.bridges.assets;
    if (mode === "funding") return brief.bridges.funding;
    if (mode === "quarterlyNetIncome")
      return brief.bridges.quarterlyNetIncome;
    return null;
  });
  let ratio = $derived(
    brief?.bridges && mode === "loanToDeposit"
      ? brief.bridges.loanToDeposit
      : null,
  );
  let reported = $derived.by((): MetricChangeInspection | null => {
    if (
      mode !== "reportedMetric" ||
      !brief?.bridges ||
      !fromRow ||
      !toRow
    )
      return null;
    return inspectReportedMetricChange(
      metric,
      fromRow,
      toRow,
      brief,
      true,
      reportedEndpoints,
      metric === "loanGrowth" && bank && fromRow && toRow
        ? buildWorkspaceEndpointPeerMovement(
            bank,
            cohort,
            metric,
            fromRow.repdte,
            toRow.repdte,
            minimumPeerCount,
          )
        : undefined,
    );
  });
  let drivers = $derived.by(() => {
    if (additive)
      return [
        ...additive.contributions.filter((item) => item.change !== null),
        ...(additive.residual === null
          ? []
          : [
              {
                key: "residual",
                label: "Reconciled residual",
                from: null,
                to: null,
                change: additive.residual,
                availability: "reported" as const,
              },
            ]),
      ].sort((a, b) => Math.abs(b.change ?? 0) - Math.abs(a.change ?? 0));
    if (ratio)
      return [
        {
          key: "numerator",
          label: "Loan balance effect",
          change: ratio.contributions.numerator,
        },
        {
          key: "denominator",
          label: "Deposit balance effect",
          change: ratio.contributions.denominator,
        },
      ].filter(
        (item): item is { key: string; label: string; change: number } =>
          item.change !== null,
      );
    return [];
  });
  let max = $derived(
    Math.max(...drivers.map((driver) => Math.abs(driver.change ?? 0)), 1),
  );
  let peer = $derived.by((): PeerMovement | null => {
    if (!brief?.peerContext) return null;
    return mode === "assets"
      ? brief.peerContext.assetGrowth
      : mode === "funding"
        ? brief.peerContext.depositGrowth
        : mode === "loanToDeposit"
          ? brief.peerContext.loanToDepositChange
          : null;
  });
  let from = $derived(additive?.from.value ?? ratio?.from ?? null);
  let to = $derived(additive?.to.value ?? ratio?.to ?? null);
  let total = $derived(additive?.totalChange ?? ratio?.totalChange ?? null);
  let displayedFrom = $derived(
    mode === "reportedMetric" ? reportedEndpoints.from : from,
  );
  let displayedTo = $derived(
    mode === "reportedMetric" ? reportedEndpoints.to : to,
  );
  let displayedTotal = $derived(
    mode === "reportedMetric" ? reported?.bankChange ?? null : total,
  );
  let modeHeading = $derived(
    mode === "reportedMetric"
      ? `${metricDefinition.shortLabel}: quarter change`
      : mode === "assets"
        ? "Total assets: quarter change"
        : mode === "funding"
          ? "Deposits and funding: quarter change"
          : mode === "quarterlyNetIncome"
            ? "Net income: quarter change"
            : "Loan-to-deposit ratio: quarter change",
  );
  let modeTabs = $derived.by((): Array<[AttributionMode, string]> => [
    ...(attributionModeForMetric(metric) === "reportedMetric"
      ? ([["reportedMetric", `${metricDefinition.shortLabel} change`]] as Array<
          [AttributionMode, string]
        >)
      : []),
    ["assets", "Assets"],
    ["funding", "Deposits & funding"],
    ["quarterlyNetIncome", "Net income"],
    ["loanToDeposit", "Loan/deposit"],
  ]);
  let formula = $derived(
    mode === "reportedMetric"
      ? metric === "loanGrowth"
        ? "Difference between the two year-over-year net-loan growth rates, each derived from reported balances."
        : `Difference between the two reported ${metricDefinition.shortLabel} values.`
      : mode === "loanToDeposit"
      ? "Exact two-factor Shapley decomposition of 100 × loans ÷ deposits."
      : "Exact difference identity using reported component endpoints.",
  );
  function format(value: number | null) {
    if (value === null) return "—";
    if (mode === "reportedMetric") return formatMetricChange(value, metric);
    if (mode === "loanToDeposit")
      return `${value >= 0 ? "+" : "−"}${Math.abs(value).toFixed(2)} pp`;
    const b = value / 1_000_000;
    return `${value >= 0 ? "+" : "−"}$${Math.abs(b).toFixed(Math.abs(b) < 10 ? 2 : 1)}B`;
  }
  function level(value: number | null) {
    if (value === null) return "—";
    if (mode === "reportedMetric") return formatMetric(value, metric);
    if (mode === "loanToDeposit")
      return `${value.toFixed(2)}%`;
    const b = value / 1_000_000;
    return `$${Math.abs(b).toFixed(Math.abs(b) < 10 ? 2 : 1)}B`;
  }
  function inspect(label: string, change: number | null) {
    selectedDriver = label;
    onInspect?.({
      mode,
      label,
      change,
      formula,
      source: brief?.provenance.source ?? "FDIC BankFind Financials",
    });
  }
  function historyDate(value: string) {
    return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`;
  }
</script>

<div class="attribution" aria-busy={status === "loading"}>
  <div class="attribution__head">
    <div>
      <h2>{modeHeading}</h2>
      <span>{bank?.name ?? "Select a bank"}</span>
    </div>
    <div class="mode-tabs" role="group" aria-label="Attribution measure">
      {#each modeTabs as option}<button
          type="button"
          class:active={mode === option[0]}
          aria-pressed={mode === option[0]}
          onclick={() => {
            mode = option[0];
            selectedDriver = null;
          }}>{option[1]}</button
        >{/each}
    </div>
  </div>
  {#if status === "loading"}<div
      class="pane-state"
      role="status"
      aria-live="polite"
      aria-atomic="true"
    >
      <strong>Loading quarter components…</strong><span
        >The bank and reporting period remain selected.</span
      >
    </div>
  {:else if status === "error"}<div
      class="pane-state"
      role="alert"
      aria-live="assertive"
      aria-atomic="true"
    >
      <strong>{errorMessage}</strong><span
        >Retry the quarter brief. The other views remain available.</span
      ><button type="button" onclick={() => reload++}>Retry</button>
    </div>
  {:else if brief?.comparison.status !== "ok" || !brief?.bridges}<div
      class="pane-state"
      role="status"
      aria-live="polite"
    >
      <strong
        >{brief?.comparison.message ??
          "Select a period with a preceding quarter."}</strong
      ><span>Quarter attribution needs consecutive FDIC reporting dates.</span>
    </div>
  {:else}
    {#if brief.structuralContext?.status === "events_present"}
      <div class="structural-break" role="note">
        <strong>Institution perimeter changed</strong>
        <span>{brief.structuralContext.caution}</span>
        <ul>
          {#each brief.structuralContext.events as event}
            <li><time datetime={historyDate(event.date)}>{historyDate(event.date)}</time> · {event.description}</li>
          {/each}
        </ul>
      </div>
    {:else if brief.structuralContext?.status === "unavailable"}
      <div class="structural-break unavailable" role="note">
        <strong>Structure check unavailable</strong>
        <span>{brief.structuralContext.caution}</span>
      </div>
    {/if}
    {#if mode === "reportedMetric" && reported}
    <div class="bridge-summary">
      <div>
        <span
          >{brief.comparison.from
            ? quarterLabel(brief.comparison.from)
            : "Start"}</span
        ><strong>{level(displayedFrom)}</strong>
      </div>
      <div>
        <span
          >{brief.comparison.to
            ? quarterLabel(brief.comparison.to)
            : "End"}</span
        ><strong>{level(displayedTo)}</strong>
      </div>
      <div>
        <span>{metricDefinition.shortLabel} change</span><strong
          class:negative={(displayedTotal ?? 0) < 0}
          >{format(displayedTotal)}</strong
        >
      </div>
    </div>
    <div class="attribution__body endpoint-body">
      <button
        type="button"
        class="endpoint-evidence"
        class:selected={selectedDriver === metricDefinition.shortLabel}
        onclick={() =>
          inspect(metricDefinition.shortLabel, displayedTotal)}
        aria-label={`Inspect ${metricDefinition.label} endpoint change`}
      >
        <span>
          <strong>{metricDefinition.label}</strong>
          <em
            >{metric === "loanGrowth"
              ? "Year-over-year rates derived from reported net loans"
              : "Reported values at both endpoints"}</em
          >
        </span>
        <b class:negative={(displayedTotal ?? 0) < 0}
          >{format(displayedTotal)}</b
        >
      </button>
      <div class="bridge-meta">
        <span
          >Evidence <b
            >{displayedFrom === null || displayedTo === null
              ? "incomplete"
              : "both endpoints"}</b
          ></span
        ><span
          >Measure <b
            >{reported.unit === "percentage_points"
              ? "percentage-point change"
              : reported.unit.replaceAll("_", " ")}</b
          ></span
        >
      </div>
      {#if reported.peerEvidence}<p>
          {reported.peerEvidence.status === "ok"
            ? `Peer median ${reported.peerMedianChange?.toFixed(2)} pp across ${reported.peerEvidence.peerCount} comparable cohort members.`
            : reported.peerEvidence.warning}
        </p>{/if}
      <p>
        Cohort: {brief.provenance.cohortDefinition}
        ({brief.provenance.cohortMemberCount ?? cohort.length} members; {brief.provenance.cohortHash ?? cohortHash}).
      </p>
      <p>{formula} Source: {brief.provenance.source}.</p>
    </div>
    {:else if drivers.length}
    <div class="bridge-summary">
      <div>
        <span
          >{brief.comparison.from
            ? quarterLabel(brief.comparison.from)
            : "Start"}</span
        ><strong>{level(displayedFrom)}</strong>
      </div>
      <div>
        <span
          >{brief.comparison.to
            ? quarterLabel(brief.comparison.to)
            : "End"}</span
        ><strong>{level(displayedTo)}</strong>
      </div>
      <div>
        <span>Total change</span><strong
          class:negative={(displayedTotal ?? 0) < 0}
          >{format(displayedTotal)}</strong
        >
      </div>
    </div>
    <div class="attribution__body">
      {#each drivers as driver}<button
          type="button"
          class="driver"
          class:selected={selectedDriver === driver.label}
          onclick={() => inspect(driver.label, driver.change)}
          aria-label={`${driver.label}: ${format(driver.change)}`}
          ><div class="driver__label">
            <span>{driver.label}</span><em
              >{driver.key === "residual"
                ? "reconciled residual"
                : mode === "quarterlyNetIncome"
                  ? "reported or derived quarterly flow"
                  : "reported endpoints"}</em
            >
          </div>
          <div class="driver__track">
            <i
              class:negative={(driver.change ?? 0) < 0}
              style={`width:${Math.max(3, (Math.abs(driver.change ?? 0) / max) * 100)}%`}
            ></i>
          </div>
          <strong class:negative={(driver.change ?? 0) < 0}
            >{format(driver.change)}</strong
          ></button
        >{/each}
      <div class="bridge-meta">
        <span
          >Coverage <b
            >{additive
              ? `${Math.round(additive.dataCoverage * 100)}%`
              : ratio?.status === "ok"
                ? "100%"
                : "unavailable"}</b
          ></span
        ><span
          >Reconciliation <b
            >{additive?.reconciliation.replaceAll("_", " ") ??
              ratio?.status.replaceAll("_", " ")}</b
          ></span
        >
      </div>
      {#if peer}<p>
          {peer.status === "ok"
            ? `Peer median ${peer.peerMedian?.toFixed(2)}${mode === "loanToDeposit" ? " pp" : "%"}. Focused bank percentile ${peer.subjectPercentile?.toFixed(0)} of ${peer.peerCount} peers.`
            : peer.warning}
        </p>{/if}
      <p>
        Cohort: {brief.provenance.cohortDefinition}
        ({brief.provenance.cohortMemberCount ?? cohort.length} members; {brief.provenance.cohortHash ?? cohortHash}).
      </p>
      <p>
        {formula} Source: {brief.provenance.source}. {brief.provenance
          .calculationVersion}.
      </p>
    </div>
    {:else}<div class="pane-state" role="status" aria-live="polite">
      <strong>This attribution is unavailable for the selected quarters.</strong
      ><span
        >Choose another measure or period with complete reported fields.</span
      >
    </div>{/if}
  {/if}
</div>

<style>
  .attribution__head {
    display: flex;
    justify-content: space-between;
    gap: 0.5rem;
    padding: 0.65rem 0.8rem;
    border-bottom: 1px solid var(--workspace-rule);
  }
  .structural-break {
    display: grid;
    gap: 0.2rem;
    padding: 0.55rem 0.8rem;
    border-bottom: 1px solid var(--workspace-orange);
    background: color-mix(in srgb, var(--workspace-orange) 9%, transparent);
    color: var(--workspace-muted);
    font-size: 11px;
  }
  .structural-break strong { color: var(--workspace-orange); font-size: 11px; }
  .structural-break ul { margin: 0.15rem 0 0; padding-left: 1rem; }
  .structural-break time { color: var(--workspace-ink); font-family: var(--workspace-data-font); }
  .structural-break.unavailable { border-bottom-color: var(--workspace-rule); background: transparent; }
  .structural-break.unavailable strong { color: var(--workspace-muted); }
  h2 {
    margin: 0;
    color: var(--workspace-ink);
    font-size: 13px;
    font-weight: 650;
  }
  .attribution__head span {
    display: block;
    max-width: 220px;
    margin-top: 0.12rem;
    color: var(--workspace-muted);
    font-size: 11px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .mode-tabs {
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: 2px;
  }
  .mode-tabs button {
    padding: 0.18rem 0.3rem;
    border: 1px solid var(--workspace-rule);
    background: transparent;
    color: var(--workspace-muted);
    font-size: 11px;
    cursor: pointer;
  }
  .mode-tabs button.active {
    border-color: var(--workspace-cyan);
    color: var(--workspace-cyan);
  }
  .bridge-summary {
    display: grid;
    grid-template-columns: 1fr 1fr 1fr;
    border-bottom: 1px solid var(--workspace-rule);
  }
  .bridge-summary div {
    padding: 0.45rem 0.7rem;
    border-right: 1px solid var(--workspace-rule-soft);
  }
  .bridge-summary span,
  .bridge-summary strong {
    display: block;
  }
  .bridge-summary span {
    color: var(--workspace-faint);
    font-size: 11px;
  }
  .bridge-summary strong {
    color: var(--workspace-ink);
    font: 11px var(--workspace-data-font);
  }
  .bridge-summary strong.negative {
    color: var(--workspace-orange);
  }
  .attribution__body {
    padding: 0.55rem 0.8rem;
  }
  .endpoint-body {
    padding-top: 0.7rem;
  }
  .endpoint-evidence {
    display: flex;
    width: 100%;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    padding: 0.55rem 0.6rem;
    border: 1px solid var(--workspace-rule);
    background: transparent;
    text-align: left;
    cursor: pointer;
  }
  .endpoint-evidence:hover,
  .endpoint-evidence.selected {
    border-color: var(--workspace-cyan);
    background: var(--workspace-selected);
  }
  .endpoint-evidence span,
  .endpoint-evidence strong,
  .endpoint-evidence em {
    display: block;
  }
  .endpoint-evidence strong {
    color: var(--workspace-ink);
    font-size: 11px;
    font-weight: 600;
  }
  .endpoint-evidence em {
    margin-top: 0.12rem;
    color: var(--workspace-faint);
    font-size: 11px;
    font-style: normal;
  }
  .endpoint-evidence > b {
    color: var(--workspace-cyan);
    font: 11px var(--workspace-data-font);
    white-space: nowrap;
  }
  .endpoint-evidence > b.negative {
    color: var(--workspace-orange);
  }
  .driver {
    display: grid;
    width: 100%;
    grid-template-columns: minmax(110px, 1fr) minmax(70px, 1.25fr) auto;
    gap: 0.55rem;
    align-items: center;
    padding: 0.35rem 0;
    border: 0;
    border-bottom: 1px solid var(--workspace-rule-soft);
    background: transparent;
    text-align: left;
    cursor: pointer;
  }
  .driver:hover,
  .driver.selected {
    background: var(--workspace-selected);
  }
  .driver__label span {
    display: block;
    color: var(--workspace-ink);
    font-size: 11px;
  }
  .driver__label em {
    display: block;
    color: var(--workspace-faint);
    font-size: 11px;
    font-style: normal;
  }
  .driver__track {
    height: 6px;
    background: var(--workspace-rule-soft);
  }
  .driver__track i {
    display: block;
    height: 100%;
    background: var(--workspace-cyan);
  }
  .driver__track i.negative {
    background: var(--workspace-orange);
  }
  .driver > strong {
    min-width: 58px;
    text-align: right;
    color: var(--workspace-cyan);
    font: 11px var(--workspace-data-font);
  }
  .driver > strong.negative {
    color: var(--workspace-orange);
  }
  .bridge-meta {
    display: flex;
    gap: 1rem;
    margin-top: 0.55rem;
    color: var(--workspace-muted);
    font-size: 11px;
  }
  .bridge-meta b {
    color: var(--workspace-ink);
    font-weight: 550;
  }
  p {
    margin: 0.5rem 0 0;
    color: var(--workspace-muted);
    font-size: 11px;
    line-height: 1.45;
  }
  .pane-state {
    min-height: 190px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 1rem;
    text-align: center;
    color: var(--workspace-muted);
    font-size: 11px;
  }
  .pane-state strong {
    color: var(--workspace-ink);
    font-size: 11px;
  }
  .pane-state button {
    margin-top: 0.6rem;
    padding: 0.3rem 0.55rem;
    border: 1px solid var(--workspace-rule);
    background: transparent;
    color: var(--workspace-cyan);
    cursor: pointer;
  }
  @media (max-width: 520px) {
    .attribution__head {
      display: block;
    }
    .mode-tabs {
      justify-content: flex-start;
      margin-top: 0.5rem;
    }
    .driver {
      grid-template-columns: 1fr auto;
    }
    .driver__track {
      grid-column: 1/3;
    }
  }
  @media (max-width: 720px), (pointer: coarse) {
    .mode-tabs button,
    .endpoint-evidence,
    .driver,
    .pane-state button {
      min-height: 44px;
    }
    .mode-tabs button,
    .pane-state button {
      padding-inline: 0.65rem;
    }
  }
</style>
