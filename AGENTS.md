# Project instructions

## Git and worktrees

- When working in a Git worktree, always work on a dedicated branch for that
  task. Do not commit directly to `main` from a worktree.
- Commit the work to that branch, push the branch when a remote is configured,
  then merge it into `main` and push `main`.
- Resolve merge conflicts yourself before completing the merge.
- `main` is the production branch; every merge to `main` is a release.
