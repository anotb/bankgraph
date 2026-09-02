import { describe, expect, it } from "vitest";
import {
  createDistributionScale,
  createPeerComparator,
  descendingValueRank,
  locateOnDistributionScale,
  positionOnDistributionScale,
  relativeStanding,
} from "./workspace-distribution";

describe("workspace distribution scales", () => {
  it("uses a log scale only for positive size values spanning at least 10x", () => {
    const scale = createDistributionScale([1, 10, 100, 1_000], "asset");

    expect(scale.kind).toBe("log-size");
    expect(scale.spanRatio).toBe(1_000);
    expect(positionOnDistributionScale(10, scale)).toBeCloseTo(35.333, 3);
    expect(positionOnDistributionScale(100, scale)).toBeCloseTo(64.667, 3);
  });

  it("keeps a narrow positive size range linear", () => {
    expect(createDistributionScale([100, 150, 900], "asset").kind).toBe(
      "linear",
    );
    expect(
      createDistributionScale([100, 150, 900], "asset", {
        logSpanThreshold: 5,
      }).kind,
    ).toBe("log-size");
  });

  it("keeps size data with zero or negative values linear", () => {
    const scale = createDistributionScale([-1, 0, 10, 1_000], "asset");

    expect(scale.kind).toBe("linear");
    expect(scale.nonPositiveCount).toBe(2);
  });

  it("keeps ratio measures on an honest linear scale", () => {
    const scale = createDistributionScale([0.5, 1, 100], "roa");

    expect(scale.kind).toBe("linear");
    expect(positionOnDistributionScale(1, scale)).toBeGreaterThan(6);
  });

  it("labels values clamped beyond the plotted range", () => {
    const scale = createDistributionScale([10, 20, 30], "roa");

    expect(locateOnDistributionScale(5, scale)).toEqual({
      percent: 6,
      edge: "low",
      edgeLabel: "Low edge",
      isOutsideScale: true,
    });
    expect(locateOnDistributionScale(35, scale)).toEqual({
      percent: 94,
      edge: "high",
      edgeLabel: "High edge",
      isOutsideScale: true,
    });
  });
});

describe("workspace distribution compatibility helpers", () => {
  it("describes values outside the loaded range without inventing rank zero", () => {
    expect(relativeStanding([10, 20, 30], 5)).toEqual({
      kind: "below",
      countAtOrBelow: 0,
      percentile: null,
    });
    expect(relativeStanding([10, 20, 30], 35).kind).toBe("above");
  });

  it("ranks exact cohort values from highest to lowest with ties", () => {
    expect(descendingValueRank([10, 20, 20, 30], 30)).toBe(1);
    expect(descendingValueRank([10, 20, 20, 30], 20)).toBe(2);
    expect(descendingValueRank([10, 20, 20, 30], 10)).toBe(4);
    expect(descendingValueRank([10, Number.NaN], Number.NaN)).toBe(0);
  });
});

describe("canonical peer comparator", () => {
  const peers = [
    { key: 1, value: 10 },
    { key: 2, value: 20 },
    { key: 3, value: 20 },
    { key: 4, value: 30 },
  ];

  it("gives cohort members a competition rank and deterministic midrank percentile", () => {
    const result = createPeerComparator(peers, { key: 2, value: 999 });

    expect(result).toMatchObject({
      availability: "available",
      membership: "member",
      subjectValue: 20,
      relative: {
        relation: "within",
        countBelow: 1,
        countEqual: 2,
        countAbove: 1,
        countAtOrBelow: 3,
      },
      rank: {
        rank: 2,
        peerCount: 4,
        tieCount: 2,
        percentile: 50,
        percentileMethod: "exact-empirical-midrank",
      },
      language: {
        membershipLabel: "Cohort member",
        positionLabel: "Rank 2 of 4",
        detail: "Highest value ranks first; tied with 1 peer.",
      },
    });
  });

  it("never assigns an off-cohort subject a peer rank", () => {
    const below = createPeerComparator(peers, { key: 99, value: 5 });
    const within = createPeerComparator(peers, { key: 98, value: 21 });
    const above = createPeerComparator(peers, { key: 97, value: 40 });

    expect(below.rank).toBeNull();
    expect(below.language.positionLabel).toBe("Below all 4 peers");
    expect(below.placement).toMatchObject({
      band: "below-range",
      label: "Below peer range",
      edge: "low",
      isOutlier: true,
      isOutsideRange: true,
    });
    expect(within.rank).toBeNull();
    expect(within.language).toMatchObject({
      membershipLabel: "Outside cohort",
      positionLabel: "Within the peer range",
      detail:
        "This bank is outside the cohort. 3 of 4 peers are at or below this value.",
    });
    expect(above.rank).toBeNull();
    expect(above.language.positionLabel).toBe("Above all 4 peers");

    const outsideButNotOutlier = createPeerComparator(
      [
        { key: 1, value: 10 },
        { key: 2, value: 20 },
        { key: 3, value: 30 },
      ],
      { key: 99, value: 5 },
    );
    expect(outsideButNotOutlier.placement).toMatchObject({
      band: "below-range",
      isOutlier: false,
      isOutsideRange: true,
    });
  });

  it("labels member outliers and quartile placement from exact peer values", () => {
    const outlierPeers = [
      { key: "a", value: 1 },
      { key: "b", value: 10 },
      { key: "c", value: 11 },
      { key: "d", value: 12 },
      { key: "e", value: 13 },
    ];

    expect(
      createPeerComparator(outlierPeers, { key: "a", value: 1 }).placement,
    ).toMatchObject({
      band: "low-outlier",
      label: "Low outlier",
      isOutlier: true,
      isOutsideRange: false,
    });
    expect(
      createPeerComparator(outlierPeers, { key: "c", value: 11 }).placement,
    ).toMatchObject({
      band: "middle-half",
      label: "Middle half",
      isOutlier: false,
    });
  });

  it("deduplicates keys by first occurrence and excludes missing values", () => {
    const result = createPeerComparator(
      [
        { key: 1, value: 10 },
        { key: 1, value: 100 },
        { key: 2, value: null },
        { key: 3, value: Number.NaN },
        { key: 4, value: 40 },
      ],
      { key: 1, value: 100 },
    );

    expect(result.subjectValue).toBe(10);
    expect(result.summary).toMatchObject({
      peerCount: 2,
      missingPeerCount: 2,
      duplicatePeerCount: 1,
      distinctValueCount: 2,
    });
    expect(result.rank?.rank).toBe(2);
  });

  it("returns explicit bounded states for missing evidence", () => {
    const noPeers = createPeerComparator(
      [
        { key: 1, value: null },
        { key: 2, value: Number.NaN },
      ],
      { key: 9, value: 10 },
    );
    const noSubject = createPeerComparator(peers, { key: 99, value: null });

    expect(noPeers).toMatchObject({
      availability: "no-peer-values",
      rank: null,
      language: {
        positionLabel: "Peer standing unavailable",
        detail: "No peer values are available for this period.",
      },
    });
    expect(noSubject).toMatchObject({
      availability: "no-subject-value",
      rank: null,
      language: {
        positionLabel: "Peer standing unavailable",
        detail: "This bank has no reported value for this period.",
      },
    });
    expect(Object.keys(noPeers).length).toBeLessThanOrEqual(9);
    expect("peers" in noPeers).toBe(false);
  });
});
