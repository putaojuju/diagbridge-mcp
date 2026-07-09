import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { ActionRequest, SessionContext } from "@diagbridge/core";
import { collectMockDiagnosticReport, getMockSystemOverview, runMockNetworkDiagnosis } from "@diagbridge/diagnostics";
import { createMockApprovalRecord, evaluateToolRequest } from "@diagbridge/policy";
import { listMcpTools } from "@diagbridge/protocol";
import { redactText } from "@diagbridge/redaction";

const host = "127.0.0.1";
const port = Number(process.env.PORT ?? 8787);

const mockSessionContext: SessionContext = {
  sessionId: "mock-session",
  entryPoint: "remote-mcp",
  diagnosedUser: {
    displayName: "Friend",
    deviceLabel: "Friend Windows PC",
    isPresent: true,
  },
  consentState: "active",
  isAdmin: false,
  expertModeEnabled: false,
  allowedRoots: [
    {
      id: "diagbridge-temp",
      label: "DiagBridge temporary collection folder",
      path: "C:\\Users\\Public\\DiagBridge",
      readonly: true,
      risk: "green",
    },
  ],
  createdAt: new Date().toISOString(),
};

type JsonObject = Record<string, unknown>;
type ToolHandler = (args: JsonObject) => unknown | Promise<unknown>;

function objectParam(value: unknown): JsonObject {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonObject) : {};
}

function buildMockActionRequest(args: JsonObject): ActionRequest {
  return {
    actionType: String(args.actionType ?? ""),
    params: objectParam(args.params),
    sessionId: mockSessionContext.sessionId,
    requestedBy: mockSessionContext.entryPoint,
    diagnosticIntent: typeof args.diagnosticIntent === "string" ? args.diagnosticIntent : undefined,
    createdAt: new Date().toISOString(),
  };
}

const handlers: Record<string, ToolHandler> = {
  get_system_overview: () => getMockSystemOverview(),
  run_network_diagnosis: (args) => runMockNetworkDiagnosis(String(args.targetHost ?? "example.com")),
  list_allowed_roots: () => ({ mock: true, roots: mockSessionContext.allowedRoots }),
  read_text_file: (args) => ({
    mock: true,
    path: String(args.path ?? ""),
    content: redactText("[mock] Phase 1 does not read real files. token=example-secret"),
    note: "No filesystem access was performed.",
  }),
  search_logs: (args) => ({
    mock: true,
    query: String(args.query ?? ""),
    results: [
      {
        source: "mock-system-log",
        message: redactText("Network adapter warning for user@example.com. token=example-secret"),
      },
    ],
    note: "No Event Viewer or log file access was performed.",
  }),
  explain_pending_action: (args) => ({
    mock: true,
    actionId: String(args.actionId ?? ""),
    explanation: "This is a mock explanation. Phase 1 does not execute pending actions.",
  }),
  request_action_approval: (args) => {
    const actionRequest = buildMockActionRequest(args);
    const approvalRecord = createMockApprovalRecord(actionRequest, mockSessionContext);
    return {
      mock: true,
      actionType: actionRequest.actionType,
      params: actionRequest.params,
      approvalRecord,
      note: "This is a mock ApprovalRecord for a structured action. It is not a raw command approval.",
    };
  },
  execute_approved_action: (args) => ({
    mock: true,
    actionType: String(args.actionType ?? ""),
    actionHash: objectParam(args.approvalRecord).actionHash,
    executed: false,
    note: "Phase 1 validates approval metadata but never executes approved actions.",
  }),
  collect_diagnostic_report: (args) => collectMockDiagnosticReport(Array.isArray(args.sections) ? args.sections.map(String) : undefined),
};

function sendJson(res: ServerResponse, statusCode: number, body: unknown): void {
  res.writeHead(statusCode, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body, null, 2));
}

async function readJson(req: IncomingMessage): Promise<JsonObject> {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk: Buffer) => {
      body += chunk.toString("utf8");
      if (body.length > 1024 * 1024) {
        reject(new Error("Request body too large"));
      }
    });
    req.on("end", () => {
      try {
        resolve(body ? (JSON.parse(body) as JsonObject) : {});
      } catch (error) {
        reject(error);
      }
    });
    req.on("error", reject);
  });
}

const server = createServer(async (req, res) => {
  try {
    if (req.method === "GET" && req.url === "/health") {
      sendJson(res, 200, {
        ok: true,
        service: "diagbridge-mock-http-gateway",
        bindHost: host,
        mockOnly: true,
        hiddenMode: false,
        rawShell: false,
      });
      return;
    }

    if (req.method === "GET" && req.url === "/mcp/tools/list") {
      sendJson(res, 200, { tools: listMcpTools() });
      return;
    }

    if (req.method === "POST" && req.url === "/mcp/tools/call") {
      const body = await readJson(req);
      const name = String(body.name ?? "");
      const args = (body.args && typeof body.args === "object" ? body.args : {}) as JsonObject;
      const policy = evaluateToolRequest({ toolName: name, args, context: mockSessionContext });

      if (!policy.allowed) {
        sendJson(res, 403, { ok: false, policy });
        return;
      }

      const handler = handlers[name];
      if (!handler) {
        sendJson(res, 404, { ok: false, error: "No handler for tool." });
        return;
      }

      const result = await handler(args);
      sendJson(res, 200, { ok: true, policy, result });
      return;
    }

    sendJson(res, 404, { ok: false, error: "Not found" });
  } catch (error) {
    sendJson(res, 500, { ok: false, error: error instanceof Error ? error.message : "Unknown error" });
  }
});

server.listen(port, host, () => {
  console.log(`DiagBridge mock HTTP gateway listening on http://${host}:${port}`);
  console.log("Phase 1 safety: mock-only, visible, non-admin, no raw shell, no real Windows operations.");
});
