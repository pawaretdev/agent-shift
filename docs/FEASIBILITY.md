# Agent Shift Feasibility

Agent Shift uses documented Claude Code and VS Code mechanisms wherever possible. Undocumented behavior is isolated, annotated in source with `// UNDOCUMENTED: ...`, guarded by runtime checks where practical, and listed below.

Legend: **Documented** means covered by official Claude Code or VS Code documentation. **Undocumented** means observed or inferred behavior that is not a supported public contract.

## Dependency table

| Requirement | Mechanism | Classification | Mitigation |
| --- | --- | --- | --- |
| Separate profiles | An absolute `CLAUDE_CONFIG_DIR` selects the Claude configuration directory and its settings, project data, and authentication context. | Documented | Validate and contain every managed directory beneath the configured profile root. |
| Login per profile | Run `claude auth login` in an integrated terminal with the selected profile environment and optional documented flags. | Documented | Use argument arrays and show a warning for console/API-billing authentication. |
| Safe identity | Run `claude auth status --json`; retain only an explicit allow-list. | Mixed | `authMethod` and `configDirectory` are documented. Optional `email`, `orgName`, `orgId`, `subscriptionType`, and `loggedIn` fields are treated as undocumented and ignored safely when absent. Raw output is never logged. |
| Logout | Run `claude auth logout` with the selected environment. | Documented | Claude Code owns credential cleanup; Agent Shift never accesses OS credential stores. |
| Console authentication isolation | Console/API-billing credentials may be stored outside `CLAUDE_CONFIG_DIR`. | Documented limitation | Warn users that console profiles may not be isolated. |
| Claude panel environment | Mutate the extension-host `process.env.CLAUDE_CONFIG_DIR` synchronously before other activation work. | Undocumented | Detect an already-active `anthropic.claude-code` extension and report **pending reload**. Never rewrite the machine-scoped Claude environment setting automatically. |
| Terminal environment | `ExtensionContext.environmentVariableCollection` replaces or deletes `CLAUDE_CONFIG_DIR` for newly created terminals. | Documented | Update the collection on every switch. Existing terminals are not changed. |
| Machine-setting conflict | Inspect `claudeCode.environmentVariables` at user scope. | Documented | Warn when it contains `CLAUDE_CONFIG_DIR` and offer to remove only that entry. Agent Shift never otherwise writes the setting. |
| Status bar, commands, pickers, notifications, and state | Standard VS Code extension APIs. | Documented | Dispose all registrations through the extension context. |
| Switching an already-running panel | Claude Code reads inherited environment when its process starts, so the extension host must restart. | Mixed | Configurable `ask`, `always`, or `never` policy runs `workbench.action.restartExtensionHost`; switching back to the profile the window loaded with clears **pending reload** without a restart. That a host restart suffices is undocumented. |
| History location | `<config>/projects/<encoded-cwd>/<session>.jsonl`; workspace encoding replaces non-alphanumeric characters with `-`. | Mixed | The location and workspace scoping are documented. Agent Shift never parses JSONL content. Long encoded directory names require an undocumented fallback scan. |
| Resume copied transcript | Copy one transcript into the active profile's corresponding project directory and run `claude --resume <id> --fork-session`. | Mixed | CLI flags are documented. Discovery of a newly copied transcript by session id is undocumented; failures remain non-destructive and are surfaced to the user. |
| Limit detection | A Claude Code StopFailure hook reports `rate_limit`; documented limit-message wording is parsed for kind and reset time. | Mixed | Whether every subscription cap maps to `rate_limit` is undocumented. Ignore warnings and unknown messages. |
| Cursor | Cursor implements the VS Code extension API and can host the Claude Code extension. | Undocumented for product-specific behavior | Use only VS Code APIs; tailor wording from `vscode.env.appName`; document best-effort support. |
| Open VSX publishing | Tag-triggered CI runs `ovsx publish` with `OVSX_PAT`. | Documented | Cursor installs from Open VSX; no VS Marketplace publishing. |

## Claude Code panel injection decision

The documented `claudeCode.environmentVariables` setting is machine-scoped, so changing it would affect other windows. `claudeCode.claudeProcessWrapper` has an undocumented argument contract and changes Claude extension behavior. Neither is suitable for v1 profile switching.

Agent Shift therefore applies the selected `CLAUDE_CONFIG_DIR` to `process.env` as the first synchronous action in `activate()`. This is a best-effort, per-extension-host technique rather than a documented VS Code inter-extension contract. If the Claude Code extension is already active, Agent Shift does not claim the panel has switched: the status bar shows **pending reload** and offers a reload action.

For terminals, Agent Shift separately uses the documented environment variable collection. A user-level `claudeCode.environmentVariables` entry for `CLAUDE_CONFIG_DIR` can override the intended result, so Agent Shift warns and offers a narrowly scoped removal of that one key.

## Security and platform boundaries

- Agent Shift never opens `.credentials.json` or any path containing `credentials`, and never invokes Keychain, `security`, libsecret, or platform credential-store APIs.
- Claude CLI processes use executable-plus-argument arrays without a shell.
- Authentication JSON is projected to the identity allow-list before leaving the CLI adapter.
- All extension logs pass through secret redaction.
- Profile identifiers are restricted to lowercase letters, digits, and hyphens. Canonical managed paths must remain inside the profile root.
- The Default profile is outside the managed root and is never deleted.
- The StopFailure hook is installed automatically only for managed profiles. Installing it for Default requires one-time consent.
- Hook installation merges settings and removes only commands owned by Agent Shift.
- Untrusted workspaces are read-only.

## Undocumented dependencies

Every implementation reliance below must carry a one-line `// UNDOCUMENTED: ...` comment at the point of use.

1. The Claude Code extension inherits a `CLAUDE_CONFIG_DIR` value set on the shared extension-host `process.env` when Agent Shift activates first.
2. Optional `claude auth status --json` fields `loggedIn`, `email`, `orgName`, `orgId`, and `subscriptionType` are present in some Claude Code versions.
3. A transcript copied into the active profile's encoded project directory is discoverable through `claude --resume <id>`.
4. For encoded workspace paths longer than 200 characters, Claude Code truncates and hashes the project directory name; the exact algorithm is not public, so Agent Shift can only use a conservative fallback scan.
5. Subscription usage caps consistently reach StopFailure hooks as `error: "rate_limit"`.
6. Cursor-specific Claude Code hosting and activation behavior matches VS Code closely enough for the same integration strategy.
7. Restarting only the extension host (`workbench.action.restartExtensionHost`) is enough for the Claude Code panel to relaunch with the new `CLAUDE_CONFIG_DIR`; a full window reload is not required.

Agent Shift deliberately does not rely on any undocumented Claude credential-store service name and never attempts to reproduce Claude Code's credential storage behavior.
