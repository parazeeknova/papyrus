This repo uses a hybrid versioning workflow.

- Patch versions are bumped automatically on every commit for touched workspaces
  under `apps/*` and `packages/*`.
- Manual Changesets are reserved for `minor` and `major` release intent.
- The root package is never versioned.

Use `bun run changeset` when a change should force a later `minor` or `major`
release. Do not add patch-only changesets unless the release policy changes.
