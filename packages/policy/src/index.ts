import { createHash } from "node:crypto";
import {
  type ActionDefinition,
  type ActionRequest,
  type ActionType,
  type ApprovalKind,
  type ApprovalPrincipal,
  type ApprovalRecord,
  type DiagnosticToolName,
  type FileRoot,
  type PolicyDecision,
  type RiskLevel,
  type SessionContext,
  type ToolRequest,
  isActionType,
  isDiagnosticToolName,
} from "@diagbridge/core";

export const POLICY_VERSION = "phase1-mock-policy-v2";

const TOOL_ACTION_MAP: Partial<Record<DiagnosticToolName, ActionType>> = {
  get_system_overview: "get_system_overview",
  run_network_diagnosis: "run_network_diagnosis",
  list_allowed_roots: "list_allowed_roots",
  read_text_file: "read_text_file",
  search_logs: "search_logs",
  collect_diagnostic_report: "collect_diagnostic_report",
  explain_pending_action: "noop",
};

export const RED_FORBIDDEN_ACTION_TYPES: readonly ActionType[] = [
  "edit_registry",
  "run_shell_command",
  "run_powershell_command",
  "download_and_execute",
  "read_browser_credentials",
  "read_cookie_store",
  "read_ssh_private_key",
  "read_api_keys",
  "read_wallet_files",
  "disable_security_tool",
  "install_persistence",
];

const FORBIDDEN_UNKNOWN_TOOL_PATTERNS = [
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
  /\\appdata\\local\\google\\chrome\\user data/i,
  /\\appdata\\roaming\\mozilla\\firefox/i,
  /(^|\\)\.ssh(\\|$)/i,
  /(^|\\)(id_rsa|id_ed25519)(\\|$)?/i,
  /(^|\\)login data(\\|$)?/i,
  /(^|\\)cookies?(\\|$)?/i,
  /wallet/i,
  /(^|\\)\.env(\.|\\|$)/i,
  /ntuser\.dat$/i,
];

function defineAction(
  actionType: ActionType,
  title: string,
  description: string,
  baseRisk: RiskLevel,
  approvalKind: ApprovalKind,
  reversible: boolean,
  scope: string[],
  impact: string,
  forbidden = false,
): ActionDefinition {
  return {
    actionType,
    title,
    description,
    baseRisk,
    approvalKind,
    reversible,
    scope,
    impact,
    mockOnly: true,
    forbidden,
    requiresBackup: baseRisk === "yellow" || baseRisk === "orange",
  };
}

export const ACTION_REGISTRY: Record<ActionType, ActionDefinition> = {
  noop: defineAction("noop", "Explain or inspect pending action", "No computer operation is performed.", "green", "none", true, ["session"], "No system impact."),
  get_system_overview: defineAction("get_system_overview", "Get system overview", "Read basic system summary fields.", "green", "none", true, ["system-summary"], "Read-only diagnostic metadata."),
  run_network_diagnosis: defineAction("run_network_diagnosis", "Run network diagnosis", "Run basic read-only network checks.", "green", "none", true, ["network-summary"], "Read-only network metadata."),
  list_allowed_roots: defineAction("list_allowed_roots", "List allowed roots", "Show the file roots explicitly scoped for diagnostics.", "green", "none", true, ["allowed-roots"], "Read-only scope metadata."),
  read_text_file: defineAction("read_text_file", "Read bounded text file", "Read a text file only from an allowed root with redaction.", "blue", "informational", true, ["allowed-root-read"], "May expose private log or config text."),
  search_logs: defineAction("search_logs", "Search logs", "Search bounded diagnostic logs with redaction.", "blue", "informational", true, ["log-search"], "May expose private log snippets."),
  collect_diagnostic_report: defineAction("collect_diagnostic_report", "Collect diagnostic report", "Collect bounded diagnostic report metadata.", "blue", "informational", true, ["diagnostic-report"], "May package diagnostic metadata."),
  flush_dns_cache: defineAction("flush_dns_cache", "Flush DNS cache", "Clear the local DNS cache.", "yellow", "single", true, ["network-repair"], "May temporarily disrupt name resolution cache."),
  restart_known_application: defineAction("restart_known_application", "Restart known application", "Restart one explicitly named non-system application.", "yellow", "single", true, ["application-repair"], "May close an application window."),
  modify_network_adapter: defineAction("modify_network_adapter", "Modify network adapter", "Change a network adapter setting.", "orange", "dual", true, ["system-network-config"], "May disrupt connectivity for the whole computer."),
  edit_registry: defineAction("edit_registry", "Edit registry", "Modify Windows Registry.", "red", "forbidden", false, ["system-registry"], "Can damage system state or hide persistence.", true),
  run_shell_command: defineAction("run_shell_command", "Run shell command", "Execute an arbitrary shell command.", "red", "forbidden", false, ["raw-execution"], "Opaque command execution is not a safe user-facing approval unit.", true),
  run_powershell_command: defineAction("run_powershell_command", "Run PowerShell command", "Execute arbitrary PowerShell.", "red", "forbidden", false, ["raw-execution"], "Raw PowerShell is not exposed as a normal DiagBridge tool.", true),
  download_and_execute: defineAction("download_and_execute", "Download and execute", "Download remote code and execute it.", "red", "forbidden", false, ["remote-code-execution"], "Remote script execution is forbidden by default.", true),
  read_browser_credentials: defineAction("read_browser_credentials", "Read browser credentials", "Read browser passwords or credential stores.", "red", "forbidden", false, ["credentials"], "Credential collection is forbidden.", true),
  read_cookie_store: defineAction("read_cookie_store", "Read cookie store", "Read browser cookies or session tokens.", "red", "forbidden", false, ["credentials"], "Cookie/session-token collection is forbidden.", true),
  read_ssh_private_key: defineAction("read_ssh_private_key", "Read SSH private key", "Read SSH private keys.", "red", "forbidden", false, ["credentials"], "Private-key collection is forbidden.", true),
  read_api_keys: defineAction("read_api_keys", "Read API keys", "Read API keys or environment secrets.", "red", "forbidden", false, ["credentials"], "API-key collection is forbidden.", true),
  read_wallet_files: defineAction("read_wallet_files", "Read wallet files", "Read cryptocurrency wallet files.", "red", "forbidden", false, ["credentials"], "Wallet-file collection is forbidden.", true),
  disable_security_tool: defineAction("disable_security_tool", "Disable security tool", "Disable antivirus, firewall, or other security controls.", "red", "forbidden", false, ["security-bypass"], "Security-control bypass is forbidden.", true),
  install_persistence: defineAction("install_persistence", "Install persistence", "Install a service, scheduled task, autorun entry, or hidden persistence.", "red", "forbidden", false, ["persistence"], "Hidden or persistent remote access is forbidden.", true),
};

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

export function normalizeWindowsPath(path: string): string {
  return path.trim().replace(/[\\/]+/gu, "\\").toLowerCase();
}

function stripTrailingBackslashes(path: string): string {
  return path.replace(/\\+$/u, "");
}

export function isSensitivePath(path: string): boolean {
  const normalizedPath = normalizeWindowsPath(path);
  return SENSITIVE_PATH_PATTERNS.some((pattern) => pattern.test(normalizedPath));
}

export function isPathWithinAllowedRoots(path: string, allowedRoots: FileRoot[]): boolean {
  const normalizedPath = stripTrailingBackslashes(normalizeWindowsPath(path));
  return allowedRoots.some((root) => {
    const normalizedRoot = stripTrailingBackslashes(normalizeWindowsPath(root.path));
    return normalizedPath === normalizedRoot || normalizedPath.startsWith(`${normalizedRoot}\\`);
  });
}

function objectParam(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }

  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, entryValue]) => entryValue !== undefined)
      .sort(([left], [right]) => left.localeCompare(right));
    return Object.fromEntries(entries.map(([key, entryValue]) => [key, canonicalize(entryValue)]));
  }

  return value;
}

export function calculateActionHash(actionType: string, params: Record<string, unknown>): string {
  return createHash("sha256").update(JSON.stringify(canonicalize({ actionType, params }))).digest("hex");
}

function makeActionRequest(actionType: string, params: Record<string, unknown>, context: SessionContext, diagnosticIntent?: string): ActionRequest {
  return {
    actionType,
    params,
    sessionId: context.sessionId,
    requestedBy: context.entryPoint,
    diagnosticIntent,
    createdAt: new Date().toISOString(),
  };
}

export function actionRequestFromToolRequest(request: ToolRequest): ActionRequest {
  if (request.toolName === "request_action_approval" || request.toolName === "execute_approved_action") {
    return makeActionRequest(
      String(request.args.actionType ?? ""),
      objectParam(request.args.params),
      request.context,
      typeof request.args.diagnosticIntent === "string" ? request.args.diagnosticIntent : undefined,
    );
  }

  if (isDiagnosticToolName(request.toolName)) {
    const actionType = TOOL_ACTION_MAP[request.toolName] ?? "noop";
    return makeActionRequest(actionType, request.args, request.context);
  }

  return makeActionRequest(String(request.toolName), request.args, request.context);
}

export function evaluateActionRequest(actionRequest: ActionRequest, context: SessionContext): PolicyDecision {
  if (context.consentState !== "active") {
    return decision({
      allowed: false,
      risk: "red",
      requiresApproval: false,
      approvalKind: "forbidden",
      reasons: ["The diagnosed user's consent is not active."],
      actionType: String(actionRequest.actionType),
    });
  }

  const actionType = String(actionRequest.actionType ?? "");
  const actionHash = calculateActionHash(actionType, actionRequest.params);

  if (!isActionType(actionType)) {
    return decision({
      allowed: false,
      risk: "red",
      requiresApproval: false,
      approvalKind: "forbidden",
      reasons: ["Unknown action types are denied by default."],
      actionType,
      actionHash,
    });
  }

  const definition = ACTION_REGISTRY[actionType];

  if (definition.forbidden || RED_FORBIDDEN_ACTION_TYPES.includes(actionType)) {
    return decision({
      allowed: false,
      risk: "red",
      requiresApproval: false,
      approvalKind: "forbidden",
      reasons: ["This action type is Red and cannot be converted into an approval prompt."],
      actionType,
      actionHash,
      scope: definition.scope,
    });
  }

  if (actionType === "read_text_file") {
    const path = String(actionRequest.params.path ?? "");
    if (!path) {
      return decision({
        allowed: false,
        risk: "blue",
        requiresApproval: false,
        approvalKind: "forbidden",
        reasons: ["read_text_file requires a path."],
        actionType,
        actionHash,
        scope: definition.scope,
      });
    }

    if (isSensitivePath(path)) {
      return decision({
        allowed: false,
        risk: "red",
        requiresApproval: false,
        approvalKind: "forbidden",
        reasons: ["The requested path appears to contain credentials, browser data, cookies, keys, or other sensitive material."],
        actionType,
        actionHash,
        scope: definition.scope,
      });
    }

    if (!isPathWithinAllowedRoots(path, context.allowedRoots)) {
      return decision({
        allowed: false,
        risk: "orange",
        requiresApproval: true,
        approvalKind: "dual",
        reasons: ["The requested path is outside the diagnosed user's allowed roots."],
        actionType,
        actionHash,
        scope: definition.scope,
      });
    }
  }

  if (definition.baseRisk === "orange") {
    return decision({
      allowed: false,
      risk: "orange",
      requiresApproval: true,
      approvalKind: "dual",
      reasons: ["Orange system-level actions are blocked in phase 1."],
      actionType,
      actionHash,
      scope: definition.scope,
    });
  }

  return decision({
    allowed: true,
    risk: definition.baseRisk,
    requiresApproval: definition.baseRisk === "blue" || definition.baseRisk === "yellow",
    approvalKind: approvalKindForRisk(definition.baseRisk),
    reasons: [
      "Risk was computed from the Action Registry and Policy Engine.",
      "AI-provided risk labels are ignored.",
      "Phase 1 is mock-only and does not execute real system changes.",
    ],
    redactions: definition.baseRisk === "blue" ? ["secret-like values", "tokens", "local usernames where practical"] : [],
    actionType,
    actionHash,
    scope: definition.scope,
  });
}

function isApprovalRecord(value: unknown): value is ApprovalRecord {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

export function validateApprovalRecord(
  value: unknown,
  actionRequest: ActionRequest,
  context: SessionContext,
  actionDecision: PolicyDecision,
  now = new Date(),
): string[] {
  if (!isApprovalRecord(value)) {
    return ["execute_approved_action requires a full ApprovalRecord; a string prefix is not execution authority."];
  }

  const expectedHash = calculateActionHash(String(actionRequest.actionType), actionRequest.params);
  const errors: string[] = [];

  if (value.sessionId !== context.sessionId) {
    errors.push("ApprovalRecord sessionId does not match the active session.");
  }

  if (value.actionHash !== expectedHash) {
    errors.push("ApprovalRecord actionHash does not match the requested action and params.");
  }

  if (value.actionType !== actionRequest.actionType) {
    errors.push("ApprovalRecord actionType does not match the requested action.");
  }

  if (value.risk !== actionDecision.risk) {
    errors.push("ApprovalRecord risk does not match the Policy Engine computed risk.");
  }

  if (!Array.isArray(value.approvedBy) || !value.approvedBy.includes("diagnosed-user")) {
    errors.push("ApprovalRecord must include diagnosed-user approval.");
  }

  if (typeof value.expiresAt !== "string" || Number.isNaN(Date.parse(value.expiresAt)) || Date.parse(value.expiresAt) <= now.getTime()) {
    errors.push("ApprovalRecord is missing a valid future expiresAt timestamp.");
  }

  if (value.singleUse !== true) {
    errors.push("ApprovalRecord must be singleUse in phase 1.");
  }

  if (value.usedAt) {
    errors.push("ApprovalRecord has already been used.");
  }

  if (value.policyVersion !== POLICY_VERSION) {
    errors.push("ApprovalRecord policyVersion does not match the active policy version.");
  }

  return errors;
}

export function createMockApprovalRecord(
  actionRequest: ActionRequest,
  context: SessionContext,
  approvedBy: ApprovalPrincipal[] = ["diagnosed-user"],
  now = new Date(),
): ApprovalRecord {
  const actionDecision = evaluateActionRequest(actionRequest, context);
  if (!actionDecision.allowed || actionDecision.risk === "red" || actionDecision.risk === "orange") {
    throw new Error("Cannot create approval record for a blocked action.");
  }

  return {
    id: `mock-approval-${now.getTime()}`,
    sessionId: context.sessionId,
    actionHash: actionDecision.actionHash ?? calculateActionHash(String(actionRequest.actionType), actionRequest.params),
    actionType: actionRequest.actionType,
    risk: actionDecision.risk,
    approvedBy,
    approvedAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + 5 * 60 * 1000).toISOString(),
    singleUse: true,
    scope: actionDecision.scope ?? [],
    reversible: ACTION_REGISTRY[actionRequest.actionType as ActionType]?.reversible ?? false,
    policyVersion: POLICY_VERSION,
  };
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

  if (!isDiagnosticToolName(request.toolName)) {
    if (FORBIDDEN_UNKNOWN_TOOL_PATTERNS.some((pattern) => pattern.test(request.toolName))) {
      return decision({
        allowed: false,
        risk: "red",
        requiresApproval: false,
        approvalKind: "forbidden",
        reasons: ["The requested unknown tool name looks like raw command execution or credential access."],
      });
    }

    return decision({
      allowed: false,
      risk: "red",
      requiresApproval: false,
      approvalKind: "forbidden",
      reasons: ["Unknown tools are denied by default."],
    });
  }

  const actionRequest = actionRequestFromToolRequest(request);
  const actionDecision = evaluateActionRequest(actionRequest, request.context);

  if (request.toolName === "request_action_approval") {
    if (!actionDecision.allowed) {
      return actionDecision;
    }

    return decision({
      ...actionDecision,
      requiresApproval: actionDecision.risk !== "green",
      approvalKind: approvalKindForRisk(actionDecision.risk),
      reasons: [
        "Approval request accepted for a structured action.",
        "Risk, reversibility, and scope were computed by policy; AI-provided risk labels were ignored.",
        ...actionDecision.reasons,
      ],
    });
  }

  if (request.toolName === "execute_approved_action") {
    if (!actionDecision.allowed) {
      return actionDecision;
    }

    const approvalErrors = validateApprovalRecord(request.args.approvalRecord, actionRequest, request.context, actionDecision);
    if (approvalErrors.length > 0) {
      return decision({
        allowed: false,
        risk: actionDecision.risk,
        requiresApproval: true,
        approvalKind: approvalKindForRisk(actionDecision.risk),
        reasons: approvalErrors,
        actionType: actionDecision.actionType,
        actionHash: actionDecision.actionHash,
        scope: actionDecision.scope,
      });
    }

    return decision({
      allowed: true,
      risk: actionDecision.risk,
      requiresApproval: false,
      approvalKind: "none",
      reasons: [
        "ApprovalRecord is valid for this session, action hash, computed risk, and expiry window.",
        "Phase 1 still returns a mock non-execution result.",
      ],
      actionType: actionDecision.actionType,
      actionHash: actionDecision.actionHash,
      scope: actionDecision.scope,
    });
  }

  return actionDecision;
}
