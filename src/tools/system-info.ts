import { arch, freemem, hostname, platform, release, totalmem, type as osType, uptime, userInfo } from "node:os";
import type { ToolMetadata } from "../config.ts";

export const systemInfoTool: ToolMetadata = {
  name: "system_info",
  title: "System information",
  description: "Return basic local system information. This is a read-only tool.",
  inputSchema: {
    type: "object",
    additionalProperties: false,
    properties: {},
  },
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    openWorldHint: false,
  },
};

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
