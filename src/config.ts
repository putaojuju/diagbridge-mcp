export const VERSION = "0.2.1";
export const DEFAULT_HOST = "127.0.0.1";
export const DEFAULT_PORT = 8787;
export const DEFAULT_REMOTE_MCP_PORT = 8787;

export const TOOL_NAMES = [
  "system_info",
  "list_dir",
  "read_file",
  "write_file",
  "run_command",
  "drive_inventory",
  "junk_candidates",
  "windows_event_summary",
] as const;
export type ToolName = (typeof TOOL_NAMES)[number];

export const DEFAULT_ENABLED_TOOLS: ToolName[] = [
  "system_info",
  "list_dir",
  "read_file",
  "drive_inventory",
  "junk_candidates",
  "windows_event_summary",
];

export const LOCAL_MCP_TOOL_NAMES = [
  "system_info",
  "list_dir",
  "read_file",
  "drive_inventory",
  "junk_candidates",
  "windows_event_summary",
] as const satisfies readonly ToolName[];

export const REMOTE_MCP_TOOL_NAMES = [
  "system_info",
  "drive_inventory",
  "junk_candidates",
  "windows_event_summary",
] as const satisfies readonly ToolName[];

export type ReadOnlyMcpToolName = (typeof LOCAL_MCP_TOOL_NAMES)[number];

export interface BridgeConfig {
  host: string;
  port: number;
  sessionToken?: string;
  enabledTools: ToolName[];
  auditLogPath?: string;
  cwd: string;
  visible: true;
  runCommandEnabled: boolean;
  writeFileEnabled: boolean;
  remoteDevNoAuth: boolean;
}

export function isToolName(value: string): value is ToolName {
  return (TOOL_NAMES as readonly string[]).includes(value);
}

export function parseEnabledTools(value: string | undefined): ToolName[] {
  if (!value) {
    return [...DEFAULT_ENABLED_TOOLS];
  }

  const parsed = value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .filter(isToolName);

  return parsed.length > 0 ? [...new Set(parsed)] : [...DEFAULT_ENABLED_TOOLS];
}

export function isRemoteDevNoAuthEnabled(env: Record<string, string | undefined> = process.env): boolean {
  if (env.DIAGBRIDGE_HTTP_DEV_NO_AUTH !== undefined && env.DIAGBRIDGE_REMOTE_DEV_NO_AUTH === undefined) {
    console.warn("DEPRECATION NOTICE: DIAGBRIDGE_HTTP_DEV_NO_AUTH is deprecated. Use DIAGBRIDGE_REMOTE_DEV_NO_AUTH instead.");
    return env.DIAGBRIDGE_HTTP_DEV_NO_AUTH === "1";
  }
  return env.DIAGBRIDGE_REMOTE_DEV_NO_AUTH === "1";
}

export function loadConfig(env: Record<string, string | undefined> = process.env): BridgeConfig {
  const toolsEnv = env.DIAGBRIDGE_MCP_TOOLS ?? env.DIAGBRIDGE_TOOLS;
  if (env.DIAGBRIDGE_TOOLS !== undefined && env.DIAGBRIDGE_MCP_TOOLS === undefined) {
    console.warn("DEPRECATION NOTICE: DIAGBRIDGE_TOOLS is deprecated for MCP tools config. Use DIAGBRIDGE_MCP_TOOLS instead.");
  }

  const enabledTools = parseEnabledTools(toolsEnv);
  const port = Number(env.DIAGBRIDGE_PORT ?? DEFAULT_PORT);

  return {
    host: env.DIAGBRIDGE_HOST ?? DEFAULT_HOST,
    port: Number.isFinite(port) ? port : DEFAULT_PORT,
    sessionToken: env.DIAGBRIDGE_SESSION_TOKEN,
    enabledTools,
    auditLogPath: env.DIAGBRIDGE_AUDIT_LOG ?? ".diagbridge-audit.jsonl",
    cwd: env.DIAGBRIDGE_CWD ?? process.cwd(),
    visible: true,
    runCommandEnabled: enabledTools.includes("run_command"),
    writeFileEnabled: enabledTools.includes("write_file"),
    remoteDevNoAuth: false,
  };
}

export function loadRemoteMcpConfig(env: Record<string, string | undefined> = process.env): BridgeConfig {
  if (env.DIAGBRIDGE_HTTP_HOST !== undefined && env.DIAGBRIDGE_REMOTE_HOST === undefined) {
    console.warn("DEPRECATION NOTICE: DIAGBRIDGE_HTTP_HOST is deprecated. Use DIAGBRIDGE_REMOTE_HOST instead.");
  }
  if (env.DIAGBRIDGE_HTTP_PORT !== undefined && env.DIAGBRIDGE_REMOTE_PORT === undefined) {
    console.warn("DEPRECATION NOTICE: DIAGBRIDGE_HTTP_PORT is deprecated. Use DIAGBRIDGE_REMOTE_PORT instead.");
  }

  const host = env.DIAGBRIDGE_REMOTE_HOST ?? env.DIAGBRIDGE_HTTP_HOST ?? env.DIAGBRIDGE_HOST ?? DEFAULT_HOST;
  const rawPort = env.DIAGBRIDGE_REMOTE_PORT ?? env.DIAGBRIDGE_HTTP_PORT ?? env.DIAGBRIDGE_PORT;
  const port = Number(rawPort ?? DEFAULT_REMOTE_MCP_PORT);

  return {
    host,
    port: Number.isFinite(port) ? port : DEFAULT_REMOTE_MCP_PORT,
    sessionToken: env.DIAGBRIDGE_SESSION_TOKEN,
    enabledTools: [...REMOTE_MCP_TOOL_NAMES],
    auditLogPath: env.DIAGBRIDGE_AUDIT_LOG ?? ".diagbridge-audit.jsonl",
    cwd: env.DIAGBRIDGE_CWD ?? process.cwd(),
    visible: true,
    runCommandEnabled: false,
    writeFileEnabled: false,
    remoteDevNoAuth: isRemoteDevNoAuthEnabled(env),
  };
}
