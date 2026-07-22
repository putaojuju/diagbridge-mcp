import * as z from "zod/v4";
import type { BridgeConfig, ToolName } from "../config.ts";
import type { ToolDefinition, ToolMetadata } from "./types.ts";
import { systemInfoDefinition } from "../tools/system-info.ts";
import { listDirDefinition, readFileDefinition, writeFileDefinition } from "../tools/file-tools.ts";
import { runCommandDefinition } from "../tools/command.ts";
import { driveInventoryDefinition } from "../tools/drive-inventory.ts";
import { junkCandidatesDefinition } from "../tools/junk-candidates.ts";
import { windowsEventSummaryDefinition } from "../tools/windows-events.ts";

export type { ToolDefinition, ToolMetadata };

export const TOOL_REGISTRY: Record<ToolName, ToolDefinition> = {
  system_info: systemInfoDefinition,
  list_dir: listDirDefinition,
  read_file: readFileDefinition,
  write_file: writeFileDefinition,
  run_command: runCommandDefinition,
  drive_inventory: driveInventoryDefinition,
  junk_candidates: junkCandidatesDefinition,
  windows_event_summary: windowsEventSummaryDefinition,
};

export function getToolDefinition(name: ToolName): ToolDefinition | undefined {
  return TOOL_REGISTRY[name];
}

export function getToolMetadata(enabledTools?: readonly ToolName[]): ToolMetadata[] {
  const names = enabledTools ?? (Object.keys(TOOL_REGISTRY) as ToolName[]);
  return names.map((name) => {
    const tool = TOOL_REGISTRY[name];
    if (!tool) {
      throw new Error(`Tool definition not found for: ${name}`);
    }
    const generatedJsonSchema = z.object(tool.zodSchema).toJSONSchema() as Record<string, unknown>;
    return {
      name: tool.name,
      title: tool.title,
      description: tool.description,
      inputSchema: generatedJsonSchema,
      annotations: tool.annotations,
    };
  });
}

export async function invokeTool(
  name: ToolName,
  args: Record<string, unknown>,
  config: BridgeConfig,
): Promise<unknown> {
  const tool = TOOL_REGISTRY[name];
  if (!tool) {
    throw new Error(`Unknown tool: ${name}`);
  }
  return tool.handler(args, config);
}
