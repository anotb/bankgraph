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
