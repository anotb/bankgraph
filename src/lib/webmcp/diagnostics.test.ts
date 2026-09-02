import { describe, expect, it } from "vitest";
import {
  describeWebMcpUnavailableReason,
  isWebMcpDebugSearch,
  readWebMcpBrowserEnvironment,
  summarizeWebMcpDiagnostics,
} from "./diagnostics.js";
import type { WebMcpDiagnosticsSnapshot } from "./types.js";

function snapshot(
  overrides: Partial<WebMcpDiagnosticsSnapshot> = {},
): WebMcpDiagnosticsSnapshot {
  return {
    feature: { available: true },
    updatedAt: 0,
    registrations: [],
    events: [],
    ...overrides,
  };
}

describe("WebMCP diagnostics presentation", () => {
  it("only enables the panel for an explicit webmcp=debug query value", () => {
    expect(isWebMcpDebugSearch("?webmcp=debug")).toBe(true);
    expect(isWebMcpDebugSearch("?mode=pro&webmcp=debug&webmcp=off")).toBe(true);
    expect(isWebMcpDebugSearch("?webmcp=true")).toBe(false);
    expect(isWebMcpDebugSearch("?debug=webmcp")).toBe(false);
  });

  it("reports the browser security signals independently", () => {
    expect(
      readWebMcpBrowserEnvironment({
        isSecureContext: true,
        originAgentCluster: true,
        crossOriginIsolated: false,
      }),
    ).toEqual({
      secureContext: true,
      originAgentCluster: true,
      crossOriginIsolated: false,
    });
    expect(readWebMcpBrowserEnvironment(undefined)).toEqual({
      secureContext: null,
      originAgentCluster: null,
      crossOriginIsolated: null,
    });
  });

  it("distinguishes unavailable, partial, and registered catalogs", () => {
    expect(
      summarizeWebMcpDiagnostics(
        snapshot({
          feature: { available: false, reason: "missing-model-context" },
        }),
      ).registrationState,
    ).toBe("unavailable");

    const partial = summarizeWebMcpDiagnostics(
      snapshot({
        registrations: [
          {
            scope: "workspace",
            toolName: "bankgraph.get_context",
            status: "registered",
            executionCount: 0,
          },
          {
            scope: "workspace",
            toolName: "bankgraph.search_banks",
            status: "failed",
            executionCount: 0,
            lastFailure: "registration denied",
          },
        ],
        events: [
          {
            id: 1,
            at: 1,
            phase: "registration",
            status: "success",
            toolName: "bankgraph.get_context",
            message: "Registered bankgraph.get_context.",
          },
          {
            id: 2,
            at: 2,
            phase: "registration",
            status: "failure",
            toolName: "bankgraph.search_banks",
            message: "registration denied",
          },
          {
            id: 3,
            at: 3,
            phase: "sync",
            status: "failure",
            message: "Tool sync complete.",
          },
        ],
      }),
    );
    expect(partial.registrationState).toBe("partial");
    expect(
      partial.activeRegistrations.map((registration) => registration.toolName),
    ).toEqual(["bankgraph.get_context"]);
    expect(partial.lastRegistration?.toolName).toBe("bankgraph.search_banks");
    expect(partial.lastError?.message).toBe("registration denied");

    expect(
      summarizeWebMcpDiagnostics(
        snapshot({
          registrations: [
            {
              scope: "workspace",
              toolName: "bankgraph.get_context",
              status: "registered",
              executionCount: 0,
            },
          ],
        }),
      ).registrationState,
    ).toBe("registered");
  });

  it("turns feature codes into recovery-oriented text", () => {
    expect(describeWebMcpUnavailableReason("missing-model-context")).toContain(
      "document.modelContext",
    );
    expect(describeWebMcpUnavailableReason("insecure-context")).toContain(
      "secure context",
    );
  });
});
