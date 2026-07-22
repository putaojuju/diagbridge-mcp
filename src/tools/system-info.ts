import { arch, freemem, hostname, platform, release, totalmem, type as osType, uptime, userInfo } from "node:os";
import type { ToolDefinition } from "../mcp/types.ts";

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
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    openWorldHint: false,
  },
  handler: async () => systemInfo(),
};
