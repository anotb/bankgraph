<script lang="ts">
	import { Board } from './board.svelte';
	import type { ResearchBoardBlock } from '$lib/workspace/types';
	import type { ViewRole } from './layout';
	import BlockContent from './BlockContent.svelte';
	import { quarterLabel, shortBankName } from '$lib/atlas/format';
	import { metricShort } from '$lib/atlas/engine/metrics';
	import { effective, followsWorkspace, resolveAnchorConfiguration } from './views/util';

	interface Sibling { id: string; span: number }
	let { block, role, span, siblings = [], tall = false }: { block: ResearchBoardBlock; role: ViewRole; span: number; siblings?: Sibling[]; tall?: boolean } = $props();
	const board = Board.use();
	let menu = $state<'size' | 'keep' | 'more' | null>(null);
	let renaming = $state(false);
	let resizing = $state(false);
	let startX = 0, startSpan = 6, startNeighbor = 0, colWidth = 100;
	let el: HTMLElement | undefined = $state();

	let anchorConfig = $derived(resolveAnchorConfiguration(board, block));
	let pins = $derived({
		...(anchorConfig.bankSource === 'fixed' ? { certs: anchorConfig.certs } : {}),
		...(anchorConfig.metricSource === 'fixed' ? { metrics: anchorConfig.metrics } : {}),
		...(anchorConfig.periodSource === 'fixed' ? { asOf: anchorConfig.asOf, compareWith: anchorConfig.compareWith } : {})
	});
	let follows = $derived(followsWorkspace(board, block));
	let ownData = $derived(!follows || Boolean(pins.asOf || pins.compareWith || pins.certs?.length || pins.metrics?.length));
	let selected = $derived(board.state.board.focusedBlockId === block.id);
	let full = $derived(span >= 12);
	let needs = $derived(board.blockNeeds(block));
	const MIN = 3, COLS = 12;
	let index = $derived(siblings.findIndex((s) => s.id === block.id));
	let neighbor = $derived(index >= 0 ? siblings[index + 1] ?? null : null);
	let others = $derived(siblings.filter((s) => s.id !== block.id && s.id !== neighbor?.id).reduce((a, s) => a + s.span, 0));

	function dragstart(e: DragEvent) { e.dataTransfer?.setData('text/atlas-block', block.id); e.dataTransfer!.effectAllowed = 'move'; document.body.classList.add('dragging'); }
	function dragend() { document.body.classList.remove('dragging'); }
	function resizeStart(e: PointerEvent) {
		if (!el) return;
		resizing = true; startX = e.clientX; startSpan = span; startNeighbor = neighbor?.span ?? 0;
		colWidth = (el.parentElement!.parentElement!.getBoundingClientRect().width + 12) / 12;
		(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
	}
	/** The gutter trades columns with the neighbor to the right; a plate at the row's end resizes against the free space. */
	function resizeMove(e: PointerEvent) {
		if (!resizing) return;
		const delta = Math.round((e.clientX - startX) / colWidth);
		if (neighbor) {
			const pair = startSpan + startNeighbor;
			const next = Math.max(MIN, Math.min(pair - MIN, startSpan + delta));
			if (next !== span) board.setSpans([{ id: block.id, span: next }, { id: neighbor.id, span: pair - next }]);
		} else {
			const next = Math.max(MIN, Math.min(COLS - others, startSpan + delta));
			if (next !== span) board.setSpan(block.id, next);
		}
	}
	function resizeEnd() { resizing = false; }
	function subtitle(): string {
		if (block.kind === 'history' && !block.binding.certs.length) return '';
		if (block.kind === 'history') {
			const scope = effective(board, block);
			return `${quarterLabel(scope.from)} – ${quarterLabel(scope.to)}`;
		}
		if (block.kind === 'exact_table' && !follows && !block.binding.followCurrent && block.binding.from) {
			const scope = effective(board, block);
			return `${quarterLabel(scope.from)} – ${quarterLabel(scope.to)}`;
		}
		return '';
	}
	function useBoardData() {
		board.setOverride(block.id, { followWorkspace: true, pins: undefined });
		menu = null;
	}
	function keepOwnData() {
		const scope = effective(board, block);
		board.setOverride(block.id, {
			followWorkspace: false,
			pins: { certs: [...scope.certs], metrics: [...scope.metrics], asOf: scope.asOf, compareWith: scope.compareWith }
		});
	}
	function size(kind: 'primary' | 'beside' | 'row') {
		const partner = neighbor ?? (index > 0 ? siblings[index - 1] : null);
		if (kind === 'row') board.setSpans([{ id: block.id, span: COLS, strip: null }]);
		else if (partner && siblings.length === 2) board.setSpans([{ id: block.id, span: kind === 'primary' ? 8 : 4 }, { id: partner.id, span: kind === 'primary' ? 4 : 8 }]);
		else board.setSpan(block.id, kind === 'primary' ? 8 : 4);
		menu = null;
	}
	const NEED_TEXT = { banks: 'This view needs a bank.', cohort: 'This view needs a cohort of five or more banks.' } as const;
	const NEED_ACTION = { banks: 'Add a bank', cohort: 'Define the cohort' } as const;
</script>

<svelte:window onclick={(e) => { if (menu && !(e.target as HTMLElement).closest(`[data-block="${block.id}"] .tools`)) menu = null; }} />

<article bind:this={el} class="plate block" class:tall class:composing={board.composingIds.has(block.id)} class:selected class:full data-block={block.id} tabindex="-1">
	<header class="bh">
		<span class="grip" draggable="true" ondragstart={dragstart} ondragend={dragend} title="Drag to move" aria-hidden="true">⋮⋮</span>
		{#if renaming}
			<input class="rename" value={block.title} onblur={(e) => { board.renameBlock(block.id, e.currentTarget.value); renaming = false; }} onkeydown={(e) => e.key === 'Enter' && (e.currentTarget as HTMLInputElement).blur()} aria-label="View title" />
		{:else}
			<button type="button" class="title" onclick={() => board.select(selected ? null : block.id)} ondblclick={() => (renaming = true)} title="Select this view; double-click to rename">{block.title || 'Untitled view'}</button>
		{/if}
		{#if subtitle()}<span class="u">{subtitle()}</span>{/if}
		<div class="tools" role="toolbar" aria-label="View controls">
			<div class="mw"><button type="button" class="tool" aria-expanded={menu === 'size'} onclick={() => (menu = menu === 'size' ? null : 'size')} title="Size and placement">{full ? 'Full row' : span >= 8 ? 'Primary' : 'Beside'}</button>
				{#if menu === 'size'}<div class="pop mn"><button type="button" aria-pressed={span >= 8 && !full} onclick={() => size('primary')}>Make primary</button><button type="button" aria-pressed={span <= 6 && !full} onclick={() => size('beside')}>Place beside</button><button type="button" aria-pressed={full} onclick={() => size('row')}>Own row</button><div class="sep"></div><button type="button" aria-pressed={!board.overrides[block.id]?.tall} onclick={() => { board.setOverride(block.id, { tall: undefined }); menu = null; }}>Standard height</button><button type="button" aria-pressed={Boolean(board.overrides[block.id]?.tall)} onclick={() => { board.setOverride(block.id, { tall: true }); menu = null; }}>Tall</button></div>{/if}
			</div>
			<div class="mw"><button type="button" class="tool" class:on={ownData} aria-expanded={menu === 'keep'} onclick={() => (menu = menu === 'keep' ? null : 'keep')} title="Choose whether this view follows the board or uses its own data">Data</button>
				{#if menu === 'keep'}
					<div class="pop mn wide">
						<button type="button" aria-pressed={follows && !ownData} onclick={useBoardData}>Use the board selection</button>
						<button type="button" aria-pressed={ownData} onclick={keepOwnData}>Keep a separate selection</button>
						<div class="sep"></div>
						<label><span>Period</span><select class="in" value={pins.asOf ?? ''} onchange={(e) => board.setOverride(block.id, { pins: { asOf: e.currentTarget.value || undefined } })}><option value="">Use board period</option>{#each board.quarters.slice().reverse() as q}<option value={q}>Keep {quarterLabel(q, 'long')}</option>{/each}</select></label>
						<label><span>Bank</span><select class="in" value={pins.certs?.join(',') ?? ''} onchange={(e) => board.setOverride(block.id, { pins: { certs: e.currentTarget.value ? e.currentTarget.value.split(',').map(Number) : undefined } })}><option value="">Use board banks</option>{#each board.selectedCerts as c}<option value={String(c)}>Keep {shortBankName(board.data.institutions[c]?.name ?? String(c))}</option>{/each}</select></label>
						<label><span>Measure</span><select class="in" value={pins.metrics?.join(',') ?? ''} onchange={(e) => board.setOverride(block.id, { pins: { metrics: e.currentTarget.value ? e.currentTarget.value.split(',') : undefined } })}><option value="">Use board measures</option>{#each board.metrics as m}<option value={m}>Keep {metricShort(m)}</option>{/each}</select></label>
					</div>
				{/if}
			</div>
			<button type="button" class="tool" onclick={() => board.focus(block.id)} title="Open large with exact values and method">Focus</button>
			<div class="mw"><button type="button" class="tool" aria-expanded={menu === 'more'} onclick={() => (menu = menu === 'more' ? null : 'more')} aria-label="More">⋯</button>
				{#if menu === 'more'}
					<div class="pop mn">
						<button type="button" onclick={() => { renaming = true; menu = null; }}>Rename</button>
						<button type="button" onclick={() => { board.moveBlock(block.id, board.blocks[Math.max(0, board.blocks.findIndex((b) => b.id === block.id) - 1)]?.id ?? null); board.setOverride(block.id, { strip: undefined, stripTitle: undefined }); menu = null; }}>Move up</button>
						<button type="button" onclick={() => { const i = board.blocks.findIndex((b) => b.id === block.id); board.moveBlock(block.id, board.blocks[i + 2]?.id ?? null); board.setOverride(block.id, { strip: undefined, stripTitle: undefined }); menu = null; }}>Move down</button>
						<button type="button" onclick={() => { board.setSpan(block.id, undefined); menu = null; }}>Reset size</button>
						<button type="button" onclick={() => { board.upsertBlock({ ...block, id: `${block.id}-copy-${Date.now().toString(36)}`, title: `${block.title} (copy)` }, board.overrides[block.id]); menu = null; }}>Duplicate</button>
						<button type="button" class="danger" onclick={() => { board.removeBlock(block.id); menu = null; }}>Remove</button>
					</div>
				{/if}
			</div>
		</div>
	</header>
	<div class="content">
		{#if needs}
			<div class="needs"><span>{NEED_TEXT[needs]}</span><button type="button" class="btn sm pri" onclick={() => (board.requestPanel = needs)}>{NEED_ACTION[needs]}</button></div>
		{:else}
			<BlockContent {block} {role} {span} {tall} />
		{/if}
	</div>
	<div class="resize" class:active={resizing} onpointerdown={resizeStart} onpointermove={resizeMove} onpointerup={resizeEnd} onpointercancel={resizeEnd} role="separator" aria-orientation="vertical" aria-label="Resize" title={neighbor ? 'Drag to trade width with the next view' : 'Drag to resize'}></div>
</article>

<style>
	.block { position: relative; display: flex; flex-direction: column; min-height: 80px; outline: 1px solid transparent; outline-offset: -1px; transition: outline-color 140ms ease-out, box-shadow 140ms ease-out; }
	.block:hover { box-shadow: 0 0 0 1px var(--rule); }
	.block.selected { outline-color: var(--accent); box-shadow: none; }
	.block:focus-visible { outline-color: var(--accent); }
	.bh { display: flex; align-items: center; gap: 8px; margin: -2px -4px 8px 0; min-height: 24px; }
	.grip { color: var(--ink-4); font-size: 11px; letter-spacing: -2px; cursor: grab; user-select: none; opacity: 0; transition: opacity 140ms ease-out; width: 12px; flex: none; }
	.block:hover .grip, .block.selected .grip, .block:focus-within .grip { opacity: 1; }
	.grip:active { cursor: grabbing; }
	.bh .title { border: 0; background: none; color: var(--ink); font: inherit; font-size: 13px; font-weight: 600; margin: 0; padding: 0; text-align: left; line-height: 1.3; cursor: pointer; min-width: 0; flex: 0 1 auto; }
	@media (max-width: 640px) { .bh { flex-wrap: wrap; row-gap: 2px; } .bh .title { white-space: nowrap; max-width: calc(100% - 100px); overflow: hidden; text-overflow: ellipsis; } .bh .u { flex-basis: 100%; order: 3; margin-left: 12px; } }
	.rename { font: inherit; font-size: 13px; font-weight: 600; border: 0; border-bottom: 1px solid var(--accent); background: transparent; color: var(--ink); outline: none; }
	.u { color: var(--ink-3); font-size: 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0; }
	.tools { margin-left: auto; display: flex; gap: 2px; align-items: center; opacity: 0; transition: opacity 140ms ease-out; flex: none; }
	.block:hover .tools, .block.selected .tools, .block:focus-within .tools { opacity: 1; }
	.tool { height: 24px; border: 1px solid transparent; border-radius: 4px; background: none; color: var(--ink-2); font: inherit; font-size: 11.5px; font-weight: 500; cursor: pointer; padding: 0 7px; white-space: nowrap; }
	.tool:hover { background: var(--surface-2); color: var(--ink); }
	.tool.on { color: var(--accent); }
	.mw { position: relative; }
	.mn { position: absolute; right: 0; top: calc(100% + 4px); display: grid; gap: 2px; min-width: 160px; padding: 6px; }
	.mn.wide { min-width: 280px; }
	.mn > button { border: 0; background: none; text-align: left; padding: 6px 8px; font: inherit; font-size: 12.5px; color: var(--ink); cursor: pointer; border-radius: 4px; }
	.mn > button:hover { background: var(--surface-2); }
	.mn > button[aria-pressed="true"] { background: var(--accent-wash); color: var(--accent); }
	.mn .danger { color: var(--adverse); }
	.mn label { display: grid; grid-template-columns: 64px 1fr; gap: 8px; align-items: center; font-size: 12px; color: var(--ink-2); padding: 3px 0; }
	.mn .in { width: 100%; height: 26px; font-size: 12px; }
	.content { min-width: 0; flex: 1; display: flex; flex-direction: column; }
	/* Two plate heights. A row takes the taller of its plates; content scrolls inside. Phones use natural height. */
	@media (min-width: 641px) { .content { flex: none; height: 300px; overflow: auto; overscroll-behavior: contain; scrollbar-gutter: stable; scrollbar-width: thin; } .block.tall .content { height: 560px; } }
	.content::-webkit-scrollbar { width: 6px; height: 6px; }
	.content::-webkit-scrollbar-button { display: none; }
	.content::-webkit-scrollbar-thumb { background: var(--rule); border-radius: 4px; }
	.sep { height: 1px; background: var(--rule-2); margin: 4px 0; }
	.content > :global(*) { min-width: 0; }
	.needs { flex: 1; min-height: 168px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px; color: var(--ink-2); font-size: 12.5px; text-align: center; padding: 12px; border: 1px dashed var(--rule); border-radius: 4px; }
	.resize { position: absolute; top: 8px; bottom: 8px; right: -9px; width: 8px; cursor: col-resize; border-radius: 3px; opacity: 0; transition: opacity 140ms ease-out; touch-action: none; }
	.block:hover .resize { opacity: 1; }
	.resize:hover, .resize.active { background: var(--accent); opacity: 1; }
	@media (pointer: coarse) { .tools, .grip { opacity: 1; } .resize { display: none; } }
</style>
