# Data Requirements

## MVP Data

The MVP uses synthetic data with fields shaped like the planned public-data
contracts.

Raw files:

- `data/raw/synthetic_area_profiles.csv`
- `data/raw/synthetic_services.csv`

Processed files:

- `data/processed/area_profile.csv`
- `data/processed/service_table.csv`
- `data/processed/accessibility_table.csv`
- `data/processed/gap_score_table.csv`
- `data/processed/flyer_examples.csv`
- `data/processed/monitoring_summary.csv`
- `data/processed/role_activity_log.csv`

## Real Data Replacement Plan

Replace synthetic sources with:

- Statistics Canada 2021 Census Profile data.
- Statistics Canada Census Boundary Files.
- Montreal administrative boundaries.
- 211 Quebec or Montreal Open Data service locations.
- Optional transit or routing data if feasible.

## Quality Checks

- Required columns exist.
- IDs are unique at the expected grain.
- Coordinates are populated and within the Greater Montreal bounding box.
- Scores are between 0 and 100.
- Gap ranks are unique.
- Monitoring summary reports source counts and missingness.
