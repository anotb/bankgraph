import type { Financial } from "$lib/types";
import type { SelectedPeriod } from "$lib/workspace";
import type { WorkspaceBank, WorkspaceMetric } from "./workspace-data";
import { valueAtPeriod } from "./workspace-data";
import type { PeerMovement } from "./workspace-attribution";

export interface CohortHistoryCoverage {
  status: "ready" | "partial";
  memberCount: number;
  membersWithHistory: number;
  membersWithRequiredPeriods: number;
  requiredPeriods: string[];
  missingCerts: number[];
  earliestPeriod: string | null;
  latestPeriod: string | null;
}

export function priorYearPeriod(period: string): string | null {
  if (!/^\d{8}$/.test(period)) return null;
  return `${Number(period.slice(0, 4)) - 1}${period.slice(4)}`;
}

export function previousQuarterPeriod(period: string): string | null {
  const match = /^(\d{4})(0331|0630|0930|1231)$/.exec(period);
  if (!match) return null;
  const year = Number(match[1]);
  if (match[2] === "0331") return `${year - 1}1231`;
  if (match[2] === "0630") return `${year}0331`;
  if (match[2] === "0930") return `${year}0630`;
  return `${year}0930`;
}

/** Exact periods needed by the visible history and quarter-attribution surfaces. */
export function visibleHistoryPeriods(
  period: SelectedPeriod,
  sourceAsOf: string | null,
  metric?: WorkspaceMetric,
): string[] {
  const endpoints = period.kind === "range"
    ? [period.from, period.to]
    : period.quarter
      ? [previousQuarterPeriod(period.quarter), period.quarter]
      : [sourceAsOf];
  if (metric === "loanGrowth") {
    endpoints.push(...endpoints.map((item) => item ? priorYearPeriod(item) : null));
  }
  return [...new Set(endpoints.filter((item): item is string => Boolean(item)))].sort();
}

export function cohortHistoryCoverage(
  certs: number[],
  histories: Record<number, Financial[]>,
  requiredPeriods: string[],
): CohortHistoryCoverage {
  const members = [...new Set(certs)].sort((left, right) => left - right);
  const required = [...new Set(requiredPeriods)].sort();
  const periods = members.flatMap((cert) =>
    (histories[cert] ?? []).map((row) => row.repdte),
  ).sort();
  const membersWithHistory = members.filter(
    (cert) => (histories[cert]?.length ?? 0) > 0,
  ).length;
  const missingCerts = members.filter((cert) => {
    const available = new Set((histories[cert] ?? []).map((row) => row.repdte));
    return required.length
      ? required.some((period) => !available.has(period))
      : available.size === 0;
  });
  return {
    status:
      members.length > 0 && missingCerts.length === 0 ? "ready" : "partial",
    memberCount: members.length,
    membersWithHistory,
    membersWithRequiredPeriods: members.length - missingCerts.length,
    requiredPeriods: required,
    missingCerts,
    earliestPeriod: periods[0] ?? null,
    latestPeriod: periods.at(-1) ?? null,
  };
}

export function banksWithPreparedHistory(
  banks: WorkspaceBank[],
  prepared: Record<number, Financial[]>,
): WorkspaceBank[] {
  return banks.map((bank) => prepared[bank.cert]?.length
    ? { ...bank, financials: prepared[bank.cert] }
    : bank);
}

export function buildWorkspaceEndpointPeerMovement(
  subject: WorkspaceBank,
  cohort: WorkspaceBank[],
  metric: WorkspaceMetric,
  from: string,
  to: string,
  minimumPeerCount: number,
): PeerMovement {
  const movement = (bank: WorkspaceBank): number | null => {
    const left = valueAtPeriod(bank, metric, from);
    const right = valueAtPeriod(bank, metric, to);
    if (left === null || right === null) return null;
    if (metric === "asset" || metric === "dep") {
      return left === 0 ? null : ((right - left) / left) * 100;
    }
    return right - left;
  };
  const subjectMovement = movement(subject);
  const peers = cohort
    .filter((bank) => bank.cert !== subject.cert)
    .map(movement)
    .filter((value): value is number => value !== null)
    .sort((left, right) => left - right);
  const peerMedian = peers.length
    ? (peers[Math.floor((peers.length - 1) / 2)] +
        peers[Math.ceil((peers.length - 1) / 2)]) / 2
    : null;
  return {
    subjectMovement,
    peerMedian,
    subjectPercentile:
      subjectMovement === null || !peers.length
        ? null
        : (peers.filter((value) => value <= subjectMovement).length / peers.length) * 100,
    peerCount: peers.length,
    minimumPeerCount,
    status:
      subjectMovement === null
        ? "unavailable"
        : peers.length >= minimumPeerCount
          ? "ok"
          : "insufficient_peers",
    warning:
      subjectMovement === null
        ? "The focused bank does not have both requested endpoints."
        : peers.length >= minimumPeerCount
          ? null
          : `Only ${peers.length} cohort members have both endpoints; ${minimumPeerCount} are required.`,
  };
}
