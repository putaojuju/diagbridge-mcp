import { describe, expect, it } from "vitest";
import type { FileRoot, SessionContext, ToolRequest } from "@diagbridge/core";
import {
  calculateActionHash,
  createMockApprovalRecord,
  evaluateToolRequest,
  isPathWithinAllowedRoots,
} from "./index.js";

const allowedRoots: FileRoot[] = [
  {
    id: "allowed",
    label: "Allowed test root",
    path: "C:\\Allowed",
    readonly: true,
    risk: "blue",
  },
];

const activeContext: SessionContext = {
  sessionId: "test-session",
  entryPoint: "remote-mcp",
  diagnosedUser: {
    displayName: "Test User",
    deviceLabel: "Test PC",
    isPresent: true,
  },
  consentState: "active",
  isAdmin: false,
  expertModeEnabled: false,
  allowedRoots,
  createdAt: "2026-07-09T00:00:00.000Z",
};

function toolRequest(toolName: string, args: Record<string, unknown>, context: SessionContext = activeContext): ToolRequest {
  return { toolName, args, context };
}

describe("policy safety boundaries", () => {
  it("rejects unknown tools", () => {
    const decision = evaluateToolRequest(toolRequest("unknown_tool", {}));

    expect(decision.allowed).toBe(false);
    expect(decision.risk).toBe("red");
    expect(decision.approvalKind).toBe("forbidden");
  });

  it("rejects shell-like unknown tool names", () => {
    const decision = evaluateToolRequest(toolRequest("run_powershell", { command: "Get-Process" }));

    expect(decision.allowed).toBe(false);
    expect(decision.risk).toBe("red");
    expect(decision.reasons.join(" ")).toMatch(/raw command|credential/i);
  });

  it("does not let Red actions enter an approval prompt", () => {
    const decision = evaluateToolRequest(
      toolRequest("request_action_approval", {
        actionType: "run_shell_command",
        params: { command: "whoami" },
      }),
    );

    expect(decision.allowed).toBe(false);
    expect(decision.risk).toBe("red");
    expect(decision.approvalKind).toBe("forbidden");
  });

  it("ignores AI self-reported low risk and keeps the real action risk", () => {
    const decision = evaluateToolRequest(
      toolRequest("request_action_approval", {
        actionType: "flush_dns_cache",
        params: {},
        risk: "green",
      }),
    );

    expect(decision.allowed).toBe(true);
    expect(decision.risk).toBe("yellow");
    expect(decision.approvalKind).toBe("single");
    expect(decision.reasons.join(" ")).toMatch(/AI-provided risk labels were ignored/i);
  });

  it("blocks Red action even when AI self-reports low risk", () => {
    const decision = evaluateToolRequest(
      toolRequest("request_action_approval", {
        actionType: "run_shell_command",
        params: { command: "echo harmless" },
        risk: "green",
      }),
    );

    expect(decision.allowed).toBe(false);
    expect(decision.risk).toBe("red");
  });

  it("does not allow allowed-root prefix bypass", () => {
    expect(isPathWithinAllowedRoots("C:\\Allowed\\diagnostic.log", allowedRoots)).toBe(true);
    expect(isPathWithinAllowedRoots("C:\\Allowed2\\diagnostic.log", allowedRoots)).toBe(false);
  });

  it("rejects sensitive paths", () => {
    const decision = evaluateToolRequest(
      toolRequest("read_text_file", {
        path: "C:\\Users\\Alice\\AppData\\Local\\Google\\Chrome\\User Data\\Default\\Cookies",
      }),
    );

    expect(decision.allowed).toBe(false);
    expect(decision.risk).toBe("red");
    expect(decision.approvalKind).toBe("forbidden");
  });

  it("rejects non-active consent", () => {
    const revokedContext: SessionContext = {
      ...activeContext,
      consentState: "revoked",
    };

    const decision = evaluateToolRequest(toolRequest("get_system_overview", {}, revokedContext));

    expect(decision.allowed).toBe(false);
    expect(decision.risk).toBe("red");
  });

  it("does not treat an approval string prefix as real execution authorization", () => {
    const decision = evaluateToolRequest(
      toolRequest("execute_approved_action", {
        approvalId: "mock-approval-123",
        actionType: "flush_dns_cache",
        params: {},
      }),
    );

    expect(decision.allowed).toBe(false);
    expect(decision.reasons.join(" ")).toMatch(/ApprovalRecord|string prefix/i);
  });

  it("accepts a structurally valid mock ApprovalRecord but still remains mock-only", () => {
    const actionType = "flush_dns_cache";
    const params = {};
    const now = new Date();
    const approvalRecord = createMockApprovalRecord(
      {
        actionType,
        params,
        sessionId: activeContext.sessionId,
        requestedBy: activeContext.entryPoint,
        createdAt: now.toISOString(),
      },
      activeContext,
      ["diagnosed-user"],
      now,
    );

    expect(approvalRecord.actionHash).toBe(calculateActionHash(actionType, params));

    const decision = evaluateToolRequest(
      toolRequest("execute_approved_action", {
        actionType,
        params,
        approvalRecord,
      }),
    );

    expect(decision.allowed).toBe(true);
    expect(decision.risk).toBe("yellow");
    expect(decision.mockOnly).toBe(true);
  });
});
