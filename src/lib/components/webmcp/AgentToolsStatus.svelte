<script lang="ts">
	import type { WebMcpDiagnosticsSnapshot, WebMcpToolHost } from '$lib/webmcp';

	let { host, scope, showCount = true, countLabel = 'agent tools' }: { host: WebMcpToolHost | null; scope: string; showCount?: boolean; countLabel?: string } = $props();
	let snapshot: WebMcpDiagnosticsSnapshot | null = $state(null);

	$effect(() => {
		if (!host) { snapshot = null; return; }
		return host.subscribe((next) => { snapshot = next; });
	});

	let status: { kind: string; label: string; detail: string } = $derived.by(() => {
		if (!snapshot) return { kind: 'checking', label: 'Checking agent tools', detail: 'Registration begins when this page is ready.' };
		const registrations = snapshot.registrations.filter((item) => item.scope === scope);
		const registered = registrations.filter((item) => item.status === 'registered').length;
		const failed = registrations.filter((item) => item.status === 'failed').length;
		const syncEvents = snapshot.events.filter((event) => event.scope === scope && event.phase === 'sync');
		const lastSync = syncEvents.at(-1);
		if (registered > 0 && lastSync?.status === 'success') return { kind: 'ready', label: 'Agent tools ready in this tab', detail: showCount ? `${registered} ${countLabel} registered.` : 'Connected to this page.' };
		if (lastSync?.status === 'unavailable' || (!snapshot.feature.available && lastSync)) return { kind: 'unavailable', label: 'Agent tools unavailable here', detail: 'Bankgraph still works normally in this browser.' };
		if (failed > 0 || lastSync?.status === 'failure') return { kind: 'failed', label: registered ? 'Some agent tools could not load' : 'Agent tools could not load', detail: registered ? `${registered} tools remain available.` : 'Bankgraph still works normally.' };
		return { kind: 'checking', label: 'Checking agent tools', detail: 'Waiting for browser registration.' };
	});
</script>

<div class="agent-status agent-status--{status.kind}" role="status">
	<i aria-hidden="true"></i>
	<span><strong>{status.label}</strong><small>{status.detail}</small></span>
</div>

<style>
	.agent-status { display: inline-flex; align-items: center; gap: .55rem; color: var(--text-tertiary); }
	.agent-status i { width: .48rem; height: .48rem; flex: 0 0 auto; border-radius: 50%; background: var(--text-disabled); }
	.agent-status--ready i { background: var(--positive); box-shadow: 0 0 0 3px rgb(102 207 160 / .1); }
	.agent-status--failed i, .agent-status--unavailable i { background: var(--warning); }
	.agent-status span { display: grid; gap: .1rem; }
	.agent-status strong { color: var(--text-secondary); font-size: .72rem; font-weight: 650; }
	.agent-status small { color: var(--text-tertiary); font-size: 11px; }
</style>
