import type { BridgeConfig, ToolName } from "./config.ts";
import { isToolName } from "./config.ts";
import { getToolMetadata, invokeTool } from "./tools/index.ts";
import type { AuditLog } from "./audit.ts";

export interface JsonRpcRequest {
  jsonrpc?: "2.0";
  id?: string | number | null;
  method?: string;
  params?: Record<string, unknown>;
}

export interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: string | number | null;
  result?: unknown;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
}

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function mcpTool(tool: ReturnType<typeof getToolMetadata>[number]) {
  return {
    name: tool.name,
    title: tool.title,
    description: tool.description,
    inputSchema: tool.inputSchema,
    annotations: tool.annotations,
  };
}

function jsonTextResult(value: unknown) {
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(value, null, 2),
      },
    ],
    structuredContent: value,
  };
}

function ok(id: JsonRpcRequest["id"], result: unknown): JsonRpcResponse {
  return { jsonrpc: "2.0", id: id ?? null, result };
}

function err(id: JsonRpcRequest["id"], code: number, message: string, data?: unknown): JsonRpcResponse {
  return { jsonrpc: "2.0", id: id ?? null, error: { code, message, data } };
}

export async function handleMcpRequest(
  request: JsonRpcRequest,
  config: BridgeConfig,
  audit?: AuditLog,
  enabledTools: ToolName[] = config.enabledTools,
): Promise<JsonRpcResponse | undefined> {
  if (!request.id && request.method?.startsWith("notifications/")) {
    return undefined;
  }

  switch (request.method) {
    case "initialize":
      return ok(request.id, {
        protocolVersion: "2024-11-05",
        capabilities: {
          tools: {},
        },
        serverInfo: {
          name: "diagbridge-mcp",
          version: "0.2.0",
        },
      });

    case "ping":
      return ok(request.id, {});

    case "tools/list":
      return ok(request.id, { tools: getToolMetadata(enabledTools).map(mcpTool) });

    case "tools/call": {
      const params = asObject(request.params);
      const name = String(params.name ?? "");
      const args = asObject(params.arguments ?? params.args);

      if (!isToolName(name)) {
        await audit?.record({ toolName: name || "unknown", params: args, status: "denied", message: "unknown tool" });
        return err(request.id, -32602, "unknown tool");
      }

      if (!enabledTools.includes(name)) {
        await audit?.record({ toolName: name, params: args, status: "denied", message: "tool disabled" });
        return err(request.id, -32602, "tool disabled by this transport");
      }

      try {
        const result = await invokeTool(name, args, config);
        await audit?.record({ toolName: name, params: args, status: "ok" });
        return ok(request.id, jsonTextResult(result));
      } catch (error) {
        const message = error instanceof Error ? error.message : "tool failed";
        await audit?.record({ toolName: name, params: args, status: "error", message });
        return err(request.id, -32000, message);
      }
    }

    default:
      return err(request.id, -32601, `unsupported MCP method: ${request.method ?? "<missing>"}`);
  }
}
