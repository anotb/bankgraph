<svelte:head>
	<title>Privacy | Bankgraph</title>
	<meta
		name="description"
		content="How Bankgraph stores workspace data, what share links contain, and how to clear local research state."
	/>
	<meta property="og:title" content="Privacy | Bankgraph" />
	<meta
		property="og:description"
		content="How Bankgraph stores workspace data, what share links contain, and how to clear local research state."
	/>
</svelte:head>

<article class="privacy-page">
	<header>
		<h1>Privacy</h1>
		<p>
			Bankgraph works without an account. Your research stays in this browser unless you export it,
			copy a share link, clear site data, or use a browser that synchronizes local data.
		</p>
	</header>

	<dl class="privacy-summary" aria-label="Privacy summary">
		<div>
			<dt>Account</dt>
			<dd>Not required for ordinary research</dd>
		</div>
		<div>
			<dt>Workspace storage</dt>
			<dd>Saved in your browser</dd>
		</div>
		<div>
			<dt>Share links</dt>
			<dd>Readable by anyone who receives the link</dd>
		</div>
	</dl>

	<section aria-labelledby="browser-storage">
		<h2 id="browser-storage">What stays in your browser</h2>
		<div>
			<p>
				Bankgraph stores the current research question, filters, selected and excluded banks, cohort
				recipe, charts, findings, and watchlist intent in local browser storage. Named workspaces and
				the older bank watchlist are stored there too.
			</p>
			<p>
				This workspace data is not sent to a Bankgraph account because ordinary research does not use
				accounts. It leaves the browser when you choose to export it or copy a share link.
			</p>
		</div>
	</section>

	<section aria-labelledby="share-links">
		<h2 id="share-links">Share links are not private</h2>
		<div>
			<p>
				The Share action copies a self-contained URL. It does not create an access-controlled server
				record. The URL contains an encoded, not encrypted, copy of the workspace.
			</p>
			<p>The link can include:</p>
			<ul>
				<li>the research question and screen filters;</li>
				<li>selected and excluded FDIC certificate numbers;</li>
				<li>the cohort recipe, periods, chart settings, and active view;</li>
				<li>finding titles, provenance, and up to 96 characters from each finding note;</li>
				<li>up to 160 characters from each finding source; and</li>
				<li>watchlist intent.</li>
			</ul>
			<p>
				Anyone with the link can read, retain, or forward this information. The URL may also appear in
				browser history, clipboards, messages, link previews, and network logs. Opening the link saves
				the decoded workspace in the recipient's browser.
			</p>
			<p>
				A self-contained link cannot be revoked. Do not include personal, confidential, or embargoed
				information in a workspace you plan to share.
			</p>
		</div>
	</section>

	<section aria-labelledby="exports">
		<h2 id="exports">Exports</h2>
		<div>
			<p>
				A workspace JSON export contains the complete local workspace, including full finding text.
				Share links shorten finding notes and sources to keep the URL within a safe browser length; that
				shortening is not a confidentiality measure.
			</p>
		</div>
	</section>

	<section aria-labelledby="network-data">
		<h2 id="network-data">Data requests</h2>
		<div>
			<p>
				The application requests public bank and economic data from Bankgraph's own API routes. The
				client does not configure advertising trackers, product analytics, or a third-party error
				monitoring service.
			</p>
			<p>
				Cloudflare and other network operators may process standard request metadata according to the
				site's configuration and their own terms.
			</p>
		</div>
	</section>

	<section aria-labelledby="clear-data">
		<h2 id="clear-data">Clear local data</h2>
		<div>
			<p>
				Clear Bankgraph's site data in your browser to remove locally saved workspaces and watchlists.
				This does not remove files you exported, links you shared, logged copies, or work saved by a
				recipient.
			</p>
		</div>
	</section>
</article>

<style>
	.privacy-page {
		max-width: 900px;
		margin: 1.5rem auto 4.5rem;
	}

	header {
		max-width: 720px;
		padding-bottom: 2rem;
	}

	h1 {
		margin: 0;
		color: var(--text-primary);
		font-size: 18px;
		font-weight: 680;
		letter-spacing: -0.03em;
		line-height: 1.05;
	}

	header p {
		margin: 1rem 0 0;
		max-width: 65ch;
		color: var(--text-secondary);
		font-size: 14px;
		line-height: 1.65;
	}

	.privacy-summary {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		margin: 0 0 2.25rem;
		border-top: 1px solid var(--border);
		border-bottom: 1px solid var(--border);
	}

	.privacy-summary div {
		min-width: 0;
		padding: 0.85rem 1rem 0.95rem 0;
	}

	.privacy-summary div + div {
		padding-left: 1rem;
		border-left: 1px solid var(--border-muted);
	}

	dt {
		color: var(--text-tertiary);
		font-size: 0.72rem;
		font-weight: 650;
		letter-spacing: 0.055em;
		text-transform: uppercase;
	}

	dd {
		margin: 0.25rem 0 0;
		color: var(--text-primary);
		font-size: 0.88rem;
		line-height: 1.45;
	}

	section {
		display: grid;
		grid-template-columns: minmax(150px, 0.35fr) minmax(0, 1fr);
		gap: 2rem;
		padding: 1.65rem 0;
		border-top: 1px solid var(--border-muted);
	}

	h2 {
		margin: 0;
		color: var(--text-primary);
		font-size: 0.9rem;
		font-weight: 650;
		line-height: 1.4;
	}

	section p,
	section li {
		max-width: 70ch;
		color: var(--text-secondary);
		font-size: 0.9rem;
		line-height: 1.7;
	}

	section p {
		margin: 0;
	}

	section p + p,
	section ul + p,
	section p + ul {
		margin-top: 0.8rem;
	}

	section ul {
		margin-bottom: 0;
		padding-left: 1.2rem;
	}

	section li + li {
		margin-top: 0.25rem;
	}

	@media (max-width: 640px) {
		.privacy-page {
			margin-top: 0.75rem;
			margin-bottom: 3rem;
		}

		header {
			padding-bottom: 1.4rem;
		}

		.privacy-summary {
			grid-template-columns: 1fr;
			margin-bottom: 1.5rem;
		}

		.privacy-summary div,
		.privacy-summary div + div {
			padding: 0.75rem 0;
			border-left: 0;
		}

		.privacy-summary div + div {
			border-top: 1px solid var(--border-muted);
		}

		section {
			grid-template-columns: 1fr;
			gap: 0.65rem;
			padding: 1.25rem 0;
		}
	}
</style>
