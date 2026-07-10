import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as z from "zod/v4";
import type { AuditLog } from "./audit.ts";
import type { BridgeConfig, ReadOnlyMcpToolName } from "./config.ts";
import { getToolMetadata, invokeTool } from "./tools/index.ts";

const TOOL_SCHEMAS: Record<ReadOnlyMcpToolName, Record<string, z.ZodType>> = {
  system_info: {},
  list_dir: {
    path: z.string(),
  },
  read_file: {
    path: z.string(),
    encoding: z.string().optional(),
    maxBytes: z.number().int().positive().max(16 * 1024 * 1024).optional(),
  },
  drive_inventory: {
    root: z.string(),
    maxDepth: z.number().int().min(0).max(10).optional(),
    maxEntries: z.number().int().min(1).max(100_000).optional(),
    maxSeconds: z.number().int().min(1).max(300).optional(),
    includeHidden: z.boolean().optional(),
    excludePaths: z.array(z.string()).optional(),
  },
  junk_candidates: {
    roots: z.array(z.string()).optional(),
    olderThanDays: z.number().int().min(1).max(3650).optional(),
    maxEntries: z.number().int().min(1).max(100_000).optional(),
  },
  windows_event_summary: {
    sinceDays: z.number().int().min(1).max(90).optional(),
    logs: z.array(z.enum(["Application", "System"])).optional(),
    maxEvents: z.number().int().min(1).max(500).optional(),
  },
};

export function createDiagBridgeMcpServer(
  config: BridgeConfig,
  audit: AuditLog,
  enabledTools: readonly ReadOnlyMcpToolName[],
): McpServer {
  const server = new McpServer({
    name: "diagbridge-mcp",
    version: "0.2.1",
  });

  const metadata = new Map(getToolMetadata([...enabledTools]).map((tool) => [tool.name, tool]));

  for (const toolName of enabledTools) {
    const tool = metadata.get(toolName);
    if (!tool) {
      continue;
    }

    server.registerTool(
      toolName,
      {
        title: tool.title,
        description: tool.description,
        inputSchema: TOOL_SCHEMAS[toolName],
        annotations: tool.annotations,
      },
      async (args) => {
        const toolArgs = args as Record<string, unknown>;
        try {
          const result = await invokeTool(toolName, toolArgs, config);
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
