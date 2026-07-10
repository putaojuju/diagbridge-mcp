# DiagBridge MCP

DiagBridge MCP is a visible Windows MCP bridge for trusted, user-authorized computer sessions.

It connects a user's local computer session to trusted MCP-capable AI agents such as ChatGPT, Codex, Claude Code, Cursor, or similar tools. It is intentionally small: it is a bridge, not a sandbox, not an RMM platform, and not a general security judge for every command.

## What DiagBridge does

DiagBridge keeps only the bridge responsibilities:

- Run visibly.
- Listen on `127.0.0.1` by default.
- Use a temporary session token.
- Provide a disconnect endpoint.
- Record audit events.
- Publish honest MCP-style tool metadata.
- Avoid hidden run modes, UAC bypass, and default administrator assumptions.

## What DiagBridge does not do

DiagBridge is not:

- A security platform.
- A sandbox.
- A malware analysis environment.
- A hidden remote-control tool.
- A replacement for MCP host approval.
- A system that can reliably decide whether every possible command is safe.

The MCP host is expected to handle approval prompts, automation level, allow/deny lists, and user-facing tool policy.

## Transports

DiagBridge currently provides three development entry points:

| Entry point | Script | Purpose |
| --- | --- | --- |
| Local HTTP bridge | `npm run dev` | Simple local `/tools` and `/call` bridge for development. |
| Stdio MCP server | `npm run dev:mcp` | Local MCP host integration over stdio. |
| Dev HTTP MCP fallback | `npm run dev:http-mcp` | ChatGPT custom connector testing through `/mcp`. |

The dev HTTP MCP fallback is for local connector testing. It returns text on `GET /`, handles `OPTIONS /mcp` and `OPTIONS /mcp/*`, and sends MCP JSON-RPC traffic through `POST /mcp`.

## Tools

The local development bridge can expose:

| Tool | Metadata | Default local enabled |
| --- | --- | --- |
| `system_info` | read-only | Yes |
| `list_dir` | read-only | Yes |
| `read_file` | read-only | Yes |
| `drive_inventory` | read-only | Yes |
| `junk_candidates` | read-only | Yes |
| `windows_event_summary` | read-only | Yes |
| `write_file` | destructive | No |
| `run_command` | destructive + open-world | No |

The ChatGPT connector HTTP fallback intentionally exposes only:

```text
system_info
drive_inventory
junk_candidates
windows_event_summary
```

It does not expose `read_file`, `write_file`, or `run_command` by default.

`run_command` is a high-power capability. If enabled in a local-only development session, an agent may run local commands through the bridge. The consequences depend on the user's operating system account, the MCP host approval policy, and the command itself.

Recommended default: use only read-only tools first. Enable `write_file` or `run_command` only for trusted local sessions where the host approval settings are understood.

## Windows read-only diagnostics

### `drive_inventory`

Scans directory metadata only: path, name, type, size, modified time, and extension. It does not read file contents. It has bounded `maxDepth`, `maxEntries`, and `maxSeconds` controls and excludes common high-privacy or high-risk directories by default.

### `junk_candidates`

Identifies possible junk candidates from metadata only. It does not delete, move, clean, or repair anything. Every candidate returns `recommendedAction: "review_only"`.

### `windows_event_summary`

Reads recent Windows Application/System error event summaries through a fixed read-only query. It focuses on application crashes, unexpected shutdowns, WHEA/hardware events, display/GPU resets, and disk/storage providers. It does not accept arbitrary command input and does not auto-elevate.

Summary fields are event-record counts:

```text
applicationCrashEvents
unexpectedShutdownEvents
hardwareErrorEvents
diskErrorEvents
countMeaning = "event_records_not_unique_incidents"
```

These values are not deduplicated fault or crash counts. For example, an `Application Error` 1000 record and a related `Windows Error Reporting` 1001 record can both be counted for one underlying application crash.

## Configuration

Environment variables:

| Variable | Default | Meaning |
| --- | --- | --- |
| `DIAGBRIDGE_HOST` | `127.0.0.1` | Bind address for the local HTTP bridge. Keep local unless you know what you are doing. |
| `DIAGBRIDGE_HTTP_HOST` | `127.0.0.1` | Bind address for the dev HTTP MCP fallback. |
| `DIAGBRIDGE_PORT` | `8787` | Local bridge port. |
| `DIAGBRIDGE_HTTP_PORT` | `8787` | Dev HTTP MCP fallback port. |
| `DIAGBRIDGE_SESSION_TOKEN` | generated at startup | Session token. Protected requests without it are rejected. |
| `DIAGBRIDGE_TOOLS` | read-only local tools | Comma-separated enabled local tools. |
| `DIAGBRIDGE_CWD` | current directory | Base directory for relative file paths. |
| `DIAGBRIDGE_AUDIT_LOG` | `.diagbridge-audit.jsonl` | JSONL audit log path. |

## Development

```bash
npm install
npm run check
npm test
npm run dev
npm run dev:mcp
npm run dev:http-mcp
```

## ChatGPT connector development

See [`docs/DEV_HTTP_CONNECTOR_SETUP.md`](./docs/DEV_HTTP_CONNECTOR_SETUP.md).

For first-round connector testing, use the dev HTTP MCP endpoint and only test:

```text
system_info
drive_inventory
junk_candidates
windows_event_summary
```

Do not enable `write_file` or `run_command` over a public tunnel.

## Security expectations

Use DiagBridge only with trusted parties and a trusted MCP host. The host should provide tool approval and policy controls. DiagBridge still refuses to add hidden operation, UAC bypass, silent persistence, credential-harvesting-specific tools, or approval-bypass behavior.

See [`SECURITY.md`](./SECURITY.md) and [`docs/threat-model.md`](./docs/threat-model.md).
