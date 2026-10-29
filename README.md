# AgentShift: Claude Code Profiles

AgentShift is a small Cursor extension for switching between isolated Claude Code accounts and organizations. Each managed profile receives its own `CLAUDE_CONFIG_DIR`, so Claude settings, project data, transcripts, and authentication context remain separate.

## Features

- Switch profiles from the status bar or command palette.
- Create a profile and launch the documented `claude auth login` flow.
- Keep a per-workspace default, with optional ordered path rules.
- Toggle back to the previous profile with `Cmd+Alt+[` on macOS or `Ctrl+Alt+[` elsewhere.
- Optionally share conversations, settings, skills, and plugins across every profile while logins stay separate (**AgentShift: Profile Data Sharing**).
- Browse transcript names and modification times across profiles, then copy one conversation into the active profile and resume it as a fork.
- Detect documented session and weekly limit messages through a profile-local StopFailure hook and suggest another signed-in profile.
- No telemetry, network requests, runtime dependencies, or direct credential-store access.

## Setup

1. Install Claude Code and sign in to the Default profile if desired.
2. Install AgentShift.
3. Run **AgentShift: Add Profile**, choose a name and login method, then complete Claude's login in the integrated terminal.
4. Select the status bar item to switch profiles. Choose **Restart** when prompted: AgentShift restarts the extension host (not the whole window) so an already-running Claude Code panel adopts the selected environment. Switching back to the profile the window started with needs no restart.

Managed profiles default to `~/.agent-shift/profiles`; metadata is stored in `~/.agent-shift/profiles.json`. The Default profile remains `~/.claude` and is never deleted by AgentShift.

## Settings

- `agentShift.profileRoot`: managed profile directory.
- `agentShift.reloadBehavior`: `ask`, `always`, or `never`.
- `agentShift.rules`: ordered `{ "glob": "…", "profile": "…" }` workspace-path rules.
- `agentShift.suggestSwitchOnLimit`: enable limit suggestions.
- `agentShift.statusBarStyle`: `name`, `compact`, or `hidden`.
- `agentShift.dataSharing`: `isolated` (default) or `shared`. Shared links each profile's `projects`, `todos`, `file-history`, `plans`, `shell-snapshots`, `history.jsonl`, `settings.json`, `CLAUDE.md`, `keybindings.json`, `agents`, `commands`, `skills`, `hooks`, `output-styles`, and `plugins` to `~/.claude`. Existing profile data is merged in first; anything that clashes is kept in the profile's `.agent-shift-backup` folder. Turning sharing off copies configuration back and leaves conversations in `~/.claude`.

AgentShift activates on `*` because it must synchronously set the selected profile environment before the Claude Code extension starts. Command-only activation can run too late and could let the Claude panel start with a different account.

## Limitations

- Profile switching is best effort for an already-running Claude Code panel and requires an extension-host restart (or window reload) to take effect.
- Existing terminals keep their original environment; newly created terminals inherit the selected profile.
- Console/API-billing sign-ins may use global Claude state outside `CLAUDE_CONFIG_DIR` and may not be isolated.
- Cursor, Remote SSH, WSL, and development containers are best-effort compatibility targets.
- Multi-root workspaces use the first workspace folder for rules and history.
- Shared mode keeps `.claude.json` per profile because it holds the signed-in account, so user-scope MCP servers and per-project trust are not shared.
- Untrusted workspaces are read-only.
- History resume copies a transcript before invoking documented resume flags. Discovery of that copied transcript is not a public Claude Code contract.

## Undocumented dependencies

The implementation isolates and marks seven observed or inferred behaviors: extension-host environment inheritance by Claude Code, an extension-host restart being enough for the Claude panel to adopt a new profile, optional identity fields in auth status JSON, discovery of a copied transcript, long workspace-path encoding, subscription caps reaching StopFailure as `rate_limit`, and Cursor-specific hosting compatibility. See [docs/FEASIBILITY.md](docs/FEASIBILITY.md) for the complete risk and mitigation table.

## Development

```sh
npm install
npm run build
npm test
npx tsc --noEmit
npm run test:integration
npx @vscode/vsce package --no-dependencies --allow-star-activation
```

Tests use temporary directories, fake homes, and fake Claude executables. They never invoke login or logout against a real Claude configuration.

## Trademark

Claude and Anthropic are trademarks of Anthropic PBC. AgentShift is an independent project and is not affiliated with, endorsed by, or sponsored by Anthropic.

## License

MIT. See [LICENSE](LICENSE) and [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
