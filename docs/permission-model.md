# Permission Model

DiagBridge uses a consent-first permission model. The diagnosed user is the principal. AI agents and helpers are temporary guests.

## Principles

1. The diagnosed user owns the session.
2. Consent can be revoked at any time.
3. Default capability is read-only.
4. Default execution is non-admin.
5. Tools are structured and risk-classified.
6. The policy engine is the primary security boundary.
7. Approval UI provides informed consent but does not make unsafe actions safe.

## Session roles

| Role | Description | Can grant broad power? |
| --- | --- | --- |
| Diagnosed user | Person sitting at or responsible for the affected Windows PC | Yes, within policy limits |
| Helper | Human assisting the diagnosed user | No |
| AI agent | ChatGPT, Codex, Claude Code, Cursor, or similar | No |
| Gateway | Service enforcing policy and session state | No, must enforce policy |
| Windows Agent | Local visible agent on the PC | No, must enforce local limits |

## Risk levels

| Level | Meaning | Examples | Phase 1 behavior |
| --- | --- | --- | --- |
| Green | Read-only basic diagnostics | OS summary, uptime, basic network checks | Allowed as mock/read-only |
| Blue | Reads logs/config that may contain private info | Log search, bounded text file read | Mock or redacted, bounded |
| Yellow | Low-risk, explainable, limited repair | Flush DNS cache, restart a known app | Schema only, no real execution |
| Orange | System-level modification requiring dual confirmation | Change network adapter settings, edit service config | Blocked in phase 1 |
| Red | Dangerous, credential-related, unclear, or remote script execution | Raw PowerShell, credential files, encoded scripts | Forbidden by default |

## Permission checks

Every tool request should be evaluated with at least:

- Session consent state.
- Entry point identity: remote MCP or local relay.
- Tool name and schema.
- Requested path or target.
- Risk level.
- Whether the request touches credentials or private locations.
- Whether the action needs approval.
- Whether the request is explainable in plain language.
- Whether the request is reversible.

## Allowed roots

File access must be scoped to explicit allowed roots. Examples for future phases:

- A temporary DiagBridge collection folder.
- User-selected log directories.
- Exported diagnostic bundles.

The project should not default to reading the entire user profile, browser profile, SSH directory, cloud credential folders, wallet folders, or application secrets.

## Approval types

| Approval type | Intended use |
| --- | --- |
| None | Green read-only tools |
| Informational consent | Blue data collection with clear privacy impact |
| Single confirmation | Yellow low-risk repair |
| Dual confirmation | Orange system-level change with helper + diagnosed user confirmation |
| Forbidden | Red requests |

## Revocation

Revocation must be easy and immediate:

- Stop the session.
- Reject new tool calls.
- Cancel pending approvals.
- Close transport to the agent.
- Preserve audit records.

## Expert mode placeholder

A future expert mode may be considered only for specialized diagnostics. It must be disabled by default, visible, policy-gated, audited, and never presented as a normal approval button for ordinary users.
