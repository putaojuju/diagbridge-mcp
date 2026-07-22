import { createServer, type ServerResponse } from "node:http";
import { exec } from "node:child_process";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { AuditLog } from "../audit.ts";
import { REMOTE_MCP_TOOL_NAMES, loadRemoteMcpConfig } from "../config.ts";
import { createDiagBridgeMcpServer } from "../mcp/server-factory.ts";
import { createStoppedSession, isRemoteMcpRequestAuthorized, stopSession } from "../session.ts";
import { CloudflareTunnel } from "../tunnel/cloudflared.ts";
import { createUiServer, listenUiServer } from "./server.ts";

function corsHeaders() {
  return {
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET, POST, DELETE, OPTIONS",
    "access-control-allow-headers":
      "content-type, accept, authorization, x-diagbridge-session-token, mcp-session-id, last-event-id, mcp-protocol-version",
    "access-control-expose-headers": "mcp-session-id",
    "access-control-max-age": "86400",
  };
}

function sendText(res: ServerResponse, statusCode: number, body: string): void {
  res.writeHead(statusCode, { "content-type": "text/plain; charset=utf-8", ...corsHeaders() });
  res.end(body);
}

function sendJson(res: ServerResponse, statusCode: number, body: unknown): void {
  res.writeHead(statusCode, { "content-type": "application/json; charset=utf-8", ...corsHeaders() });
  res.end(JSON.stringify(body));
}

function isMcpPath(url: string | undefined): boolean {
  return url === "/mcp" || Boolean(url?.startsWith("/mcp/"));
}

export function openBrowser(url: string): void {
  if (process.env.NODE_ENV === "test" || process.env.DIAGBRIDGE_TEST_NO_OPEN === "1") {
    return;
  }

  const startCmd =
    process.platform === "win32"
      ? `start "" "${url}"`
      : process.platform === "darwin"
        ? `open "${url}"`
        : `xdg-open "${url}"`;

  exec(startCmd, (err) => {
    if (err) {
      console.log(`Auto-open browser failed. Please manually navigate to: ${url}`);
    }
  });
}

export async function startFriendUiService(): Promise<void> {
  const config = loadRemoteMcpConfig();
  const session = createStoppedSession();
  const audit = new AuditLog(config.auditLogPath);
  const tunnel = new CloudflareTunnel();

  let shuttingDown = false;
  const shutdownAll = () => {
    if (shuttingDown) return;
    shuttingDown = true;
    stopSession(session, "process-exit");
    tunnel.stop().catch(() => {});
  };

  process.on("SIGINT", () => {
    shutdownAll();
    process.exit(0);
  });

  process.on("SIGTERM", () => {
    shutdownAll();
    process.exit(0);
  });

  process.on("exit", () => {
    shutdownAll();
  });

  // 1. Create Remote Streamable HTTP MCP Server
  const remoteMcpServer = createServer(async (req, res) => {
    try {
      if (req.method === "GET" && req.url === "/") {
        sendText(res, 200, "DiagBridge Remote Streamable HTTP Endpoint\n");
        return;
      }

      if (req.method === "OPTIONS" && isMcpPath(req.url)) {
        res.writeHead(204, corsHeaders());
        res.end();
        return;
      }

      if (req.method === "POST" && req.url === "/mcp") {
        if (!isRemoteMcpRequestAuthorized(req.headers, session, config.remoteDevNoAuth)) {
          sendJson(res, 401, { error: "missing, invalid, stopped, or expired session token" });
          return;
        }

        for (const [name, value] of Object.entries(corsHeaders())) {
          res.setHeader(name, value);
        }

        const transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: undefined,
        });
        const mcpServer = createDiagBridgeMcpServer(config, audit, REMOTE_MCP_TOOL_NAMES);

        let cleanedUp = false;
        const cleanup = () => {
          if (!cleanedUp) {
            cleanedUp = true;
            Promise.allSettled([transport.close(), mcpServer.close()]).catch(() => {});
          }
        };

        res.once("finish", cleanup);
        res.once("close", cleanup);

        try {
          await mcpServer.connect(transport);
          await transport.handleRequest(req, res);
        } catch (error) {
          console.error("Error handling MCP request:", error);
          if (!res.headersSent) {
            sendJson(res, 500, {
              jsonrpc: "2.0",
              error: { code: -32603, message: "Internal server error" },
              id: null,
            });
          }
          cleanup();
        }
        return;
      }

      sendText(res, 404, "not found\n");
    } catch (error) {
      if (!res.headersSent) {
        sendJson(res, 500, { error: error instanceof Error ? error.message : "unknown error" });
      }
    }
  });

  // 2. Create Local UI Server
  const uiServer = createUiServer(session, audit, 8790, "127.0.0.1", config.port, tunnel);

  await new Promise<void>((resolvePromise) => {
    remoteMcpServer.listen(config.port, config.host, () => resolvePromise());
  });

  await listenUiServer(uiServer, 8790);

  const uiUrl = "http://127.0.0.1:8790";

  console.log("--------------------------------------------------");
  console.log("🛡️ DiagBridge 控制面板已启动！");
  console.log(`👉 本地控制页面: ${uiUrl}`);
  console.log(`🌐 远程 MCP 本地代理端点: http://${config.host}:${config.port}/mcp`);
  console.log("--------------------------------------------------");
  console.log("提示：请在本地浏览器中点击“开始诊断”以建立安全公网 HTTPS 连接。");

  openBrowser(uiUrl);
}

if (process.argv[1]?.endsWith("launch-friend-ui.ts") || process.argv[1]?.endsWith("launch-friend-ui.js") || process.argv[1]?.endsWith("diagbridge.mjs")) {
  startFriendUiService().catch((err) => {
    console.error("Failed to start Friend UI service:", err);
    process.exit(1);
  });
}
