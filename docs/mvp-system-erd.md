# MVP Data Models

Date updated: 2026-07-02

This document separates two related models:

1. The application-facing model contains the processed tables currently used by
   the dashboard and frontend.
2. The scoring pipeline model shows how census, geography, center, and
   k-anonymized encounter data produce V1 frontline demand and V2 planning
   scores.

## Application-Facing Data Model

```mermaid
erDiagram
    AREA_PROFILE ||--|| GAP_SCORE : "scores into"
    AREA_PROFILE ||--o{ ACCESSIBILITY : "has category access rows"
    AREA_PROFILE ||--o{ FLYER_EXAMPLE : "selected for"
    AREA_PROFILE ||--o| AREA_VULNERABILITY_INDEX_REAL : "real census index for"
    SERVICE ||--o{ FLYER_EXAMPLE : "listed on"
    SERVICE ||--o{ ACCESSIBILITY : "summarized by category"
    MONITORING_SUMMARY ||--o{ ROLE_ACTIVITY_LOG : "documents pipeline context"

    AREA_PROFILE {
        string area_id PK
        string area_name
        string borough_name
        float latitude
        float longitude
        int population
        float income_indicator
        float age_indicator
        float language_indicator
        float immigration_indicator
        float housing_indicator
        float vulnerability_score
        int vulnerability_rank
        string top_vulnerability_drivers
    }

    GAP_SCORE {
        string area_id PK, FK
        string area_name
        string borough_name
        float latitude
        float longitude
        float vulnerability_score
        float overall_accessibility_score
        float gap_score
        int gap_rank
        string priority_flag
        string gap_drivers
        string summary_en
        string summary_fr
    }

    ACCESSIBILITY {
        string area_id FK
        string service_category
        float nearest_service_distance_km
        int service_count_within_threshold
        float accessibility_score
        string accessibility_method
    }

    SERVICE {
        string service_id PK
        string service_name
        string service_category
        string address
        float latitude
        float longitude
        string phone
        string website
        string language
        string source_name
        string source_url
        date last_checked_date
    }

    FLYER_EXAMPLE {
        string selected_area_id FK
        string area_label
        string selected_service_category
        string service_name
        string address
        string phone
        string website
        string language
        float distance_km
        date generated_date
        string disclaimer
    }

    AREA_VULNERABILITY_INDEX_REAL {
        string area_id PK, FK
        string area_name
        string borough_name
        float low_income_pct
        float seniors_65plus_pct
        float recent_immigrant_pct
        float no_official_language_pct
        float shelter_cost_burden_pct
        float population_2021
        float vulnerability_index
        string top_drivers
        float immigrant_census_concern_score
        float indigenous_census_concern_score
        float mvp_focus_census_index
        string mvp_focus_data_basis
        string mvp_focus_top_concern
        int vulnerability_rank
    }

    MONITORING_SUMMARY {
        string check_name PK
        string status
        int value
        string details
    }

    ROLE_ACTIVITY_LOG {
        date date
        string owner
        string role
        string activity
        string output
        string decision_or_blocker
        string next_step
    }
```

## Scoring And Source Data Model

```mermaid
erDiagram
    CENSUS_TRACT ||--o{ CT_TO_AREA_LOOKUP : "spatially assigned to"
    AREA_BOUNDARY ||--o{ CT_TO_AREA_LOOKUP : "contains tract centroid"
    AREA_BOUNDARY ||--o{ CENTER_AREA_LOOKUP : "contains center point"
    AREA_BOUNDARY ||--o{ SERVICES_MASTER : "contains located service"
    DATABASE_CENTER ||--|| CENTER_AREA_LOOKUP : "mapped through"
    DATABASE_CENTER ||--o{ DATABASE_VISITOR_TAG : "receives aggregate visits"
    DATABASE_VISITOR_TAG }o--|| OBSERVED_NEED_INDEX : "aggregates into"
    AREA_BOUNDARY ||--o| OBSERVED_NEED_INDEX : "has demand summary"
    OBSERVED_NEED_INDEX ||--o{ OBSERVED_NEED_CATEGORY_SUMMARY : "breaks down into"
    AREA_VULNERABILITY_INDEX_REAL ||--o| VULNERABILITY_INDEX_V2 : "structural layer"
    OBSERVED_NEED_INDEX ||--o| VULNERABILITY_INDEX_V2 : "observed layer"
    VULNERABILITY_INDEX_V2 ||--o| GAP_SCORE : "candidate future input"

    CENSUS_TRACT {
        string ct_code PK
        string dguid
        string geo_name
        int population_2021
        float low_income_pct
        float seniors_65plus_pct
        float recent_immigrant_pct
        float no_official_language_pct
        float shelter_cost_burden_pct
        float indigenous_identity_pct
    }

    AREA_BOUNDARY {
        string area_id PK
        string area_name
        string borough_name
        geometry polygon
    }

    CT_TO_AREA_LOOKUP {
        string ct_code FK
        string area_id FK
        string join_method
    }

    DATABASE_CENTER {
        string center_id PK
        string center_name
        float latitude
        float longitude
        string address
        string service_categories
        string languages
        boolean indigenous_led_or_specific
    }

    CENTER_AREA_LOOKUP {
        string center_id PK, FK
        string area_id FK
        string join_method
    }

    DATABASE_VISITOR_TAG {
        string visit_group_id PK
        string center_id FK
        date period_start
        date period_end
        string key_need
        int k_anon_count
        string severity
        string population_group
        boolean language_need_flag
        boolean settlement_need_flag
        boolean indigenous_specific_need_flag
    }

    OBSERVED_NEED_INDEX {
        string area_id PK, FK
        int rolling_window_days
        int rolling_visit_count
        float visit_volume_per_1000
        float observed_visit_volume_score
        string top_need_category
        int top_need_count
        float top_need_share_pct
        float top_category_rate_per_1000
        float top_category_pressure_score
        float v1_demand_score
        date data_through_date
        float observed_immigrant_need_score
        float observed_indigenous_need_score
        float focus_category_share_score
        float observed_severity_breadth_score
        float observed_recency_score
        float v2_observed_score
        float observed_focus_need_score
        string observed_data_basis
        boolean insufficient_visit_data
        string top_key_needs
        int observed_need_rank
    }

    OBSERVED_NEED_CATEGORY_SUMMARY {
        string area_id PK, FK
        string key_need PK
        int encounter_count
        float encounter_share_pct
        int category_rank
    }

    VULNERABILITY_INDEX_V2 {
        string area_id PK, FK
        string area_name
        string borough_name
        float structural_vulnerability_index
        float immigrant_census_concern_score
        float indigenous_census_concern_score
        float mvp_focus_census_index
        float v1_demand_score
        float visit_volume_score
        float top_category_pressure_score
        float focus_category_share_score
        float severity_breadth_score
        float recency_score
        float v2_observed_score
        float observed_focus_need_score
        float vulnerability_index_v2
        float structural_weight
        float observed_weight
        boolean insufficient_visit_data
        string v2_data_basis
        string v2_top_concern
        int vulnerability_rank_v2
    }

    SERVICES_MASTER {
        string service_id PK
        string name
        string primary_category
        string service_categories
        string address
        float latitude
        float longitude
        boolean mappable
        string geocode_precision
        string area_id FK
        string borough_name
        string phone
        string website
        string email
        string hours
        string services
        string sources
        string legacy_center_id
        boolean serves_indigenous
        boolean serves_immigrant
        string gender_focus
        string age_groups
    }
```

## Relationship Notes

- `AREA_PROFILE.area_id` is the main MVP area key.
- `GAP_SCORE.area_id`, `ACCESSIBILITY.area_id`, and
  `AREA_VULNERABILITY_INDEX_REAL.area_id` join back to `AREA_PROFILE.area_id`.
- `ACCESSIBILITY` is category-level, so its practical composite key is
  `area_id + service_category`.
- Current `FLYER_EXAMPLE` stores service details denormalized for printable
  output; it does not currently store `service_id`.
- Current service-to-accessibility linkage is by `service_category`, not direct
  service ID.
- The scoring pipeline uses explicit spatial lookup tables to assign census
  tracts and service centers to MVP areas.
- `DATABASE_VISITOR_TAG` must remain k-anonymized. Rows below `k=5` should be
  suppressed or rolled up before they reach the observed index.
- `OBSERVED_NEED_CATEGORY_SUMMARY` contains the full need-category distribution;
  `OBSERVED_NEED_INDEX` contains the area-level V1 and V2 observed summaries.
- `VULNERABILITY_INDEX_V2` is implemented as an experimental planning score but
  is not yet wired into `GAP_SCORE` or the application-facing views.
- `SERVICES_MASTER` is the canonical single services table: the 211 Grand
  Montréal directory merged with the open-data social/food/library service points,
  de-duplicated (3,664 actionable organizations; park amenities and name-only
  stubs excluded), classified, and area-assigned. `service_id` is the primary key;
  `area_id` is an enforced foreign key to `AREA_PROFILE` (0 orphans). Located rows
  carry `geocode_precision` = `exact` (real building, safe as a map pin) or
  `approximate` (street/postal-centroid, good for area assignment only); rows with
  no coordinate stay searchable by name/category. `legacy_center_id` is a soft
  reference (not a foreign key) back to `DATABASE_CENTER` — it is blank for 211-only
  orgs and can hold multiple `; `-joined ids for merged twins, so Frondy's scoring
  can reconcile against it while migrating. Until it migrates, `DATABASE_CENTER` /
  `CENTER_AREA_LOOKUP` and the scores are left intact and unchanged.
- `SERVICES_MASTER.serves_indigenous`, `serves_immigrant`, `gender_focus`, and
  `age_groups` power the app's who-is-served filters. They are keyword-derived
  from each org's services text + name (classify_service_audience.py), so treat
  them as best-effort hints: group and gender are reliable, age is looser.
