# Initial Issues

Create these issues after the private GitHub repository is pushed.

## Configure branch protection for `main` and `dev`

Labels: `work-item`, `monitoring`

### Objective

Protect `main` as the stable branch and require reviewed pull requests for
changes into `dev`.

### Acceptance Criteria

- [ ] `main` blocks direct pushes.
- [ ] `dev` requires pull requests.
- [ ] Required GitHub Actions checks are enabled after the first workflow run.

## Build missing MVP source, data, and tests

Labels: `work-item`, `data`, `dashboard`, `scoring`

### Objective

Add the implementation artifacts described by the planning docs.

### Acceptance Criteria

- [ ] Synthetic raw data exists.
- [ ] Processed dashboard-ready data exists.
- [ ] React/Vite dashboard source exists.
- [ ] Local tests exist and run in CI.

## Reconcile submission checklist after implementation

Labels: `work-item`, `documentation`

### Objective

Update `docs/submission-checklist.md` after source, data, monitoring, and tests
are implemented.

### Acceptance Criteria

- [ ] Checklist reflects repository reality.
- [ ] Completed items are supported by committed files or documented commands.

## Add monitoring artifacts and implementation progress updates

Labels: `work-item`, `monitoring`

### Objective

Create the monitoring artifacts required by the project docs and keep
`docs/task-progress.md` updated during implementation.

### Acceptance Criteria

- [ ] Monitoring summary artifact exists.
- [ ] Progress log rows are added for completed implementation PRs.
- [ ] Any blockers are reflected in issue labels and handoff notes.
