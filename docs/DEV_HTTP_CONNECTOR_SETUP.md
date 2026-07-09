# Development HTTP Connector Setup

This guide is for first-round ChatGPT custom connector testing against a local DiagBridge MCP endpoint.

The HTTP MCP fallback is development-only. It is not a production deployment model.

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

## 5. Expose the local port for connector testing

Use a temporary tunnel only for development.

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

## 6. Configure ChatGPT connector

In the ChatGPT custom connector setup, use:

```text
HTTPS URL: https://<your-tunnel-host>/mcp
```

Use bearer/API-key authentication if the connector setup allows custom authorization headers, and set the value to the session token printed by DiagBridge.

## 7. First-round tool whitelist

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

## 8. Do not expose destructive tools through tunnels

Do not enable `write_file` or `run_command` while using ngrok, Cloudflare Tunnel, or any public tunnel.

`run_command` is destructive and open-world. It is not part of the ChatGPT connector first-round test surface.

## 9. Smoke checks

Health text:

```bash
curl -i https://<your-tunnel-host>/
```

CORS preflight:

```bash
curl -i -X OPTIONS https://<your-tunnel-host>/mcp
curl -i -X OPTIONS https://<your-tunnel-host>/mcp/actions
```

Tool list:

```bash
curl -i -X POST \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}' \
  https://<your-tunnel-host>/mcp
```

Expected tools are only:

```text
system_info
drive_inventory
junk_candidates
windows_event_summary
```
