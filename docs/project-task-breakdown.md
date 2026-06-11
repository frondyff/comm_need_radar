# Project Task Breakdown

## MVP Workstreams

| Workstream | Owner | MVP Output |
| --- | --- | --- |
| Product and project management | Chloe | Scope, acceptance criteria, decisions, monitoring structure |
| Data acquisition and processing | Laura | Synthetic raw data and processed contracts |
| Geospatial analytics and scoring | Frondy | Vulnerability, accessibility, and gap scoring |
| Dashboard and user experience | Jessie | Streamlit Planner, Frontline, and Monitoring views |
| AI, insights, and presentation | Mariam | Plain-language summaries and simulated user-testing notes |
| Integration and final review | Chloe and all | README, docs, tests, and local run path |

## Handoffs

| Handoff | From | To | Artifact |
| --- | --- | --- | --- |
| MVP scope | Chloe | All | `docs/project-definition.md` |
| Synthetic raw data | Laura | Frondy | `data/raw/*.csv` |
| Scored processed outputs | Frondy | Jessie and Mariam | `data/processed/*.csv` |
| Dashboard workflows | Jessie | Chloe | Streamlit app |
| Summaries and test notes | Mariam | Jessie and Chloe | Summary fields and role log |
| Final verification | All | Chloe | Tests, README, and monitoring docs |

## Acceptance Criteria

- Raw and processed MVP data exist.
- Processed outputs match `docs/interfaces.md`.
- Dashboard reads processed data only.
- Dashboard supports click-selected map inspection for areas and services.
- Planner mode includes a local policymaker assistant for priority, gap,
  borough, and funding questions.
- Frontline mode supports synthetic postal-code/community search and
  clickable vulnerability-type cards with analysis detail panels.
- Monitoring view reports dataset health.
- Simulated role activity is written to docs and processed data, not displayed
  as a dashboard view.
- Local run commands are documented.
