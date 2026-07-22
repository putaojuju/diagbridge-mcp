# DiagBridge MCP

DiagBridge MCP is a general Windows MCP bridge for trusted local and remote AI agents.

It exposes one shared tool registry through:
- `stdio` for local MCP clients (Codex, Claude Code, Cursor, etc.)
- `Streamable HTTP` for remote MCP clients (ChatGPT, Codex Plugin, remote agents, etc.)

> **Runtime Requirements**:
> Requires Node.js 22.6 or newer.
> Tested on Node.js 24.

中文：
> DiagBridge MCP 是面向可信本地和远程 AI Agent 的通用 Windows MCP 桥。
> 它通过 stdio 和 Streamable HTTP 暴露同一套工具。

## Transports

| Entry point | Command / Script | Purpose |
| --- | --- | --- |
| Stdio MCP server (MCP Host) | `node --experimental-strip-types <path>/src/mcp/transports/stdio.ts` | Production integration for MCP hosts over stdio. |
| Stdio MCP server (Manual Dev) | `npm run dev:mcp` | Manual CLI developer testing. |
| Streamable HTTP MCP transport | `npm run dev:remote-mcp` | Remote MCP client integration over Streamable HTTP (`src/mcp/transports/streamable-http.ts`). |

## Tools Overview

All tools are defined in a single, shared tool registry (`src/mcp/tool-registry.ts`).

### Local Stdio Defaults (6 read-only tools)
- `system_info`
- `list_dir`
- `read_file`
- `drive_inventory`
- `junk_candidates`
- `windows_event_summary`

`write_file` and `run_command` are destructive and disabled by default. They can be enabled for stdio using `DIAGBRIDGE_MCP_TOOLS`.

### Remote Streamable HTTP Defaults (4 read-only tools)
- `system_info`
- `drive_inventory`
- `junk_candidates`
- `windows_event_summary`

`read_file`, `write_file`, and `run_command` are **never registered** on the remote transport for security and privacy protection.

For full tool details, see [`docs/TOOLS.md`](./docs/TOOLS.md).

## Configuration

Environment variables:

| Variable | Default | Meaning |
| --- | --- | --- |
| `DIAGBRIDGE_HOST` | `127.0.0.1` | Default host address. |
| `DIAGBRIDGE_REMOTE_HOST` | `127.0.0.1` | Bind address for Streamable HTTP server (`DIAGBRIDGE_HTTP_HOST` supported for 1-version deprecated compatibility). |
| `DIAGBRIDGE_PORT` | `8787` | Default port number. |
| `DIAGBRIDGE_REMOTE_PORT` | `8787` | Streamable HTTP server port (`DIAGBRIDGE_HTTP_PORT` supported for 1-version deprecated compatibility). |
| `DIAGBRIDGE_SESSION_TOKEN` | generated at startup | Session token for authenticating HTTP requests. |
| `DIAGBRIDGE_MCP_TOOLS` | read-only local tools | Comma-separated enabled tools for local stdio transport (`DIAGBRIDGE_TOOLS` supported for 1-version deprecated compatibility). |
| `DIAGBRIDGE_REMOTE_DEV_NO_AUTH` | `0` | Enable `1` for temporary localhost Inspector testing without token authentication (`DIAGBRIDGE_HTTP_DEV_NO_AUTH` supported for 1-version deprecated compatibility). |
| `DIAGBRIDGE_CWD` | current directory | Base working directory. |
| `DIAGBRIDGE_AUDIT_LOG` | `.diagbridge-audit.jsonl` | JSONL audit log file path. |

## Quick Start

```bash
npm install
npm run check
npm test

# Launch remote Streamable HTTP server
npm run dev:remote-mcp
```

## Documentation

- [Local MCP Setup (stdio)](./docs/LOCAL_MCP_SETUP.md)
- [Remote MCP Setup (Streamable HTTP)](./docs/REMOTE_MCP_SETUP.md)
- [Tools Reference](./docs/TOOLS.md)
- [Usage Guide](./docs/usage.md)
- [Threat Model](./docs/threat-model.md)
