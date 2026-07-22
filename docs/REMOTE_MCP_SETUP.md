# Remote Streamable HTTP MCP Setup

This guide describes how to run and connect to the DiagBridge Remote Streamable HTTP MCP transport.

The Streamable HTTP transport allows remote MCP clients (such as ChatGPT, Codex Plugin, or other HTTP MCP hosts) to connect to DiagBridge securely.

## 1. Quick Start

```bash
npm install
npm run check
npm test
```

### Start the Remote MCP Server

```bash
npm run dev:remote-mcp
```

By default, it listens on:

```text
http://127.0.0.1:8787/mcp
```

The server prints a generated session token on startup. Protected `/mcp` requests require this token in either header:

```text
Authorization: Bearer <token>
```

or:

```text
X-DiagBridge-Session-Token: <token>
```

## 2. Dev No-Auth Mode (Inspector Testing)

For short-lived localhost Inspector testing, launch the server in dev no-auth mode:

### PowerShell

```powershell
$env:DIAGBRIDGE_REMOTE_DEV_NO_AUTH="1"
npm run dev:remote-mcp
```

### Command Prompt

```bat
set DIAGBRIDGE_REMOTE_DEV_NO_AUTH=1
npm run dev:remote-mcp
```

Then test with MCP Inspector:

```bash
npx @modelcontextprotocol/inspector@latest --server-url http://127.0.0.1:8787/mcp --transport http
```

> [!CAUTION]
> Use `DIAGBRIDGE_REMOTE_DEV_NO_AUTH=1` strictly on `127.0.0.1` for quick debugging. Do not leave it enabled or expose it over public tunnels.

## 3. Exposing for Remote MCP Clients (Tunnels)

To test with remote MCP clients (such as ChatGPT custom connectors or Codex Plugin), expose the authenticated local port using a tunnel tool:

### Option A: ngrok

```bash
ngrok http 8787
```

Use the HTTPS URL and append `/mcp`:

```text
https://<your-subdomain>.ngrok-free.app/mcp
```

### Option B: Cloudflare Tunnel

```bash
cloudflared tunnel --url http://127.0.0.1:8787
```

## 4. Remote MCP Tool Whitelist

The Remote Streamable HTTP transport is strictly limited to 4 read-only diagnostic tools:

- `system_info`
- `drive_inventory`
- `junk_candidates`
- `windows_event_summary`

`read_file`, `write_file`, and `run_command` are **never registered** on the remote transport, regardless of environment variables.
