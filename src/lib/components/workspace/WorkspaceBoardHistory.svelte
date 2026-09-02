<script lang="ts">
  import { untrack } from "svelte";
  import type { ResearchHistoryBinding } from "$lib/workspace";
  import { researchMetricDefinition, type ResearchMetric } from "$lib/research-metrics";
  import WorkspaceTrend from "./WorkspaceTrend.svelte";
  import type { WorkspaceBank } from "./workspace-data";

  let {
    banks,
    binding,
    dates,
    onFocus,
    onFocusMetric,
    onPresentation,
  }: {
    banks: WorkspaceBank[];
    binding: ResearchHistoryBinding;
    dates: string[];
    onFocus: (cert: number) => void;
    onFocusMetric: (metric: ResearchMetric) => void;
    onPresentation: (chartKind: "line" | "area", scale: "value" | "index") => void;
  } = $props();

  let selectedMetric = $state<ResearchMetric | null>(untrack(() => binding.metrics[0] ?? null));
  let cursorIndex = $state(0);
  let activeMetric = $derived(
    binding.metrics.includes(selectedMetric as ResearchMetric)
      ? selectedMetric
      : binding.metrics[0] ?? null,
  );

  $effect(() => {
    if (dates.length && cursorIndex >= dates.length) cursorIndex = dates.length - 1;
  });
</script>

<div class="board-history">
  {#if binding.metrics.length > 1}
    <div class="board-history__tabs" role="tablist" aria-label="History measure">
      {#each binding.metrics as metric}
        <button
          type="button"
          role="tab"
          aria-selected={activeMetric === metric}
          onclick={() => {
            selectedMetric = metric;
            onFocusMetric(metric);
          }}
        >{researchMetricDefinition(metric).shortLabel}</button>
      {/each}
    </div>
  {/if}
  {#if activeMetric && banks.length && dates.length}
    <WorkspaceTrend
      {banks}
      metric={activeMetric}
      {dates}
      {cursorIndex}
      kind={binding.chartKind}
      scale={binding.scale}
      compact
      onCursor={(index) => (cursorIndex = index)}
      {onFocus}
      onKind={(kind) => onPresentation(kind, binding.scale)}
      onScale={(scale) => onPresentation(binding.chartKind, scale)}
    />
  {:else}
    <p class="board-history__empty">Reported history is unavailable for this selection and period.</p>
  {/if}
</div>

<style>
  .board-history { min-width: 0; }
  .board-history__tabs { display: flex; overflow-x: auto; border-bottom: 1px solid var(--workspace-rule-soft); scrollbar-width: thin; scrollbar-color: var(--workspace-rule) transparent; }
  .board-history__tabs button { flex: 0 0 auto; min-height: 34px; padding: .35rem .7rem; border: 0; border-right: 1px solid var(--workspace-rule-soft); background: transparent; color: var(--workspace-muted); font: 500 11px/1.35 var(--workspace-data-font); cursor: pointer; }
  .board-history__tabs button[aria-selected="true"] { background: var(--workspace-selected); color: var(--workspace-cyan); box-shadow: inset 0 -1px var(--workspace-cyan); }
  .board-history__tabs button:focus-visible { outline: 2px solid var(--workspace-cyan); outline-offset: -2px; }
  .board-history__empty { min-height: 160px; display: grid; place-items: center; margin: 0; color: var(--workspace-muted); font-size: 12px; }
</style>
