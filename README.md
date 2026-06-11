# Community Needs Radar

Community Needs Radar is a Streamlit-based analytics project for mapping social
vulnerability and service accessibility across Greater Montreal. The project
combines public census indicators, geographic boundaries, and community service
locations to identify areas where community need is high and nearby service
access is limited.

The project supports two product modes:

- **Frontline / Community View:** help residents, newcomers, volunteers, and
  frontline workers find relevant nearby services and generate printable flyers.
- **Planner / Organization View:** help nonprofits, funders, borough planners,
  and policy analysts compare vulnerability, service coverage, and priority
  gaps across neighborhoods.

## Project Goal

Build a reproducible decision-support tool that lets non-technical users answer:

1. Where are vulnerable communities located in Greater Montreal?
2. What services are available near those communities?
3. Which areas show high vulnerability and lower service accessibility?
4. What action or outreach may be appropriate for each priority area?

## Expected Workflow

```text
public raw data
-> processed census, service, and geography datasets
-> vulnerability, accessibility, and gap scores
-> Streamlit dashboard and flyer generator
-> monitoring, documentation, report, and presentation
```

Cloud deployment is optional. The project must still be runnable locally through
documented commands so it can be evaluated even if deployment is not completed.

## Planned Repository Structure

```text
comm_need_radar/
  README.md
  docs/
    project-definition.md
    project-task-breakdown.md
    architecture.md
    interfaces.md
    decisions.md
    task-progress.md
    data-requirements.md
    submission-checklist.md
  data/
    raw/
    processed/
  notebooks/
  scripts/
  src/comm_need_radar/
  tests/
  .github/
    ISSUE_TEMPLATE/
      work-item.md
      interface-change.md
    pull_request_template.md
```

Only the documentation and GitHub templates are created in the initial planning
session. Code, data, notebooks, tests, deployment files, and CI are deferred to
implementation tasks.

## Team Ownership

| Team Member | Primary Area | Backup Area |
| --- | --- | --- |
| Chloe | Product leadership, scope, timeline, proposal coordination, MVP decisions | AI/RAG and dashboard support |
| Laura | Data engineering for census, boundaries, and service datasets | AI/RAG, geospatial, and dashboard support |
| Frondy | Geospatial analytics, spatial joins, vulnerability score, service access score, gap score, GitHub documentation | App support |
| Jessie | Streamlit dashboard, two-mode UI, map UX, exports | AI/RAG, geospatial, and GitHub support |
| Mariam | AI insights, neighborhood summaries, user testing, presentation story | Methodology wording and final presentation |

## Documentation Index

- [Project Definition](docs/project-definition.md)
- [Project Task Breakdown](docs/project-task-breakdown.md)
- [Architecture](docs/architecture.md)
- [Interfaces](docs/interfaces.md)
- [Decisions](docs/decisions.md)
- [Task Progress](docs/task-progress.md)
- [Data Requirements](docs/data-requirements.md)
- [Submission Checklist](docs/submission-checklist.md)
- [GitHub Workflow](docs/github-workflow.md)

## Collaboration Rules

- Use GitHub issues for all implementation tasks.
- Use one branch and one pull request per issue.
- Use `dev` as the integration branch and reserve `main` for stable milestone
  snapshots.
- Include a closing keyword such as `Closes #12` in each pull request body so
  issues and PRs stay connected.
- Keep `docs/interfaces.md` synchronized with any shared data contract changes.
- Update `docs/task-progress.md` after each major handoff or completed pull
  request.
- Record scope, data-source, scoring, and deployment decisions in
  `docs/decisions.md`.
- Do not commit private data, secrets, or personally identifiable information.
