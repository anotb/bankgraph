# Privacy

This note describes the behavior of the checked-in Bankgraph application. A deployment operator may configure additional infrastructure, so review the deployed site's policies alongside this document.

## Workspace data

Bankgraph does not require an account for ordinary research. The browser stores the current question, filters, selected and excluded banks, cohort recipe, charts, findings, and watchlist intent in local storage under `bankgraph-workspace-v1`. Named workspaces use `bankgraph.saved-workspaces.v1`; the older bank watchlist uses `bde-watchlist`. This state stays in the browser unless a person exports it, copies a share link, clears site data, or uses a browser feature that synchronizes local data.

The application requests public bank and economic data from its own API routes. The checked-in client does not configure advertising trackers, product analytics, or a third-party error-monitoring service. Cloudflare and other network operators may still process standard request metadata according to the deployment operator's configuration and their own terms.

## Live links are not private

**Copy live link** creates a self-contained URL and copies it to the clipboard; it does not create an access-controlled server record. The URL query contains a bounded, encoded—not encrypted—copy of the workspace, including:

- the research question and screen filters;
- selected and excluded FDIC certificate numbers;
- the cohort recipe, periods, chart settings, and active view;
- finding titles, provenance, and up to 96 characters of each finding note;
- up to 160 characters of each finding source; and
- watchlist intent.

Anyone who receives the link can decode, retain, or forward that information. The URL can also appear in browser history, clipboards, messages, link-preview systems, and hosting or proxy logs when it is opened. Opening it writes the decoded workspace to that browser's local storage. Truncation keeps the link within a safe browser budget; it is not a confidentiality control.

Do not put personal, confidential, or embargoed information in a workspace that will be shared. Review finding summaries before copying the link. A self-contained link cannot be revoked; create a new workspace state and share a new link if its contents should change.

## Evidence snapshot downloads

**Evidence snapshot (JSON)** creates a local file rather than a hosted permalink. It includes the full local workspace state, selected observations, normalized financial rows, coverage, formulas, cohort membership, and published release ID. Values in that file do not update when Bankgraph publishes a new release. The file can still contain research questions and full finding notes, so review it before sending it to someone else.

## Clearing local state

Clear Bankgraph's site data in the browser to remove its locally persisted workspace. Clearing local data does not remove copies already exported, shared, logged, or saved by a recipient.

## Contact

For a privacy question that does not contain sensitive information, use the repository's public discussion area. Security reports and sensitive privacy concerns should follow [SECURITY.md](SECURITY.md) and use GitHub's private vulnerability reporting.
