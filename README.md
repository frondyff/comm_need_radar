# Community Needs Radar

Community Needs Radar is a React/Vite dashboard project for mapping social
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
-> React dashboard and flyer generator
-> monitoring, documentation, report, and presentation
```

The integrated repository keeps a local run path while preparing the React app
for Supabase-backed preview and production deployment.

## Run Locally

The canonical frontend is the React/Vite dashboard from `feature/dashboard`.
Node.js 22+ is required.

```bash
cd frontend
npm ci
npm run dev
```

Then open `http://localhost:5173` in a browser. See
[frontend/README.md](frontend/README.md) for the detailed frontend guide.

With `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`, the dashboard
loads real app-ready scores and the deduplicated `services_master` layer.
Without that configuration it shows an explicitly labeled demo fallback.

## Data And Validation

Python 3.11+ is required for the reproducible data, scoring, and spatial
pipelines:

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python3 -m unittest discover -s tests
python3 scripts/validate_spatial_joins.py
```

Frontend validation:

```bash
cd frontend
npm ci
npm run validate:boundaries
npm run validate:dashboard-adapter
npm run build
```

The owner-level Supabase SQL contract is
`supabase/tests/issue_6_contract.sql`. Public-key validation requires the
documented Supabase environment variables; see
`docs/supabase-operations.md`.

## Repository Structure

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
  frontend/
    README.md
    package.json
    public/
      geo/
        areas.geojson
    src/
      main.jsx
      App.jsx
      components/
        serviceVisuals.jsx
      flyer/
        FlyerPreview.jsx
        FlyerPdfExporter.js
        flyerData.js
        flyerStyles.js
      lib/
        supabaseData.js
        dashboardAdapter.js
        analytics.js
  notebooks/
  scripts/
    data_pipeline/
  src/comm_need_radar/
    geospatial/
    scoring/
  supabase/
    migrations/
    tests/
  tests/
  .github/
    ISSUE_TEMPLATE/
      work-item.md
      interface-change.md
    pull_request_template.md
```

The React dashboard is the canonical product UI. The Python/Streamlit code is
retained as a local analytical reference and pipeline consumer, not as the
production web baseline.

## Team Ownership

| Team Member | Primary Area | Backup Area |
| --- | --- | --- |
| Chloe | Product leadership, scope, timeline, proposal coordination, MVP decisions | AI/RAG and dashboard support |
| Laura | Data engineering for census, boundaries, and service datasets | AI/RAG, geospatial, and dashboard support |
| Frondy | Geospatial analytics, spatial joins, vulnerability score, service access score, gap score, GitHub documentation | App support |
| Jessie | React dashboard development (Community & Planner views), interactive map UX and data visualization, Supabase integration, flyer generation/export system, usage analytics | AI/RAG, geospatial, and GitHub support |
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
- [Data Inventory](docs/DATA_INVENTORY.md)
- [Supabase Operations](docs/supabase-operations.md)
- [Spatial Join Validation](docs/spatial-join-validation.md)
- [Chatbot](docs/chatbot.md)

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
