# Community Needs Radar MVP

Community Needs Radar MVP is a local-first Streamlit analytics app that uses a
synthetic Greater Montreal dataset to demonstrate the project workflow described
in the planning docs:

```text
raw synthetic data
-> processed area, service, accessibility, and gap-score outputs
-> Planner / Organization View
-> Frontline / Community View
-> monitoring dashboard plus role activity documented in docs/data
```

The MVP is intentionally synthetic. It lets the team validate scoring logic,
dashboard interactions, handoff contracts, and monitoring rules before replacing
sample records with public census, boundary, and service-location data.

## What Is Implemented

- Synthetic raw datasets in `data/raw/`.
- Processed dashboard-ready outputs in `data/processed/`.
- Reproducible data generation and processing scripts.
- Vulnerability, accessibility, and gap-score logic.
- A Streamlit dashboard with:
  - Planner / Organization View.
  - Local policymaker assistant for priority, gap, and funding questions.
  - Interactive geospatial map clicks for area and service inspection.
  - Frontline / Community View with postal-code/community search and
    clickable vulnerability profile cards.
  - Monitoring View.
- A separate customizable React frontend prototype with Planner and Frontline
  modes, MapLibre maps, vulnerability cards, card detail, and local policy chat.
- Custom frontend upgrades for PDF handouts, synthetic polygon choropleth
  layers, radius catchments, and scenario-style geospatial analysis.
- Plain-language area summaries grounded in processed data.
- Markdown docs and GitHub templates for team monitoring.
- Lightweight standard-library tests that can run without pytest.

Docker is not required. Cloud deployment is optional. Local execution is the
fallback and default path.

## Repository Structure

```text
comm_mvp/
  README.md
  pyproject.toml
  requirements.txt
  streamlit_app.py
  frontend/
  .streamlit/
  data/
    raw/
    processed/
  docs/
  scripts/
  src/comm_need_radar/
    config/
    dashboard/
    ingestion/
    monitoring/
    processing/
    rag/
    scoring/
  tests/
  .github/
```

## Local Setup

Create an environment with Python 3.11+ and install dependencies:

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

If Streamlit is unavailable, the data pipeline and tests still run with the
standard library plus pandas.

## Regenerate Synthetic Data

```bash
python3 scripts/generate_synthetic_data.py
python3 scripts/build_processed_data.py
```

The scripts write:

- `data/raw/synthetic_area_profiles.csv`
- `data/raw/synthetic_services.csv`
- `data/processed/area_profile.csv`
- `data/processed/service_table.csv`
- `data/processed/accessibility_table.csv`
- `data/processed/gap_score_table.csv`
- `data/processed/flyer_examples.csv`
- `data/processed/monitoring_summary.csv`
- `data/processed/role_activity_log.csv`

## Run Dashboard

```bash
streamlit run streamlit_app.py
```

The app uses processed CSV files and does not need external credentials.

## Run Custom Frontend

The `frontend/` directory contains the recommended production-oriented UI stack:
Vite, React, TypeScript, Tailwind CSS, MapLibre GL JS, and deck.gl-ready
dependencies. I used Vite here because the patched secure Next.js release
requires Node 20.9+, while this repo currently runs Node 18.19. The frontend
reads the same processed CSV outputs copied into `frontend/public/data/`.
The synthetic polygon layer lives at `frontend/public/geo/areas.geojson`; replace
it with real boundary GeoJSON using the same `area_id` keys when public
geography is ready.

```bash
cd frontend
npm install
npm run dev
```

Use the localhost URL printed in the terminal, usually `http://localhost:5173`.

Use Streamlit for the current cloud-ready MVP. Use the custom frontend when the
project needs more control over interaction design, map behavior, routing, and
component-level UX.

## Deploy To Streamlit Community Cloud

This repository is ready for Streamlit Community Cloud.

Use these settings when creating the app:

- Repository: `frondyff/comm_mvp`
- Branch: `main`
- Main file path: `streamlit_app.py`
- Python version: `3.12`

Cloud uses the root `requirements.txt` for Python dependencies and
`.streamlit/config.toml` for app configuration. No secrets or external
`apt-get` packages are required for the synthetic MVP.

## Run Tests

```bash
python3 -m unittest discover -s tests
```

## Team Roles Simulated In Activity Log

| Role | Simulated Owner | MVP Responsibility |
| --- | --- | --- |
| Product / project lead | Chloe | Scope, acceptance criteria, monitoring rules |
| Data engineering lead | Laura | Synthetic raw and processed data contracts |
| Geospatial / analytics lead | Frondy | Accessibility, vulnerability, and gap scoring |
| Dashboard / app lead | Jessie | Planner and frontline Streamlit workflows |
| AI / insight / presentation lead | Mariam | Summaries, user-test notes, presentation story |

See `docs/task-progress.md` and `data/processed/role_activity_log.csv` for the
full simulated activity log. The activity log is not displayed as a dashboard
view.
