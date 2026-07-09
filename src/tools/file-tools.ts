import { dirname, isAbsolute, normalize, resolve } from "node:path";
import { mkdir, readFile as fsReadFile, readdir, stat, writeFile as fsWriteFile } from "node:fs/promises";
import type { ToolMetadata } from "../config.ts";

export const listDirTool: ToolMetadata = {
  name: "list_dir",
  title: "List directory",
  description: "List entries in a local directory. This is a read-only tool.",
  inputSchema: {
    type: "object",
    additionalProperties: false,
    required: ["path"],
    properties: {
      path: { type: "string" },
    },
  },
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    openWorldHint: false,
  },
};

export const readFileTool: ToolMetadata = {
  name: "read_file",
  title: "Read file",
  description: "Read a local text file. This is a read-only tool.",
  inputSchema: {
    type: "object",
    additionalProperties: false,
    required: ["path"],
    properties: {
      path: { type: "string" },
      encoding: { type: "string", default: "utf8" },
      maxBytes: { type: "number", default: 1048576 },
    },
  },
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    openWorldHint: false,
  },
};

export const writeFileTool: ToolMetadata = {
  name: "write_file",
  title: "Write file",
  description: "Write a local text file. This is destructive and should normally require MCP host approval.",
  inputSchema: {
    type: "object",
    additionalProperties: false,
    required: ["path", "content"],
    properties: {
      path: { type: "string" },
      content: { type: "string" },
      encoding: { type: "string", default: "utf8" },
      createParents: { type: "boolean", default: false },
    },
  },
  annotations: {
    readOnlyHint: false,
    destructiveHint: true,
    openWorldHint: false,
  },
};

export function resolveBridgePath(inputPath: string, cwd = process.cwd()): string {
  if (!inputPath || inputPath.trim().length === 0) {
    throw new Error("path is required");
  }

  if (inputPath.includes("\0")) {
    throw new Error("path must not contain null bytes");
  }

  return normalize(isAbsolute(inputPath) ? inputPath : resolve(cwd, inputPath));
}

function stringArg(args: Record<string, unknown>, key: string): string {
  const value = args[key];
  if (typeof value !== "string") {
    throw new Error(`${key} must be a string`);
  }
  return value;
}

export async function listDir(args: Record<string, unknown>, cwd = process.cwd()) {
  const directoryPath = resolveBridgePath(stringArg(args, "path"), cwd);
  const entries = await readdir(directoryPath, { withFileTypes: true });
  return {
    path: directoryPath,
    entries: entries.map((entry) => ({
      name: entry.name,
      type: entry.isDirectory() ? "directory" : entry.isFile() ? "file" : "other",
    })),
  };
}

export async function readFile(args: Record<string, unknown>, cwd = process.cwd()) {
  const filePath = resolveBridgePath(stringArg(args, "path"), cwd);
  const maxBytes = typeof args.maxBytes === "number" ? args.maxBytes : 1024 * 1024;
  const fileStat = await stat(filePath);

  if (fileStat.size > maxBytes) {
    throw new Error(`file is larger than maxBytes (${fileStat.size} > ${maxBytes})`);
  }

  const encoding = (typeof args.encoding === "string" ? args.encoding : "utf8") as BufferEncoding;
  return {
    path: filePath,
    content: await fsReadFile(filePath, encoding),
    encoding,
  };
}

export async function writeFile(args: Record<string, unknown>, cwd = process.cwd()) {
  const filePath = resolveBridgePath(stringArg(args, "path"), cwd);
  const content = stringArg(args, "content");
  const encoding = (typeof args.encoding === "string" ? args.encoding : "utf8") as BufferEncoding;

  if (args.createParents === true) {
    await mkdir(dirname(filePath), { recursive: true });
  }

  await fsWriteFile(filePath, content, encoding);
  return {
    path: filePath,
    bytesWritten: Buffer.from(content, encoding).length,
  };
}
