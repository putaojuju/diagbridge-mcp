export const DEFAULT_HOST = "127.0.0.1";
export const DEFAULT_PORT = 8787;
export const DEFAULT_HTTP_MCP_PORT = 8787;

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

export const HTTP_CONNECTOR_TOOL_NAMES = [
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
  httpDevNoAuth: boolean;
}

export interface ToolAnnotations {
  readOnlyHint: boolean;
  destructiveHint: boolean;
  openWorldHint: boolean;
}

export interface ToolMetadata {
  name: ToolName;
  title: string;
  description: string;
  inputSchema: Record<string, unknown>;
  annotations: ToolAnnotations;
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

export function isHttpDevNoAuthEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env.DIAGBRIDGE_HTTP_DEV_NO_AUTH === "1";
}

export function loadConfig(env: Record<string, string | undefined> = process.env): BridgeConfig {
  const enabledTools = parseEnabledTools(env.DIAGBRIDGE_TOOLS);
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
    httpDevNoAuth: false,
  };
}

export function loadHttpMcpConfig(env: Record<string, string | undefined> = process.env): BridgeConfig {
  const port = Number(env.DIAGBRIDGE_HTTP_PORT ?? env.DIAGBRIDGE_PORT ?? DEFAULT_HTTP_MCP_PORT);
  return {
    host: env.DIAGBRIDGE_HTTP_HOST ?? env.DIAGBRIDGE_HOST ?? DEFAULT_HOST,
    port: Number.isFinite(port) ? port : DEFAULT_HTTP_MCP_PORT,
    sessionToken: env.DIAGBRIDGE_SESSION_TOKEN,
    enabledTools: [...HTTP_CONNECTOR_TOOL_NAMES],
    auditLogPath: env.DIAGBRIDGE_AUDIT_LOG ?? ".diagbridge-audit.jsonl",
    cwd: env.DIAGBRIDGE_CWD ?? process.cwd(),
    visible: true,
    runCommandEnabled: false,
    writeFileEnabled: false,
    httpDevNoAuth: isHttpDevNoAuthEnabled(env),
  };
}
