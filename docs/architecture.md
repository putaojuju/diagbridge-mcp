# Architecture

DiagBridge is an MCP-first bridge between AI agents and a consenting Windows user who needs help diagnosing a computer problem.

## Entry points

DiagBridge keeps two MCP entry points from the beginning:

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

### Remote MCP Server

The Remote MCP Server is intended for ChatGPT Connector style usage. It should expose only structured MCP tools, never a raw shell. It authenticates the AI session, forwards structured tool requests to the gateway, and receives policy decisions and tool results.

### Local MCP Relay

The Local MCP Relay is intended for local AI tools such as Codex, Claude Code, Cursor, or future desktop agents. It should provide a local MCP-compatible surface while still routing all tool calls through the same gateway policy path.

The local relay exists so local developer tools do not need direct access to the diagnosed computer or a raw remote channel.

### DiagBridge Gateway

The gateway is the trust boundary between external AI agents and the diagnosed Windows Agent. It is responsible for:

- Session state.
- Consent state.
- Tool registry lookup.
- Policy evaluation.
- Approval state.
- Audit event creation.
- Redaction and result shaping.
- Transport to the Windows Agent.

The gateway should reject unsafe requests before they reach the Windows Agent.

### Friend Windows Agent

The Windows Agent runs visibly on the diagnosed computer. It should:

- Show that a diagnostic session is active.
- Show who is connected.
- Show what was requested.
- Allow the user to pause, revoke, or disconnect.
- Run without administrator privileges by default.
- Prefer read-only OS APIs and explicit diagnostic collectors.

Phase 1 uses a TypeScript mock agent. A future native Windows implementation may use .NET if needed.

## Data flow

1. A diagnosed user starts or joins a visible diagnostic session.
2. The AI agent connects through the Remote MCP Server or Local MCP Relay.
3. The agent lists available structured tools.
4. The agent calls a tool with JSON arguments.
5. The gateway evaluates the request with the policy package.
6. Green requests may return mock/read-only data.
7. Blue requests require bounded access and redaction.
8. Yellow and higher requests require explicit policy handling and approval state.
9. Orange and Red requests are blocked in phase 1.
10. Results are redacted, logged, and returned to the AI agent.

## Trust boundaries

| Boundary | Risk | Required control |
| --- | --- | --- |
| AI agent -> MCP entry point | Prompt injection or malicious tool call | Structured tools, authentication, policy gate |
| MCP entry point -> gateway | Session confusion | Session IDs, entry-point identity, audit events |
| Gateway -> Windows Agent | Unsafe operation forwarding | Policy before forwarding, no raw command channel |
| Windows Agent -> filesystem/logs | Privacy exposure | Allowed roots, redaction, size limits |
| Approval UI -> execution | User misunderstanding | Plain-language explanations, policy remains primary |

## Phase 1 architecture status

Phase 1 creates the shape of the system without dangerous execution:

- `apps/gateway`: mock HTTP/MCP gateway skeleton.
- `apps/mcp-local`: local relay skeleton that talks to the mock gateway.
- `apps/agent-windows`: visible Windows Agent placeholder with mock capabilities.
- `packages/core`: shared types.
- `packages/protocol`: MCP tool schema draft.
- `packages/policy`: risk and policy decision skeleton.
- `packages/diagnostics`: mock diagnostic data.
- `packages/redaction`: redaction helpers.
- `packages/playbooks`: safe diagnostic playbook metadata.
