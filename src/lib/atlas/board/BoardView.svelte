<script lang="ts">
	import { Board } from './board.svelte';
	import { BoardData } from '$lib/atlas/engine/board-data.svelte';
	import { agentPresence } from '$lib/atlas/agent.svelte';
	import AnchorRail from './AnchorRail.svelte';
	import Timebar from './Timebar.svelte';
	import StripView from './StripView.svelte';
	import Launcher from './Launcher.svelte';
	import AddViewMenu from './AddViewMenu.svelte';
	import FocusMode from './FocusMode.svelte';
	import { trySerializeWorkspaceSearch } from '$lib/workspace/codec';
	import { BOARD_TEMPLATES } from '$lib/atlas/templates';
	import LayoutPreview from './LayoutPreview.svelte';

	const board = Board.use();
	let layoutOpen = $state(false);
	let addOpen = $state(false);
	let copied = $state<string | null>(null);
	let questionEl: HTMLTextAreaElement | undefined = $state();

	$effect(() => {
		const s = board.state;
		const selected = [...s.selectedCerts];
		const bound = board.blocks.flatMap((block) => block.kind === 'history' || block.kind === 'exact_table' ? block.binding.certs : []);
		const pinned = Object.values(board.overrides).flatMap((override) => override.pins?.certs ?? []);
		const certs = [...new Set([...selected, ...board.data.cohort, ...bound, ...pinned])];
		const starts = [
			BoardData.windowStart(s, board.data.latestQuarter),
			...board.blocks.flatMap((block) => block.kind === 'history' ? [block.binding.from] : block.kind === 'exact_table' && block.binding.from ? [block.binding.from] : []),
			...Object.values(board.overrides).flatMap((override) => override.pins?.compareWith ? [override.pins.compareWith] : [])
		].filter(Boolean);
		const from = starts.sort()[0];
		const controller = new AbortController();
		const t = setTimeout(() => {
			void board.data.ensureInstitutions(certs, controller.signal);
			if (certs.length) void board.data.ensureRows(certs, from, controller.signal);
		}, 0);
		return () => { clearTimeout(t); controller.abort(); };
	});
	$effect(() => {
		const s = board.state;
		const snapshot = JSON.parse(JSON.stringify({ peerRecipe: s.peerRecipe, filters: s.filters, screenView: s.screenView, excludedCerts: s.excludedCerts })) as typeof s;
		const controller = new AbortController();
		const t = setTimeout(() => { void board.data.loadCohort(snapshot, controller.signal); }, 0);
		return () => { clearTimeout(t); controller.abort(); };
	});
	let seen = new Set<string>();
	$effect(() => {
		const ids = board.blocks.map((b) => b.id);
		const fresh = ids.filter((id) => !seen.has(id));
		if (fresh.length && seen.size) {
			board.composingIds = new Set([...board.composingIds, ...fresh]);
			setTimeout(() => { const next = new Set(board.composingIds); fresh.forEach((id) => next.delete(id)); board.composingIds = next; }, 500);
		}
		seen = new Set(ids);
	});

	async function copyLink() {
		const result = trySerializeWorkspaceSearch(board.state);
		if (result.ok === false) { copied = 'Too large for a link'; return; }
		const url = `${location.origin}/b?${result.search}`;
		try { await navigator.clipboard.writeText(url); copied = 'Link copied'; } catch { copied = url; }
		setTimeout(() => (copied = null), 2500);
	}
	function autosize(el: HTMLTextAreaElement) {
		el.style.height = 'auto';
		const lineHeight = Number.parseFloat(getComputedStyle(el).lineHeight) || 25;
		el.style.height = `${Math.min(el.scrollHeight + 2, lineHeight * 2 + 10)}px`;
	}
	$effect(() => {
		const el = questionEl; const _q = board.state.question;
		if (!el) return;
		autosize(el);
		document.fonts?.ready.then(() => autosize(el));
		const ro = new ResizeObserver(() => autosize(el));
		ro.observe(el);
		return () => ro.disconnect();
	});
	let working = $derived(agentPresence.phase === 'working');
	let synthesis = $derived.by(() => { const b = board.blocks.find((x) => x.kind === 'takeaway' && x.referenceBlockIds.length === 0); return b && b.kind === 'takeaway' ? b : null; });
	function closeMenus(e: MouseEvent) { if (!(e.target as HTMLElement).closest('.menu-wrap')) { layoutOpen = false; addOpen = false; } }
</script>

<svelte:window onclick={closeMenus} onkeydown={(e) => e.key === 'Escape' && (layoutOpen = addOpen = false)} />

<div class="shell"><div class="board" class:has-ruler={board.timeForm !== 'compact' || board.pinnedTimebar}>
	<header class="head">
		<textarea bind:this={questionEl} class="question" rows="1" placeholder="Name this board or ask a question" value={board.state.question} oninput={(e) => { autosize(e.currentTarget); board.setQuestion(e.currentTarget.value); }} aria-label="Board question"></textarea>
		<div class="actions">
			{#if agentPresence.completedCount}<button type="button" class="btn quiet" aria-expanded={board.activityOpen} onclick={() => (board.activityOpen = !board.activityOpen)}>Activity</button>{/if}
			<div class="menu-wrap">
				<button type="button" class="btn" aria-expanded={layoutOpen} onclick={() => { layoutOpen = !layoutOpen; addOpen = false; }}>Layout</button>
				{#if layoutOpen}
					<div class="pop menu" role="menu">
						{#each BOARD_TEMPLATES as t}
							<button type="button" role="menuitem" onclick={() => { board.applyCuratedTemplate(t, 'replace'); layoutOpen = false; }}><span class="th"><LayoutPreview template={t} height={26} /></span><span><b>{t.name}</b><small>{t.description}</small></span></button>
						{/each}
						<div class="sep"></div>
						<button type="button" role="menuitem" onclick={() => { board.clearOverrides(); layoutOpen = false; }}><span class="th"></span><span><b>Arrange automatically</b><small>Drop manual sizes and positions</small></span></button>
						<button type="button" role="menuitem" onclick={() => { board.pinnedTimebar = !board.pinnedTimebar; layoutOpen = false; }}><span class="th"></span><span><b>{board.pinnedTimebar ? 'Hide the time ruler' : 'Always show the time ruler'}</b></span></button>
					</div>
				{/if}
			</div>
			<div class="menu-wrap">
				<button type="button" class="btn" aria-expanded={addOpen} onclick={() => { addOpen = !addOpen; layoutOpen = false; }}>Add view</button>
				{#if addOpen}<AddViewMenu onclose={() => (addOpen = false)} />{/if}
			</div>
			{#if !board.isEmpty}<button type="button" class="btn" onclick={() => board.clearBoard(true)} title="Remove every view and start from scratch; the banks, cohort, measures, and period stay">Clear board</button>{/if}
			<button type="button" class="btn pri" onclick={copyLink}>{copied ?? 'Share'}</button>
		</div>
	</header>
	{#if synthesis}<p class="synthesis">{synthesis.text}</p>{/if}

	<AnchorRail />

	{#if !board.isEmpty && (board.unmetNeeds.banks || board.unmetNeeds.cohort)}
		{@const n = board.unmetNeeds}
		<div class="needs-bar" role="status">
			<span>{n.banks ? `${n.banks} view${n.banks > 1 ? 's' : ''} on this board need${n.banks > 1 ? '' : 's'} a bank` : ''}{n.banks && n.cohort ? ' · ' : ''}{n.cohort ? `${n.cohort} need${n.cohort > 1 ? '' : 's'} a cohort of five or more` : ''}.</span>
			{#if n.banks}<button type="button" class="btn sm pri" onclick={() => (board.requestPanel = 'banks')}>Add a bank</button>{/if}
			{#if n.cohort}<button type="button" class="btn sm" onclick={() => (board.requestPanel = 'cohort')}>Define the cohort</button>{/if}
		</div>
	{/if}

	{#if working && agentPresence.current}
		<div class="progress" role="status"><i></i><span>{agentPresence.current.label}…</span><span class="dim">{agentPresence.completedCount} steps so far</span></div>
	{/if}
	{#if board.activityOpen}
		<div class="plate activity">
			<div class="ah"><b>Agent activity</b><button type="button" class="btn sm quiet" onclick={() => (board.activityOpen = false)}>Close</button></div>
			<ol>{#each agentPresence.steps.slice(-12) as step}<li class:failed={step.status === 'failure'}>{step.label}</li>{/each}</ol>
		</div>
	{/if}

	{#if board.isEmpty}
		<Launcher />
	{:else}
		<main class="field">
			{#each board.strips as strip (strip.id)}<StripView {strip} />{/each}
			<div class="end"><button type="button" class="btn quiet" onclick={() => (addOpen = true)}>+ Add view</button><button type="button" class="btn quiet" onclick={() => board.clearBoard(true)}>Clear board</button></div>
		</main>
	{/if}

	{#if board.recentlyRemoved}
		<div class="undo" role="status"><span>Removed “{board.recentlyRemoved.block.title || 'view'}”</span><button type="button" class="btn sm" onclick={() => board.restoreRemoved()}>Undo</button><button type="button" class="btn sm quiet" onclick={() => (board.recentlyRemoved = null)}>Dismiss</button></div>
	{/if}
	{#if board.recentlyCleared}
		<div class="undo" role="status"><span>Cleared {board.recentlyCleared.blocks.length} view{board.recentlyCleared.blocks.length === 1 ? '' : 's'}</span><button type="button" class="btn sm" onclick={() => board.restoreCleared()}>Undo</button><button type="button" class="btn sm quiet" onclick={() => (board.recentlyCleared = null)}>Dismiss</button></div>
	{/if}
	{#if board.data.error}<div class="err" role="alert">{board.data.error}</div>{/if}
</div>

{#if board.timeForm !== 'compact' || board.pinnedTimebar}<Timebar />{/if}
</div>
{#if board.focusedBlockId}<FocusMode />{/if}

<style>
	/* The board scrolls inside its own area, so the time ruler sits below it and never covers content. */
	.shell { flex: 1 1 auto; min-height: 0; display: grid; grid-template-rows: minmax(0, 1fr) auto; }
	.board { min-height: 0; overflow-y: auto; overscroll-behavior: contain; padding: 12px 20px 40px; display: grid; grid-template-columns: minmax(0, 1fr); gap: 12px; align-content: start; }
	.board.has-ruler { padding-bottom: 24px; }
	.head { display: flex; align-items: flex-start; gap: 16px; }
	.question { flex: 1; min-width: 0; resize: none; border: 0; background: transparent; color: var(--ink); font: inherit; font-size: 20px; font-weight: 650; line-height: 1.25; letter-spacing: -0.015em; padding: 4px 4px 4px 0; margin: 0; outline: none; overflow-x: hidden; overflow-y: auto; scrollbar-width: none; field-sizing: content; border-bottom: 1px solid transparent; transition: border-color 140ms ease-out; }
	.question:hover, .question:focus { border-bottom-color: var(--rule); }
	.question::-webkit-scrollbar { display: none; }
	.question::placeholder { color: var(--ink-4); font-weight: 500; }
	.actions { display: flex; gap: 8px; align-items: center; flex: none; padding-top: 2px; }
	.menu-wrap { position: relative; }
	.menu { position: absolute; right: 0; top: calc(100% + 6px); width: 340px; display: grid; gap: 2px; padding: 6px; }
	.menu button { display: grid; grid-template-columns: 44px 1fr; gap: 10px; align-items: center; border: 0; background: none; text-align: left; padding: 6px 8px; cursor: pointer; color: var(--ink); font: inherit; border-radius: 4px; }
	.menu button:hover { background: var(--surface-2); }
	.menu button b { display: block; font-weight: 600; font-size: 12.5px; }
	.menu button small { display: block; font-size: 11.5px; color: var(--ink-3); line-height: 1.35; }
	.menu .th { display: block; }
	.menu .sep { height: 1px; background: var(--rule-2); margin: 4px 0; }
	.synthesis { margin: -6px 0 0; font-size: 13px; color: var(--ink-2); line-height: 1.5; max-width: 900px; }
	.progress { display: flex; align-items: center; gap: 10px; padding: 8px 12px; border-radius: 4px; background: var(--accent-wash); font-size: 12.5px; color: var(--ink); font-weight: 500; }
	.progress i { width: 8px; height: 8px; border-radius: 50%; background: var(--accent); animation: breathe 1.2s ease-in-out infinite; }
	.progress .dim { margin-left: auto; font-weight: 400; }
	.activity { font-size: 12.5px; }
	.ah { display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; }
	.activity ol { margin: 0; padding-left: 18px; display: grid; gap: 3px; color: var(--ink-2); }
	.activity li.failed { color: var(--caution); }
	.field { display: grid; grid-template-columns: repeat(12, minmax(0, 1fr)); gap: 12px; min-width: 0; align-items: start; }
	.end { grid-column: 1 / -1; display: flex; gap: 8px; padding: 4px 0 20px; }
	.needs-bar { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; padding: 8px 12px; border-radius: 4px; background: var(--surface); border: 1px dashed var(--rule); font-size: 12.5px; color: var(--ink-2); }
	.needs-bar span { flex: 1; min-width: 200px; }
	.undo { position: fixed; left: 50%; bottom: 84px; transform: translateX(-50%); display: flex; gap: 10px; align-items: center; background: var(--ink); color: var(--bg); padding: 8px 8px 8px 14px; font-size: 12.5px; z-index: 35; border-radius: 6px; box-shadow: var(--shadow-md); }
	.undo .btn { background: transparent; color: var(--bg); border-color: rgb(255 255 255 / .25); }
	.undo .btn.quiet { border-color: transparent; color: rgb(255 255 255 / .7); }
	.err { color: var(--caution); font-size: 12.5px; }
	@keyframes breathe { 50% { opacity: .35; } }
	@media (max-width: 860px) {
		.board { padding: 10px 12px 40px; gap: 10px; }
		.head { flex-direction: column; gap: 8px; }
		.question { font-size: 17px; width: 100%; }
		.actions { width: 100%; flex-wrap: wrap; }
		.actions .pri { margin-left: auto; }
		.menu { right: auto; left: 0; width: min(340px, calc(100vw - 24px)); }
		.undo { left: 12px; right: 12px; transform: none; bottom: 76px; flex-wrap: wrap; }
	}
	@media (max-width: 1024px) { .field { grid-template-columns: repeat(6, minmax(0, 1fr)); } }
	@media (max-width: 640px) { .field { grid-template-columns: minmax(0, 1fr); gap: 10px; } }
</style>
