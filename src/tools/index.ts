import type { BridgeConfig, ToolMetadata, ToolName } from "../config.ts";
import { systemInfo, systemInfoTool } from "./system-info.ts";
import { listDir, listDirTool, readFile, readFileTool, writeFile, writeFileTool } from "./file-tools.ts";
import { runCommand, runCommandTool } from "./command.ts";
import { driveInventory, driveInventoryTool } from "./drive-inventory.ts";
import { junkCandidates, junkCandidatesTool } from "./junk-candidates.ts";
import { windowsEventSummary, windowsEventSummaryTool } from "./windows-events.ts";

export const ALL_TOOL_METADATA: Record<ToolName, ToolMetadata> = {
  system_info: systemInfoTool,
  list_dir: listDirTool,
  read_file: readFileTool,
  write_file: writeFileTool,
  run_command: runCommandTool,
  drive_inventory: driveInventoryTool,
  junk_candidates: junkCandidatesTool,
  windows_event_summary: windowsEventSummaryTool,
};

export function getToolMetadata(enabledTools?: ToolName[]): ToolMetadata[] {
  const names = enabledTools ?? Object.keys(ALL_TOOL_METADATA) as ToolName[];
  return names.map((name) => ALL_TOOL_METADATA[name]);
}

export async function invokeTool(name: ToolName, args: Record<string, unknown>, config: BridgeConfig): Promise<unknown> {
  switch (name) {
    case "system_info":
      return systemInfo();
    case "list_dir":
      return listDir(args, config.cwd);
    case "read_file":
      return readFile(args, config.cwd);
    case "write_file":
      if (!config.writeFileEnabled) {
        throw new Error("write_file is disabled by current DiagBridge config");
      }
      return writeFile(args, config.cwd);
    case "run_command":
      if (!config.runCommandEnabled) {
        throw new Error("run_command is disabled by current DiagBridge config");
      }
      return runCommand(args);
    case "drive_inventory":
      return driveInventory(args, config.cwd);
    case "junk_candidates":
      return junkCandidates(args, config.cwd);
    case "windows_event_summary":
      return windowsEventSummary(args);
  }
}
