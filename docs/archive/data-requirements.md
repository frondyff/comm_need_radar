# Data Requirements

## MVP Data

The MVP uses synthetic data with fields shaped like the planned public-data
contracts.

Raw files:

- `data/raw/synthetic_area_profiles.csv`
- `data/raw/synthetic_services.csv`
- `data/raw/database_centers.csv`
- `data/raw/database_visitor_tags.csv`
- `data/raw/statcan_2021_montreal_ct_variables.csv`
- `data/raw/boundaries/ct_centroids_montreal.csv`
- `data/raw/boundaries/montreal_boroughs.geojson`

Processed files:

- `data/processed/area_profile.csv`
- `data/processed/service_table.csv`
- `data/processed/accessibility_table.csv`
- `data/processed/gap_score_table.csv`
- `data/processed/flyer_examples.csv`
- `data/processed/monitoring_summary.csv`
- `data/processed/role_activity_log.csv`
- `data/processed/area_vulnerability_index_real.csv`
- `data/processed/center_area_lookup.csv`
- `data/processed/observed_need_index.csv`
- `data/processed/observed_need_category_summary.csv`
- `data/processed/vulnerability_index_v2.csv`

The center, visitor-tag, and current V2 outputs are demonstration data shaped
like the production contracts. Encounter aggregates must meet `k >= 5`; they do
not represent deduplicated people.

## Real Data Replacement Plan

Replace synthetic sources with:

- Statistics Canada 2021 Census Profile data.
- Statistics Canada Census Boundary Files.
- Montreal administrative boundaries.
- 211 Quebec or Montreal Open Data service locations.
- Optional transit or routing data if feasible.

For the immigrant/Indigenous MVP vulnerability index, see
`docs/archive/laura-data-request-real-index.md` for Laura's concrete source-field
checklist.

## Quality Checks

- Required columns exist.
- IDs are unique at the expected grain.
- Coordinates are populated and within the Greater Montreal bounding box.
- Scores are between 0 and 100.
- Category encounter counts reconcile to each area's rolling encounter count.
- V1 and V2 observed rows expose their data basis and insufficient-data status.
- Gap ranks are unique.
- Monitoring summary reports source counts and missingness.
