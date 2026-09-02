<script lang="ts">
	import { Board } from './board.svelte';
	import type { Strip } from './layout';
	import BlockFrame from './BlockFrame.svelte';

	let { strip }: { strip: Strip } = $props();
	const board = Board.use();
	let over = $state<string | null>(null);
	let renaming = $state(false);
	// A row label only earns its place when it says something the plates don't.
	let showTitle = $derived(strip.blocks.length > 2 && !strip.blocks.some((b) => b.block.title.toLowerCase() === strip.title.toLowerCase()));
	// One height per row: if any plate asks to be tall, the row is tall.
	let rowTall = $derived(strip.blocks.some((b) => board.overrides[b.block.id]?.tall));

	function drop(e: DragEvent, beforeId: string | null) {
		e.preventDefault();
		const id = e.dataTransfer?.getData('text/atlas-block');
		if (!id) return;
		board.moveBlock(id, beforeId);
		board.setOverride(id, { strip: strip.id, stripTitle: strip.title });
		over = null;
	}
	function dropNewStrip(e: DragEvent) {
		e.preventDefault();
		const id = e.dataTransfer?.getData('text/atlas-block');
		if (!id) return;
		const last = strip.blocks.at(-1)?.block.id ?? null;
		const ids = board.blocks.map((b) => b.id);
		const after = last ? ids.indexOf(last) + 1 : ids.length;
		const next = ids.filter((x) => x !== id);
		next.splice(Math.min(after, next.length), 0, id);
		board.reorder(next);
		board.setOverride(id, { strip: `new-${Date.now().toString(36)}`, stripTitle: 'New row', span: undefined });
		over = null;
	}
</script>

<section class="row" id="strip-{strip.id}" aria-label={strip.title}>
	{#if showTitle || renaming}
		<div class="row-title">
			{#if renaming}
				<input class="rename" value={strip.title} onblur={(e) => { for (const b of strip.blocks) board.setOverride(b.block.id, { strip: strip.id, stripTitle: e.currentTarget.value }); renaming = false; }} onkeydown={(e) => e.key === 'Enter' && (e.currentTarget as HTMLInputElement).blur()} aria-label="Row title" />
			{:else}
				<button type="button" class="t" ondblclick={() => (renaming = true)} title="Double-click to rename">{strip.title}</button>
			{/if}
		</div>
	{/if}
	<div class="grid">
		{#each strip.blocks as item (item.block.id)}
			<div class="dz" class:over={over === item.block.id} ondragover={(e) => { e.preventDefault(); over = item.block.id; }} ondragleave={() => (over = null)} ondrop={(e) => drop(e, item.block.id)} role="presentation"></div>
			<div class="cell" style="grid-column: span {item.span}">
				<BlockFrame block={item.block} role={item.role} span={item.span} siblings={strip.blocks.map((b) => ({ id: b.block.id, span: b.span }))} tall={rowTall} />
			</div>
		{/each}
		<div class="dz end" class:over={over === 'end'} ondragover={(e) => { e.preventDefault(); over = 'end'; }} ondragleave={() => (over = null)} ondrop={(e) => drop(e, null)} role="presentation"></div>
	</div>
	{#if strip.notes.length}
		<div class="notes">
			{#each strip.notes as note (note.id)}
				<div class="note"><p>{note.kind === 'takeaway' ? note.text : ''}</p><button type="button" class="btn sm quiet" onclick={() => board.removeBlock(note.id)} aria-label="Remove note">×</button></div>
			{/each}
		</div>
	{/if}
	<div class="between" class:over={over === 'new'} ondragover={(e) => { e.preventDefault(); over = 'new'; }} ondragleave={() => (over = null)} ondrop={dropNewStrip} role="presentation"><span>Drop here for a new row</span></div>
</section>

<style>
	.row { display: grid; grid-template-columns: minmax(0, 1fr); gap: 8px; scroll-margin-top: 60px; }
	.row-title { display: flex; align-items: baseline; gap: 10px; padding: 2px 2px 0; }
	.row-title .t { border: 0; background: none; padding: 0; font: inherit; font-size: 12px; font-weight: 600; color: var(--ink-2); letter-spacing: 0.02em; text-transform: uppercase; cursor: text; }
	.rename { font: inherit; font-size: 12px; font-weight: 600; border: 0; border-bottom: 1px solid var(--accent); background: transparent; color: var(--ink); outline: none; }
	.grid { display: grid; grid-template-columns: repeat(12, minmax(0, 1fr)); gap: 12px; align-items: stretch; position: relative; }
	.cell { min-width: 0; display: flex; }
	.cell > :global(*) { flex: 1; }
	.dz { position: absolute; width: 12px; height: 100%; margin-left: -12px; z-index: 5; pointer-events: none; border-radius: 2px; }
	:global(body.dragging) .dz { pointer-events: auto; }
	.dz.over { background: var(--accent-wash-2); box-shadow: inset 2px 0 0 var(--accent); }
	.dz.end { position: relative; grid-column: span 12; height: 0; margin: 0; width: auto; }
	.dz.end.over { height: 28px; border: 1px dashed var(--accent); }
	.notes { display: grid; gap: 6px; }
	.note { display: flex; gap: 10px; align-items: flex-start; padding: 8px 12px; border: 1px solid var(--rule); border-radius: 4px; background: var(--surface); font-size: 13px; color: var(--ink-2); line-height: 1.5; max-width: 980px; }
	.note p { margin: 0; flex: 1; }
	.between { height: 0; position: relative; }
	.between span { display: none; }
	:global(body.dragging) .between { height: 26px; border: 1px dashed var(--rule); border-radius: 4px; }
	:global(body.dragging) .between span { display: block; font-size: 11.5px; color: var(--ink-3); text-align: center; line-height: 24px; }
	.between.over { border-color: var(--accent) !important; background: var(--accent-wash); }
	@media (max-width: 1024px) { .grid { grid-template-columns: repeat(6, minmax(0, 1fr)); } .cell { grid-column: span 6 !important; } .dz, .between { display: none; } }
	@media (max-width: 640px) { .grid { grid-template-columns: 1fr; gap: 10px; } .cell { grid-column: span 1 !important; } }
</style>
