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

export const ACTION_TYPES = [
  "noop",
  "get_system_overview",
  "run_network_diagnosis",
  "list_allowed_roots",
  "read_text_file",
  "search_logs",
  "collect_diagnostic_report",
  "flush_dns_cache",
  "restart_known_application",
  "modify_network_adapter",
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
] as const;

export type ActionType = (typeof ACTION_TYPES)[number];

export type GatewayEntryPoint = "remote-mcp" | "local-relay" | "agent";
export type ConsentState = "active" | "revoked" | "expired";
export type ApprovalKind = "none" | "informational" | "single" | "dual" | "forbidden";
export type AutonomyMode = "automatic" | "session_scope" | "action_card" | "dual_confirmation" | "forbidden";
export type ApprovalPrincipal = "diagnosed-user" | "helper" | "policy-engine" | "test";

export interface AutonomyProfile {
  id: string;
  name: string;
  description: string;
  riskModes: Record<RiskLevel, AutonomyMode>;
  grantedScopes: string[];
  maxAutomaticRisk: RiskLevel;
  aiMaySelfDeclareRisk: false;
}

export const DEFAULT_AUTONOMY_PROFILE: AutonomyProfile = {
  id: "progressive-autonomy-v1",
  name: "Progressive Autonomy",
  description: "Green runs automatically, Blue uses session-scoped authorization, Yellow needs action-card approval, Orange needs dual confirmation, and Red is forbidden by default.",
  riskModes: {
    green: "automatic",
    blue: "session_scope",
    yellow: "action_card",
    orange: "dual_confirmation",
    red: "forbidden",
  },
  grantedScopes: [],
  maxAutomaticRisk: "green",
  aiMaySelfDeclareRisk: false,
};

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
  autonomyProfile?: AutonomyProfile;
  createdAt: string;
  expiresAt?: string;
}

export interface ActionDefinition {
  actionType: ActionType;
  title: string;
  description: string;
  baseRisk: RiskLevel;
  approvalKind: ApprovalKind;
  reversible: boolean;
  scope: string[];
  impact: string;
  mockOnly: boolean;
  forbidden?: boolean;
  requiresBackup?: boolean;
}

export interface ActionRequest {
  actionType: ActionType | string;
  params: Record<string, unknown>;
  sessionId: string;
  requestedBy: GatewayEntryPoint;
  diagnosticIntent?: string;
  createdAt: string;
}

export interface ApprovalRecord {
  id: string;
  sessionId: string;
  actionHash: string;
  actionType: ActionType | string;
  risk: RiskLevel;
  approvedBy: ApprovalPrincipal[];
  approvedAt: string;
  expiresAt: string;
  singleUse: boolean;
  usedAt?: string;
  scope: string[];
  reversible: boolean;
  policyVersion: string;
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
  actionType?: string;
  actionHash?: string;
  scope?: string[];
}

export interface PendingAction {
  id: string;
  actionType: ActionType | string;
  actionHash: string;
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

export function isActionType(name: string): name is ActionType {
  return (ACTION_TYPES as readonly string[]).includes(name);
}
