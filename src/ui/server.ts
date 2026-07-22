import { createServer, type Server, type ServerResponse } from "node:http";
import { readFileSync } from "node:fs";
import { networkInterfaces } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { AuditLog } from "../audit.ts";
import { DEFAULT_REMOTE_MCP_PORT, REMOTE_MCP_TOOL_NAMES } from "../config.ts";
import { type SessionState, checkAndExpireSession, startSession, stopSession } from "../session.ts";
import { CloudflareTunnel } from "../tunnel/cloudflared.ts";

const UI_HOST = "127.0.0.1";
const DEFAULT_UI_PORT = 8790;

const __filename = fileURLToPath(import.meta.url);
const PUBLIC_DIR = join(__filename, "..", "public");

let expirationTimer: NodeJS.Timeout | null = null;

function scheduleExpirationTimer(session: SessionState, tunnel: CloudflareTunnel) {
  if (expirationTimer) {
    clearTimeout(expirationTimer);
    expirationTimer = null;
  }

  if (session.expiresAt) {
    const delay = Math.max(0, new Date(session.expiresAt).getTime() - Date.now());
    expirationTimer = setTimeout(() => {
      stopSession(session, "session-expired");
      tunnel.stop().catch(() => {});
    }, delay);
  }
}

function clearExpirationTimer() {
  if (expirationTimer) {
    clearTimeout(expirationTimer);
    expirationTimer = null;
  }
}

export function getCandidateEndpoints(remoteMcpPort = DEFAULT_REMOTE_MCP_PORT): string[] {
  const interfaces = networkInterfaces();
  const endpoints: string[] = [];

  for (const name of Object.keys(interfaces)) {
    const netList = interfaces[name];
    if (!netList) continue;

    for (const net of netList) {
      if (net.family === "IPv4" && !net.internal) {
        const ip = net.address;
        if (ip !== "127.0.0.1" && !ip.startsWith("169.254.")) {
          endpoints.push(`http://${ip}:${remoteMcpPort}/mcp`);
        }
      }
    }
  }

  if (endpoints.length === 0) {
    endpoints.push(`http://127.0.0.1:${remoteMcpPort}/mcp`);
  }

  return [...new Set(endpoints)];
}

function isOriginAllowed(origin: string | undefined, uiPort = DEFAULT_UI_PORT): boolean {
  if (!origin) {
    return true; // Allow automated tests and cURL requests without Origin
  }
  return origin === `http://127.0.0.1:${uiPort}` || origin === `http://localhost:${uiPort}`;
}

function sendJson(res: ServerResponse, statusCode: number, data: unknown): void {
  res.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-cache",
  });
  res.end(JSON.stringify(data));
}

function sendFile(res: ServerResponse, filename: string, contentType: string): void {
  try {
    const filePath = join(PUBLIC_DIR, filename);
    const content = readFileSync(filePath, "utf8");
    res.writeHead(200, {
      "content-type": contentType,
      "cache-control": "no-cache",
    });
    res.end(content);
  } catch (error) {
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    res.end("Not Found");
  }
}

export function formatStatusResponse(session: SessionState, tunnel?: CloudflareTunnel): Record<string, unknown> {
  const expired = checkAndExpireSession(session);
  if (expired) {
    clearExpirationTimer();
    if (tunnel) {
      tunnel.stop().catch(() => {});
    }
  }

  return {
    state: session.state,
    startedAt: session.startedAt ?? null,
    expiresAt: session.expiresAt ?? null,
    connected: session.connected,
    tokenLast4: session.token ? session.token.slice(-4) : null,
    disconnectReason: session.disconnectReason ?? null,
    allowedTools: [...REMOTE_MCP_TOOL_NAMES],
    tunnelStatus: tunnel ? tunnel.getStatus() : "stopped",
  };
}

export function createUiServer(
  session: SessionState,
  audit: AuditLog,
  port = DEFAULT_UI_PORT,
  requestedHost?: string,
  remoteMcpPort = DEFAULT_REMOTE_MCP_PORT,
  tunnel: CloudflareTunnel = new CloudflareTunnel(),
): Server {
  if (requestedHost && requestedHost !== UI_HOST) {
    throw new Error(`UI server is restricted to 127.0.0.1 and cannot bind to ${requestedHost}`);
  }

  tunnel.setUnexpectedExitHandler((reason) => {
    stopSession(session, "tunnel-exited");
    clearExpirationTimer();
  });

  const server = createServer(async (req, res) => {
    const url = req.url ?? "/";
    const method = req.method ?? "GET";

    if (method === "GET" && (url === "/" || url === "/index.html")) {
      sendFile(res, "index.html", "text/html; charset=utf-8");
      return;
    }

    if (method === "GET" && url === "/styles.css") {
      sendFile(res, "styles.css", "text/css; charset=utf-8");
      return;
    }

    if (method === "GET" && url === "/app.js") {
      sendFile(res, "app.js", "text/javascript; charset=utf-8");
      return;
    }

    if (method === "GET" && url === "/api/status") {
      sendJson(res, 200, formatStatusResponse(session, tunnel));
      return;
    }

    if (method === "POST" && url === "/api/session/start") {
      if (!isOriginAllowed(req.headers.origin, port)) {
        sendJson(res, 403, { error: "Cross-origin request forbidden" });
        return;
      }

      startSession(session);

      // Start Cloudflare Quick Tunnel if not in test bypass mode
      let publicEndpoint = `http://127.0.0.1:${remoteMcpPort}/mcp`;
      if (process.env.DIAGBRIDGE_MOCK_TUNNEL === "1") {
        publicEndpoint = `https://mock-tunnel.trycloudflare.com/mcp`;
      } else {
        const tunnelRes = await tunnel.start(`http://127.0.0.1:${remoteMcpPort}`);
        if (tunnelRes.error) {
          stopSession(session, "tunnel-start-failed");
          clearExpirationTimer();
          await tunnel.stop();
          sendJson(res, 500, { error: tunnelRes.error });
          return;
        }
        if (tunnelRes.mcpEndpoint) {
          publicEndpoint = tunnelRes.mcpEndpoint;
        }
      }

      scheduleExpirationTimer(session, tunnel);

      const lanEndpoints = getCandidateEndpoints(remoteMcpPort);
      const allCandidateEndpoints = [...new Set([publicEndpoint, ...lanEndpoints])];

      sendJson(res, 200, {
        status: formatStatusResponse(session, tunnel),
        connection: {
          token: session.token,
          expiresAt: session.expiresAt,
          mcpEndpoint: publicEndpoint,
          candidateEndpoints: allCandidateEndpoints,
        },
      });
      return;
    }

    if (method === "POST" && url === "/api/session/stop") {
      if (!isOriginAllowed(req.headers.origin, port)) {
        sendJson(res, 403, { error: "Cross-origin request forbidden" });
        return;
      }

      stopSession(session);
      clearExpirationTimer();
      await tunnel.stop();
      sendJson(res, 200, {
        status: formatStatusResponse(session, tunnel),
      });
      return;
    }

    if (method === "GET" && url === "/api/activity") {
      const recentEvents = audit.events.slice(-20).reverse();
      sendJson(res, 200, recentEvents);
      return;
    }

    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    res.end("Not Found");
  });

  return server;
}

export function listenUiServer(
  server: Server,
  port = DEFAULT_UI_PORT,
  onListening?: (url: string) => void,
): Promise<void> {
  return new Promise((resolvePromise) => {
    server.listen(port, UI_HOST, () => {
      const url = `http://${UI_HOST}:${port}`;
      if (onListening) {
        onListening(url);
      }
      resolvePromise();
    });
  });
}
