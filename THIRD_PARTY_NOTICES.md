# Third-party notices

Bankgraph is licensed under the Apache License 2.0 in `LICENSE`. The components and data below retain their own licenses and copyright notices. Exact license texts are preserved in `LICENSES/`.

Versions in this notice match the locked release dependencies on August 30, 2026. Update the notice when a shipped dependency or asset changes.

## Runtime code

| Component | Version | License | Copyright or project |
| --- | ---: | --- | --- |
| Svelte | 5.57.0 | MIT | Copyright 2016–2025 Svelte contributors |
| SvelteKit | 2.70.3 | MIT | Copyright 2020 SvelteKit contributors |
| SvelteKit Cloudflare adapter | 7.2.9 | MIT | Copyright 2020 SvelteKit contributors |
| Apache ECharts | 6.1.0 | Apache-2.0 | Apache Software Foundation |
| zrender | 6.1.0 | BSD-3-Clause | Copyright 2017 Baidu Inc. |
| tslib | 2.3.0 | 0BSD | Microsoft Corporation |
| d3-geo | 3.1.1 | ISC, with the bundled GeographicLib notice | Copyright 2010–2024 Mike Bostock; GeographicLib copyright 2008–2012 Charles Karney |
| d3-array | 3.2.4 | ISC | Copyright 2010–2023 Mike Bostock |
| InternMap | 2.0.3 | ISC | Copyright 2021 Mike Bostock |
| TopoJSON Client | 3.1.0 | ISC | Copyright 2012–2019 Michael Bostock |

The root `LICENSE` file contains the unmodified Apache License 2.0 text used by Bankgraph and Apache ECharts. ECharts also embeds portions of d3.js under the BSD 3-Clause license; that exact text is preserved in `LICENSES/ECharts-D3-BSD-3-Clause.txt`.

## Fonts

The released interface self-hosts these variable fonts through Fontsource packages:

- **Inter** from `@fontsource-variable/inter` 5.3.0. Copyright 2016 The Inter Project Authors. Licensed under the SIL Open Font License 1.1. The package's complete attribution and license are in `LICENSES/Inter-OFL-1.1.txt`.
- **Geist Mono** from `@fontsource-variable/geist-mono` 5.3.0. Copyright 2024 The Geist Project Authors. Licensed under the SIL Open Font License 1.1. The package's complete attribution and license are in `LICENSES/Geist-Mono-OFL-1.1.txt`.

No font name has been modified, and neither font is sold by itself.

## U.S. state topology

`static/us-states-10m.json` is an exact copy of `states-10m.json` from `us-atlas` 3.0.1:

- Package: [topojson/us-atlas](https://github.com/topojson/us-atlas), version 3.0.1.
- Repository file SHA-256: `D76B391CCFA8BFF601D51E3E3DA5D43A89FA46CD5CACA72CE731B383BE5596D0`.
- Verified package file SHA-256: `D76B391CCFA8BFF601D51E3E3DA5D43A89FA46CD5CACA72CE731B383BE5596D0`.
- License: ISC. Copyright 2013–2019 Michael Bostock. The exact text is in `LICENSES/us-atlas-ISC.txt`.
- Source geometry: U.S. Census Bureau cartographic state boundaries, 2017 edition, transformed by the us-atlas project into quantized and simplified TopoJSON. The nation boundary is computed by merging states.

The geometry describes boundaries for visualization. It is not a statement about legal jurisdiction or the status of a bank.

## Public data and the recorded demo

The recorded demo includes a bounded set of FDIC BankFind Suite observations and Bankgraph-derived quarterly aggregates. Those data are not third-party source code and are not relicensed by the repository's Apache License 2.0. U.S. Treasury, BLS, and Federal Reserve Board observations are retrieved at runtime and are not bundled in the demo. Exact agency endpoints, rights pages, reporting periods, transforms, retrieval state, and methodology are documented in `DATA_NOTICE.md`, `demo/fixtures/manifest.json`, and `docs/data-and-methodology.md`. Users remain responsible for rechecking source terms when redistributing the fixture or exported data.

## License files

- `LICENSES/Svelte-MIT.txt`
- `LICENSES/SvelteKit-MIT.txt`
- `LICENSES/adapter-cloudflare-MIT.txt`
- `LICENSES/ECharts-D3-BSD-3-Clause.txt`
- `LICENSES/zrender-BSD-3-Clause.txt`
- `LICENSES/tslib-0BSD.txt`
- `LICENSES/d3-geo-ISC.txt`
- `LICENSES/d3-array-ISC.txt`
- `LICENSES/internmap-ISC.txt`
- `LICENSES/topojson-client-ISC.txt`
- `LICENSES/Inter-OFL-1.1.txt`
- `LICENSES/Geist-Mono-OFL-1.1.txt`
- `LICENSES/us-atlas-ISC.txt`
