export const RISK_LEVELS = ["green", "blue", "yellow", "orange", "red"] as const;

export type RiskLevel = (typeof RISK_LEVELS)[number];

export const TOOL_NAMES = [
  "get_system_overview",
  "run_network_diagnosis",
  "list_allowed_roots",
  "read_text_file",
  "search_logs",
  "explain_pending_action",
  "request_action_approval",
  "execute_approved_action",
  "collect_diagnostic_report",
] as const;

export type DiagnosticToolName = (typeof TOOL_NAMES)[number];

export type GatewayEntryPoint = "remote-mcp" | "local-relay" | "agent";
export type ConsentState = "active" | "revoked" | "expired";
export type ApprovalKind = "none" | "informational" | "single" | "dual" | "forbidden";

export interface DiagnosedUser {
  displayName?: string;
  deviceLabel?: string;
  isPresent: boolean;
}

export interface FileRoot {
  id: string;
  label: string;
  path: string;
  readonly: boolean;
  risk: RiskLevel;
}

export interface SessionContext {
  sessionId: string;
  entryPoint: GatewayEntryPoint;
  diagnosedUser: DiagnosedUser;
  consentState: ConsentState;
  isAdmin: boolean;
  expertModeEnabled: boolean;
  allowedRoots: FileRoot[];
  createdAt: string;
  expiresAt?: string;
}

export interface ToolRequest {
  toolName: string;
  args: Record<string, unknown>;
  context: SessionContext;
}

export interface PolicyDecision {
  allowed: boolean;
  risk: RiskLevel;
  requiresApproval: boolean;
  approvalKind: ApprovalKind;
  reasons: string[];
  redactions: string[];
  mockOnly: boolean;
}

export interface PendingAction {
  id: string;
  title: string;
  plainLanguageSummary: string;
  risk: RiskLevel;
  reversible: boolean;
  requestedBy: GatewayEntryPoint;
  createdAt: string;
}

export interface AuditEvent {
  id: string;
  sessionId: string;
  toolName: string;
  risk: RiskLevel;
  allowed: boolean;
  createdAt: string;
  summary: string;
}

export function isDiagnosticToolName(name: string): name is DiagnosticToolName {
  return (TOOL_NAMES as readonly string[]).includes(name);
}
