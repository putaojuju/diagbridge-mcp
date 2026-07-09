import { ACTION_TYPES, type DiagnosticToolName, type RiskLevel } from "@diagbridge/core";

export interface JsonSchemaDraft {
  type: "object";
  additionalProperties?: boolean;
  required?: string[];
  properties: Record<string, unknown>;
}

export interface McpToolSchemaDraft {
  name: DiagnosticToolName;
  description: string;
  defaultRisk: RiskLevel;
  mockOnly: boolean;
  inputSchema: JsonSchemaDraft;
}

const actionTypeEnum = [...ACTION_TYPES];

export const MCP_TOOL_SCHEMAS: Record<DiagnosticToolName, McpToolSchemaDraft> = {
  get_system_overview: {
    name: "get_system_overview",
    description: "Return a basic read-only system overview. Phase 1 returns mock data.",
    defaultRisk: "green",
    mockOnly: true,
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        includeInstalledApps: { type: "boolean", default: false },
      },
    },
  },
  run_network_diagnosis: {
    name: "run_network_diagnosis",
    description: "Run basic read-only network diagnostics. Phase 1 returns mock data.",
    defaultRisk: "green",
    mockOnly: true,
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        targetHost: { type: "string", default: "example.com" },
      },
    },
  },
  list_allowed_roots: {
    name: "list_allowed_roots",
    description: "List file roots that the diagnosed user explicitly allowed for diagnostic reads.",
    defaultRisk: "green",
    mockOnly: true,
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {},
    },
  },
  read_text_file: {
    name: "read_text_file",
    description: "Read a bounded text file from an allowed root. Phase 1 never reads real files.",
    defaultRisk: "blue",
    mockOnly: true,
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["path"],
      properties: {
        path: { type: "string" },
        maxBytes: { type: "number", default: 65536 },
      },
    },
  },
  search_logs: {
    name: "search_logs",
    description: "Search selected diagnostic logs with redaction and size limits. Phase 1 returns mock data.",
    defaultRisk: "blue",
    mockOnly: true,
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["query"],
      properties: {
        query: { type: "string" },
        sources: { type: "array", items: { type: "string" }, default: ["system"] },
        maxResults: { type: "number", default: 20 },
      },
    },
  },
  explain_pending_action: {
    name: "explain_pending_action",
    description: "Explain a pending action in plain language before any approval decision.",
    defaultRisk: "green",
    mockOnly: true,
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["actionId"],
      properties: {
        actionId: { type: "string" },
      },
    },
  },
  request_action_approval: {
    name: "request_action_approval",
    description: "Request diagnosed-user approval for a structured action. Risk, reversibility, and scope are computed by Action Registry and Policy Engine, not by AI arguments.",
    defaultRisk: "yellow",
    mockOnly: true,
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["actionType", "params"],
      properties: {
        actionType: { enum: actionTypeEnum },
        params: { type: "object", additionalProperties: true, default: {} },
        diagnosticIntent: { type: "string" },
      },
    },
  },
  execute_approved_action: {
    name: "execute_approved_action",
    description: "Execute a previously approved structured action. Phase 1 validates approval metadata and returns a mock non-execution result.",
    defaultRisk: "yellow",
    mockOnly: true,
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["actionType", "params", "approvalRecord"],
      properties: {
        actionType: { enum: actionTypeEnum },
        params: { type: "object", additionalProperties: true, default: {} },
        approvalRecord: {
          type: "object",
          additionalProperties: true,
          required: ["sessionId", "actionHash", "risk", "approvedBy", "expiresAt", "singleUse"],
          properties: {
            id: { type: "string" },
            sessionId: { type: "string" },
            actionHash: { type: "string" },
            risk: { enum: ["green", "blue", "yellow", "orange", "red"] },
            approvedBy: { type: "array", items: { type: "string" } },
            expiresAt: { type: "string" },
            singleUse: { type: "boolean" },
          },
        },
      },
    },
  },
  collect_diagnostic_report: {
    name: "collect_diagnostic_report",
    description: "Collect a bounded diagnostic report. Phase 1 returns mock report metadata.",
    defaultRisk: "blue",
    mockOnly: true,
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        sections: { type: "array", items: { type: "string" }, default: ["system", "network"] },
      },
    },
  },
};

export function listMcpTools(): McpToolSchemaDraft[] {
  return Object.values(MCP_TOOL_SCHEMAS);
}
