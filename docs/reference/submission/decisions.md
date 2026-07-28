# Decisions

## Approved Decisions

| Date | Decision | Rationale |
| --- | --- | --- |
| 2026-06-11 | Build the MVP in `/home/frondy/code/comm_mvp` | Keeps implementation separate from planning repo |
| 2026-06-11 | Use synthetic data for MVP | Allows fast validation before public data collection |
| 2026-06-11 | Use `data/raw/` and `data/processed/` only | Matches Cookiecutter-style request |
| 2026-06-11 | Do not Dockerize the MVP | User specified Docker is not required |
| 2026-06-11 | Local run is required; Streamlit Cloud readiness is included | Keeps demo resilient locally and deployable from GitHub |
| 2026-06-11 | Use 2.5 km as MVP service-access threshold | Simple explainable distance proxy |
| 2026-06-11 | Calculate gap score as vulnerability times access deficit | Makes priority areas interpretable |
| 2026-06-11 | Simulate role activity log | Supports team monitoring demo without waiting for real PR history |
| 2026-06-11 | Add a local policymaker assistant instead of external RAG | Provides chat-style policy analysis without API keys or private data |
| 2026-07-02 | Define V1 as a frontline demand score using 70% visit volume and 30% top-category pressure | Keeps the operational score tied to transparent encounter measures |
| 2026-07-02 | Pass selected V1 indicators into V2 instead of inserting the complete V1 score | Separates frontline operations from area-level vulnerability planning |
| 2026-07-02 | Use a fixed V2 observed component mix and retain the 60% structural / 40% observed composite | Makes contributions auditable and limits recency inflation in low-volume areas |
| 2026-07-02 | Treat encounter counts as visits, not unique people | The aggregate source has no deduplicated client identifier |
| 2026-07-14 | Use official administrative polygons and a labeled centroid partition for `A001`/`A002` | Preserves the 12 stable scoring IDs without overlapping synthetic envelopes or presenting the derived divider as official |
| 2026-07-14 | Keep GeoJSON for the 12-feature production map contract | The generated payload is 265 KB raw and 71 KB gzip; PMTiles adds complexity without a payload benefit at this scale |
| 2026-07-23 | Use `feature/dashboard` as the canonical React UX and combine production work on `integration/production-web` | Preserves the accepted dashboard interaction model while importing Supabase, scoring, spatial, pipeline, and server API artifacts without reviving the obsolete TypeScript/MapLibre frontend |
| 2026-07-27 | Evaluate anonymous `page_events` and `flyer_downloads` as a digital-demand candidate for experimental V2 | Website behavior can measure interaction with this tool but is not relabelled as resident need, partner encounters, or 211 demand; any candidate remains k-anonymized and production `gap_score` stays unchanged |
| 2026-07-27 | Keep production gap scoring unchanged while web-observed V2 is evaluated | Preserves the current application contract; the code applies the original 60/40 V2 only after all areas pass coverage and otherwise uses structural-only fallback |
| 2026-07-28 | Defer web-observed application integration after the no-publish review | The 90-day dry run produced 0 of 12 reviewable areas; structural-only fallback, `k >= 5`, and the unchanged production `gap_score` remain the approved state |
| 2026-07-28 | Use one root README plus canonical V1, V2, and chatbot guides | Gives reviewers a short entrypoint while keeping detailed references and superseded planning material navigable |

## Pending Decisions For Real Data Version

| Decision | Owner | Notes |
| --- | --- | --- |
| Service-source refresh governance | Laura | The current 3,664-row directory uses the public 211 PDF plus public/open sources; define ownership and refresh cadence before operational use |
| Future high-resolution geography level | Laura and Frondy | Current release uses 11 official administrative polygons mapped to 12 stable project IDs; reconsider tracts when scoring supports them |
| Validate V1/V2 weights and saturation thresholds | Frondy and Chloe | Current weights are implemented but experimental |
| Wire V2 into gap scoring and application views | Frondy and Jessie | Defer until production coverage, web-observed quality artifacts, and representative-user interpretation are validated |
