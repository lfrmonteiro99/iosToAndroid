# Agent instructions

These instructions apply to any coding agent working in this repository,
regardless of harness (Claude Code, Codex CLI, Cursor, Copilot, Gemini CLI,
generic bots).

## Branching model

- `main` — production. Only receives merges from `dev`.
- `dev` — integration. All feature/fix work targets `dev`.
- Feature branches — branched from `dev`, PRs opened against `dev`.

## Pull requests

**All PRs MUST target `dev` as the base branch.** Never open a PR against
`main` directly. `main` only receives PRs from `dev`, and those are opened
manually by a maintainer to cut a release.

When creating a PR:
- Set `base` to `dev` (not `main`).
- If the branch was started from `main`, rebase it onto `dev` before
  opening the PR.

A CI guard (`.github/workflows/enforce-pr-base.yml`) fails any PR against
`main` whose head is not `dev`. Ignoring the rule blocks the merge.

## Releases

Releases are cut by merging `dev` → `main`. The
`.github/workflows/auto-release.yml` workflow handles version bump, tag,
GitHub release, and release APK build/upload automatically on that merge.

Merges to `dev` build a release-config APK as a workflow artifact
(`iosToAndroid-dev-<sha>`, 30d retention) via
`.github/workflows/build-dev-apk.yml`. No tag or release is created for
`dev` builds.
