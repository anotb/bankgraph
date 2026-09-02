<script lang="ts">
	import { Board } from './board.svelte';
	import { quarterLabel } from '$lib/atlas/format';
	import { quartersBetween, previousQuarter, nextQuarter } from '$lib/atlas/engine/metrics';

	const board = Board.use();
	let el: HTMLDivElement | undefined = $state();
	let dragging = $state<'asof' | 'cmp' | 'range' | null>(null);
	let rangeStartX = 0, rangeFrom = '', rangeTo = '';
	// A caret drag ends with pointerup and then a click at the same spot; the click must not move the other caret.
	let suppressClick = false;

	// Calendar ruler: the visible history plus a year each side so the caret can be dragged past the window.
	let quarters = $derived(board.eventTime ? [] : quartersBetween(previousQuarter(board.historyFrom, 4), board.latest));
	let eventQuarters = $derived(board.eventTime ? Array.from({ length: board.eventTime.quartersBefore + 1 }, (_, i) => `t−${board.eventTime!.quartersBefore - i}`.replace('t−0', 't0')) : []);
	let n = $derived(board.eventTime ? eventQuarters.length : quarters.length);
	function pos(i: number) { return n <= 1 ? 0 : (i / (n - 1)) * 100; }
	let asOfIndex = $derived(Math.max(0, quarters.indexOf(board.asOf)));
	let cmpIndex = $derived(quarters.indexOf(board.compareWith));
	let rulerWidth = $state(800);
	$effect(() => { if (!el) return; const ro = new ResizeObserver(([e]) => { rulerWidth = e.contentRect.width; }); ro.observe(el); return () => ro.disconnect(); });
	let labelEvery = $derived(Math.max(1, Math.ceil(n / Math.max(2, Math.floor(rulerWidth / 64)))));

	function indexFromEvent(e: PointerEvent): number {
		if (!el) return 0;
		const r = el.getBoundingClientRect();
		const t = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
		return Math.round(t * (n - 1));
	}
	/** Move the visible window by n quarters (negative = earlier); the as-of caret stays inside it. */
	function shiftWindow(n: number) {
		const len = quartersBetween(board.historyFrom, board.historyTo).length - 1;
		let to = n < 0 ? previousQuarter(board.historyTo, -n) : nextQuarter(board.historyTo, n);
		if (to > board.latest) to = board.latest;
		const from = previousQuarter(to, len);
		board.setHistory(from, to);
		if (board.asOf > to) board.setAsOf(to); else if (board.asOf < from) board.setAsOf(from);
	}
	function down(which: 'asof' | 'cmp' | 'range', e: PointerEvent) {
		if (board.eventTime) return;
		dragging = which;
		if (which === 'range') { rangeStartX = e.clientX; rangeFrom = board.historyFrom; rangeTo = board.historyTo; }
		(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
	}
	function move(e: PointerEvent) {
		if (!dragging || board.eventTime) return;
		if (dragging === 'range') {
			if (!el) return;
			const perQuarter = el.getBoundingClientRect().width / Math.max(1, n - 1);
			const delta = Math.round((e.clientX - rangeStartX) / perQuarter);
			const to = delta < 0 ? previousQuarter(rangeTo, -delta) : nextQuarter(rangeTo, delta);
			const from = delta < 0 ? previousQuarter(rangeFrom, -delta) : nextQuarter(rangeFrom, delta);
			if (to <= board.latest && (from !== board.historyFrom || to !== board.historyTo)) board.setHistory(from, to);
			return;
		}
		const q = quarters[indexFromEvent(e)];
		if (!q) return;
		if (dragging === 'asof') board.previewAsOf = q;
		else board.hoverQuarter = q;
	}
	function up(e: PointerEvent) {
		if (!dragging) return;
		if (dragging === 'range') { if (board.asOf > board.historyTo) board.setAsOf(board.historyTo); else if (board.asOf < board.historyFrom) board.setAsOf(board.historyFrom); }
		const q = quarters[indexFromEvent(e)];
		if (dragging === 'asof' && q) board.setAsOf(q);
		if (dragging === 'cmp' && q) board.setComparison('custom', q);
		dragging = null; board.previewAsOf = null; board.hoverQuarter = null;
		suppressClick = true; setTimeout(() => { suppressClick = false; }, 0);
	}
	function clickRuler(e: MouseEvent) {
		if (board.eventTime || dragging || suppressClick) return;
		const q = quarters[indexFromEvent(e as unknown as PointerEvent)];
		if (!q) return;
		if (e.shiftKey) board.setComparison('custom', q); else board.setAsOf(q);
	}
	let events = $derived.by(() => {
		const marks: Array<{ from: string; to: string; label: string }> = [
			{ from: '20071231', to: '20090630', label: 'recession' }, { from: '20200331', to: '20200630', label: 'pandemic' }, { from: '20230331', to: '20230331', label: 'Mar ʼ23 failures' }
		];
		return marks.map((m) => ({ ...m, a: quarters.indexOf(m.from), b: quarters.indexOf(m.to) })).filter((m) => m.a >= 0 || m.b >= 0).map((m) => ({ ...m, a: Math.max(0, m.a), b: m.b < 0 ? n - 1 : m.b }));
	});
</script>

<div class="timebar" class:event={!!board.eventTime}>
	<div class="mode">
		<div class="seg"><button type="button" aria-pressed={!!board.eventTime} disabled={!board.eventTimeAvailable} title={board.eventTimeAvailable ? 'Align on each bank’s last filing before failure' : 'Available once a failure analysis is on the board'} onclick={() => board.useEventTime()}>Event time</button><button type="button" aria-pressed={!board.eventTime} onclick={() => board.useCalendar()}>Calendar</button></div>
	</div>
	<div class="ruler" bind:this={el} onpointermove={move} onpointerup={up} onpointercancel={up} onclick={clickRuler} role="slider" aria-label="Reporting period" aria-valuemin="0" aria-valuemax={Math.max(0, n - 1)} aria-valuenow={Math.max(0, asOfIndex)} aria-valuetext={board.eventTime ? 'event time' : quarterLabel(board.asOf, 'long')} tabindex="0"
		onkeydown={(e) => { if (board.eventTime) return; if (e.key === 'ArrowLeft' && asOfIndex > 0) board.setAsOf(quarters[asOfIndex - 1]); if (e.key === 'ArrowRight' && asOfIndex < n - 1) board.setAsOf(quarters[asOfIndex + 1]); }}>
		<div class="ax"></div>
		{#if board.eventTime}
			<div class="rng2" style="left:0;width:{pos(Math.floor(n / 2))}%"><span>early deterioration</span></div>
			{#each eventQuarters as l, i}<div class="tk" style="left:{pos(i)}%"></div><div class="tl" class:first={i === 0} class:last={i === n - 1} style="left:{pos(i)}%">{l}</div>{/each}
			<div class="caret end" style="left:100%" data-l="t0 · last filing before failure"></div>
		{:else}
			{#each events as ev}<div class="rng2" style="left:{pos(ev.a)}%;width:{Math.max(0.6, pos(ev.b) - pos(ev.a))}%"><span>{ev.label}</span></div>{/each}
			<div class="rng" class:live={dragging === 'range'} style="left:{pos(quarters.indexOf(board.historyFrom))}%;width:{pos(quarters.indexOf(board.historyTo)) - pos(quarters.indexOf(board.historyFrom))}%" title="Drag to move the window" onpointerdown={(e) => { e.stopPropagation(); down('range', e); }} role="presentation"></div>
			{#each quarters as q, i}
				<div class="tk" style="left:{pos(i)}%"></div>
				{#if i % labelEvery === 0 || i === n - 1}<div class="tl" class:first={i === 0} class:last={i === n - 1} style="left:{pos(i)}%">{quarterLabel(q)}</div>{/if}
			{/each}
			{#if cmpIndex >= 0}<div class="caret cmp" class:end={cmpIndex > n * 0.8} style="left:{pos(cmpIndex)}%" data-l="vs {quarterLabel(board.compareWith)}" onpointerdown={(e) => down('cmp', e)} role="presentation"></div>{/if}
			<div class="caret" class:end={asOfIndex > n * 0.85} class:live={board.previewAsOf} style="left:{pos(asOfIndex)}%" data-l="{quarterLabel(board.asOf)}" onpointerdown={(e) => down('asof', e)} role="presentation"></div>
		{/if}
	</div>
	<div class="legend">{#if board.eventTime}<b>{board.eventTime.quartersBefore}</b> quarters before failure{:else}<button type="button" class="pan" onclick={() => shiftWindow(-4)} aria-label="Earlier by a year" title="Earlier by a year">‹</button><button type="button" class="pan" onclick={() => shiftWindow(4)} disabled={board.historyTo >= board.latest} aria-label="Later by a year" title="Later by a year">›</button><span>Drag the window or a caret · shift-click sets the comparison</span>{/if}</div>
</div>

<style>
	.timebar { position: relative; z-index: 25; background: var(--surface); border-top: 1px solid var(--rule); padding: 10px 20px 8px; display: grid; grid-template-columns: 150px minmax(0, 1fr) 260px; gap: 24px; align-items: center; }
	.ruler { position: relative; height: 52px; cursor: pointer; outline: none; touch-action: none; user-select: none; -webkit-user-select: none; }
	.timebar.event .ruler { cursor: default; }
	.timebar { user-select: none; -webkit-user-select: none; }
	.ruler:focus-visible { outline: 2px solid var(--accent); outline-offset: 4px; border-radius: 4px; }
	.ax { position: absolute; left: 0; right: 0; top: 26px; border-top: 2px solid var(--rule); }
	.tk { position: absolute; top: 22px; width: 1px; height: 10px; background: var(--ink-4); }
	.tl { position: absolute; top: 34px; font-family: var(--font-mono); font-size: 11px; color: var(--ink-3); transform: translateX(-50%); white-space: nowrap; }
	.tl.first { transform: none; } .tl.last { transform: translateX(-100%); }
	.caret { position: absolute; top: 12px; width: 2px; height: 30px; background: var(--accent); transform: translateX(-1px); cursor: ew-resize; border-radius: 1px; }
	.caret::before { content: ''; position: absolute; left: -9px; right: -9px; top: -6px; bottom: -6px; }
	.caret::after { content: attr(data-l); position: absolute; top: -12px; left: 7px; font-family: var(--font-mono); font-size: 11px; font-weight: 500; color: var(--accent); white-space: nowrap; background: var(--surface); padding: 0 3px; border-radius: 2px; }
	.caret.end::after { left: auto; right: 7px; }
	.caret.cmp { background: var(--ink-3); top: 16px; height: 22px; } .caret.cmp::after { color: var(--ink-2); font-weight: 400; top: 30px; }
	.caret.live { background: var(--ink); }
	.rng { position: absolute; top: 21px; height: 12px; background: var(--accent); opacity: .22; border-radius: 3px; cursor: grab; }
	.rng:hover, .rng.live { opacity: .38; }
	.rng.live { cursor: grabbing; }
	.pan { width: 24px; height: 24px; border: 1px solid var(--rule); border-radius: 4px; background: var(--surface-2); color: var(--ink-2); font: inherit; font-size: 15px; line-height: 1; cursor: pointer; margin-right: 4px; vertical-align: middle; }
	.pan:hover { color: var(--ink); }
	.pan:disabled { color: var(--ink-4); cursor: default; }
	.legend span { margin-left: 6px; }
	.rng2 { position: absolute; top: 14px; height: 24px; background: var(--band); border-radius: 2px; }
	.rng2 span { position: absolute; top: -13px; left: 2px; font-size: 10.5px; color: var(--ink-3); white-space: nowrap; }
	.legend { font-size: 12px; color: var(--ink-3); text-align: right; }
	.legend b { color: var(--ink); font-weight: 600; }
	@media (max-width: 1024px) { .timebar { grid-template-columns: 1fr; gap: 6px; padding: 8px 12px; } .legend { display: none; } .mode { order: 2; } }
	@media (max-width: 640px) { .mode { display: none; } .timebar { padding: 8px 12px 4px; } .tl { font-size: 10px; } }
</style>
