# Shared Interfaces

Status: implemented for the synthetic/demonstration MVP as of 2026-07-02.

## Area Profile Table

File: `data/processed/area_profile.csv`

Grain: one row per synthetic area.

Required fields:

| Field | Meaning |
| --- | --- |
| `area_id` | Stable area identifier |
| `area_name` | Area label |
| `borough_name` | Synthetic borough label |
| `latitude` | Area centroid latitude |
| `longitude` | Area centroid longitude |
| `population` | Synthetic population |
| `income_indicator` | Higher means more income vulnerability |
| `age_indicator` | Higher means more age-related vulnerability |
| `language_indicator` | Higher means more language-access vulnerability |
| `immigration_indicator` | Higher means more newcomer-support need |
| `housing_indicator` | Higher means more housing vulnerability |
| `vulnerability_score` | 0-100 normalized score |
| `vulnerability_rank` | Rank, 1 is highest vulnerability |
| `top_vulnerability_drivers` | Semicolon-separated top drivers |
| `summary_en` | English area summary |
| `summary_fr` | French area summary |

## Service Table

File: `data/processed/service_table.csv`

Grain: one row per synthetic service location.

Required fields:

| Field | Meaning |
| --- | --- |
| `service_id` | Stable service identifier |
| `service_name` | Service name |
| `service_category` | Standardized service category |
| `address` | Synthetic public address |
| `latitude` | Service latitude |
| `longitude` | Service longitude |
| `phone` | Synthetic phone number |
| `website` | Synthetic website |
| `language` | Service language availability |
| `source_name` | Source label |
| `source_url` | Source URL or placeholder |
| `last_checked_date` | Collection or validation date |

## Accessibility Table

File: `data/processed/accessibility_table.csv`

Grain: one row per `area_id` and `service_category`.

Required fields:

| Field | Meaning |
| --- | --- |
| `area_id` | Area identifier |
| `service_category` | Service category |
| `nearest_service_distance_km` | Distance to nearest service |
| `service_count_within_threshold` | Services within 2.5 km |
| `accessibility_score` | 0-100 access score, higher is better |
| `accessibility_method` | MVP method label |

## Gap Score Table

File: `data/processed/gap_score_table.csv`

Grain: one row per `area_id`.

Required fields:

| Field | Meaning |
| --- | --- |
| `area_id` | Area identifier |
| `area_name` | Area label |
| `borough_name` | Synthetic borough label |
| `latitude` | Area latitude |
| `longitude` | Area longitude |
| `vulnerability_score` | 0-100 vulnerability score |
| `overall_accessibility_score` | Average service access score |
| `gap_score` | Higher means higher priority |
| `gap_rank` | Rank, 1 is highest priority |
| `priority_flag` | High priority, watch, or lower priority |
| `gap_drivers` | Plain-language gap explanation |

## Census Vulnerability Index Tables

Files:

- `data/processed/census_vulnerability_index.csv`
- `data/processed/statcan_census_vulnerability_index.csv`
- `data/processed/area_vulnerability_index_real.csv`

Grain:

- `census_vulnerability_index.csv`: one row per MVP area using illustrative sample values.
- `statcan_census_vulnerability_index.csv`: one row per complete census tract.
- `area_vulnerability_index_real.csv`: one row per MVP area after borough-level aggregation.

Required focus fields:

| Field | Meaning |
| --- | --- |
| `vulnerability_index` | General structural CISV-style census index |
| `top_drivers` | Top general structural drivers |
| `immigrant_census_concern_score` | Average of recent-immigrant and no-official-language scaled scores |
| `indigenous_census_concern_score` | Scaled Indigenous identity concern when source data exists; blank otherwise |
| `mvp_focus_census_index` | Focus-group census score from available immigrant/Indigenous inputs |
| `mvp_focus_data_basis` | Data availability flag for focus score |
| `mvp_focus_top_concern` | Plain-language top focus concern |
| `vulnerability_rank` | Rank by general structural vulnerability index |

## Flyer Examples

File: `data/processed/flyer_examples.csv`

Grain: one row per selected area and selected service row.

## Frontline V1 Demand Tables

Files:

- `data/processed/observed_need_index.csv`
- `data/processed/observed_need_category_summary.csv`

`observed_need_index.csv` has one row per `area_id`. V1 describes service
encounters in the trailing 90-day window; it does not claim to count unique
people.

| Field | Meaning |
| --- | --- |
| `rolling_visit_count` | K-anonymized service encounters in the reporting window |
| `visit_volume_per_1000` | Encounters per 1,000 area residents |
| `observed_visit_volume_score` | Visit rate capped to 0-100 |
| `top_need_category` | Most selected `key_need` category |
| `top_need_count` | Encounters in the top category |
| `top_need_share_pct` | Top-category share, for explanation only |
| `top_category_pressure_score` | Top-category encounters per 1,000 residents, capped to 0-100 |
| `v1_demand_score` | 70% visit volume plus 30% top-category pressure |
| `data_through_date` | Most recent included source period end |
| `v2_observed_score` | Fixed-component observed score used only by V2 |
| `insufficient_visit_data` | True when the area does not meet the privacy/data floor |

`observed_need_category_summary.csv` has one row per `area_id` and `key_need`.
It exposes `encounter_count`, `encounter_share_pct`, and `category_rank` so
frontline users can inspect the complete category mix.

## Vulnerability Index V2

File: `data/processed/vulnerability_index_v2.csv`

Grain: one row per `area_id`. V2 is an experimental planning score, not a
person-level risk score or a frontline eligibility decision.

The output carries `v1_demand_score`, `visit_volume_score`,
`top_category_pressure_score`, `focus_category_share_score`,
`severity_breadth_score`, `recency_score`, and `v2_observed_score` to make the
composite auditable. Only the selected V1 volume and category-pressure
components affect V2; the complete V1 score is not inserted as a single input.

| Field | Meaning |
| --- | --- |
| `mvp_focus_census_index` | Structural focus input |
| `v1_demand_score` | Frontline summary carried for comparison, not inserted directly |
| `visit_volume_score` | 30% of V2 observed; 12% of final V2 |
| `top_category_pressure_score` | 20% of V2 observed; 8% of final V2 |
| `focus_category_share_score` | 20% of V2 observed; 8% of final V2 |
| `severity_breadth_score` | 20% of V2 observed; 8% of final V2 |
| `recency_score` | 10% of V2 observed; 4% of final V2 |
| `v2_observed_score` | Fixed-component observed score |
| `vulnerability_index_v2` | 60% structural plus 40% V2 observed |
| `insufficient_visit_data` | Triggers structural-only fallback when true |
| `v2_data_basis` | Identifies structural-only or structural-plus-observed calculation |

## Monitoring Summary

File: `data/processed/monitoring_summary.csv`

Grain: one row per monitoring check.

## Supabase Cloud Contract

Versioned schema and RLS definitions live in `supabase/migrations/`; operational
steps and refresh semantics live in `docs/reference/operations/supabase-operations.md`.

The current cloud schema contains 19 core tables plus two cloud-native
analytics tables. Browser roles have read-only access
to `area_profile`, `gap_score`, `accessibility`, the legacy `service_table`,
the canonical `services_master`, `observed_need_index`, and
`observed_need_category_summary`, and `vulnerability_index_v2`. Browser roles
have insert-only access to `page_events` and `flyer_downloads`. All raw/source
and database-view objects, including `database_visitor_tag`, are denied to
browser roles.

Required application keys:

| Table | Primary key | Parent relationship |
| --- | --- | --- |
| `area_profile` | `area_id` | none |
| `gap_score` | `area_id` | `area_profile.area_id` |
| `accessibility` | `area_id`, `service_category` | `area_profile.area_id` |
| `service_table` | `service_id` | `database_center.center_id` |
| `services_master` | `service_id` | optional `area_profile.area_id` |
| `observed_need_index` | `area_id` | `area_profile.area_id` |
| `vulnerability_index_v2` | `area_id` | `area_profile.area_id` |

Cloud refresh uses transactional replacement of rows. Migrations, rather than
the data loader, own tables, types, keys, indexes, views, grants, and RLS.

## Web-Observed Demand Outputs

Generated files under gitignored `data/derived/web_observed_demand/`:

- `database_visitor_tag.csv`
- `web_observed_area.csv`
- `observed_need_index.csv`
- `observed_need_category_summary.csv`
- `vulnerability_index_v2.csv`
- `quality_report.json`

`web_observed_area` has one row per dataset and area. Required fields include
`dataset_id`, `area_id`, `unique_sessions`, `active_days`,
`service_impressions`, `weighted_demand_total`,
`intent_rate_per_100_impressions`, `digital_demand_score`,
and `coverage_status`.

`database_visitor_tag` stores one web aggregate per qualifying area/window.
`k_anon_count` is the unique-session privacy count;
`weighted_demand_total` is the accumulated behavior weight. The area score is
written to `observed_need_index.v2_observed_score`, then
`vulnerability_index_v2` applies the original 60% structural / 40% observed
formula.

Only after all 12 areas have `coverage_status=reviewable` may observed scores
and the 40% observed weight be applied. Otherwise V2 is structural-only. These
outputs do not feed `gap_score`.

## Area Boundary GeoJSON

File: `frontend/public/geo/areas.geojson`

Grain: one non-overlapping feature per stable `area_id` in `area_profile` and
`gap_score`.

Required feature properties:

| Field | Meaning |
| --- | --- |
| `area_id` | Stable join key used by scoring and map selection |
| `area_name` | Project display name |
| `borough_name` | Normalized administrative-area name |
| `boundary_type` | Official polygon or documented centroid partition |
| `boundary_source` | Human-readable source attribution |
| `source_downloaded_date` | Date the committed source was acquired |

Geometry may be `Polygon` or `MultiPolygon`. `A001` and `A002` are a derived,
non-overlapping partition of their shared official borough; other IDs map
one-to-one to an official administrative polygon. Run
`scripts/validate_spatial_joins.py` after any boundary or centroid change.

## Role Activity Log

File: `data/processed/role_activity_log.csv`

Grain: one row per simulated team activity.
