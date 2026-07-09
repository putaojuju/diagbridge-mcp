# Autonomy Model

DiagBridge uses **Progressive Autonomy**: the system can act more autonomously only when the requested scope is safer, narrower, reversible, and already covered by policy.

This model is designed to reduce decision burden on ordinary users without turning approval into blind command execution.

## Core rule

The user authorizes a **scope**, not a command.

Examples:

- Acceptable scope: "During this session, read selected network diagnostic logs from this allowed folder."
- Unacceptable command approval: "Run this PowerShell script because the AI said it is safe."

AI agents may describe diagnostic intent, but they cannot decide their own risk level.

## Progressive Autonomy levels

| Risk | Autonomy mode | Meaning |
| --- | --- | --- |
| Green | Automatic | Basic read-only diagnostics can run automatically during an active session. |
| Blue | Session-level authorization | The user grants a bounded scope for privacy-touching reads such as selected logs or allowed-root text files. |
| Yellow | Action-card confirmation | The user sees one plain-language action card for a low-risk repair or limited change. |
| Orange | Dual confirmation | System-level changes require stronger confirmation, such as diagnosed user plus helper, and are blocked in phase 1. |
| Red | Forbidden by default | Credential access, raw shell, remote script execution, hidden control, and unsafe actions are blocked by policy. |

## What AI can and cannot do

AI can:

- State a diagnostic goal.
- Choose from known structured tools.
- Propose an action type and parameters.
- Explain why the action may help.

AI cannot:

- Self-report the final risk level.
- Lower risk by saying an action is harmless.
- Turn a Red action into an approval prompt.
- Ask a user to approve opaque code as a substitute for policy.
- Request a raw PowerShell or shell capability as a normal tool.

## Scope-based authorization

A scope should include:

- What type of data can be read or changed.
- Which root, log source, app, or subsystem is in scope.
- How long the authorization lasts.
- Whether the action is read-only or repair-oriented.
- Whether the scope is single-use or session-level.

A scope should not include:

- Arbitrary command text.
- Downloaded scripts.
- Hidden execution.
- Credential locations.
- Browser password or cookie stores.

## Blue session-level authorization

Blue actions may expose private information but should not modify the system. Examples include bounded log search or reading selected files from an allowed root.

Blue authorization should be session-scoped and revocable. It should not silently expand to the whole user profile, browser profiles, SSH directories, API key folders, or wallet folders.

## Yellow action cards

Yellow actions are low-risk, explainable repairs. The action card should show:

- What will happen.
- Why it may help.
- What could go wrong.
- Whether it is reversible.
- What backup or restore point the Action Runtime will create where applicable.

The user approves the action card, not the underlying implementation command.

## Orange dual confirmation

Orange actions affect system-level configuration. They need dual confirmation in a future phase and remain blocked in phase 1.

Examples include changing network adapter settings or system services.

## Red default prohibition

Red actions are not eligible for normal approval. They include:

- Raw shell or PowerShell execution.
- Encoded or downloaded scripts.
- Credential, cookie, SSH key, API key, wallet, or browser password access.
- UAC bypass or security tool disablement.
- Hidden persistence or stealth operation.
- Opaque actions that cannot be explained in plain language.

## Phase 1 implementation rule

Phase 1 remains mock-only. The policy core may classify and validate actions, but no real Windows repair, registry edit, command execution, credential read, hidden mode, or administrator action is implemented.
