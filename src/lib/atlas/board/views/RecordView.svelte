<script lang="ts">
	import { Board } from '../board.svelte';
	import type { ResearchBoardBlock } from '$lib/workspace/types';
	import { effective } from './util';
	import { count, usdThousands } from '$lib/atlas/format';

	let { block }: { block: ResearchBoardBlock } = $props();
	const board = Board.use();
	let e = $derived(effective(board, block));
	let cert = $derived(board.state.activeBank && e.certs.includes(board.state.activeBank) ? board.state.activeBank : e.certs[0] ?? null);
	let inst = $derived(cert ? board.data.institutions[cert] : null);
	const TIER: Record<number, string> = { 1: 'Under $100M', 2: '$100M – $300M', 3: '$300M – $1B', 4: '$1B – $10B', 5: '$10B – $50B', 6: '$50B – $250B', 7: 'Over $250B' };
	function date(d: string | null | undefined) {
		if (!d) return '—';
		const value = String(d);
		const us = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value);
		const iso = /^(\d{4})-?(\d{2})-?(\d{2})/.exec(value);
		const year = us?.[3] ?? iso?.[1];
		const month = Number(us?.[1] ?? iso?.[2]);
		return year && month >= 1 && month <= 12
			? `${['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][month - 1]} ${year}`
			: value;
	}
</script>

{#if !inst}
	<div class="empty">{cert ? 'Loading…' : 'Add a bank to see its record.'}</div>
{:else}
	<div class="kv">
		<div class="h">Identity</div>
		<div><span>Legal name</span><span>{inst.name}</span></div>
		<div><span>Headquarters</span><span>{inst.city}, {inst.state}{inst.county ? ` · ${inst.county} County` : ''}</span></div>
		<div><span>Certificate</span><span>{inst.cert}{inst.rssd_id ? ` · RSSD ${inst.rssd_id}` : ''}</span></div>
		<div><span>Established</span><span>{date(inst.established_date)}{inst.insured_date ? ` · insured ${date(inst.insured_date)}` : ''}</span></div>
		<div class="h">Charter and ownership</div>
		<div><span>Primary regulator</span><span>{inst.regulator ?? '—'}{inst.charter_class ? ` · charter ${inst.charter_class}` : ''}</span></div>
		<div><span>Holding company</span><span>{inst.holding_company ?? 'none reported'}</span></div>
		<div><span>Asset group</span><span>{inst.asset_tier ? TIER[inst.asset_tier] : '—'}</span></div>
		<div><span>Status</span><span>{inst.active ? 'Active' : 'Inactive'}</span></div>
		<div class="h">Scale, latest filing</div>
		<div><span>Total assets</span><span>{usdThousands(inst.total_assets)}</span></div>
		<div><span>Total deposits</span><span>{usdThousands(inst.total_deposits)}</span></div>
		<div><span>Domestic offices</span><span>{count(inst.num_branches)}</span></div>
		<div><span>Employees</span><span>{count(inst.num_employees)}</span></div>
	</div>
	<div class="readout"><a href="https://banks.data.fdic.gov/bankfind-suite/bankfind?cert={inst.cert}" target="_blank" rel="noreferrer">FDIC BankFind record ↗</a></div>
{/if}

<style>
	.kv { font-size: 12.5px; }
	.kv > div { display: flex; justify-content: space-between; gap: 12px; padding: 6px 0; border-bottom: 1px solid var(--rule-2); }
	.kv > div > span:first-child { color: var(--ink-2); }
	.kv > div > span:last-child { font-family: var(--font-mono); font-size: 12px; text-align: right; }
	.kv .h { color: var(--ink-2); font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: .04em; border-bottom: 0; margin-top: 8px; padding-bottom: 2px; display: block; }
	.readout a { color: var(--accent); text-decoration: none; }
</style>
