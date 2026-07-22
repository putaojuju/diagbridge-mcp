import { arch, freemem, hostname, platform, release, totalmem, type as osType, uptime, userInfo } from "node:os";
import type { ToolDefinition, ToolMetadata } from "../config.ts";

export function systemInfo() {
  return {
    hostname: hostname(),
    osType: osType(),
    platform: platform(),
    release: release(),
    arch: arch(),
    uptimeSeconds: Math.round(uptime()),
    totalMemoryBytes: totalmem(),
    freeMemoryBytes: freemem(),
    username: userInfo().username,
    visibleBridge: true,
  };
}

export const systemInfoDefinition: ToolDefinition = {
  name: "system_info",
  title: "System information",
  description: "Return basic local system information. This is a read-only tool.",
  zodSchema: {},
  jsonSchema: {
    type: "object",
    additionalProperties: false,
    properties: {},
  },
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    openWorldHint: false,
  },
  handler: async () => systemInfo(),
};

export const systemInfoTool: ToolMetadata = {
  name: systemInfoDefinition.name,
  title: systemInfoDefinition.title,
  description: systemInfoDefinition.description,
  inputSchema: systemInfoDefinition.jsonSchema,
  annotations: systemInfoDefinition.annotations,
};
