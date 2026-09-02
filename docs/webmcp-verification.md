# WebMCP verification

## Automated checks

Run the focused unit suite:

```text
npx vitest run src/lib/webmcp/diagnostics.test.ts src/lib/webmcp/host.test.ts
```

Then run the repository gates:

```text
npm run typecheck
npm run test
npm run build
```

The fake `modelContext` suite deterministically covers:

- exact `?webmcp=debug` activation and browser-environment signal presentation;
- unavailable, registering, registered, partial, and failed catalog summaries;
- unavailable-browser degradation;
- registration and AbortController cleanup;
- idempotent re-sync with a refreshed controller;
- exact `readOnlyHint` and `untrustedContentHint` forwarding;
- browser execution-signal propagation and cancellation rejection;
- duplicate names within a route and across route scopes;
- external route-controller cleanup;
- registration timing and failure diagnostics;
- rejection of unbounded input schemas; and
- success/error envelope budgeting at 1,400 characters by default and 32,768 characters for declared analytical or artifact results.

## Choose a supported browser

WebMCP is progressive enhancement. Bankgraph continues to work when `document.modelContext` is
absent. For the product demonstration, use the ChatGPT desktop in-app browser and keep the Bankgraph
tab open while you talk to ChatGPT. Chrome can also expose the experimental API through its current
origin-trial or local testing setup; confirm the current browser documentation before relying on it.

The document must be served from a secure context. WebMCP is gated by the `tools` Permissions Policy,
which defaults to `self`. `crossOriginIsolated` is a separate signal and does not need to be true.
See [OpenAI's site-tools guide](https://help.openai.com/en/articles/20001423-using-site-tools-in-the-chatgpt-desktop-app),
[Chrome's WebMCP guide](https://developer.chrome.com/docs/ai/webmcp), and the
[WebMCP specification](https://webmachinelearning.github.io/webmcp/).

## Run the browser smoke check

1. Open `/b?webmcp=debug` in the supported browser. Confirm the panel reports the browser API,
   secure-context state, origin isolation, registration state, the contextual tool list, and the
   latest registration or error.
2. Invoke a read tool through the browser agent. Confirm the visible workspace and the panel's
   execution diagnostics update.
3. Change the workspace by hand, call `bankgraph.get_context`, and confirm the returned revision and
   selection reflect the human edit.
4. Navigate to a route with a smaller catalog. Confirm the workspace registrations disappear and
   only that route's names remain.
5. Cancel one invocation. Confirm the underlying request receives the same aborted signal.
6. Repeat step 1 in an ordinary browser profile with no WebMCP experiment. Confirm the workspace
   still works and the panel reports `missing-model-context` with zero registered tools.

The `webmcp=debug` query also registers the developer-only diagnostics tool. It does not change bank
data or workspace calculations. Chrome's Model Context Tool Inspector can list and manually call
registrations, validate schemas, and run natural-language prompts. It is a test client and is
separate from Gemini in Chrome.

### Research board smoke check

Open a fresh workspace in a supported browser and ask the agent to build the answer in Bankgraph.
A complete smoke check should:

1. Read the current context and board, including both revisions.
2. Load a curated board or add a reported-history chart and exact bank-by-measure table.
3. Read each view without specifying a section and confirm the primary exact data matches the visible chart or table.
4. Configure one view, change the theme, and add a takeaway tied to the views that support it.
5. Resize, focus, or reconfigure a view by hand, then confirm the next agent read sees the change.
6. Retry a presentation mutation with the old revision and confirm it fails as stale instead of replacing the human edit.
7. Clear the board, restore a template, reset its automatic layout, and confirm each operation is visible and idempotent.

For the full demonstration, ask the agent to study the eight quarters before U.S. bank failures from
2007 through 2012, publish the event trajectories and current analogues as separate views of the same
result, compare the leading current institutions, and add a short linked takeaway. The analysis should
appear on the page as the tools run; the final answer should not exist only in chat.

The API is still a Community Group draft, so re-check the
[imperative WebMCP IDL](https://webmachinelearning.github.io/webmcp/#model-context-container) before
updating browser experiment versions. As of September 1, 2026, cleanup uses the `signal` option on
`registerTool()`, execution cancellation is delivered through the callback options, and the tool
dictionary has no `outputSchema` member.

# Board semantic-tool checks

`src/lib/webmcp/eval-fixtures.ts` records natural-language invocation cases for bank screening,
multi-bank comparison, peer distributions, metric relationships, geography, economic context,
watchlist idempotency, deterministic change attribution, board presentation control, and the deliberate
absence of pipeline control. These fixtures verify descriptions and schemas; they do not claim that
every model will choose the same tool for every wording.

Run the focused suite with:

```sh
npx vitest run src/lib/webmcp/catalog.test.ts src/lib/webmcp/browser-services.test.ts src/lib/webmcp/host.test.ts
```

The suite also exercises registration through a fake `modelContext`, default and extended result
envelopes, payload-fitted complete cursor pages, current-cohort and cohort-trend reads, stale revisions,
cancellation before a prepared mutation commits, runtime rejection before side effects, and repeated
desired state returning `changed: false`.

Current-cohort analyses that hydrate complete histories in the browser support up to 200 institutions
in one interactive workspace. That is a client computation limit, not a claim about the analytical
universe or a D1 limit. Server-backed failed-bank research ranks the full eligible active population;
its returned analogue count controls presentation only. For a larger browser-side cohort, refine the
screen before requesting a history-heavy analysis.

For the complete recorded-data and WebMCP contract check, run:

```sh
npm run demo:verify
```

The command has a 170-second deadline. On a normal local install it completes in a few seconds and
fails if the recorded FDIC rows, attribution semantics, schemas, pagination, mutation guarantees,
or browser-host envelopes drift.
