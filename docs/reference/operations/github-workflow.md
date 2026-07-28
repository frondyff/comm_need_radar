# GitHub Workflow

## Repository Setup

- Repository: `comm_need_radar`
- Visibility: private
- Stable branch: `main`
- Integration branch: `dev`

`main` is reserved for stable milestone snapshots. Implementation work targets
`dev` through pull requests.

## Branch Rules

1. Open a GitHub issue before starting implementation work.
2. Create one branch per issue from `dev`.
3. Use a branch name that includes the issue number, such as
   `feature/12-monitoring-view`.
4. Open the pull request back into `dev`.
5. Include a closing keyword in the PR body, such as `Closes #12`.
6. Promote `dev` to `main` only for reviewed milestones.

## Issue Rules

- Use the work-item template for implementation and documentation tasks.
- Use the interface-change template for shared data, dashboard, or contract
  changes.
- Apply the most specific labels from `.github/labels.yml`.
- Document blockers directly in the issue and apply the `blocked` label.

## Pull Request Rules

- Keep each PR scoped to one issue.
- Update `docs/reference/submission/task-progress.md` when work changes project state or handoff
  status.
- Update `docs/reference/data/interfaces.md` and `docs/reference/submission/decisions.md` for shared contract or
  project-decision changes.
- Confirm no secrets, private data, or personally identifiable information are
  committed.

## Initial GitHub Issues To Create

After the repository is pushed, create these issues:

1. Configure branch protection for `main` and `dev`.
2. Build the missing MVP source, data, and tests described by the planning docs.
3. Reconcile `docs/reference/submission/submission-checklist.md` after implementation artifacts are
   added.
4. Add monitoring artifacts and keep implementation progress updated.

Issue seed text is available in `.github/initial-issues.md`.

## Local Publish Commands

This managed workspace mounts `.git/` as read-only, so local Git state is stored
in `.git-local/` and commands must pass the Git directory explicitly:

```bash
gh auth login
gh repo create OWNER/comm_need_radar --private
git --git-dir=.git-local --work-tree=. status
git --git-dir=.git-local --work-tree=. remote add origin git@github.com:OWNER/comm_need_radar.git
git --git-dir=.git-local --work-tree=. push -u origin main
git --git-dir=.git-local --work-tree=. push -u origin dev
```

Replace `OWNER` with the GitHub user or organization that owns the private
repository.
