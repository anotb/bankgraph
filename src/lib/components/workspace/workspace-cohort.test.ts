import { describe, expect, it } from "vitest";
import type { Financial } from "$lib/types";
import type { WorkspaceBank } from "./workspace-data";
import {
  buildWorkspaceEndpointPeerMovement,
  cohortHistoryCoverage,
  visibleHistoryPeriods,
} from "./workspace-cohort";

function financial(cert: number, repdte: string, roa: number): Financial {
  return { cert, repdte, roa } as Financial;
}

function bank(cert: number, values: Array<[string, number]>): WorkspaceBank {
  return {
    cert,
    name: `Bank ${cert}`,
    financials: values.map(([period, roa]) => financial(cert, period, roa)),
  } as WorkspaceBank;
}

describe("workspace cohort history authority", () => {
  it("keeps an empty cohort partial instead of claiming history is ready", () => {
    expect(cohortHistoryCoverage([], {}, [])).toMatchObject({
      status: "partial",
      memberCount: 0,
      membersWithRequiredPeriods: 0,
    });
  });

  it("does not report ready when a member has history but lacks a requested endpoint", () => {
    const coverage = cohortHistoryCoverage(
      [1, 2],
      {
        1: [financial(1, "20250331", 1), financial(1, "20250630", 1.1)],
        2: [financial(2, "20250331", 2)],
      },
      ["20250331", "20250630"],
    );

    expect(coverage).toMatchObject({
      status: "partial",
      membersWithHistory: 2,
      membersWithRequiredPeriods: 1,
      missingCerts: [2],
    });
  });

  it("includes exact attribution and year-over-year endpoints for the visible period", () => {
    expect(
      visibleHistoryPeriods(
        { kind: "quarter", quarter: "20250630" },
        "20250630",
        "loanGrowth",
      ),
    ).toEqual(["20240331", "20240630", "20250331", "20250630"]);
  });

  it("computes peer movement from the exact supplied members and excludes the subject", () => {
    const subject = bank(1, [["20250331", 1], ["20250630", 2]]);
    const exactCohort = [
      subject,
      bank(2, [["20250331", 2], ["20250630", 2.5]]),
      bank(9, [["20250331", 8], ["20250630", 7]]),
    ];

    const result = buildWorkspaceEndpointPeerMovement(
      subject,
      exactCohort,
      "roa",
      "20250331",
      "20250630",
      2,
    );

    expect(result).toMatchObject({
      subjectMovement: 1,
      peerMedian: -0.25,
      peerCount: 2,
      status: "ok",
    });
  });
});
