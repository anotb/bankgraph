# Verify Bankgraph locally

Bankgraph includes a recorded FDIC dataset so the research board and WebMCP contracts can be checked without production credentials or a network data load. The recorded path is explicit: the interface labels it as recorded data and never substitutes it for an unavailable live release.

## Run the automated verification

Use Node.js 22 and install the locked dependencies first:

```sh
npm ci
npm run demo:verify
```

The command verifies the recorded dataset pin, seeds an isolated local D1 database, starts the built application, and exercises the shared workspace and WebMCP behavior. It does not deploy the application or write to a production database.

## Open the recorded board

Create the local variables file, seed the fixture, and start the development server:

```sh
cp .dev.vars.example .dev.vars
npm run db:migrate:local
node demo/fixtures/seed-local.mjs
npm run dev
```

On Windows PowerShell, use `Copy-Item .dev.vars.example .dev.vars` instead of `cp`. Open `http://localhost:5173/b?demo=recorded` and keep the recorded-source label visible.

The fixture contains 12 quarterly FDIC observations for six named institutions through June 30, 2026. Its industry aggregates were calculated separately from every institution returned for each pinned quarter. Bankgraph does not present the six selected institutions as the U.S. banking system. Read [the fixture guide](../demo/fixtures/README.md) and [the data notice](../DATA_NOTICE.md) for the exact scope and checksums.

## Check the live deployment

For a live release, confirm the following before relying on an analysis:

- `/api/v1/ready` reports `ready: true` and matching D1 and cache generations.
- `/api/v1/meta` reports the expected FDIC quarter, source mode, population counts, and retrieval time.
- A supported browser registers the route-appropriate WebMCP tools.
- A natural-language investigation updates the same visible bank, metrics, periods, cohort, views, and layout a person can edit.
- A structured view read returns the exact values behind a visible chart or table after either the person or agent changes it.
- Reported component bridges disclose their residual, and peer results retain the exact cohort definition.

Run the critical browser suite for the full human workflow:

```sh
npm run test:e2e
```

## Try the shared board with ChatGPT

Open the [live Bankgraph site](https://bankgraph.anot-irky.workers.dev/) in ChatGPT's in-app browser, or use Chrome with WebMCP testing enabled. Bankgraph registers its site tools on every primary page, so the first request can begin from the home page, the institution directory, the economy page, or an existing board.

These prompts exercise the shortest complete path:

1. “Open the failure analogues board and show me what it says about active banks that resemble past failures.”
2. “Read the exact data behind this board. What is the strongest pattern, and what should I be careful not to infer from it?”
3. “Start a fresh board. Compare JPMorgan Chase with readable peers in its asset group across size, funding, credit quality, profitability, and capital.”
4. “Add several more peers, change one view to focus on deposits, and place the exact table below the charts.”

The important result is visible in Bankgraph rather than confined to the chat response. The agent should load or compose the views, the person should be able to revise them, and a later structured read should reflect those revisions without reading numbers from a screenshot.
