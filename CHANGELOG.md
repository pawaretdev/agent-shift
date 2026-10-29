# Changelog

All notable changes to AgentShift are documented here.

## Unreleased

- Usage-limit hooks keep working after updates: the hook script lives in the extension's global storage, and hooks left by older versions are replaced on startup.
- `agentShift.profileRoot` and `agentShift.rules` can no longer be set from workspace settings, so a repository cannot point Claude Code at its own configuration.
- Limit warnings reach the right window when several are open, and now also appear for the Default profile.
- Add Profile switches to the new profile only after the login succeeds and its terminal is closed.
- Changing data sharing with several windows open applies the change once.
- The Default-hook prompt offers "Don't ask again" and asks again if dismissed.
- A conversation copy that fails part-way no longer blocks a retry.
- Restarting extensions after a switch no longer shows a "Canceled" error.

## 0.1.4 - 2026-10-29

- Publish to the VS Code Marketplace as well as Open VSX.

## 0.1.3 - 2026-10-29

- Rename the display name to AgentShift so it is easier to find; the extension ID `pawaretdev.agent-shift` and `agentShift.*` settings are unchanged.
- Add search keywords.

## 0.1.2 - 2026-10-29

- New extension icon.

## 0.1.1 - 2026-10-29

- Switching profile restarts only the extension host instead of reloading the window; the data-sharing prompt does the same.
- Switching back to the profile the window started with clears **pending reload** and no longer prompts for a restart.
- Add opt-in `agentShift.dataSharing` mode that links conversations and configuration of every profile to `~/.claude`.
- Usage-limit hook reports the profile from `CLAUDE_CONFIG_DIR`, so one shared hook serves every profile.
- Settings writes follow symlinks, and Browse Conversations dedupes shared transcripts.

## 0.1.0 - 2026-10-29

- Add isolated Claude Code profile creation, switching, workspace defaults, and previous-profile toggling.
- Add safe identity projection, profile-local limit hooks, and conflict detection.
- Add cross-profile conversation browsing with non-destructive copy-and-fork resume.
- Add Cursor packaging (Open VSX), tests, and release workflows.
