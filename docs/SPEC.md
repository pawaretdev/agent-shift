# AgentShift Functional Specification

AgentShift is a Cursor and VS Code extension for managing separate Claude Code accounts and organizations as isolated `CLAUDE_CONFIG_DIR` profiles. The extension makes no network calls and collects no telemetry.

## Functional requirements

| ID | Requirement |
| --- | --- |
| F1 | A status bar item shows the active profile. Its tooltip may include the profile label, email, organization, and plan. Selecting it opens a profile picker containing all profiles plus **Add profile…** and **Manage profiles…**. |
| F2 | Adding a profile asks for a name, creates `<profile-root>/<id>/`, and opens an integrated terminal with that directory as `CLAUDE_CONFIG_DIR` running `claude auth login`. Supported login flags are `--email`, `--sso`, and `--console`. Identity is refreshed after the terminal closes. |
| F3 | Identity is obtained by running `claude auth status --json` with the profile environment. Only `loggedIn`, `authMethod`, `email`, `orgName`, `orgId`, `subscriptionType`, and `configDirectory` may leave the Claude CLI adapter. |
| F4 | A profile represents one account and organization. Organization selection remains part of Claude's browser login, and `orgName` is shown when available. |
| F5 | Switching changes the active profile for the current window, updates the environment inherited by newly created terminals, and follows the configured reload policy: `ask`, `always`, or `never`. Reloading is required for an already-running Claude Code extension to adopt the environment. |
| F6 | Users can set a workspace default profile. It is stored in workspace state and applied when the window opens. When no workspace default exists, optional ordered rules of `{ glob, profile }` select a profile from the workspace path. |
| F7 | The Default profile is `~/.claude` and is represented by the absence of `CLAUDE_CONFIG_DIR`. It is never deleted or modified without explicit consent. |
| F8 | **Browse conversations from all profiles** lists sessions for the current workspace folder by reading only transcript file names and modification times from `<config>/projects/<encoded-cwd>/*.jsonl`. Selecting a session copies that transcript to the active profile without changing the source, then opens `claude --resume <id> --fork-session` in a terminal. A first-use warning explains that transcripts may contain secrets and source code. |
| F9 | When an installed StopFailure hook reports a session or weekly usage limit for the active profile, a notification identifies the profile and reset time and offers to switch to another logged-in profile. |
| F10 | Removing a managed profile first runs `claude auth logout` with that profile environment, then deletes its directory after confirmation. The Default profile cannot be removed. |
| F11 | A command and keybinding switch back to the previous profile. |
| F12 | The extension performs no telemetry and no direct network requests. |

## Scope and behavior

- Profiles created by AgentShift are stored below `~/.agent-shift/profiles` by default. Metadata is stored in `~/.agent-shift/profiles.json`.
- Profiles are fully isolated. AgentShift does not link or share `CLAUDE.md`, agents, skills, plugins, settings, transcripts, or credentials between profiles.
- Multiple windows may use the same profile.
- In multi-root workspaces, the first workspace folder determines rule matching and history scope.
- In untrusted workspaces, AgentShift is read-only: users can inspect profile state, but profile, hook, transcript, and configuration mutations are disabled.
- Remote SSH, WSL, development containers, and Cursor are best-effort compatibility targets.
- Console/API-billing authentication may use global state outside `CLAUDE_CONFIG_DIR`; the UI warns that it may not be isolated.

## Non-goals for v1

- Sharing settings, skills, plugins, agents, or `CLAUDE.md` between profiles
- Usage analytics or Gravatar integration
- Localization beyond English
- API-key profiles based on `ANTHROPIC_API_KEY`
- A Claude process wrapper mode

