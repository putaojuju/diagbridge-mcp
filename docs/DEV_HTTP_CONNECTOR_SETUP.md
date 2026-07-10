# Development HTTP Connector Setup

This guide is for first-round ChatGPT custom connector testing against a local DiagBridge MCP endpoint.

The HTTP MCP fallback is development-only. It uses the official `@modelcontextprotocol/sdk` Streamable HTTP server transport. It is not a production deployment model.

## 1. Install

```bash
npm install
```

## 2. Check TypeScript

```bash
npm run check
```

## 3. Run tests

```bash
npm test
```

## 4. Start the HTTP MCP server

Normal token-authenticated mode:

```bash
npm run dev:http-mcp
```

By default it listens on:

```text
http://127.0.0.1:8787/mcp
```

The server prints a session token. Protected `/mcp` requests require it as either:

```text
Authorization: Bearer <token>
```

or:

```text
X-DiagBridge-Session-Token: <token>
```

## 5. Validate with MCP Inspector

For a short localhost-only Inspector test, start the server with development no-auth mode:

### PowerShell

```powershell
$env:DIAGBRIDGE_HTTP_DEV_NO_AUTH="1"
npm run dev:http-mcp
```

### Command Prompt

```bat
set DIAGBRIDGE_HTTP_DEV_NO_AUTH=1
npm run dev:http-mcp
```

Then run:

```bash
npx @modelcontextprotocol/inspector@latest --server-url http://127.0.0.1:8787/mcp --transport http
```

`DIAGBRIDGE_HTTP_DEV_NO_AUTH=1` is disabled by default. It bypasses only the development HTTP connector token check and still exposes only these four read-only tools:

```text
system_info
drive_inventory
junk_candidates
windows_event_summary
```

Use no-auth mode only on `127.0.0.1` for a short Inspector test. Do not leave it enabled, do not bind it to `0.0.0.0`, and do not expose it through a public tunnel.

After the Inspector test, unset the variable or open a new terminal before starting the authenticated connector mode.

## 6. Expose the authenticated local port for connector testing

Use a temporary tunnel only for development. Keep token authentication enabled while tunneling.

### Option A: ngrok

```bash
ngrok http 8787
```

Use the HTTPS forwarding URL and append `/mcp`.

Example:

```text
https://example.ngrok-free.app/mcp
```

### Option B: Cloudflare Tunnel

```bash
cloudflared tunnel --url http://127.0.0.1:8787
```

Use the generated HTTPS URL and append `/mcp`.

Example:

```text
https://example.trycloudflare.com/mcp
```

## 7. Configure ChatGPT connector

In the ChatGPT custom connector setup, use:

```text
HTTPS URL: https://<your-tunnel-host>/mcp
```

Use bearer/API-key authentication if the connector setup allows custom authorization headers, and set the value to the session token printed by DiagBridge.

## 8. First-round tool whitelist

The HTTP connector exposes only these read-only tools:

```text
system_info
drive_inventory
junk_candidates
windows_event_summary
```

Do not test or expose:

```text
read_file
write_file
run_command
```

`read_file` remains available for local development modes, but it is intentionally omitted from the HTTP connector list.

## 9. Do not expose destructive tools through tunnels

Do not enable `write_file` or `run_command` while using ngrok, Cloudflare Tunnel, or any public tunnel.

`run_command` is destructive and open-world. It is not part of the ChatGPT connector first-round test surface.

## 10. Smoke checks

Health text:

```bash
curl -i https://<your-tunnel-host>/
```

CORS preflight:

```bash
curl -i -X OPTIONS https://<your-tunnel-host>/mcp
curl -i -X OPTIONS https://<your-tunnel-host>/mcp/actions
```

Expected connector tools are only:

```text
system_info
drive_inventory
junk_candidates
windows_event_summary
```
