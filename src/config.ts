export const DEFAULT_HOST = "127.0.0.1";
export const DEFAULT_PORT = 8787;

export const TOOL_NAMES = ["system_info", "list_dir", "read_file", "write_file", "run_command"] as const;
export type ToolName = (typeof TOOL_NAMES)[number];

export const DEFAULT_ENABLED_TOOLS: ToolName[] = ["system_info", "list_dir", "read_file"];

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
  };
}
