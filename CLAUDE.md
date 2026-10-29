# Agent Shift

Cursor/VS Code extension that switches Claude Code accounts by giving each profile its own `CLAUDE_CONFIG_DIR`. Published to Open VSX as `pawaretdev.agent-shift`. No runtime dependencies, no network, no telemetry.

## Commands

```sh
npm run build        # esbuild -> dist/
npm test             # vitest unit tests (test/unit)
npm run typecheck    # tsc --noEmit, covers src and test
npm run test:integration   # VS Code test host; needs a display (CI uses xvfb)
npm run package      # build + .vsix
code --install-extension agent-shift-0.1.0.vsix --force   # `code` on this machine is Cursor
```

## Layout

- `src/core/`: pure Node logic (profiles store, path rules, history, sharing, limit parsing). No `vscode` import; unit-test here first.
- `src/claude/`: talks to Claude Code: env injection, `claude auth` CLI calls, the StopFailure hook and its installer.
- `src/ui/`: `CommandController` (all commands and switching state), picker, status bar, limit notifications.
- `src/extension.ts`: activation; sets the environment synchronously before anything else.
- `docs/FEASIBILITY.md`: which behaviors are documented and which are not. `docs/SPEC.md`: the original spec.

## How switching works

- Activation (on `*`) sets `process.env.CLAUDE_CONFIG_DIR` on the shared extension host before the Claude Code extension starts. Do not move activation to command-only: it would run too late.
- Claude Code reads the env only at launch. A switch updates `process.env` and the terminal env collection, then asks to restart the extension host (`workbench.action.restartExtensionHost`), not reload the window.
- `CommandController.loadedId` is the profile the window started with; `pendingReload` is true only while the active profile differs from it.
- New terminals pick up a switch immediately; existing ones keep their env.

## Rules

- Mark every reliance on behavior Claude Code or VS Code does not document with a one-line `// UNDOCUMENTED: ...` comment, and add it to the numbered list in `docs/FEASIBILITY.md` and the count in the README.
- Never read credential files or the OS keychain. Identity comes only from `claude auth status --json`, filtered to an allow-list (`src/core/redact.ts`).
- Never write `claudeCode.environmentVariables`: it is machine-scoped and would change every window. Only removing a `CLAUDE_CONFIG_DIR` entry the user agrees to is allowed.
- The Default profile is `~/.claude` and is never deleted or modified except by data sharing.
- Untrusted workspaces are read-only: guard writes with `assertTrusted()`.
- Data sharing moves real user data; keep the merge-then-backup behavior in `src/core/sharing.ts` and never delete what clashes.
- Unit tests that need `vscode` mock it with `vi.mock('vscode', ...)` (see `test/unit/commands.test.ts`).
- Add a CHANGELOG entry under **Unreleased** for user-visible changes.
- Switching still needs a manual check in a real window: switch, restart, then confirm the account with `/status` in the Claude Code panel.
