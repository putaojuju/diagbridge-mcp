# DiagBridge MCP

DiagBridge is an **AI-native remote diagnostics bridge** for helping trusted people diagnose Windows computer problems with AI agents such as ChatGPT, Codex, Claude Code, Cursor, and other MCP-capable tools.

The project is **MCP-first**, **consent-first**, and **safety-default**. It is designed for visible, authorized, auditable, revocable computer diagnostics. It is not a hidden remote-control tool, not a remote shell, and not a way to bypass Windows security boundaries.

## Project goals

- Provide a safe bridge between AI agents and a consenting Windows user who needs help.
- Support two MCP entry points:
  - **Remote MCP Server** for ChatGPT Connector style usage.
  - **Local MCP Relay** for local tools such as Codex, Claude Code, Cursor, and other local AI agents.
- Keep the diagnosed user as the permanent permission owner.
- Make every sensitive action visible, explainable, auditable, and revocable.
- Prefer read-only diagnostics and structured tools over free-form command execution.
- Build a policy engine that blocks dangerous requests even when an AI or helper asks for them.

## Non-goals

DiagBridge is explicitly **not** trying to be:

- A stealth remote administration tool.
- A malware-like remote access trojan.
- A hidden background controller.
- A default administrator agent.
- A raw PowerShell, CMD, WMI, or registry backdoor.
- A credential, cookie, key, wallet, or browser-password collector.
- A tool that asks non-technical users to understand arbitrary scripts before approving them.

## Safety principles

1. The diagnosed person is always the permission owner.
2. The AI agent is only a temporary guest.
3. Default mode is read-only.
4. Default mode is non-admin.
5. No hidden run mode is provided.
6. No default raw shell is provided.
7. Browser passwords, cookies, SSH keys, API keys, wallet files, and similar credentials must not be read.
8. High-risk actions must be blocked or routed through the policy engine and approval flow.
9. User approval is not the primary safety boundary; the policy engine is.
10. Approval buttons are for informed consent, not for making ordinary users understand PowerShell.

## First-phase status

This repository currently contains the first-phase foundation:

- Monorepo structure.
- Security and architecture documentation.
- MCP tool schema draft.
- Permission and risk model.
- Gateway, Local MCP Relay, and Windows Agent skeletons.
- Mock-only read diagnostics.

The first phase intentionally does **not** execute real repair commands, arbitrary shell commands, registry edits, credential reads, or administrator actions.

## High-level architecture

```text
ChatGPT Connector
  -> Remote HTTPS MCP Gateway
  -> DiagBridge Gateway
  -> Friend Windows Agent

Codex / Claude Code / Cursor / local AI tools
  -> Local MCP Relay
  -> DiagBridge Gateway
  -> Friend Windows Agent
```

## First-phase MCP tools

The initial tool surface is schema-first and mock-first:

- `get_system_overview`
- `run_network_diagnosis`
- `list_allowed_roots`
- `read_text_file`
- `search_logs`
- `explain_pending_action`
- `request_action_approval`
- `execute_approved_action`
- `collect_diagnostic_report`

There is deliberately no `run_powershell(command)` tool. If a future free-command capability is explored, it must be treated as disabled-by-default **expert mode**, routed through the policy engine, and never exposed as a normal user approval prompt.

## Risk levels

| Level | Meaning | First-phase default |
| --- | --- | --- |
| Green | Read-only basic diagnostics | Allowed as mock/read-only |
| Blue | Reads logs or config that may contain private information | Limited, redacted, mock-first |
| Yellow | Low-risk, explainable, limited repair | Schema only, no real execution |
| Orange | System-level modification requiring dual confirmation | Blocked in phase 1 |
| Red | Credential-related, dangerous, unclear, or remote-script execution | Forbidden by default |

## Repository layout

```text
diagbridge-mcp/
  README.md
  LICENSE
  SECURITY.md
  docs/
    architecture.md
    threat-model.md
    permission-model.md
    tool-policy.md
    approval-flow.md
  apps/
    gateway/
    agent-windows/
    mcp-local/
  packages/
    core/
    protocol/
    policy/
    diagnostics/
    redaction/
    playbooks/
```

## Development

The initial implementation uses TypeScript and Node.js so the MCP server, gateway, relay, and shared type packages can evolve together.

```bash
npm install
npm run check
npm run dev:gateway
npm run dev:mcp-local
npm run dev:agent-windows
```

All current app entry points are mock skeletons. They are useful for shaping the protocol and safety model before any real Windows integration is added.

## Security posture

Security design is part of the product, not an afterthought. See:

- [`SECURITY.md`](./SECURITY.md)
- [`docs/threat-model.md`](./docs/threat-model.md)
- [`docs/permission-model.md`](./docs/permission-model.md)
- [`docs/tool-policy.md`](./docs/tool-policy.md)
- [`docs/approval-flow.md`](./docs/approval-flow.md)

## License

This project is currently licensed under the MIT License. This can be revisited before the first public release if the project needs stronger copyleft or contributor governance.