# Task Progress

This file is a simulated role activity log for the MVP. It demonstrates how the
team can monitor work through owners, outputs, blockers, and handoffs.

## Simulated Activity Log

| Date | Owner | Role | Activity | Output | Decision Or Blocker | Next Step |
| --- | --- | --- | --- | --- | --- | --- |
| 2026-06-11 | Chloe | Product / project lead | Locked MVP scope around synthetic data, local run, and optional cloud path | `docs/project-definition.md` | Real public data deferred | Open implementation issues |
| 2026-06-11 | Laura | Data engineering lead | Created synthetic area and service source contracts | `data/raw/*.csv` | 211 access not needed for MVP | Replace synthetic data later |
| 2026-06-11 | Frondy | Geospatial / analytics lead | Implemented vulnerability, accessibility, and gap scoring | `data/processed/gap_score_table.csv` | 2.5 km threshold selected | Validate with real geography later |
| 2026-06-11 | Jessie | Dashboard / app lead | Built Planner, Frontline, and Monitoring views | Streamlit app | Streamlit dependency required locally | Test with users |
| 2026-06-11 | Mariam | AI / insight / presentation lead | Added data-grounded area summaries and user-test notes | Summary fields and activity log | Full chatbot deferred | Use summaries in presentation |
| 2026-06-11 | Chloe | Integration lead | Verified local scripts and tests | README and tests | Cloud deployment optional | Prepare final demo script |
| 2026-06-11 | Frondy | Geospatial / analytics lead | Enhanced maps with click-selected areas, click-selected services, radius filters, and category-level access tables | `src/comm_need_radar/dashboard/app.py` | Role activity log kept in docs/data instead of dashboard | Validate clicks with user testing |
| 2026-06-11 | Mariam | AI / insight / presentation lead | Added local policymaker assistant for priority, gap, borough, and funding questions | `src/comm_need_radar/dashboard/app.py` | External RAG/LLM not required for MVP | Validate answers with policy users |
| 2026-06-11 | Frondy | GitHub / collaboration lead | Added GitHub branch, issue, PR, label, and CI workflow structure | `.github/`, `docs/github-workflow.md` | GitHub CLI is not installed locally yet | Install/authenticate GitHub CLI and push private repo |

## Monitoring Rule

Every future implementation task should add a row with owner, role, activity,
output, blocker, and next step. Shared schema changes must also update
`docs/interfaces.md`.

The activity log is maintained here and in
`data/processed/role_activity_log.csv`; it is not displayed as a dashboard view.
