import { AuditLog } from "./audit.ts";
import { loadConfig } from "./config.ts";
import { handleMcpRequest, type JsonRpcRequest, type JsonRpcResponse } from "./mcp-core.ts";

const config = loadConfig();
const audit = new AuditLog(config.auditLogPath);
let buffer = Buffer.alloc(0);

function writeMessage(message: JsonRpcResponse): void {
  const body = Buffer.from(JSON.stringify(message), "utf8");
  process.stdout.write(`Content-Length: ${body.length}\r\n\r\n`);
  process.stdout.write(body);
}

function tryReadOneMessage(): JsonRpcRequest | undefined {
  const headerEnd = buffer.indexOf("\r\n\r\n");
  if (headerEnd === -1) {
    return undefined;
  }

  const header = buffer.subarray(0, headerEnd).toString("utf8");
  const match = /^Content-Length:\s*(\d+)$/im.exec(header);
  if (!match) {
    throw new Error("missing Content-Length header");
  }

  const length = Number(match[1]);
  const bodyStart = headerEnd + 4;
  const bodyEnd = bodyStart + length;
  if (buffer.length < bodyEnd) {
    return undefined;
  }

  const body = buffer.subarray(bodyStart, bodyEnd).toString("utf8");
  buffer = buffer.subarray(bodyEnd);
  return JSON.parse(body) as JsonRpcRequest;
}

async function processBuffer(): Promise<void> {
  while (true) {
    const message = tryReadOneMessage();
    if (!message) {
      return;
    }

    const response = await handleMcpRequest(message, config, audit);
    if (response) {
      writeMessage(response);
    }
  }
}

process.stdin.on("data", (chunk: Buffer) => {
  buffer = Buffer.concat([buffer, chunk]);
  processBuffer().catch((error) => {
    writeMessage({
      jsonrpc: "2.0",
      id: null,
      error: {
        code: -32603,
        message: error instanceof Error ? error.message : "internal error",
      },
    });
  });
});
