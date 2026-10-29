# Contributing to AgentShift

Thanks for helping. Bug reports, fixes, and small focused features are all welcome. For anything larger, open an issue first so we can agree on the approach before you write code.

## Set up

You need Node.js 20+ and either Cursor or VS Code. Claude Code is only needed for manual testing.

```sh
git clone https://github.com/pawaretdev/agent-shift.git
cd agent-shift
npm install
npm run build
```

## Check your change

Run these before opening a pull request. CI runs the same steps.

```sh
npm test               # unit tests (vitest)
npm run typecheck      # tsc --noEmit
npm run test:integration   # VS Code test host; on Linux run under xvfb-run
```

Unit tests live in `test/unit`. Code in `src/core` has no `vscode` import, so test it there first. Tests that need `vscode` mock it with `vi.mock('vscode', ...)`; see `test/unit/commands.test.ts`. Tests must never log in, log out, or touch a real `~/.claude`: use temporary directories and fake homes.

## Try it in your editor

```sh
npm run package
code --install-extension agent-shift-<version>.vsix --force     # VS Code
cursor --install-extension agent-shift-<version>.vsix --force   # Cursor
```

Reload the window afterwards. If your change touches profile switching, check it by hand: switch profiles, choose **Restart**, then run `/status` in the Claude Code panel and confirm the account changed. Automated tests cannot cover this.

## Project rules

These keep AgentShift safe to install. Pull requests that break them will not be merged.

- **No network and no telemetry.** The extension makes no requests of its own.
- **No runtime dependencies.** Dev dependencies are fine.
- **Never read credentials.** Do not open credential files or the OS keychain. Identity comes only from `claude auth status --json`, filtered through the allow-list in `src/core/redact.ts`.
- **Mark undocumented behavior.** If your code relies on Claude Code, VS Code, or Cursor behavior that is not in their official docs, add a one-line `// UNDOCUMENTED: ...` comment where you rely on it, and add it to the numbered list in `docs/FEASIBILITY.md`.
- **Never lose user data.** `~/.claude` is never deleted. Data sharing merges first and moves anything that clashes into a backup; keep it that way.
- **Respect untrusted workspaces.** Writes go through `assertTrusted()`.
- **Keep the IDs stable.** Do not rename the extension `name`, `publisher`, command IDs, or `agentShift.*` setting keys; existing users would lose updates or settings.

## Pull requests

- Keep each pull request to one change, with a short description of what and why.
- Add a line under **Unreleased** in `CHANGELOG.md` for anything users will notice.
- Write commit messages in English.
- Update `README.md` when you add or change a command or setting.

Releases are cut by the maintainer by pushing a version tag; contributors do not need to bump the version.

## Reporting bugs

Use the [bug report form](https://github.com/pawaretdev/agent-shift/issues/new?template=bug_report.yml). Include your editor and its version, the AgentShift and Claude Code versions, and how the profile signed in. Redact emails, organization names, and file paths you do not want public.

## License

By contributing, you agree that your contributions are licensed under the [MIT License](LICENSE).
