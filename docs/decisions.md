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

## Pending Decisions For Real Data Version

| Decision | Owner | Notes |
| --- | --- | --- |
| Final public service source | Laura | Prefer 211 Quebec if structured access is feasible |
| Final geography level | Laura and Frondy | Prefer census tract; fallback to borough if needed |
| Validate V1/V2 weights and saturation thresholds | Frondy and Chloe | Current weights are implemented but experimental |
| Wire V2 into gap scoring and application views | Frondy and Jessie | Defer until weights and production coverage are validated |
