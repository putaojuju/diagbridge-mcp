import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AuditLog } from "../audit.ts";
import type { BridgeConfig, ToolName } from "../config.ts";
import { VERSION } from "../version.ts";
import { getToolDefinition } from "./tool-registry.ts";


export function createDiagBridgeMcpServer(
  config: BridgeConfig,
  audit: AuditLog,
  enabledTools: readonly ToolName[],
): McpServer {
  const server = new McpServer({
    name: "diagbridge-mcp",
    version: VERSION,
  });

  for (const toolName of enabledTools) {
    const tool = getToolDefinition(toolName);
    if (!tool) {
      continue;
    }

    server.registerTool(
      toolName,
      {
        title: tool.title,
        description: tool.description,
        inputSchema: tool.zodSchema,
        annotations: tool.annotations,
      },
      async (args) => {
        const toolArgs = args as Record<string, unknown>;
        try {
          const result = await tool.handler(toolArgs, config);
          await audit.record({ toolName, params: toolArgs, status: "ok" });
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(result, null, 2),
              },
            ],
          };
        } catch (error) {
          const message = error instanceof Error ? error.message : "tool failed";
          await audit.record({ toolName, params: toolArgs, status: "error", message });
          return {
            isError: true,
            content: [
              {
                type: "text" as const,
                text: message,
              },
            ],
          };
        }
      },
    );
  }

  return server;
}
