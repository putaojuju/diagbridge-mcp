# Remote Streamable HTTP MCP Setup

This guide describes how to run and connect to the DiagBridge Remote Streamable HTTP MCP transport.

> **Runtime Requirements**:
> Requires Node.js 22.6 or newer.
> Tested on Node.js 24.

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

### Windows PowerShell

```powershell
$env:DIAGBRIDGE_REMOTE_DEV_NO_AUTH = "1"
npm run dev:remote-mcp
```

### Command Prompt

```bat
set DIAGBRIDGE_REMOTE_DEV_NO_AUTH=1
npm run dev:remote-mcp
```

### Linux / macOS Bash

```bash
DIAGBRIDGE_REMOTE_DEV_NO_AUTH=1 npm run dev:remote-mcp
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

## 4. Deprecated Environment Variable Compatibility

For backward compatibility, the following historical environment variables are supported as one-version deprecated aliases:

- `DIAGBRIDGE_HTTP_HOST` $\rightarrow$ use `DIAGBRIDGE_REMOTE_HOST` instead
- `DIAGBRIDGE_HTTP_PORT` $\rightarrow$ use `DIAGBRIDGE_REMOTE_PORT` instead
- `DIAGBRIDGE_HTTP_DEV_NO_AUTH` $\rightarrow$ use `DIAGBRIDGE_REMOTE_DEV_NO_AUTH` instead

Using these legacy variables will emit a deprecation warning at startup.

## 5. Remote MCP Tool Whitelist

The Remote Streamable HTTP transport is strictly limited to 4 read-only diagnostic tools:

- `system_info`
- `drive_inventory`
- `junk_candidates`
- `windows_event_summary`

`read_file`, `write_file`, and `run_command` are **never registered** on the remote transport, regardless of environment variables.
