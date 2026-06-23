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
| 2026-06-11 | Jessie | Dashboard / app lead | Added Streamlit Community Cloud entrypoint, config, and deployment instructions | `streamlit_app.py`, `.streamlit/config.toml`, README | No secrets or apt packages required | Deploy and record public app URL |
| 2026-06-12 | Jessie | Frontend / UX lead | Added custom React frontend audit and roadmap covering PDF handouts, polygon layers, and advanced geospatial analysis | `docs/custom-frontend-audit-roadmap.md` | Polygon and PDF features are planned but not implemented yet | Start PDF handout and polygon GeoJSON implementation |
| 2026-06-12 | Jessie | Frontend / geospatial lead | Implemented PDF handout flow, synthetic polygon choropleth layer, radius catchments, and scenario-style geospatial analysis | `frontend/src/App.tsx`, `frontend/src/components/InteractiveMap.tsx`, `frontend/public/geo/areas.geojson` | Real public boundaries and network travel-time engine remain future work | Replace synthetic envelopes with real GeoJSON and add E2E tests |
| 2026-06-23 | Frondy | Geospatial / analytics lead | Rebuilt census index outputs with immigrant and Indigenous MVP focus columns | `data/processed/*vulnerability_index*.csv`, census scripts, docs | Indigenous census variable is missing from current raw StatCan extract | Add `indigenous_identity_pct` or observed k-anonymized Indigenous service-need tags |
| 2026-06-23 | Laura | Data engineering lead | Defined real-data request checklist for the immigrant/Indigenous vulnerability index | `docs/laura-data-request-real-index.md` | Awaiting Indigenous census field and k-anonymized observed need exports | Deliver minimum data package so Frondy can build the real index |
| 2026-06-23 | Frondy | Geospatial / analytics lead | Added MVP system ERD covering current processed tables and planned real-index extension | `docs/mvp-system-erd.md` | Planned visitor/center tables are contracts, not implemented data yet | Use ERD to guide real data ingestion |

## Monitoring Rule

Every future implementation task should add a row with owner, role, activity,
output, blocker, and next step. Shared schema changes must also update
`docs/interfaces.md`.

The activity log is maintained here and in
`data/processed/role_activity_log.csv`; it is not displayed as a dashboard view.
