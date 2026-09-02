import { describe, expect, it } from "vitest";
import type { Financial } from "$lib/types";
import type { WorkspaceBank } from "./workspace-data";
import {
  attributionModeForMetric,
  buildRecordedQuarterBrief,
  inspectReportedMetricChange,
  withWorkspacePeerContext,
} from "./workspace-attribution";

function row(repdte: string, values: Partial<Financial>): Financial {
  return {
    cert: 7,
    repdte,
    asset: null,
    dep: null,
    eq: null,
    lnlsnet: null,
    lnre: null,
    lnci: null,
    lncon: null,
    sec: null,
    netinc: null,
    intinc: null,
    eintexp: null,
    nim: null,
    nonii: null,
    nonix: null,
    elnatr: null,
    roa: null,
    roe: null,
    nimy: null,
    eeffr: null,
    rbcrwaj: null,
    rbc1rwaj: null,
    rbc1aaj: null,
    eqv: null,
    nclnlsr: null,
    lnatresr: null,
    nco_ratio: null,
    lnlsdepr: null,
    othbfhlb: null,
    numemp: null,
    asset_bucket: 4,
    ...values,
  };
}

const bank = {
  cert: 7,
  name: "Contract Bank",
  city: "New York",
  state: "NY",
  color: "#25cdf5",
  financials: [
    row("20250930", {
      asset: 1_000,
      dep: 600,
      roa: 1.2,
      nimy: 3.1,
      nclnlsr: 0.4,
      lnlsnet: 500,
      netincq: 10,
    }),
    row("20251231", {
      asset: 1_200,
      dep: 650,
      roa: 1.1,
      nimy: 3.2,
      nclnlsr: 0.45,
      lnlsnet: 540,
      netincq: 30,
    }),
  ],
} as WorkspaceBank;

describe("workspace metric-change semantics", () => {
  it("routes ROA focus to its reported endpoint change, not net income", () => {
    const brief = buildRecordedQuarterBrief(bank, [bank], 1);
    expect(attributionModeForMetric("roa")).toBe("reportedMetric");
    const roa = inspectReportedMetricChange(
      "roa",
      bank.financials[0],
      bank.financials[1],
      brief,
      true,
    );
    expect(roa.bankChange).toBeCloseTo(-0.1, 10);
    expect(roa.unit).toBe("percentage_points");
    expect(roa.method).toBe("reported_endpoint_point_difference");
    expect(roa.components).toEqual([]);
    expect(brief.bridges?.quarterlyNetIncome.totalChange).toBe(20);
    expect(roa.bankChange).not.toBe(
      brief.bridges?.quarterlyNetIncome.totalChange,
    );
  });

  it("keeps deposit changes in their requested measure", () => {
    const brief = buildRecordedQuarterBrief(bank, [bank], 1);
    const deposits = inspectReportedMetricChange(
      "dep",
      bank.financials[0],
      bank.financials[1],
      brief,
      true,
    );
    expect(deposits.bankChange).toBe(50);
    expect(deposits.unit).toBe("usd_thousands");
    expect(deposits.components).toEqual([]);
  });

  it("keeps peer-relative balance attribution explicit about its mixed units", () => {
    const brief = buildRecordedQuarterBrief(bank, [bank], 1);
    brief.peerContext!.assetGrowth = {
      subjectMovement: 20,
      peerMedian: 4.5,
      subjectPercentile: 80,
      peerCount: 30,
      minimumPeerCount: 20,
      status: "ok",
      warning: null,
    };
    brief.peerContext!.depositGrowth = {
      subjectMovement: 8.33,
      peerMedian: 2.25,
      subjectPercentile: 70,
      peerCount: 30,
      minimumPeerCount: 20,
      status: "ok",
      warning: null,
    };
    const assets = inspectReportedMetricChange(
      "asset", bank.financials[0], bank.financials[1], brief, true,
    );
    const deposits = inspectReportedMetricChange(
      "dep", bank.financials[0], bank.financials[1], brief, true,
    );
    expect(assets).toMatchObject({
      bankChange: 200,
      unit: "usd_thousands",
      peerMedianChange: 4.5,
      peerEvidence: { status: "ok", peerCount: 30 },
    });
    expect(deposits).toMatchObject({
      bankChange: 50,
      unit: "usd_thousands",
      peerMedianChange: 2.25,
      peerEvidence: { status: "ok", peerCount: 30 },
    });
  });

  it("attributes loanGrowth as the point change between derived YoY endpoints", () => {
    const brief = buildRecordedQuarterBrief(bank, [bank], 1);
    const loanGrowth = inspectReportedMetricChange(
      "loanGrowth",
      bank.financials[0],
      bank.financials[1],
      brief,
      true,
      { from: 4.25, to: 7.5 },
      {
        subjectMovement: 3.25,
        peerMedian: 1.1,
        subjectPercentile: 75,
        peerCount: 25,
        minimumPeerCount: 20,
        status: "ok",
        warning: null,
      },
    );
    expect(loanGrowth).toMatchObject({
      bankChange: 3.25,
      unit: "percentage_points",
      method: "derived_year_over_year_net_loan_growth_endpoint_point_difference",
      peerMedianChange: 1.1,
      peerEvidence: { status: "ok", peerCount: 25 },
    });
  });

  it("binds live component bridges to the exact workspace cohort provenance", () => {
    const serverBrief = buildRecordedQuarterBrief(bank, [bank], 1);
    serverBrief.provenance.cohortDefinition = "opening-quarter asset bucket";
    const rebound = withWorkspacePeerContext(serverBrief, bank, [bank], 1, {
      cohortDefinition: "Regional reporters; exact visible members after exclusions",
      cohortDefinitionHash: "cohort:abc123",
      cohortHash: "members:def456",
      minimumPeerCount: 7,
    });

    expect(rebound.bridges).toBe(serverBrief.bridges);
    expect(rebound.provenance).toMatchObject({
      cohortDefinition: "Regional reporters; exact visible members after exclusions",
      cohortDefinitionHash: "cohort:abc123",
      cohortHash: "members:def456",
      cohortMemberCount: 1,
    });
    expect(rebound.peerContext?.assetGrowth.minimumPeerCount).toBe(7);
  });

  it("uses supplied exact-cohort movement for reported ratio metrics", () => {
    const brief = buildRecordedQuarterBrief(bank, [bank], 1);
    const roa = inspectReportedMetricChange(
      "roa",
      bank.financials[0],
      bank.financials[1],
      brief,
      true,
      undefined,
      {
        subjectMovement: -0.1,
        peerMedian: 0.04,
        subjectPercentile: 25,
        peerCount: 24,
        minimumPeerCount: 20,
        status: "ok",
        warning: null,
      },
    );

    expect(roa).toMatchObject({
      peerMedianChange: 0.04,
      peerEvidence: { peerCount: 24, status: "ok" },
    });
  });

  it("rejects unsupported attribution metrics instead of using net income", () => {
    expect(() => attributionModeForMetric("unsupported")).toThrow(
      'Quarter-change evidence does not support metric "unsupported".',
    );
  });
});
