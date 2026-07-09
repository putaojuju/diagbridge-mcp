import {
  type ApprovalKind,
  type DiagnosticToolName,
  type PolicyDecision,
  type RiskLevel,
  type ToolRequest,
  isDiagnosticToolName,
} from "@diagbridge/core";

const TOOL_RISK: Record<DiagnosticToolName, RiskLevel> = {
  get_system_overview: "green",
  run_network_diagnosis: "green",
  list_allowed_roots: "green",
  read_text_file: "blue",
  search_logs: "blue",
  explain_pending_action: "green",
  request_action_approval: "yellow",
  execute_approved_action: "yellow",
  collect_diagnostic_report: "blue",
};

const FORBIDDEN_TOOL_PATTERNS = [
  /powershell/i,
  /cmd/i,
  /shell/i,
  /exec/i,
  /script/i,
  /download.*run/i,
  /credential/i,
  /cookie/i,
  /wallet/i,
  /ssh.*key/i,
  /api.*key/i,
];

const SENSITIVE_PATH_PATTERNS = [
  /\\AppData\\Local\\Google\\Chrome\\User Data/i,
  /\\AppData\\Roaming\\Mozilla\\Firefox/i,
  /\\.ssh(\\|$)/i,
  /id_rsa/i,
  /id_ed25519/i,
  /Login Data/i,
  /Cookies/i,
  /wallet/i,
  /\.env(\.|$)/i,
  /NTUSER\.DAT/i,
];

function decision(input: Omit<PolicyDecision, "redactions" | "mockOnly"> & Partial<Pick<PolicyDecision, "redactions" | "mockOnly">>): PolicyDecision {
  return {
    redactions: [],
    mockOnly: true,
    ...input,
  };
}

function approvalKindForRisk(risk: RiskLevel): ApprovalKind {
  switch (risk) {
    case "green":
      return "none";
    case "blue":
      return "informational";
    case "yellow":
      return "single";
    case "orange":
      return "dual";
    case "red":
      return "forbidden";
  }
}

function pathLooksSensitive(path: string): boolean {
  return SENSITIVE_PATH_PATTERNS.some((pattern) => pattern.test(path));
}

function pathIsWithinAllowedRoots(path: string, request: ToolRequest): boolean {
  const normalizedPath = path.toLowerCase();
  return request.context.allowedRoots.some((root) => normalizedPath.startsWith(root.path.toLowerCase()));
}

export function evaluateToolRequest(request: ToolRequest): PolicyDecision {
  if (request.context.consentState !== "active") {
    return decision({
      allowed: false,
      risk: "red",
      requiresApproval: false,
      approvalKind: "forbidden",
      reasons: ["The diagnosed user's consent is not active."],
    });
  }

  if (FORBIDDEN_TOOL_PATTERNS.some((pattern) => pattern.test(request.toolName))) {
    return decision({
      allowed: false,
      risk: "red",
      requiresApproval: false,
      approvalKind: "forbidden",
      reasons: ["The requested tool name looks like raw command execution or credential access."],
    });
  }

  if (!isDiagnosticToolName(request.toolName)) {
    return decision({
      allowed: false,
      risk: "red",
      requiresApproval: false,
      approvalKind: "forbidden",
      reasons: ["Unknown tools are denied by default."],
    });
  }

  const risk = TOOL_RISK[request.toolName];

  if (request.toolName === "read_text_file") {
    const path = String(request.args.path ?? "");
    if (!path) {
      return decision({
        allowed: false,
        risk,
        requiresApproval: false,
        approvalKind: "forbidden",
        reasons: ["read_text_file requires a path."],
      });
    }

    if (pathLooksSensitive(path)) {
      return decision({
        allowed: false,
        risk: "red",
        requiresApproval: false,
        approvalKind: "forbidden",
        reasons: ["The requested path appears to contain credentials, browser data, cookies, keys, or other sensitive material."],
      });
    }

    if (!pathIsWithinAllowedRoots(path, request)) {
      return decision({
        allowed: false,
        risk: "orange",
        requiresApproval: true,
        approvalKind: "dual",
        reasons: ["The requested path is outside the diagnosed user's allowed roots."],
      });
    }
  }

  if (risk === "red") {
    return decision({
      allowed: false,
      risk,
      requiresApproval: false,
      approvalKind: "forbidden",
      reasons: ["Red actions are forbidden by default."],
    });
  }

  if (risk === "orange") {
    return decision({
      allowed: false,
      risk,
      requiresApproval: true,
      approvalKind: "dual",
      reasons: ["Orange system-level actions are blocked in phase 1."],
    });
  }

  return decision({
    allowed: true,
    risk,
    requiresApproval: risk === "blue" || risk === "yellow",
    approvalKind: approvalKindForRisk(risk),
    reasons: [
      "The request uses a known structured diagnostic tool.",
      "Phase 1 is mock-only and does not execute real system changes.",
    ],
    redactions: risk === "blue" ? ["secret-like values", "tokens", "local usernames where practical"] : [],
  });
}
