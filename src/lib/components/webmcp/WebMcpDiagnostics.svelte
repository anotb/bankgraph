<script lang="ts">
	import { onMount } from 'svelte';
	import {
		describeWebMcpUnavailableReason,
		readWebMcpBrowserEnvironment,
		summarizeWebMcpDiagnostics,
		type WebMcpBrowserEnvironment,
		type WebMcpDiagnosticEvent,
		type WebMcpDiagnosticsSnapshot,
		type WebMcpRegistrationState,
		type WebMcpToolHost
	} from '$lib/webmcp/index.js';

	let { host, class: className = '' }: { host: WebMcpToolHost; class?: string } = $props();
	let snapshot = $state<WebMcpDiagnosticsSnapshot>({
		feature: { available: false, reason: 'not-browser' },
		updatedAt: 0,
		registrations: [],
		events: []
	});
	let browserEnvironment = $state<WebMcpBrowserEnvironment>({
		secureContext: null,
		originAgentCluster: null,
		crossOriginIsolated: null
	});

	onMount(() => {
		browserEnvironment = readWebMcpBrowserEnvironment(globalThis);
	});

	$effect(() => {
		snapshot = host.getDiagnostics();
		return host.subscribe((next) => {
			snapshot = next;
		});
	});

	let diagnostics = $derived(summarizeWebMcpDiagnostics(snapshot));
	let registrationLabel = $derived(registrationStateLabel(diagnostics.registrationState));

	function registrationStateLabel(state: WebMcpRegistrationState): string {
		switch (state) {
			case 'unavailable': return 'Unavailable';
			case 'idle': return 'Waiting to register';
			case 'registering': return 'Registering';
			case 'registered': return 'Registered';
			case 'partial': return 'Partly registered';
			case 'failed': return 'Registration failed';
		}
	}

	function booleanLabel(value: boolean | null, trueLabel: string, falseLabel: string): string {
		if (value === null) return 'Not reported';
		return value ? trueLabel : falseLabel;
	}

	function eventLabel(event: WebMcpDiagnosticEvent | null): string {
		if (!event) return 'None recorded';
		const tool = event.toolName ? `${event.toolName} · ` : '';
		const timing = event.durationMs === undefined ? '' : ` · ${event.durationMs.toFixed(1)} ms`;
		return `${tool}${event.status}${timing}`;
	}
</script>

<section
	class="webmcp-diagnostics {className}"
	aria-labelledby="webmcp-diagnostics-title"
	data-state={diagnostics.registrationState}
>
	<header class="diagnostics-header">
		<div>
			<h2 id="webmcp-diagnostics-title">WebMCP diagnostics</h2>
			<p>Live browser and route-registration state. This panel does not enable WebMCP or attach an agent.</p>
		</div>
		<p class="registration-state" aria-live="polite">{registrationLabel}</p>
	</header>

	<dl class="status-grid">
		<div class="status-item">
			<dt>Browser API</dt>
			<dd>{snapshot.feature.available ? 'Available' : 'Unavailable'}</dd>
			<p>
				{snapshot.feature.available
					? 'document.modelContext.registerTool() is callable.'
					: describeWebMcpUnavailableReason(snapshot.feature.reason)}
			</p>
		</div>
		<div class="status-item">
			<dt>Origin isolation</dt>
			<dd>{booleanLabel(browserEnvironment.originAgentCluster, 'Origin-isolated', 'Not origin-isolated')}</dd>
			<p>
				Secure context: {booleanLabel(browserEnvironment.secureContext, 'yes', 'no')}.
				Cross-origin isolation: {booleanLabel(browserEnvironment.crossOriginIsolated, 'on', 'off')}.
			</p>
		</div>
		<div class="status-item">
			<dt>Registration</dt>
			<dd>{registrationLabel}</dd>
			<p>{diagnostics.failedRegistrations.length} failed registration{diagnostics.failedRegistrations.length === 1 ? '' : 's'}.</p>
		</div>
		<div class="status-item">
			<dt>Registered tools</dt>
			<dd class="tabular-nums">{diagnostics.activeRegistrations.length}</dd>
			<p>{snapshot.registrations.length} registration record{snapshot.registrations.length === 1 ? '' : 's'} observed on this page.</p>
		</div>
	</dl>

	<div class="event-grid">
		<div>
			<h3>Last registration</h3>
			<p class="event-summary">{eventLabel(diagnostics.lastRegistration)}</p>
			{#if diagnostics.lastRegistration}
				<p class="event-detail">{diagnostics.lastRegistration.message}</p>
			{/if}
		</div>
		<div>
			<h3>Last error</h3>
			<p class="event-summary">{eventLabel(diagnostics.lastError)}</p>
			{#if diagnostics.lastError}
				<p class="event-detail">{diagnostics.lastError.message}</p>
			{/if}
		</div>
	</div>

	<section class="tool-section" aria-labelledby="registered-tools-title">
		<div class="section-heading">
			<h3 id="registered-tools-title">Registered tool names</h3>
			<span class="tabular-nums">{diagnostics.activeRegistrations.length}</span>
		</div>
		{#if diagnostics.activeRegistrations.length}
			<ul class="tool-list">
				{#each diagnostics.activeRegistrations as registration (`${registration.scope}:${registration.toolName}`)}
					<li>
						<code>{registration.toolName}</code>
						<span>
							{registration.scope}
							{#if registration.registrationMs !== undefined}
								· {registration.registrationMs.toFixed(1)} ms
							{/if}
						</span>
					</li>
				{/each}
			</ul>
		{:else}
			<p class="empty-state">
				{snapshot.feature.available
					? 'No tools are registered for this route yet.'
					: 'No tools can register until the browser exposes the WebMCP API.'}
			</p>
		{/if}
	</section>

	<details class="setup-notes" open={!snapshot.feature.available}>
		<summary>Chrome availability and test setup</summary>
		<div>
			<p>
				Chrome documents WebMCP as an origin-trial feature for milestones 149–156. A production origin
				needs a valid origin-trial token while that trial applies. Chromium lists milestone 157 as the
				estimated shipping target, not as a compatibility guarantee.
			</p>
			<p>
				For local development, Chrome documents the dedicated
				<code>chrome://flags/#enable-webmcp-testing</code> flag. The page cannot change that setting;
				relaunch Chrome after changing it in a test profile. The Model Context Tool Inspector is a
				separate test client, not Gemini in Chrome.
			</p>
			<p>
				WebMCP also requires a secure, origin-isolated document and is gated by the <code>tools</code>
				Permissions Policy. <code>crossOriginIsolated</code> is a separate browser signal and can remain
				false when WebMCP is available.
			</p>
			<p>
				<a href="https://developer.chrome.com/docs/ai/webmcp" target="_blank" rel="noreferrer">Read Chrome's WebMCP setup and inspector guide</a>
			</p>
		</div>
	</details>
</section>

<style>
	.webmcp-diagnostics {
		margin: 0.5rem;
		border: 1px solid var(--border);
		border-radius: 0;
		background: var(--surface-1);
		color: var(--text-secondary);
		font-size: 12px;
		line-height: 1.45;
	}

	.diagnostics-header {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 1rem;
		padding: 0.875rem 1rem;
	}

	.diagnostics-header h2 {
		margin: 0;
		color: var(--text-primary);
		font-size: 13px;
		font-weight: 650;
		letter-spacing: -0.015em;
	}

	.diagnostics-header p {
		max-width: 72ch;
		margin: 0.25rem 0 0;
	}

	.registration-state {
		flex: 0 0 auto;
		margin: 0 !important;
		padding: 0.2rem 0.5rem;
		border-radius: 0;
		background: var(--accent-muted);
		color: var(--accent-text);
		font-size: 11px;
		font-weight: 650;
	}

	.webmcp-diagnostics[data-state='unavailable'] .registration-state,
	.webmcp-diagnostics[data-state='failed'] .registration-state,
	.webmcp-diagnostics[data-state='partial'] .registration-state {
		background: var(--warning-muted);
		color: var(--warning);
	}

	.status-grid {
		display: grid;
		grid-template-columns: repeat(4, minmax(0, 1fr));
		margin: 0;
		border-block: 1px solid var(--border-muted);
	}

	.status-item {
		min-width: 0;
		padding: 0.75rem 1rem;
	}

	.status-item + .status-item {
		border-inline-start: 1px solid var(--border-muted);
	}

	.status-item dt,
	.event-grid h3,
	.section-heading h3 {
		margin: 0;
		color: var(--text-secondary);
		font-size: 11px;
		font-weight: 600;
	}

	.status-item dd {
		margin: 0.15rem 0 0;
		color: var(--text-primary);
		font-size: 14px;
		font-weight: 570;
	}

	.status-item p {
		margin: 0.25rem 0 0;
		color: var(--text-secondary);
		font-size: 11px;
		overflow-wrap: anywhere;
	}

	.event-grid {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 1rem;
		padding: 0.875rem 1rem;
		border-bottom: 1px solid var(--border-muted);
	}

	.event-grid > div {
		min-width: 0;
	}

	.event-summary {
		margin: 0.25rem 0 0;
		color: var(--text-primary);
		font-family: var(--font-mono);
		font-size: 11px;
		font-variant-numeric: tabular-nums;
		overflow-wrap: anywhere;
	}

	.event-detail {
		margin: 0.2rem 0 0;
		color: var(--text-secondary);
		font-size: 11px;
		overflow-wrap: anywhere;
	}

	.tool-section {
		padding: 0.875rem 1rem 1rem;
	}

	.section-heading {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		margin-bottom: 0.5rem;
	}

	.section-heading span {
		color: var(--text-secondary);
		font-size: 11px;
	}

	.tool-list {
		max-height: 13rem;
		margin: 0;
		padding: 0;
		overflow: auto;
		list-style: none;
		scrollbar-color: var(--border) var(--surface-1);
		scrollbar-width: thin;
	}

	.tool-list li {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto;
		gap: 0.75rem;
		padding: 0.35rem 0;
		border-top: 1px solid var(--border-muted);
	}

	.tool-list code,
	.setup-notes code {
		color: var(--text-primary);
		font-family: var(--font-mono);
		font-size: 11px;
		overflow-wrap: anywhere;
	}

	.tool-list span {
		color: var(--text-secondary);
		font-size: 11px;
		font-variant-numeric: tabular-nums;
		white-space: nowrap;
	}

	.empty-state {
		margin: 0;
		padding: 0.75rem 0;
		border-top: 1px solid var(--border-muted);
		color: var(--text-secondary);
	}

	.setup-notes {
		border-top: 1px solid var(--border-muted);
	}

	.setup-notes summary {
		padding: 0.75rem 1rem;
		color: var(--text-primary);
		font-weight: 600;
		cursor: pointer;
	}

	.setup-notes > div {
		max-width: 75ch;
		padding: 0 1rem 1rem;
	}

	.setup-notes p {
		margin: 0.55rem 0 0;
	}

	.setup-notes a {
		color: var(--accent-text);
		text-decoration: underline;
		text-decoration-thickness: 1px;
		text-underline-offset: 0.2em;
	}

	.setup-notes a:hover {
		color: var(--accent-hover);
	}

	@media (max-width: 800px) {
		.status-grid {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}

		.status-item:nth-child(3) {
			border-inline-start: 0;
		}

		.status-item:nth-child(n + 3) {
			border-top: 1px solid var(--border-muted);
		}
	}

	@media (max-width: 520px) {
		.diagnostics-header {
			align-items: stretch;
			flex-direction: column;
		}

		.registration-state {
			align-self: flex-start;
		}

		.status-grid,
		.event-grid {
			grid-template-columns: minmax(0, 1fr);
		}

		.status-item + .status-item {
			border-inline-start: 0;
			border-top: 1px solid var(--border-muted);
		}

		.tool-list li {
			grid-template-columns: minmax(0, 1fr);
			gap: 0.1rem;
		}

		.tool-list span {
			white-space: normal;
		}
	}
</style>
