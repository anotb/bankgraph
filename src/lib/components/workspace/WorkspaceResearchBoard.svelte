<script lang="ts">
  import { onDestroy, tick, type Snippet } from "svelte";
  import type {
    ResearchAnalysisBlock,
    ResearchBoard,
    ResearchBoardBlock,
    ResearchBoardSpan,
    ResearchExactTableBlock,
    ResearchHistoryBlock,
    ResearchTakeawayBlock,
    ResearchWorkspaceViewBlock,
    WorkspaceAnalysisResult,
    WorkspaceDepth,
  } from "$lib/workspace";
  import type { ResearchMetric } from "$lib/research-metrics";
  import WorkspaceAnalysisResultView from "./WorkspaceAnalysisResult.svelte";
  import WorkspaceFailurePatternResult from "./WorkspaceFailurePatternResult.svelte";

  type AnalysisResolution = WorkspaceAnalysisResult | null | undefined;
  type BoardMoveDirection = "up" | "down";
  type BoardDropSide = "before" | "after";
  type BoardTemplate = { id: string; title: string; description: string };

  let {
    board,
    depth,
    currentCohortHash,
    currentSelectedCerts,
    currentRevision,
    templates,
    renderHistory,
    renderExactTable,
    renderWorkspaceView,
    resolveAnalysis = () => null,
    onAddHistory,
    onAddExactTable,
    onAddPeerDistribution,
    onAddChangeAttribution,
    onAddMetricRelationship,
    onAddHeadquartersGeography,
    onAddEconomicContext,
    onAddBankContext,
    onAddTakeaway,
    onApplyTemplate,
    onAskChatGPT,
    onUpdateTitle,
    onUpdateTakeaway,
    onSetSpan,
    onMove,
    onReorder,
    onRemove,
    onRestore,
    onFocus,
    onRebuildAnalysis,
    onFocusBank,
    onFocusMetric,
  }: {
    board: ResearchBoard;
    depth: WorkspaceDepth;
    currentCohortHash: string;
    currentSelectedCerts: number[];
    currentRevision: number;
    templates: BoardTemplate[];
    renderHistory?: Snippet<[ResearchHistoryBlock]>;
    renderExactTable?: Snippet<[ResearchExactTableBlock]>;
    renderWorkspaceView?: Snippet<[ResearchWorkspaceViewBlock]>;
    /** Return undefined while loading, null when the referenced result is missing. */
    resolveAnalysis?: (block: ResearchAnalysisBlock) => AnalysisResolution;
    onAddHistory: () => void;
    onAddExactTable: () => void;
    onAddPeerDistribution: () => void;
    onAddChangeAttribution: () => void;
    onAddMetricRelationship: () => void;
    onAddHeadquartersGeography: () => void;
    onAddEconomicContext: () => void;
    onAddBankContext: () => void;
    onAddTakeaway: () => void;
    onApplyTemplate: (id: string) => void;
    onAskChatGPT: () => void;
    onUpdateTitle: (id: string, title: string) => void;
    onUpdateTakeaway: (id: string, text: string) => void;
    onSetSpan: (id: string, span: ResearchBoardSpan) => void;
    onMove: (id: string, direction: BoardMoveDirection) => void;
    onReorder: (orderedBlockIds: string[]) => void;
    onRemove: (block: ResearchBoardBlock) => void;
    onRestore: (block: ResearchBoardBlock, index: number) => void;
    onFocus: (id: string | null) => void;
    onRebuildAnalysis: (block: ResearchAnalysisBlock) => void;
    onFocusBank: (cert: number) => void;
    onFocusMetric: (metric: ResearchMetric) => void;
  } = $props();

  let notice = $state("");
  let addMenu = $state<HTMLDetailsElement | null>(null);
  let templateMenu = $state<HTMLDetailsElement | null>(null);
  let removed = $state<{ block: ResearchBoardBlock; index: number } | null>(null);
  let removalTimer: ReturnType<typeof setTimeout> | null = null;
  let draggedBlockId = $state<string | null>(null);
  let dropTargetId = $state<string | null>(null);
  let dropSide = $state<BoardDropSide | null>(null);
  let inspectedBlockId = $state<string | null>(null);
  let inspectReturnFocusId: string | null = null;

  onDestroy(() => {
    if (removalTimer) clearTimeout(removalTimer);
  });

  $effect(() => {
    if (!inspectedBlockId || typeof document === "undefined") return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  });

  function workspaceViewLabel(block: ResearchWorkspaceViewBlock): string {
    if (block.binding.view === "comparison_matrix") return "Comparison matrix";
    if (block.binding.view === "metric_history") return "Metric history";
    if (block.binding.view === "peer_distribution") return "Peer distribution";
    if (block.binding.view === "change_attribution") return "Change attribution";
    if (block.binding.view === "metric_relationship") return "Metric relationship";
    if (block.binding.view === "headquarters_geography") return "Headquarters geography";
    if (block.binding.view === "economic_context") return "Economic context";
    return "Bank context";
  }

  function kindLabel(block: ResearchBoardBlock): string {
    if (block.kind === "history") return "History";
    if (block.kind === "exact_table") return "Exact table";
    if (block.kind === "analysis") return "Analysis";
    if (block.kind === "workspace_view") return workspaceViewLabel(block);
    return "Takeaway";
  }

  function spanLabel(span: ResearchBoardSpan): string {
    if (span === "quarter") return "Quarter";
    if (span === "half") return "Half";
    if (span === "three_quarter") return "Three quarters";
    return "Full";
  }

  function announce(message: string): void {
    notice = "";
    queueMicrotask(() => {
      notice = message;
    });
  }

  function commitTitle(block: ResearchBoardBlock, value: string): void {
    const title = value.trim();
    if (!title || title === block.title) return;
    onUpdateTitle(block.id, title);
    announce(`Renamed view to ${title}.`);
  }

  function addView(action: () => void): void {
    action();
    if (addMenu) addMenu.open = false;
  }

  function applyTemplate(template: BoardTemplate): void {
    onApplyTemplate(template.id);
    if (templateMenu) templateMenu.open = false;
    announce(`${template.title} added to the board.`);
  }

  function commitTakeaway(block: ResearchTakeawayBlock, value: string): void {
    if (value === block.text) return;
    onUpdateTakeaway(block.id, value);
    announce(`Updated ${block.title}.`);
  }

  function setSpan(block: ResearchBoardBlock, span: ResearchBoardSpan): void {
    if (block.span === span) return;
    onSetSpan(block.id, span);
    announce(`${block.title} now uses ${spanLabel(span).toLowerCase()} width.`);
  }

  function moveBlock(block: ResearchBoardBlock, direction: BoardMoveDirection): void {
    onMove(block.id, direction);
    announce(`${block.title} moved ${direction}.`);
  }

  function beginDrag(event: DragEvent, block: ResearchBoardBlock): void {
    draggedBlockId = block.id;
    dropTargetId = null;
    dropSide = null;
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", block.id);
    }
    announce(`Moving ${block.title}.`);
  }

  function previewDrop(event: DragEvent, target: ResearchBoardBlock): void {
    if (!draggedBlockId || draggedBlockId === target.id) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
    const element = event.currentTarget as HTMLElement;
    const bounds = element.getBoundingClientRect();
    dropTargetId = target.id;
    dropSide = event.clientY < bounds.top + bounds.height / 2 ? "before" : "after";
  }

  function finishDrop(event: DragEvent, target: ResearchBoardBlock): void {
    event.preventDefault();
    if (!draggedBlockId || draggedBlockId === target.id || !dropSide) {
      clearDrag();
      return;
    }
    const order = board.blocks.map((block) => block.id).filter((id) => id !== draggedBlockId);
    const targetIndex = order.indexOf(target.id);
    order.splice(targetIndex + (dropSide === "after" ? 1 : 0), 0, draggedBlockId);
    const moved = board.blocks.find((block) => block.id === draggedBlockId);
    onReorder(order);
    if (moved) announce(`${moved.title} moved to position ${order.indexOf(moved.id) + 1}.`);
    clearDrag();
  }

  function clearDrag(): void {
    draggedBlockId = null;
    dropTargetId = null;
    dropSide = null;
  }

  async function inspectBlock(event: MouseEvent, block: ResearchBoardBlock): Promise<void> {
    inspectReturnFocusId = (event.currentTarget as HTMLElement).id;
    onFocus(block.id);
    inspectedBlockId = block.id;
    announce(`${block.title} opened for inspection.`);
    await tick();
    document.getElementById(`research-board-back-${block.id}`)?.focus();
  }

  async function exitInspect(restoreFocus = true): Promise<void> {
    if (!inspectedBlockId) return;
    const block = board.blocks.find((item) => item.id === inspectedBlockId);
    const returnTargetId = inspectReturnFocusId;
    inspectedBlockId = null;
    inspectReturnFocusId = null;
    if (block) announce(`${block.title} returned to the board.`);
    await tick();
    if (restoreFocus && returnTargetId) document.getElementById(returnTargetId)?.focus();
  }

  function handleWindowKeydown(event: KeyboardEvent): void {
    if (event.key !== "Escape" || !inspectedBlockId) return;
    event.preventDefault();
    void exitInspect();
  }

  function handleInspectKeydown(event: KeyboardEvent): void {
    if (event.key !== "Tab") return;
    const panel = event.currentTarget as HTMLElement;
    const controls = Array.from(
      panel.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
      ),
    );
    if (controls.length === 0) return;
    const first = controls[0];
    const last = controls[controls.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  function removeBlock(block: ResearchBoardBlock, index: number): void {
    if (removalTimer) clearTimeout(removalTimer);
    if (inspectedBlockId === block.id) void exitInspect(false);
    removed = { block, index };
    onRemove(block);
    removalTimer = setTimeout(() => {
      removed = null;
      removalTimer = null;
    }, 6_000);
  }

  function restoreRemoved(): void {
    if (!removed) return;
    const item = removed;
    if (removalTimer) clearTimeout(removalTimer);
    removalTimer = null;
    removed = null;
    onRestore(item.block, item.index);
    announce(`${item.block.title} restored.`);
  }

  function handleBlockKeydown(event: KeyboardEvent, block: ResearchBoardBlock, index: number): void {
    if (!event.altKey || (event.key !== "ArrowUp" && event.key !== "ArrowDown")) return;
    const direction = event.key === "ArrowUp" ? "up" : "down";
    if ((direction === "up" && index === 0) || (direction === "down" && index === board.blocks.length - 1)) return;
    event.preventDefault();
    moveBlock(block, direction);
  }

  async function jumpToBlock(id: string): Promise<void> {
    onFocus(id);
    await tick();
    document.getElementById(`research-board-title-${id}`)?.focus();
  }

  function targetBlock(id: string): ResearchBoardBlock | undefined {
    return board.blocks.find((block) => block.id === id);
  }

  function focusFailureMetric(metric: string): void {
    if (metric === "roa") onFocusMetric("roa");
    else if (metric === "npl_ratio") onFocusMetric("nclnlsr");
  }
</script>

<svelte:window onkeydown={handleWindowKeydown} />

<section class="research-board" class:research-board--pro={depth === "pro"} aria-labelledby="research-board-title">
  <header class="research-board__bar">
    <div>
      <h2 id="research-board-title">Research board</h2>
      <p>{board.blocks.length} {board.blocks.length === 1 ? "view" : "views"}</p>
    </div>
    {#if board.blocks.length > 0}
      <div class="research-board__toolbar" aria-label="Research board actions">
        <details class="research-board__menu" bind:this={addMenu}>
          <summary>Add view</summary>
          <div class="research-board__menu-panel" role="group" aria-label="Add a view to the research board">
            <button type="button" onclick={() => addView(onAddHistory)}>History</button>
            <button type="button" onclick={() => addView(onAddExactTable)}>Exact table</button>
            <button type="button" onclick={() => addView(onAddPeerDistribution)}>Peer distribution</button>
            <button type="button" onclick={() => addView(onAddChangeAttribution)}>Change attribution</button>
            <button type="button" onclick={() => addView(onAddMetricRelationship)}>Metric relationship</button>
            <button type="button" onclick={() => addView(onAddHeadquartersGeography)}>Headquarters geography</button>
            <button type="button" onclick={() => addView(onAddEconomicContext)}>Economic context</button>
            <button type="button" onclick={() => addView(onAddBankContext)}>Bank context</button>
            <button type="button" onclick={() => addView(onAddTakeaway)}>Takeaway</button>
          </div>
        </details>
        <details class="research-board__menu" bind:this={templateMenu}>
          <summary>Templates</summary>
          <div class="research-board__menu-panel research-board__template-menu" aria-label="Board templates">
            {#each templates as template (template.id)}
              <button type="button" onclick={() => applyTemplate(template)}>
                <strong>{template.title}</strong>
                <span>{template.description}</span>
              </button>
            {:else}
              <p>No board templates are available yet.</p>
            {/each}
          </div>
        </details>
        <button class="research-board__chatgpt" type="button" onclick={onAskChatGPT}>Build with ChatGPT</button>
      </div>
    {/if}
  </header>

  {#if board.blocks.length === 0}
    <div class="research-board__empty">
      <div class="research-board__empty-copy">
        <h3>Build the board around your question.</h3>
        <p>Start with a research path, add one linked view, or ask ChatGPT to shape the board with you.</p>
      </div>
      <div class="research-board__templates" aria-label="Start from a board template">
        {#each templates as template (template.id)}
          <button type="button" onclick={() => applyTemplate(template)}>
            <strong>{template.title}</strong>
            <span>{template.description}</span>
          </button>
        {:else}
          <p>No board templates are available yet.</p>
        {/each}
      </div>
      <div class="research-board__launcher-actions">
        <details class="research-board__menu" bind:this={addMenu}>
          <summary>Add a view</summary>
          <div class="research-board__menu-panel" role="group" aria-label="Add a view to the research board">
            <button type="button" onclick={() => addView(onAddHistory)}>History</button>
            <button type="button" onclick={() => addView(onAddExactTable)}>Exact table</button>
            <button type="button" onclick={() => addView(onAddPeerDistribution)}>Peer distribution</button>
            <button type="button" onclick={() => addView(onAddChangeAttribution)}>Change attribution</button>
            <button type="button" onclick={() => addView(onAddMetricRelationship)}>Metric relationship</button>
            <button type="button" onclick={() => addView(onAddHeadquartersGeography)}>Headquarters geography</button>
            <button type="button" onclick={() => addView(onAddEconomicContext)}>Economic context</button>
            <button type="button" onclick={() => addView(onAddBankContext)}>Bank context</button>
            <button type="button" onclick={() => addView(onAddTakeaway)}>Takeaway</button>
          </div>
        </details>
        <button type="button" onclick={onAskChatGPT}>Build with ChatGPT</button>
      </div>
    </div>
  {:else}
    <div class="research-board__grid">
      {#each board.blocks as block, index (block.id)}
        {@const inspected = inspectedBlockId === block.id}
        <article
          id={`research-board-block-${block.id}`}
          class:research-block--quarter={block.span === "quarter"}
          class:research-block--half={block.span === "half"}
          class:research-block--three-quarter={block.span === "three_quarter"}
          class:research-block--full={block.span === "full"}
          class:research-block--focused={board.focusedBlockId === block.id}
          class:research-block--inspected={inspected}
          class:research-block--dragging={draggedBlockId === block.id}
          class:research-block--drop-before={dropTargetId === block.id && dropSide === "before"}
          class:research-block--drop-after={dropTargetId === block.id && dropSide === "after"}
          aria-label={`${kindLabel(block)} view: ${block.title}`}
          aria-current={board.focusedBlockId === block.id ? "true" : undefined}
          aria-modal={inspected ? "true" : undefined}
          role={inspected ? "dialog" : "article"}
          onkeydown={inspected ? handleInspectKeydown : undefined}
          ondragover={(event) => previewDrop(event, block)}
          ondrop={(event) => finishDrop(event, block)}
        >
          <header class="research-block__bar">
            {#if !inspected}
              <button
                type="button"
                class="research-block__drag-handle"
                draggable="true"
                aria-label={`Move ${block.title}. Drag to rearrange, or use Alt plus the arrow keys.`}
                title="Drag to rearrange"
                onclick={() => onFocus(block.id)}
                ondragstart={(event) => beginDrag(event, block)}
                ondragend={clearDrag}
                onkeydown={(event) => handleBlockKeydown(event, block, index)}
              >
                <svg aria-hidden="true" viewBox="0 0 16 16">
                  <circle cx="5" cy="4" r="1"></circle><circle cx="11" cy="4" r="1"></circle>
                  <circle cx="5" cy="8" r="1"></circle><circle cx="11" cy="8" r="1"></circle>
                  <circle cx="5" cy="12" r="1"></circle><circle cx="11" cy="12" r="1"></circle>
                </svg>
              </button>
            {/if}
            <div class="research-block__identity">
              <span>{kindLabel(block)}</span>
              <input
                id={`research-board-title-${block.id}`}
                aria-label={`Title for ${kindLabel(block).toLowerCase()} view`}
                value={block.title}
                onblur={(event) => commitTitle(block, event.currentTarget.value)}
                onkeydown={(event) => {
                  if (event.key === "Enter") {
                    event.currentTarget.blur();
                    return;
                  }
                  handleBlockKeydown(event, block, index);
                }}
              />
            </div>
            <div class="research-block__direct-actions" aria-label={`Actions for ${block.title}`}>
              {#if inspected}
                <button id={`research-board-back-${block.id}`} type="button" class="research-block__back" onclick={() => exitInspect()}>Back to board</button>
              {:else}
                <span class="research-block__touch-order" role="group" aria-label={`Reorder ${block.title}`}>
                  <button
                    type="button"
                    aria-label={`Move ${block.title} earlier`}
                    title="Move earlier"
                    disabled={index === 0}
                    onclick={() => moveBlock(block, "up")}
                  >
                    <svg viewBox="0 0 16 16" aria-hidden="true"><path d="m4 10 4-4 4 4"></path></svg>
                  </button>
                  <button
                    type="button"
                    aria-label={`Move ${block.title} later`}
                    title="Move later"
                    disabled={index === board.blocks.length - 1}
                    onclick={() => moveBlock(block, "down")}
                  >
                    <svg viewBox="0 0 16 16" aria-hidden="true"><path d="m4 6 4 4 4-4"></path></svg>
                  </button>
                </span>
                <label class="research-block__size">
                  <span>Size</span>
                  <select
                    aria-label={`Size for ${block.title}`}
                    value={block.span}
                    onchange={(event) => setSpan(block, event.currentTarget.value as ResearchBoardSpan)}
                  >
                    <option value="quarter">Quarter</option>
                    <option value="half">Half</option>
                    <option value="three_quarter">Three quarters</option>
                    <option value="full">Full</option>
                  </select>
                </label>
                <button id={`research-board-inspect-${block.id}`} type="button" class="research-block__inspect" aria-label={`Inspect ${block.title}`} onclick={(event) => inspectBlock(event, block)}>Inspect</button>
              {/if}
              <button class="research-block__remove" type="button" aria-label={`Remove ${block.title}`} title="Remove view" onclick={() => removeBlock(block, index)}>
                <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 4.5h9M6 4.5V3h4v1.5m1.5 0-.5 8H5l-.5-8M6.75 6.5v4m2.5-4v4"></path></svg>
              </button>
            </div>
          </header>

          <div class="research-block__body">
            {#if block.kind === "history"}
              {#if renderHistory}
                {@render renderHistory(block)}
              {:else}
                <div class="research-block__state">This history view is not available.</div>
              {/if}
            {:else if block.kind === "exact_table"}
              {#if renderExactTable}
                {@render renderExactTable(block)}
              {:else}
                <div class="research-block__state">This exact table is not available.</div>
              {/if}
            {:else if block.kind === "workspace_view"}
              {#if renderWorkspaceView}
                {@render renderWorkspaceView(block)}
              {:else}
                <div class="research-block__state">This linked workspace view is not available.</div>
              {/if}
            {:else if block.kind === "analysis"}
              {@const result = resolveAnalysis(block)}
              {#if result === undefined}
                <div class="research-block__state" role="status">Loading analysis…</div>
              {:else if result === null}
                <div class="research-block__missing" role="status">
                  <div>
                    <strong>Saved analysis is unavailable.</strong>
                    <span>Rebuild it from the saved question and population to reconnect this view.</span>
                  </div>
                  <button type="button" onclick={() => onRebuildAnalysis(block)}>Rebuild analysis</button>
                </div>
              {:else}
                <div class="research-block__analysis">
                  {#if result.kind === "failure_pattern"}
                    <WorkspaceFailurePatternResult
                      result={result.result}
                      view={block.binding.view === "event_study" || block.binding.view === "event_trajectories"
                        ? "event-study"
                        : block.binding.view === "analogues" || block.binding.view === "analogue_table"
                          ? "analogues"
                          : "both"}
                      onFocusBank={onFocusBank}
                      onFocusMetric={focusFailureMetric}
                    />
                  {:else}
                    <WorkspaceAnalysisResultView
                      embedded
                      {result}
                      {currentCohortHash}
                      {currentSelectedCerts}
                      {currentRevision}
                      onFocus={onFocusBank}
                      onFocusMetric={onFocusMetric}
                      onClear={() => removeBlock(block, index)}
                    />
                  {/if}
                </div>
              {/if}
            {:else}
              <label class="takeaway-editor">
                <span>Takeaway text</span>
                <textarea aria-label={`Text for ${block.title}`} value={block.text} placeholder="Write the point these views support." onblur={(event) => commitTakeaway(block, event.currentTarget.value)}></textarea>
              </label>
              {#if block.referenceBlockIds.length > 0}
                <nav class="takeaway-references" aria-label={`Views referenced by ${block.title}`}>
                  <span>References</span>
                  {#each block.referenceBlockIds as referenceId}
                    {@const target = targetBlock(referenceId)}
                    {#if target}
                      <button type="button" onclick={() => jumpToBlock(target.id)}>{target.title}</button>
                    {/if}
                  {/each}
                </nav>
              {/if}
            {/if}
          </div>
        </article>
      {/each}
    </div>
  {/if}

  <p class="research-board__live" aria-live="polite" aria-atomic="true">{notice}</p>
  {#if removed}
    <div class="research-board__undo" role="status" aria-live="polite" aria-atomic="true">
      <span>{removed.block.title} removed.</span>
      <button type="button" onclick={restoreRemoved}>Undo</button>
    </div>
  {/if}
</section>

<style>
  .research-board {
    position: relative;
    min-width: 0;
    border: 1px solid var(--workspace-rule, #29404e);
    background: var(--workspace-bg, #06131d);
    color: var(--workspace-ink, #eef5f7);
  }
  .research-board ::selection { background: var(--workspace-cyan, #25cdf5); color: var(--workspace-bg, #06131d); }
  .research-board__bar {
    min-height: 54px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.8rem;
    padding: 0.55rem 0.7rem;
    border-bottom: 1px solid var(--workspace-rule, #29404e);
    background: var(--workspace-bg-elevated, #091a26);
  }
  h2, h3 { margin: 0; font-weight: 650; }
  h2 { font-size: 13px; }
  h3 {
    max-width: 26ch;
    font-size: 14px;
    line-height: 1.35;
    letter-spacing: -0.02em;
    text-wrap: balance;
  }
  .research-board__bar p {
    margin: 0.12rem 0 0;
    color: var(--workspace-muted, #b8c6cc);
    font: 11px/1.4 var(--workspace-data-font, "Geist Mono Variable", "Geist Mono", ui-monospace, monospace);
  }
  button, select, summary {
    border-radius: 0;
    font: 500 11px/1.35 var(--workspace-data-font, "Geist Mono Variable", "Geist Mono", ui-monospace, monospace);
  }
  button {
    min-height: 30px;
    padding: 0.3rem 0.48rem;
    border: 1px solid var(--workspace-rule, #29404e);
    background: transparent;
    color: var(--workspace-muted, #b8c6cc);
    cursor: pointer;
  }
  button:hover, button:focus-visible { border-color: var(--workspace-cyan, #25cdf5); color: var(--workspace-cyan, #25cdf5); }
  button:focus-visible, input:focus-visible, textarea:focus-visible, select:focus-visible, summary:focus-visible, article:focus-visible {
    outline: 2px solid var(--workspace-cyan, #25cdf5);
    outline-offset: 2px;
  }
  button:disabled {
    border-color: var(--workspace-rule-soft, #19313e);
    color: var(--workspace-faint, #93a8b1);
    cursor: not-allowed;
    opacity: 0.5;
  }
  .research-board__toolbar, .research-board__launcher-actions { display: flex; align-items: center; gap: 1px; }
  .research-board__menu { position: relative; }
  .research-board__menu summary {
    min-height: 30px;
    display: flex;
    align-items: center;
    padding: 0.3rem 0.48rem;
    border: 1px solid var(--workspace-rule, #29404e);
    color: var(--workspace-muted, #b8c6cc);
    list-style: none;
    cursor: pointer;
  }
  .research-board__menu summary::-webkit-details-marker { display: none; }
  .research-board__menu[open] summary { border-color: var(--workspace-cyan, #25cdf5); color: var(--workspace-cyan, #25cdf5); }
  .research-board__menu-panel {
    position: absolute;
    top: calc(100% + 1px);
    right: 0;
    z-index: 20;
    min-width: 205px;
    max-height: min(390px, 70vh);
    overflow-y: auto;
    display: grid;
    gap: 1px;
    padding: 1px;
    border: 1px solid var(--workspace-rule, #29404e);
    background: var(--workspace-rule-soft, #19313e);
    box-shadow: 0 18px 32px rgba(0, 0, 0, 0.36);
  }
  .research-board__menu-panel > button { width: 100%; border: 0; background: var(--workspace-bg-elevated, #091a26); text-align: left; }
  .research-board__template-menu { min-width: min(330px, 84vw); }
  .research-board__template-menu button, .research-board__templates button { display: grid; gap: 0.14rem; }
  .research-board__template-menu strong, .research-board__templates strong {
    color: var(--workspace-ink, #eef5f7);
    font-family: Inter, system-ui, sans-serif;
    font-size: 12px;
  }
  .research-board__template-menu span, .research-board__templates span {
    color: var(--workspace-faint, #93a8b1);
    font-family: Inter, system-ui, sans-serif;
    font-size: 11px;
    font-weight: 400;
    line-height: 1.45;
  }
  .research-board__template-menu p {
    margin: 0;
    padding: 0.65rem;
    background: var(--workspace-bg-elevated, #091a26);
    color: var(--workspace-faint, #93a8b1);
    font-size: 11px;
  }
  .research-board__chatgpt { border-color: var(--workspace-cyan, #25cdf5); color: var(--workspace-cyan, #25cdf5); }
  .research-board__empty {
    min-height: 280px;
    display: grid;
    grid-template-columns: minmax(180px, 0.75fr) minmax(260px, 1.25fr);
    gap: 1px;
    background: var(--workspace-rule-soft, #19313e);
  }
  .research-board__empty-copy, .research-board__templates, .research-board__launcher-actions { background: var(--workspace-bg, #06131d); }
  .research-board__empty-copy {
    display: flex;
    flex-direction: column;
    justify-content: center;
    padding: clamp(1rem, 3vw, 2rem);
  }
  .research-board__empty-copy p {
    max-width: 48ch;
    margin: 0.45rem 0 0;
    color: var(--workspace-muted, #b8c6cc);
    font-size: 12px;
    line-height: 1.55;
  }
  .research-board__templates { display: grid; align-content: center; gap: 1px; padding: clamp(0.7rem, 2vw, 1.15rem); }
  .research-board__templates button {
    min-height: 56px;
    padding: 0.62rem 0.7rem;
    border-color: var(--workspace-rule-soft, #19313e);
    background: var(--workspace-bg-elevated, #091a26);
    text-align: left;
  }
  .research-board__templates > p { margin: 0; color: var(--workspace-faint, #93a8b1); font-size: 12px; }
  .research-board__launcher-actions {
    grid-column: 1 / -1;
    display: flex;
    justify-content: flex-end;
    padding: 0.55rem 0.7rem;
    border-top: 1px solid var(--workspace-rule, #29404e);
  }
  .research-board__grid {
    display: grid;
    grid-template-columns: repeat(12, minmax(0, 1fr));
    grid-auto-flow: row;
    align-items: start;
    gap: 0;
    background: var(--workspace-bg, #06131d);
  }
  article {
    min-width: 0;
    container-type: inline-size;
    grid-column: span 6;
    border-right: 1px solid var(--workspace-rule, #29404e);
    border-bottom: 1px solid var(--workspace-rule, #29404e);
    background: var(--workspace-bg, #06131d);
  }
  article.research-block--quarter { grid-column: span 3; }
  article.research-block--half { grid-column: span 6; }
  article.research-block--three-quarter { grid-column: span 9; }
  article.research-block--full { grid-column: span 12; border-right: 0; }
  article.research-block--inspected {
    position: fixed;
    inset: 0;
    z-index: 100;
    display: flex;
    flex-direction: column;
    width: 100vw;
    height: 100dvh;
    border: 0;
    background: var(--workspace-bg, #06131d);
  }
  article.research-block--dragging { opacity: 0.42; }
  article.research-block--drop-before, article.research-block--drop-after { position: relative; }
  article.research-block--drop-before::before, article.research-block--drop-after::after {
    position: absolute;
    left: 0;
    right: 0;
    z-index: 5;
    height: 2px;
    background: var(--workspace-cyan, #25cdf5);
    content: "";
    pointer-events: none;
  }
  article.research-block--drop-before::before { top: -1px; }
  article.research-block--drop-after::after { bottom: -1px; }
  article.research-block--focused, article:focus-within { box-shadow: inset 0 0 0 1px var(--workspace-cyan, #25cdf5); }
  article.research-block--inspected:focus-within { box-shadow: none; }
  .research-block__bar {
    min-height: 48px;
    display: flex;
    align-items: center;
    gap: 0.55rem;
    padding: 0.42rem 0.55rem;
    border-bottom: 1px solid var(--workspace-rule-soft, #19313e);
    background: var(--workspace-bg-elevated, #091a26);
  }
  .research-block__drag-handle { flex: 0 0 30px; width: 30px; padding: 0; cursor: grab; }
  .research-block__drag-handle:active { cursor: grabbing; }
  .research-block__drag-handle svg, .research-block__remove svg { display: block; width: 16px; height: 16px; margin: auto; }
  .research-block__drag-handle svg { fill: currentColor; }
  .research-block__identity {
    flex: 1 1 auto;
    min-width: 8rem;
    display: grid;
    grid-template-columns: auto minmax(7rem, 1fr);
    align-items: center;
    gap: 0.5rem;
  }
  .research-block__identity > span, .takeaway-references > span {
    color: var(--workspace-muted, #b8c6cc);
    font: 500 11px/1.4 var(--workspace-data-font, "Geist Mono Variable", "Geist Mono", ui-monospace, monospace);
  }
  .research-block__identity input {
    min-width: 0;
    height: 30px;
    padding: 0 0.35rem;
    border: 1px solid transparent;
    border-radius: 0;
    background: transparent;
    color: var(--workspace-ink, #eef5f7);
    caret-color: var(--workspace-cyan, #25cdf5);
    text-overflow: ellipsis;
    font: 650 13px/1.4 Inter, system-ui, sans-serif;
  }
  .research-block__identity input:hover, .research-block__identity input:focus {
    border-color: var(--workspace-rule, #29404e);
    background: var(--workspace-bg, #06131d);
  }
  .research-block__direct-actions { flex: 0 0 auto; display: flex; align-items: center; gap: 1px; }
  .research-block__touch-order { display: none; }
  .research-block__size {
    display: flex;
    align-items: center;
    border: 1px solid var(--workspace-rule, #29404e);
    color: var(--workspace-faint, #93a8b1);
    font: 500 10px/1 var(--workspace-data-font, "Geist Mono Variable", "Geist Mono", ui-monospace, monospace);
  }
  .research-block__size > span { padding-left: 0.4rem; }
  .research-block__size select {
    min-height: 28px;
    max-width: 8.5rem;
    padding: 0 1.5rem 0 0.35rem;
    border: 0;
    background: var(--workspace-bg-elevated, #091a26);
    color: var(--workspace-ink, #eef5f7);
    cursor: pointer;
  }
  .research-block__remove { width: 30px; padding: 0; }
  .research-block__remove svg {
    fill: none;
    stroke: currentColor;
    stroke-linecap: square;
    stroke-linejoin: miter;
    stroke-width: 1.25;
  }
  .research-block__remove:hover, .research-block__remove:focus-visible { border-color: var(--workspace-orange, #ff875a); color: var(--workspace-orange, #ff875a); }
  .research-block__body { min-width: 0; }
  .research-block--inspected .research-block__bar {
    position: sticky;
    top: 0;
    z-index: 2;
    min-height: 58px;
    padding-inline: clamp(0.7rem, 2vw, 1.25rem);
    border-bottom-color: var(--workspace-rule, #29404e);
  }
  .research-block--inspected .research-block__body { flex: 1 1 auto; min-height: 0; overflow: auto; }
  .research-block__back { border-color: var(--workspace-cyan, #25cdf5); color: var(--workspace-cyan, #25cdf5); }
  .research-block__state {
    min-height: 132px;
    display: grid;
    place-items: center;
    padding: 0.85rem;
    color: var(--workspace-muted, #b8c6cc);
    font-size: 12px;
  }
  .research-block__missing {
    min-height: 132px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.8rem;
    padding: 0.85rem;
  }
  .research-block__missing strong, .research-block__missing span { display: block; }
  .research-block__missing strong { font-size: 12px; }
  .research-block__missing span {
    max-width: 64ch;
    margin-top: 0.2rem;
    color: var(--workspace-muted, #b8c6cc);
    font-size: 11px;
    line-height: 1.45;
  }
  .research-block__analysis { min-width: 0; overflow: hidden; }
  .takeaway-editor { display: block; padding: 0.65rem; }
  .takeaway-editor > span { display: block; margin-bottom: 0.3rem; color: var(--workspace-muted, #b8c6cc); font-size: 11px; font-weight: 600; }
  .takeaway-editor textarea {
    display: block;
    width: 100%;
    min-height: 118px;
    resize: vertical;
    padding: 0.55rem;
    border: 1px solid var(--workspace-rule, #29404e);
    border-radius: 0;
    background: var(--workspace-bg-elevated, #091a26);
    color: var(--workspace-ink, #eef5f7);
    caret-color: var(--workspace-cyan, #25cdf5);
    font: 12px/1.55 Inter, system-ui, sans-serif;
  }
  .takeaway-editor textarea::placeholder { color: var(--workspace-faint, #93a8b1); }
  .takeaway-references {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 0.35rem;
    padding: 0.45rem 0.65rem 0.65rem;
    border-top: 1px solid var(--workspace-rule-soft, #19313e);
  }
  .takeaway-references button { min-height: 26px; padding: 0.2rem 0.4rem; border-color: var(--workspace-rule-soft, #19313e); color: var(--workspace-cyan, #25cdf5); font-family: Inter, system-ui, sans-serif; }
  .research-board__live {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
    clip-path: inset(50%);
    white-space: nowrap;
  }
  .research-board__undo {
    position: sticky;
    bottom: 0;
    z-index: 30;
    min-height: 42px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.8rem;
    padding: 0.45rem 0.65rem;
    border-top: 1px solid var(--workspace-cyan, #25cdf5);
    background: var(--workspace-bg-elevated, #091a26);
    color: var(--workspace-ink, #eef5f7);
    font-size: 12px;
  }

  @container (max-width: 560px) {
    .research-block__bar {
      align-items: flex-start;
      flex-wrap: wrap;
    }
    .research-block__identity {
      min-width: calc(100% - 2.3rem);
      grid-template-columns: auto minmax(0, 1fr);
    }
    .research-block__direct-actions {
      width: 100%;
      justify-content: flex-end;
      padding-left: 2.25rem;
    }
  }

  @media (min-width: 880px) and (max-width: 1279px) {
    article.research-block--quarter, article.research-block--half { grid-column: span 6; }
    article.research-block--three-quarter, article.research-block--full { grid-column: span 12; border-right: 0; }
  }
  @media (max-width: 879px) {
    .research-board__grid { grid-template-columns: minmax(0, 1fr); }
    article, article.research-block--quarter, article.research-block--half, article.research-block--three-quarter, article.research-block--full {
      grid-column: 1;
      border-right: 0;
    }
    .research-board__empty { grid-template-columns: minmax(0, 1fr); }
    .research-board__empty-copy, .research-board__templates, .research-board__launcher-actions { grid-column: 1; }
    .research-board__empty-copy { min-height: 150px; }
    .research-board__launcher-actions { justify-content: flex-start; }
    .research-block__drag-handle, .research-block__size { display: none; }
    .research-block__touch-order { display: flex; gap: 1px; }
    .research-block__touch-order button { width: 44px; touch-action: manipulation; }
    .research-block__touch-order svg { width: 16px; height: 16px; fill: none; stroke: currentColor; stroke-width: 1.5; }
  }
  @media (max-width: 700px) {
    .research-board__bar { align-items: flex-start; flex-direction: column; }
    .research-board__toolbar { position: relative; width: 100%; flex-wrap: wrap; }
    .research-board__menu { position: static; }
    .research-board__menu-panel {
      left: 0;
      right: 0;
      min-width: 0;
      width: auto;
      max-width: none;
    }
    .research-board__chatgpt { margin-left: auto; }
    .research-block__bar { align-items: flex-start; flex-wrap: wrap; padding: 0.55rem; }
    .research-block__identity { min-width: 100%; grid-template-columns: auto minmax(0, 1fr); }
    .research-block__direct-actions { width: 100%; justify-content: flex-end; padding-left: 0; }
    .research-block--inspected .research-block__identity { min-width: 100%; }
    .research-block--inspected .research-block__direct-actions { padding-left: 0; }
  }
  @media (max-width: 560px) {
    .research-board__menu summary, .research-board__toolbar > button, .research-board__launcher-actions > button,
    .research-block__direct-actions button, .research-block__size, .research-block__size select,
    .research-block__drag-handle, .research-block__missing button { min-height: 44px; }
    .research-block__drag-handle, .research-block__remove { width: 44px; }
    .research-block__missing { align-items: flex-start; flex-direction: column; }
    .research-block__size { flex: 1 1 auto; }
    .research-block__size select { flex: 1 1 auto; max-width: none; }
  }
</style>
