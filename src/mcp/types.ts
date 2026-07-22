import type { z } from "zod/v4";
import type { BridgeConfig, ToolName } from "../config.ts";

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

export type ToolHandler = (args: Record<string, unknown>, config: BridgeConfig) => Promise<unknown>;

export interface ToolDefinition {
  name: ToolName;
  title: string;
  description: string;
  zodSchema: Record<string, z.ZodType>;
  annotations: ToolAnnotations;
  handler: ToolHandler;
}
