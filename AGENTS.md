# Project instructions

## Git and worktrees

- When working in a Git worktree, always work on a dedicated branch for that
  task. Do not commit directly to `main` from a worktree.
- Commit the work to that branch, push the branch when a remote is configured,
  then merge it into `main` and push `main`.
- Keep the primary repository checkout on the latest `main` (master): fetch and
  fast-forward it before starting a task, and leave it on `main` in sync with
  `origin/main` when the task is done.
- Resolve merge conflicts yourself before completing the merge.
- `main` is the production branch; every merge to `main` is a release.
