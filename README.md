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

## Tools

The first bridge surface is intentionally small:

| Tool | Metadata | Default enabled |
| --- | --- | --- |
| `system_info` | read-only | Yes |
| `list_dir` | read-only | Yes |
| `read_file` | read-only | Yes |
| `write_file` | destructive | No |
| `run_command` | destructive + open-world | No |

`run_command` is a high-power capability. If enabled, an agent may run local commands through the bridge. The consequences depend on the user's operating system account, the MCP host approval policy, and the command itself.

Recommended default: enable only read-only tools first, then enable `write_file` or `run_command` only for trusted sessions where the host approval settings are understood.

## Configuration

Environment variables:

| Variable | Default | Meaning |
| --- | --- | --- |
| `DIAGBRIDGE_HOST` | `127.0.0.1` | Bind address. Keep local unless you know what you are doing. |
| `DIAGBRIDGE_PORT` | `8787` | Local HTTP bridge port. |
| `DIAGBRIDGE_SESSION_TOKEN` | generated at startup | Session token. Requests without it are rejected. |
| `DIAGBRIDGE_TOOLS` | `system_info,list_dir,read_file` | Comma-separated enabled tools. |
| `DIAGBRIDGE_CWD` | current directory | Base directory for relative file paths. |
| `DIAGBRIDGE_AUDIT_LOG` | `.diagbridge-audit.jsonl` | JSONL audit log path. |

Example read-only session:

```bash
npm run dev
```

Example enabling all tools:

```bash
DIAGBRIDGE_TOOLS=system_info,list_dir,read_file,write_file,run_command npm run dev
```

## Local HTTP endpoints

The current implementation is a minimal local HTTP bridge, not a polished production MCP server yet.

- `GET /health` - public local status.
- `GET /tools` - requires session token.
- `POST /call` - requires session token.
- `POST /disconnect` - requires session token and disconnects the session.

Authorized requests can use either:

```text
Authorization: Bearer <session-token>
```

or:

```text
X-DiagBridge-Session-Token: <session-token>
```

## Development

```bash
npm install
npm run check
npm test
npm run dev
```

The project currently uses Node.js TypeScript with a small `src/` tree. Older monorepo-style `apps/` and `packages/` code has been removed from the main line to keep the bridge small and understandable.

## Security expectations

Use DiagBridge only with trusted parties and a trusted MCP host. The host should provide tool approval and policy controls. DiagBridge still refuses to add hidden operation, UAC bypass, silent persistence, credential-harvesting-specific tools, or approval-bypass behavior.

See [`SECURITY.md`](./SECURITY.md) and [`docs/threat-model.md`](./docs/threat-model.md).
