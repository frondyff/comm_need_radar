# Shared Interfaces

Status: implemented for synthetic MVP.

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

## Flyer Examples

File: `data/processed/flyer_examples.csv`

Grain: one row per selected area and selected service row.

## Monitoring Summary

File: `data/processed/monitoring_summary.csv`

Grain: one row per monitoring check.

## Role Activity Log

File: `data/processed/role_activity_log.csv`

Grain: one row per simulated team activity.
