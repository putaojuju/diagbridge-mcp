# Responsibility Model

DiagBridge separates responsibility so ordinary users are not asked to review commands, scripts, or implementation details they cannot reasonably understand.

## Responsibility split

| Component | Responsibility | Not responsible for |
| --- | --- | --- |
| AI Agent | Propose diagnostic intent and choose structured tool/action requests. | Final risk classification, policy bypass, raw command design. |
| Policy Engine | Decide risk, approval mode, allowed scope, and whether a request is blocked. | Executing actions or asking users to approve unsafe code. |
| Action Registry | Define known action types, base risk, reversibility, scope, and impact. | Accepting arbitrary action types from AI as safe. |
| Action Runtime | Prepare backups, execute approved structured actions, roll back where possible, and record audit events. | Deciding policy or expanding scope. |
| Diagnosed user | Authorize understandable scopes, approve action cards, deny requests, and disconnect anytime. | Reviewing PowerShell, registry diffs, downloaded scripts, or hidden behavior. |
| Helper | Help explain the problem and assist with dual confirmation where appropriate. | Taking ownership away from the diagnosed user. |

## AI responsibility

AI is responsible for describing intent, for example:

- "Check whether DNS resolution is failing."
- "Search the selected diagnostic logs for network adapter errors."
- "Propose flushing the DNS cache as a low-risk repair."

AI is not responsible for deciding the final risk level. It may propose `actionType` and `params`, but Policy Engine and Action Registry compute risk and approval mode.

## Policy Engine responsibility

The Policy Engine decides:

- Whether the tool or action type is known.
- Whether consent is active.
- Whether the requested path is inside allowed roots.
- Whether the action touches credentials or sensitive paths.
- Whether the action is Green, Blue, Yellow, Orange, or Red.
- Whether approval is none, informational, single, dual, or forbidden.
- Whether the request is blocked before it reaches runtime.

The Policy Engine is the main safety boundary. User approval is not a replacement for policy.

## Action Runtime responsibility

The Action Runtime is the only component that should execute approved structured actions in future phases.

For any real action, it should handle:

- Preflight checks.
- Backup or restore preparation where possible.
- Execution of known implementation steps.
- Rollback where supported.
- Audit logging.
- User-visible progress and cancellation.

In phase 1, Action Runtime behavior is mock-only. It validates approval metadata but does not perform real Windows operations.

## User responsibility

The diagnosed user is responsible for:

- Starting or joining the session knowingly.
- Granting understandable diagnostic scopes.
- Approving or denying plain-language action cards.
- Disconnecting at any time.

The user is not responsible for command review.

## User approval is not command review

A user approval button must not mean:

- "I have reviewed this PowerShell and guarantee it is safe."
- "I allow the AI to run any command it wants."
- "I accept credential reads because the AI said they are diagnostic."

A user approval button means:

- "I understand this bounded diagnostic scope or action card."
- "The policy engine already judged it eligible for approval."
- "I can stop the session if I am uncomfortable."

## Failure handling

If a request cannot be explained in plain language, it should be blocked or redesigned as a safer structured action.

If a request needs raw code, hidden execution, credential access, or broad system modification, it is outside normal user approval and should be Red or Orange depending on the action type.

## Phase 1 implementation rule

The current repository implements the responsibility split as types, registry, policy decisions, and tests. It does not implement real execution, rollback, registry edits, shell commands, credential collection, hidden run mode, or administrator operations.
