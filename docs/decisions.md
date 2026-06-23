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

## Pending Decisions For Real Data Version

| Decision | Owner | Notes |
| --- | --- | --- |
| Final public service source | Laura | Prefer 211 Quebec if structured access is feasible |
| Final geography level | Laura and Frondy | Prefer census tract; fallback to borough if needed |
| Final vulnerability indicators | Frondy and Chloe | Synthetic indicators are placeholders |
