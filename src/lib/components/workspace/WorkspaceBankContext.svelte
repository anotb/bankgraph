<script lang="ts">
  import type { BankContext } from "$lib/server/bank-context";
  import { WebMcpHost } from "$lib/components/webmcp/index.js";
  import { createBankSystemContextTools } from "$lib/webmcp/index.js";
  let {
    cert,
    bankName,
    sourceMode = "live"
  }: {
    cert: number | null;
    bankName: string | null;
    sourceMode?: "live" | "recorded";
  } = $props();
  let data = $state<BankContext | null>(null);
  let status = $state<"idle" | "loading" | "ready" | "error">("idle");
  let errorMessage = $state("");
  let reload = $state(0);
  let selectedFootprint = $state<number | null>(null);
  let selectedMarket = $state(0);
  let selectedIndustry = $state(0);
  let webMcpTools = $derived(data ? createBankSystemContextTools(data, bankName, {
    footprintIndex: selectedFootprint,
    marketIndex: selectedMarket,
    industryIndex: selectedIndustry
  }) : []);

  $effect(() => {
    const currentCert = cert;
    reload;
    if (sourceMode === "recorded") {
      data = null;
      status = "idle";
      errorMessage = "";
      return;
    }
    if (!currentCert) { data = null; status = "idle"; return; }
    const controller = new AbortController();
    data = null;
    status = "loading";
    errorMessage = "";
    void fetch(`/api/v2/banks/${currentCert}/context`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(response.status === 404
          ? "No linked institution context was found for this bank."
          : "Institution context could not be loaded.");
        const next = await response.json() as BankContext;
        data = next;
        selectedFootprint = Math.max(0, next.footprint.length - 1);
        selectedMarket = 0;
        selectedIndustry = Math.max(0, next.industry.length - 1);
        status = "ready";
      })
      .catch((error) => { if (error.name !== "AbortError") { data = null; status = "error"; errorMessage = error.message; } });
    return () => controller.abort();
  });

  let footprint = $derived(data && selectedFootprint !== null ? data.footprint[selectedFootprint] : null);
  let market = $derived(data?.markets[selectedMarket] ?? null);
  let industry = $derived(data?.industry[selectedIndustry] ?? null);
  const money = (value: number | null | undefined) => value == null ? "—" : `$${(value / 1_000_000).toFixed(value >= 10_000_000 ? 0 : 1)}B`;
  const number = (value: number | null | undefined) => value == null ? "—" : value.toLocaleString("en-US");
</script>

<WebMcpHost scope="workspace-bank-system-context" tools={webMcpTools} />

<div class="context" aria-busy={status === "loading"}>
  <header>
    <div><h2>Institution & system context</h2><p>Annual branch markets, structural history, and the long-run U.S. banking system</p></div>
    <span>{bankName ?? "Select a bank"}</span>
  </header>
  {#if status === "loading"}<div class="state" role="status" aria-live="polite" aria-atomic="true">Loading linked FDIC context…</div>
  {:else if status === "error"}<div class="state" role="alert" aria-live="assertive" aria-atomic="true"><strong>{errorMessage}</strong><span>The quarterly workspace remains available.</span><button type="button" onclick={() => reload++}>Retry context</button></div>
  {:else if sourceMode === "recorded"}<div class="state" role="status" aria-live="polite"><strong>Linked annual context is not part of this recorded workspace.</strong><span>Open the live workspace to load branch markets, structural history, and the U.S. banking system series.</span></div>
  {:else if !data}<div class="state" role="status" aria-live="polite">Select a bank to open its footprint and history.</div>
  {:else}<div class="context-grid">
    <section aria-labelledby="footprint-title">
      <h3 id="footprint-title">Branch footprint</h3>
      {#if footprint}
        <div class="facts"><strong>{number(footprint.branches)} branches</strong><span>{footprint.states} states · {footprint.counties} counties · {money(footprint.deposits)} deposits allocated to branches</span></div>
        <label>Summary of Deposits year <output>{footprint.year}</output><input type="range" min="0" max={Math.max(0, data.footprint.length - 1)} step="1" bind:value={selectedFootprint} /></label>
      {:else}<p>No published SOD footprint is linked to this certificate.</p>{/if}
      <small>Annual June 30 branch allocation; amounts are reported in thousands of dollars.</small>
      {#if footprint}<details class="source-record">
          <summary>Source record</summary>
          <dl>
            <dt>R2 object SHA-256</dt><dd><code>{footprint.source.objectSha256}</code></dd>
            <dt>Manifest</dt><dd><code>{footprint.source.manifestKey}</code></dd>
            <dt>Retrieved</dt><dd>{footprint.source.retrievedAt}</dd>
          </dl>
        </details>{/if}
    </section>
    <section aria-labelledby="markets-title">
      <h3 id="markets-title">Largest deposit markets</h3>
      {#if data.markets.length}
        <div class="market-list" role="group" aria-label="Largest county deposit markets">
          {#each data.markets as item, index}<button type="button" aria-pressed={selectedMarket === index} class:active={selectedMarket === index} onclick={() => selectedMarket = index}><span>{item.county}, {item.state}</span><b>{item.depositShare == null ? "—" : `${item.depositShare.toFixed(1)}%`}</b></button>{/each}
        </div>
        {#if market}<p class="detail">{market.branches} branches · {money(market.bankDeposits)} of {money(market.marketDeposits)} county deposits · {market.competingBanks} reporting banks</p>{/if}
      {:else}<p>No county market rows are available in the current SOD snapshot.</p>{/if}
      {#if data.provenance.sodCurrent}<details class="source-record">
          <summary>Current SOD publication</summary>
          <dl>
            <dt>Source run</dt><dd><code>{data.provenance.sodCurrent.sourceRunId}</code></dd>
            <dt>Source retrieved</dt><dd>{data.provenance.sodCurrent.sourceRetrievedAt}</dd>
            <dt>R2 object SHA-256</dt><dd><code>{data.provenance.sodCurrent.objectSha256}</code></dd>
            <dt>Manifest</dt><dd><code>{data.provenance.sodCurrent.manifestKey}</code></dd>
          </dl>
        </details>{/if}
    </section>
    <section aria-labelledby="industry-title">
      <h3 id="industry-title">U.S. banking system</h3>
      {#if industry}
        <div class="facts"><strong>{money(industry.assets)} assets</strong><span>{number(industry.banks)} institutions · {number(industry.branches)} branches</span></div>
        <label>Annual summary year <output>{industry.year}</output><input type="range" min="0" max={Math.max(0, data.industry.length - 1)} step="1" bind:value={selectedIndustry} /></label>
        <p class="detail">{money(industry.deposits)} deposits · {money(industry.loans)} net loans · {number(industry.employees)} employees</p>
      {:else}<p>No national annual-summary series is available.</p>{/if}
      <small>FDIC Annual Summary, commercial banks plus savings institutions.</small>
      {#if industry}<details class="source-record">
          <summary>Annual Summary source runs</summary>
          <dl>
            {#each industry.sources as source}
              <dt>{source.charterType}</dt><dd><code>{source.sourceRunId}</code> · retrieved {source.sourceRetrievedAt ?? "not reported"}</dd>
            {/each}
            <dt>Release generation</dt><dd><code>{data.provenance.publicationGeneration ?? "not available"}</code></dd>
          </dl>
        </details>{/if}
    </section>
    <section aria-labelledby="structure-title">
      <h3 id="structure-title">Structural history</h3>
      {#if data.structuralHistory.length}<ol>{#each data.structuralHistory.slice(0, 6) as event}<li><time datetime={`${event.date.slice(0, 4)}-${event.date.slice(4, 6)}-${event.date.slice(6)}`}>{event.date.slice(0, 4)}-{event.date.slice(4, 6)}-{event.date.slice(6)}</time><span>{event.description}</span></li>{/each}</ol>
      {:else if data.coverage.historyPartitions > 0}<p>No merger, acquisition, closure, or charter event is mapped to this certificate in the published history.</p>
      {:else}<p>Published FDIC history partitions are unavailable.</p>{/if}
      <small>Only history rows mapped to this FDIC certificate are checked; other rows use entity identifiers that are not yet resolved here. Events do not, by themselves, explain a financial change.</small>
    </section>
  </div>{/if}
</div>

<style>
  .context header { min-height:50px; display:flex; justify-content:space-between; gap:.7rem; padding:.7rem .8rem; border-bottom:1px solid var(--workspace-rule); }
  h2,h3,p { margin:0; } h2 { color:var(--workspace-ink); font-size:13px; } header p, section p, small { color:var(--workspace-muted); font-size:11px; } header span { color:var(--workspace-cyan); font:11px var(--workspace-data-font); max-width:240px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .context-grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); }
  section { min-width:0; padding:.7rem .8rem; border-right:1px solid var(--workspace-rule-soft); border-bottom:1px solid var(--workspace-rule-soft); }
  h3 { margin-bottom:.45rem; color:var(--workspace-ink); font-size:11px; text-transform:uppercase; letter-spacing:.05em; }
  .facts { display:grid; gap:.12rem; margin-bottom:.55rem; } .facts strong { color:var(--workspace-cyan); font:14px var(--workspace-data-font); } .facts span,.detail { color:var(--workspace-muted); font-size:11px; }
  label { display:grid; grid-template-columns:1fr auto; gap:.25rem; color:var(--workspace-muted); font-size:11px; } output { color:var(--workspace-ink); font-family:var(--workspace-data-font); } input { grid-column:1/-1; width:100%; accent-color:var(--workspace-cyan); }
  .market-list { max-height:105px; overflow:auto; border:1px solid var(--workspace-rule-soft); }
  .market-list button { display:grid; grid-template-columns:minmax(0,1fr) auto; gap:.5rem; width:100%; padding:.25rem .4rem; border:0; border-bottom:1px solid var(--workspace-rule-soft); background:transparent; color:var(--workspace-muted); text-align:left; font-size:11px; cursor:pointer; }
  .market-list button.active { background:var(--workspace-selected); color:var(--workspace-ink); } .market-list b { color:var(--workspace-cyan); font-family:var(--workspace-data-font); }
  .detail { margin-top:.45rem; } ol { max-height:125px; margin:0; padding:0; overflow:auto; list-style:none; } li { display:grid; grid-template-columns:auto 1fr; gap:.45rem; padding:.28rem 0; border-bottom:1px solid var(--workspace-rule-soft); color:var(--workspace-muted); font-size:11px; } time { color:var(--workspace-ink); font-family:var(--workspace-data-font); } small { display:block; margin-top:.45rem; line-height:1.35; } .state { min-height:120px; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:.25rem; padding:1rem; color:var(--workspace-muted); font-size:11px; text-align:center; } .state strong { color:var(--workspace-ink); } .state button { margin-top:.35rem; min-height:32px; padding:.3rem .55rem; border:1px solid var(--workspace-rule); background:transparent; color:var(--workspace-cyan); cursor:pointer; }
  .source-record { margin-top:.45rem; border-top:1px solid var(--workspace-rule-soft); padding-top:.35rem; color:var(--workspace-muted); font-size:11px; }
  .source-record summary { color:var(--workspace-cyan); cursor:pointer; }
  .source-record dl { display:grid; grid-template-columns:auto minmax(0,1fr); gap:.22rem .45rem; margin:.4rem 0 0; }
  .source-record dt { color:var(--workspace-faint); }
  .source-record dd { min-width:0; margin:0; overflow-wrap:anywhere; color:var(--workspace-ink); }
  .source-record code { font-family:var(--workspace-data-font); }
  @media (max-width:640px) { .context-grid { grid-template-columns:1fr; } }
  @media (max-width:720px), (pointer:coarse) {
    .market-list button, .source-record summary, .state button { min-height:44px; }
    input[type="range"] { min-height:44px; }
  }
</style>
