# Approval Flow

Approval in DiagBridge is designed for ordinary users. It should answer: what will happen, why it is needed, what could go wrong, and how to stop it.

## Important rule

Approval is not the main safety boundary. The policy engine must reject dangerous requests before they become approval prompts.

## Plain-language flow

1. The AI asks for a structured tool.
2. The gateway checks the policy.
3. If the request is safe and read-only, it may run without interruption.
4. If the request may reveal private information, the user sees a plain-language notice.
5. If the request changes something, the user sees a repair explanation.
6. If the request is system-level, dual confirmation is required in a future phase.
7. If the request is dangerous or credential-related, it is blocked.

## What the user should see

For any approval request, the UI should show:

- A short title.
- Plain-language purpose.
- What data may be read.
- What settings may be changed.
- Whether the action is reversible.
- Risk level.
- The requesting AI/tool name.
- Buttons for approve, deny, and disconnect.

## What the user should not be asked to do

The user should not be asked to decide whether arbitrary PowerShell, registry edits, encoded commands, or downloaded scripts are safe.

If a request cannot be explained without showing code, that is a policy problem, not a user education problem.

## Example approval text

### Blue read notice

DiagBridge wants to search selected Windows logs for network error messages. This may include computer names, Wi-Fi names, usernames, or local paths. Secrets will be redacted where possible.

### Yellow repair request

DiagBridge wants to try a low-risk network repair: clear the local DNS cache. This does not delete personal files and can usually be reversed by reconnecting to the network. This feature is not implemented in phase 1.

### Red denial

This request was blocked because it attempted to read browser cookies or credentials. DiagBridge does not allow credential collection.

## Revocation

The diagnosed user must always have a visible stop button. Revocation should:

- Stop new tool calls.
- Cancel pending approvals.
- Disconnect active AI agents.
- Keep the audit trail.
