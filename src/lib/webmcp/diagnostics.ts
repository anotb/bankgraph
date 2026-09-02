import type {
  WebMcpDiagnosticEvent,
  WebMcpDiagnosticsSnapshot,
  WebMcpRegistrationDiagnostic,
} from "./types.js";

export type WebMcpRegistrationState =
  | "unavailable"
  | "idle"
  | "registering"
  | "registered"
  | "partial"
  | "failed";

export interface WebMcpBrowserEnvironment {
  secureContext: boolean | null;
  originAgentCluster: boolean | null;
  crossOriginIsolated: boolean | null;
}

export interface WebMcpDiagnosticsSummary {
  registrationState: WebMcpRegistrationState;
  activeRegistrations: readonly WebMcpRegistrationDiagnostic[];
  failedRegistrations: readonly WebMcpRegistrationDiagnostic[];
  lastRegistration: WebMcpDiagnosticEvent | null;
  lastError: WebMcpDiagnosticEvent | null;
}

interface BrowserEnvironmentTarget {
  isSecureContext?: unknown;
  originAgentCluster?: unknown;
  crossOriginIsolated?: unknown;
}

function booleanOrNull(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function findLastEvent(
  events: readonly WebMcpDiagnosticEvent[],
  predicate: (event: WebMcpDiagnosticEvent) => boolean,
): WebMcpDiagnosticEvent | null {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index];
    if (predicate(event)) return event;
  }
  return null;
}

export function isWebMcpDebugSearch(search: string): boolean {
  return new URLSearchParams(search).getAll("webmcp").includes("debug");
}

export function readWebMcpBrowserEnvironment(
  target: BrowserEnvironmentTarget | null | undefined,
): WebMcpBrowserEnvironment {
  return {
    secureContext: booleanOrNull(target?.isSecureContext),
    originAgentCluster: booleanOrNull(target?.originAgentCluster),
    crossOriginIsolated: booleanOrNull(target?.crossOriginIsolated),
  };
}

export function summarizeWebMcpDiagnostics(
  snapshot: WebMcpDiagnosticsSnapshot,
): WebMcpDiagnosticsSummary {
  const activeRegistrations = snapshot.registrations.filter(
    (registration) => registration.status === "registered",
  );
  const failedRegistrations = snapshot.registrations.filter(
    (registration) => registration.status === "failed",
  );
  const registeringCount = snapshot.registrations.filter(
    (registration) => registration.status === "registering",
  ).length;
  const lastSync = findLastEvent(
    snapshot.events,
    (event) => event.phase === "sync",
  );
  const lastRegistration = findLastEvent(
    snapshot.events,
    (event) => event.phase === "registration",
  );
  const lastError =
    findLastEvent(
      snapshot.events,
      (event) =>
        event.status === "failure" &&
        !(
          event.phase === "sync" &&
          event.message.startsWith("Tool sync complete")
        ),
    ) ?? findLastEvent(snapshot.events, (event) => event.status === "failure");

  let registrationState: WebMcpRegistrationState;
  if (!snapshot.feature.available) registrationState = "unavailable";
  else if (registeringCount > 0) registrationState = "registering";
  else if (
    failedRegistrations.length > 0 &&
    activeRegistrations.length > 0
  ) {
    registrationState = "partial";
  } else if (
    failedRegistrations.length > 0 ||
    lastSync?.status === "failure"
  ) {
    registrationState = "failed";
  } else if (activeRegistrations.length > 0) registrationState = "registered";
  else registrationState = "idle";

  return {
    registrationState,
    activeRegistrations,
    failedRegistrations,
    lastRegistration,
    lastError,
  };
}

export function describeWebMcpUnavailableReason(reason?: string): string {
  switch (reason) {
    case "not-browser":
      return "The browser environment has not mounted yet.";
    case "insecure-context":
      return "This page is not running in a secure context.";
    case "missing-model-context":
      return "This browser has not exposed document.modelContext.";
    case "missing-register-tool":
      return "document.modelContext is present, but registerTool() is not available.";
    case "model-context-access-failed":
      return "The browser blocked access to document.modelContext.";
    default:
      return "The browser did not expose the imperative WebMCP API.";
  }
}
