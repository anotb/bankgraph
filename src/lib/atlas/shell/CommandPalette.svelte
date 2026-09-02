<script lang="ts">
	import { goto } from '$app/navigation';
	import { RESEARCH_METRICS } from '$lib/research-metrics';
	import { BOARD_TEMPLATES } from '$lib/atlas/templates';
	import { US_STATES, matchState } from '$lib/atlas/states';
	import { usdThousands, shortBankName } from '$lib/atlas/format';

	interface Item { group: string; title: string; sub?: string; action: string; href: string }
	interface BankRow { cert: number; name: string; city: string | null; state: string | null; total_assets: number | null; active: number }

	let open = $state(false);
	let query = $state('');
	let banks = $state<BankRow[]>([]);
	let selected = $state(0);
	let input: HTMLInputElement | undefined = $state();
	let controller: AbortController | null = null;

	export function show() { open = true; query = ''; selected = 0; queueMicrotask(() => input?.focus()); }
	export function hide() { open = false; }

	$effect(() => {
		if (!open) return;
		const q = query.trim();
		controller?.abort();
		if (q.length < 2) { banks = []; return; }
		controller = new AbortController();
		const signal = controller.signal;
		const timer = setTimeout(async () => {
			try {
				const res = await fetch(`/api/v1/banks?q=${encodeURIComponent(q)}&active=all&limit=6&sort=assets&order=desc`, { signal });
				if (!res.ok) return;
				const body = (await res.json()) as { data: BankRow[] };
				if (!signal.aborted) banks = body.data ?? [];
			} catch { /* aborted or offline */ }
		}, 120);
		return () => clearTimeout(timer);
	});

	const PAGES = [
		{ title: 'Research', sub: 'your board', href: '/b' },
		{ title: 'Institutions', sub: 'every FDIC-insured bank, screened and sorted', href: '/banks' },
		{ title: 'Economy', sub: 'rates, the yield curve, bank credit, inflation and labor', href: '/economy' },
		{ title: 'Data and methods', sub: 'every measure, its source field, and how change is measured', href: '/methods' }
	];
	let items = $derived.by((): Item[] => {
		const q = query.trim();
		const ql = q.toLowerCase();
		const out: Item[] = [];
		if (!q) {
			for (const p of PAGES) out.push({ group: 'Go to', title: p.title, sub: p.sub, action: 'layout', href: p.href });
			for (const t of BOARD_TEMPLATES.slice(0, 5)) out.push({ group: 'Start a board', title: t.name, sub: t.description, action: 'layout', href: `/b?template=${t.id}` });
			return out;
		}
		for (const p of PAGES) if (p.title.toLowerCase().includes(ql) || p.sub.toLowerCase().includes(ql)) out.push({ group: 'Go to', title: p.title, sub: p.sub, action: 'layout', href: p.href });
		const state = matchState(q.split(/\s+/)[0]) ?? matchState(q);
		if (state) out.push({ group: 'Places', title: US_STATES[state], sub: `banks headquartered in ${state}`, action: 'cohort', href: `/b?template=geography&states=${state}` });
		for (const b of banks) out.push({ group: 'Institutions', title: shortBankName(b.name), sub: `${b.city ?? ''}${b.state ? ', ' + b.state : ''} · ${b.cert} · ${usdThousands(b.total_assets)}${b.active ? '' : ' · inactive'}`, action: 'bank', href: `/bank/${b.cert}` });
		for (const m of RESEARCH_METRICS) {
			if (m.label.toLowerCase().includes(ql) || m.shortLabel.toLowerCase().includes(ql) || m.id.toLowerCase() === ql || m.source.toLowerCase().includes(ql)) {
				out.push({ group: 'Measures', title: m.label, sub: `${m.source} · ${m.displayUnit} · ${m.category.replace('_', ' ')}`, action: 'definition', href: `/methods#${m.id}` });
			}
		}
		for (const t of BOARD_TEMPLATES) {
			if (t.name.toLowerCase().includes(ql) || t.description.toLowerCase().includes(ql)) out.push({ group: 'Layouts', title: t.name, sub: t.description, action: 'layout', href: `/b?template=${t.id}` });
		}
		if (q.length > 12 || /\?$/.test(q) || /^(which|how|what|where|who|show|find|compare)\b/i.test(q)) {
			out.push({ group: 'Question', title: q, sub: 'Open a board around this question', action: 'board', href: `/b?q=${encodeURIComponent(q)}` });
		}
		return out.slice(0, 14);
	});

	function onkey(e: KeyboardEvent) {
		if (e.key === 'Escape') { hide(); return; }
		if (e.key === 'ArrowDown') { e.preventDefault(); selected = Math.min(selected + 1, items.length - 1); }
		if (e.key === 'ArrowUp') { e.preventDefault(); selected = Math.max(selected - 1, 0); }
		if (e.key === 'Enter') {
			const item = items[selected];
			if (item) { hide(); goto(item.href); }
			else if (query.trim()) { hide(); goto(`/b?q=${encodeURIComponent(query.trim())}`); }
		}
	}

	function globalKey(e: KeyboardEvent) {
		if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); open ? hide() : show(); }
	}
</script>

<svelte:window onkeydown={globalKey} />

{#if open}
	<div class="scrim" role="presentation" onclick={hide}></div>
	<div class="pal" role="dialog" aria-modal="true" aria-label="Search and start">
		<div class="in">
			<input bind:this={input} bind:value={query} onkeydown={onkey} placeholder="A bank, a place, a measure, or a question" aria-label="Search" autocomplete="off" spellcheck="false" />
			<span class="hint">↑↓ · ↵ open · esc</span>
		</div>
		<div class="list" role="listbox">
			{#each items as item, i}
				{#if i === 0 || items[i - 1].group !== item.group}
					<div class="g">{item.group}</div>
				{/if}
				<a href={item.href} role="option" aria-selected={i === selected} class="it" class:on={i === selected} onclick={hide} onmouseenter={() => (selected = i)}>
					<span class="t">{item.title}{#if item.sub}<span class="s">{item.sub}</span>{/if}</span>
					<span class="k">{item.action}</span>
				</a>
			{/each}
			{#if query.trim() && !items.length}
				<div class="empty">Nothing matches yet. Press ↵ to open a board around “{query.trim()}”.</div>
			{/if}
		</div>
	</div>
{/if}

<style>
	.scrim { position: fixed; inset: 0; background: rgb(17 24 39 / .32); z-index: 90; }
	.pal { position: fixed; z-index: 91; left: 50%; top: 10vh; transform: translateX(-50%); width: min(680px, calc(100vw - 24px)); background: var(--surface); border: 1px solid var(--rule); border-radius: 8px; box-shadow: var(--shadow-lg); overflow: hidden; }
	.in { display: flex; align-items: center; gap: 10px; padding: 12px 16px; border-bottom: 1px solid var(--rule); }
	.in input { flex: 1; border: 0; background: transparent; color: var(--ink); font: inherit; font-size: 16px; outline: none; }
	.in input::placeholder { color: var(--ink-3); }
	.hint { font-family: var(--font-mono); font-size: 11px; color: var(--ink-3); white-space: nowrap; }
	.list { padding: 6px 8px 10px; max-height: 60vh; overflow: auto; }
	.g { font-size: 11px; font-weight: 600; letter-spacing: .04em; text-transform: uppercase; color: var(--ink-3); margin: 10px 8px 4px; }
	.it { display: grid; grid-template-columns: 1fr auto; gap: 12px; padding: 7px 10px; align-items: baseline; color: var(--ink); text-decoration: none; border-radius: 4px; }
	.it.on { background: var(--accent-wash); }
	.t { font-size: 13.5px; min-width: 0; font-weight: 500; }
	.s { color: var(--ink-3); font-size: 12px; margin-left: 8px; font-weight: 400; }
	.k { font-size: 11px; color: var(--ink-3); font-weight: 500; }
	.empty { padding: 14px 10px; color: var(--ink-2); font-size: 12.5px; }
	@media (max-width: 640px) { .pal { top: 6vh; } .s { display: block; margin: 2px 0 0; } }
</style>
