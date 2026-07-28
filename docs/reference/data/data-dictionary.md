# Community Radar data dictionary

Complete reference for every dataset, table, and column in the project database,
where each one comes from, and the processing done to produce it.

The database is rebuilt from source CSVs by `scripts/data_pipeline/build_database.py`
into `data/community_radar.sqlite`, and mirrored to Supabase by
`scripts/data_pipeline/load_to_cloud.py` (the Supabase schema, keys, and views are
defined by `supabase/migrations/*.sql`).

Full per-dataset provenance (source URL, licence, download date, known limitations)
lives in `data/raw/source_metadata.csv`; this document summarizes and explains it.

---

## 1. Real vs synthetic at a glance

| Layer | Real or synthetic | Why |
| --- | --- | --- |
| Census and geography | **Real** | StatCan 2021 Census + boundary files |
| Services / organizations | **Real** | 211 directory + Montreal/Quebec open data + OpenStreetMap |
| Structural vulnerability (from census) | **Real** | computed from real census indicators |
| Committed visits / service-usage fixture | **Synthetic** | no public partner source exists for who visits which service |
| Web-observed demand | **Real, experimental** | anonymous `page_events` and `flyer_downloads`, exposure-normalized and k-anonymized |
| Observed need and V2 demand scores | **Source-dependent** | synthetic fixture until atomically replaced by a web-observed publication |
| Accessibility and gap (current MVP) | **Placeholder** | built on MVP inputs until scoring migrates to real services |
| CISV, transit | **Real (reference)** | used for validation / future use, not in the app yet |

Every chatbot answer and every table below is labelled with which of these it is.

---

## 2. Data sources

| Source | Provider | Licence | Feeds |
| --- | --- | --- | --- |
| 2021 Census profile (98-401-X2021007) | Statistics Canada | Open Government Licence – Canada | `census_tract` |
| 2021 Census tract boundaries (lct_000b21a_e) | Statistics Canada | Open Government Licence – Canada | `ct_centroid` |
| Administrative borough limits | Ville de Montreal Open Data (donnees.montreal.ca) | CC BY 4.0 | area boundaries / `area_profile` |
| Recreation installations | Ville de Montreal Open Data | CC BY 4.0 | `database_center` (recreation) |
| Cultural places (lieux culturels) | Ville de Montreal Open Data | CC BY 4.0 | `database_center` (culture) |
| Health/social facilities (M02) | Donnees Quebec / MSSS | Open Government Licence – Quebec | `database_center` (CLSC, hospitals) |
| Community/social services | OpenStreetMap (Overpass) | ODbL, © OpenStreetMap contributors | `database_center` (social) |
| Indigenous organizations (INDex) | reseaumtlnetwork.com | Research use; © contributors | `database_center` (Indigenous) |
| Food banks | Moisson Montreal network / public directories | Public directories | `database_center` (food) |
| **211 directory of social and community resources** | **211 Grand Montreal / Centraide** (montreal2-en.pdf) | **© 211 GM / Centraide, academic use only; raw PDF kept out of the repo** | **`services_master`** |
| Canadian Index of Social Vulnerability 2021 | Statistics Canada | Open Government Licence – Canada | `cisv_reference` |
| Transit stops (GTFS) | Societe de transport de Montreal (STM) | Open (STM) | `stm_stop` |
| Service usage / visits | **none — synthetic** | model-generated placeholder | `database_visitor_tag` |
| Anonymous website behavior | Community Needs Radar production application | First-party aggregate | `database_visitor_tag` web rows → observed/V2 |

---

## 3. Processing pipeline (what was done to the data)

Scripts live in `scripts/data_pipeline/` and `scripts/`. In order:

**A. Census.** `build_census_ct_variables.py` reads the StatCan 2021 bulk profile,
extracts the six vulnerability variables (low income, seniors 65+, recent
immigrants, no official language, shelter-cost burden) plus Indigenous identity
for the 1,004 Montreal census tracts, and writes `statcan_2021_montreal_ct_variables.csv`.

**B. Geography.** `build_geography.py` derives census tract centroids from the
StatCan cartographic boundary file and prepares the borough polygons;
`scripts/build_area_boundaries.py` builds the 12 stable MVP areas from the 11
official boroughs.

**C. Services (open data).** `fetch_community_services.py`, `fetch_osm_services.py`,
and `fetch_indigenous_services.py` pull the open-data service points;
`build_service_centers.py` assembles them into `database_centers.csv` (4,255
points, cross-source deduplicated), and `build_service_table.py` produces the
service-detail table.

**D. 211 directory.** `extract_211_directory.py` extracts the organizations from
the licensed 211 PDF; `geocode_211_directory.py` (+ `geocode_211_retry.py`) geocode
them for free with OpenStreetMap Nominatim, flagging each result exact or
approximate; `service_taxonomy.py` classifies each organization into the app
taxonomy from its services text; `classify_service_audience.py` tags who each
organization serves (group / gender / age); `integrate_211_directory.py` cleans
and de-duplicates into `service_directory_211.csv`.

**E. Unified services.** `build_services_master.py` merges the 211 directory with
the open-data services into `services_master` (3,664 unique organizations): it
de-duplicates cross-source overlaps, drops park amenities and empty stubs, and
assigns an `area_id` when a located organization falls within the reviewed
geography. Locations outside the 12 review areas retain a blank `area_id`.

**F. Structural vulnerability.** `build_statcan_vulnerability_index.py` scales the
census indicators to 0–100 and combines them; `aggregate_ct_to_areas.py` rolls the
census tracts up to the 12 areas, producing `area_vulnerability_index_real` and the
`area_profile`.

**G. Observed need (synthetic).** `generate_synthetic_visitor_tags.py` generates
the k-anonymized synthetic visit records (no real usage data exists);
`build_observed_need_index.py` aggregates them into the observed-need index and
category summary; `build_vulnerability_index_v2.py` combines structural + observed
into the V2 score.

**G2. Web-observed replacement.** `build_web_observed_demand.py` reads real
versioned website analytics, deduplicates and exposure-normalizes them, stores
k-anonymized area snapshots in `database_visitor_tag`, replaces the synthetic
observed materialization, and applies the same original 60/40 V2 composite.

**H. Access, gap, assembly.** The accessibility and gap tables are produced by the
processing pipeline (`src/comm_need_radar/processing/pipeline.py`);
`map_centers_to_areas.py` builds `center_area_lookup`. `build_database.py` loads
every CSV into SQLite; `load_to_cloud.py` refreshes Supabase.

---

## 4. Tables and columns

Grouping: census/geography, services, structural vulnerability, visits/observed
need (synthetic), accessibility/gap, reference, operational.

### 4.1 Census and geography (REAL)

#### `census_tract` — 1,004 rows. Source: StatCan 2021 Census.
One row per Montreal census tract; the real demographic foundation.

| Column | Type | Description |
| --- | --- | --- |
| `ct_code` | TEXT (PK) | Census tract identifier |
| `dguid` | TEXT | StatCan dissemination geography UID |
| `geo_name` | TEXT | Tract name/label |
| `population_2021` | INT | Population, 2021 Census |
| `low_income_pct` | REAL | % low income (LIM-AT) |
| `seniors_65plus_pct` | REAL | % aged 65+ |
| `recent_immigrant_pct` | REAL | % recent immigrants |
| `no_official_language_pct` | REAL | % with no knowledge of English or French |
| `shelter_cost_burden_pct` | REAL | % of households spending 30%+ of income on shelter |
| `indigenous_identity_pct` | REAL | % Indigenous identity |
| `indigenous_identity_count` | INT | Count with Indigenous identity |
| `total_indigenous_identity_universe` | INT | Denominator for the Indigenous percentage |

#### `ct_centroid` — 1,004 rows. Source: StatCan 2021 cartographic boundaries.
Map location of each census tract.

| Column | Type | Description |
| --- | --- | --- |
| `ct_code` | TEXT (PK) | Census tract identifier (FK to census_tract) |
| `dguid` | TEXT | StatCan geography UID |
| `centroid_lon` | REAL | Longitude of the tract centroid (EPSG:4326) |
| `centroid_lat` | REAL | Latitude of the tract centroid |

#### `v_ct_vulnerability` (VIEW) — 1,004 rows.
Convenience view joining `census_tract` to `ct_centroid` (tract vulnerability
indicators plus map location). Columns: `ct_code`, `geo_name`, `population_2021`,
`low_income_pct`, `recent_immigrant_pct`, `indigenous_identity_pct`,
`centroid_lat`, `centroid_lon`.

### 4.2 Services (REAL)

#### `services_master` — 3,664 rows. Source: 211 directory + open-data services. CANONICAL.
One row per real organization. Built by `build_services_master.py`.

| Column | Type | Description |
| --- | --- | --- |
| `service_id` | TEXT | Unique id (SVC_ + hash of name+location) |
| `name` | TEXT | Organization name |
| `primary_category` | TEXT | Single main category from the app taxonomy |
| `service_categories` | TEXT | All matched categories (multi-label, "; " joined) |
| `address` | TEXT | Street address (blank if confidential/none) |
| `latitude` / `longitude` | REAL | Coordinates (blank if not located) |
| `mappable` | INT/BOOL | 1 if it has usable coordinates |
| `geocode_precision` | TEXT | `exact` (real building), `approximate` (street/postal centroid), or blank |
| `area_id` | TEXT | MVP area it falls in (FK to area_profile; blank if outside/unlocated) |
| `borough_name` | TEXT | Borough of the coordinate |
| `phone` / `website` / `email` | TEXT | Contact details |
| `hours` | TEXT | Opening hours (211 orgs) |
| `services` | TEXT | Free-text description of services offered (211 orgs) |
| `sources` | TEXT | Where the record came from (`211`, `community_services`, `montreal_open_data`, `food_banks`, or combinations) |
| `legacy_center_id` | TEXT | Soft link to `database_center.center_id`(s) for the same org (not a FK) |
| `serves_indigenous` | INT/BOOL | Serves Indigenous people (keyword-derived) |
| `serves_immigrant` | INT/BOOL | Serves immigrants/newcomers (keyword-derived) |
| `gender_focus` | TEXT | `All`, `Female`, or `Male` (keyword-derived) |
| `age_groups` | TEXT | Age bands served: subset of Under 25 / 25-44 / 45-64 / 65+ |

#### `database_center` — 4,255 rows. Source: Montreal/Quebec open data + OSM + INDex + curated. LEGACY.
The earlier service-point layer (mostly recreation facilities plus social/health
points). Kept as the input to Frondy's current scoring; superseded by
`services_master` for the directory.

| Column | Type | Description |
| --- | --- | --- |
| `center_id` | TEXT (PK) | Center identifier (CTR_...) |
| `center_name` | TEXT | Facility/organization name |
| `latitude` / `longitude` | REAL | Coordinates |
| `address` | TEXT | Street address |
| `service_categories` | TEXT | Coarse category: Recreation & Sport / Library & Culture / Community & Social Services / Food Support |
| `hours` | TEXT | Opening hours where available |
| `languages` | TEXT | Languages where available |
| `indigenous_led_or_specific` | INT/BOOL | Indigenous-led or Indigenous-specific |

#### `service_table` — 4,255 rows. Source: derived from `database_center`.
Service-detail view of the centers, with provenance per record.

| Column | Type | Description |
| --- | --- | --- |
| `service_id` | TEXT (PK) | Same id as the center (FK to database_center) |
| `service_name` | TEXT | Name |
| `service_category` | TEXT | Category |
| `address` | TEXT | Address |
| `latitude` / `longitude` | REAL | Coordinates |
| `phone` / `website` | TEXT | Contact |
| `language` | TEXT | Service language |
| `source_name` | TEXT | Originating data source |
| `source_url` | TEXT | Source URL |
| `last_checked_date` | TEXT | Date the record was last verified |

#### `center_area_lookup` — 4,255 rows. Source: spatial join (map_centers_to_areas.py).
Maps each center to its MVP area (for the scoring).

| Column | Type | Description |
| --- | --- | --- |
| `center_id` | TEXT | Center id (FK to database_center) |
| `area_id` | TEXT | MVP area (FK to area_profile); blank if outside the study area |
| `borough_name` | TEXT | Borough |
| `join_method` | TEXT | How it was assigned (point-in-polygon then nearest area centroid) |

### 4.3 Areas and structural vulnerability (REAL)

#### `area_profile` — 12 rows. Source: census aggregated to areas.
One row per MVP area; the main area key used across the app.

| Column | Type | Description |
| --- | --- | --- |
| `area_id` | TEXT | MVP area id (A001..A012) |
| `area_name` | TEXT | Area name |
| `borough_name` | TEXT | Borough |
| `latitude` / `longitude` | REAL | Area centroid |
| `population` | INT | Area population (from census) |
| `income_indicator` | INT | Income-pressure indicator, 0-100 |
| `age_indicator` | INT | Age-related need indicator, 0-100 |
| `language_indicator` | INT | Language-access need indicator, 0-100 |
| `immigration_indicator` | INT | Immigrant-concentration indicator, 0-100 |
| `housing_indicator` | INT | Housing-pressure indicator, 0-100 |
| `vulnerability_score` | REAL | Overall structural vulnerability, 0-100 |
| `vulnerability_rank` | INT | Rank among the 12 areas (1 = most vulnerable) |
| `top_vulnerability_drivers` | TEXT | Main drivers of the score |

#### `area_vulnerability_index_real` — 12 rows. Source: build_statcan_vulnerability_index.py + aggregate_ct_to_areas.py.
Detailed structural vulnerability per area, with raw and scaled census inputs.

| Column | Type | Description |
| --- | --- | --- |
| `area_id`, `area_name`, `borough_name` | TEXT | Area keys |
| `low_income_pct`, `seniors_65plus_pct`, `recent_immigrant_pct`, `no_official_language_pct`, `shelter_cost_burden_pct`, `indigenous_identity_pct` | REAL | Area-level census indicators (population-weighted from tracts) |
| `population_2021` | REAL | Area population |
| `*_scaled` (six columns) | REAL | Each indicator scaled to 0-100 for combining |
| `vulnerability_index` | REAL | Combined structural vulnerability, 0-100 |
| `top_drivers` | TEXT | Highest-contributing indicators |
| `immigrant_census_concern_score` | REAL | Immigrant-focused sub-score |
| `indigenous_census_concern_score` | REAL | Indigenous-focused sub-score |
| `mvp_focus_census_index` | REAL | Combined MVP-focus census index |
| `mvp_focus_data_basis` | TEXT | Note on the data basis |
| `mvp_focus_top_concern` | TEXT | Top MVP-focus concern |
| `vulnerability_rank` | INT | Rank among the 12 areas |

#### `vulnerability_index_v2` — 12 rows. Source: build_vulnerability_index_v2.py.
Experimental combined score = structural (real census) + observed demand.
Observed provenance is explicit: the committed fixture is synthetic; a
published web-observed snapshot is real first-party behavior. Weights:
structural 0.6, observed 0.4.

| Column | Type | Description |
| --- | --- | --- |
| `area_id`, `area_name`, `borough_name` | TEXT | Area keys |
| `structural_vulnerability_index` | REAL | Real census-based layer |
| `immigrant_census_concern_score`, `indigenous_census_concern_score`, `mvp_focus_census_index` | REAL | Structural sub-scores |
| `v1_demand_score` | REAL | V1 demand (0.7 visit volume + 0.3 top-category pressure) |
| `visit_volume_score`, `top_category_pressure_score`, `focus_category_share_score`, `severity_breadth_score`, `recency_score` | REAL | Partner/fixture sub-scores; web publication uses the exposure-normalized demand score directly |
| `v2_observed_score` | REAL | Combined observed layer |
| `observed_focus_need_score` | REAL | Observed MVP-focus need |
| `vulnerability_index_v2` | REAL | Final combined score |
| `structural_weight`, `observed_weight` | REAL | Blend weights (0.6 / 0.4) |
| `insufficient_visit_data` | INT/BOOL | Flag when the selected observed source has insufficient coverage |
| `v2_data_basis` | TEXT | Data-basis note |
| `v2_top_concern` | TEXT | Top concern |
| `vulnerability_rank_v2` | INT | Rank among the 12 areas |

### 4.4 Visits and observed need

#### `database_visitor_tag` — 1,408 rows. Source: SYNTHETIC (generate_synthetic_visitor_tags.py).
Model-generated, k-anonymized visit-group records. No real service-usage data
exists publicly, so this is a clearly-labelled placeholder. Each row references a
real center id.

| Column | Type | Description |
| --- | --- | --- |
| `visit_group_id` | TEXT (PK) | Visit-group identifier |
| `center_id` | TEXT | Center visited (FK to database_center) |
| `period_start` / `period_end` | TEXT | Reporting period |
| `key_need` | TEXT | Need category (Housing & Shelter, Food Support, Mental Health, Legal Aid, Language Access, Family Services, Employment, General Support, Settlement Navigation, Indigenous Cultural Support, Indigenous-Led Referral) |
| `k_anon_count` | INT | Number of visits in the group (k-anonymized, k>=5) |
| `severity` | TEXT | Severity level |
| `population_group` | TEXT | general / immigrant_newcomer / indigenous |
| `language_need_flag` | INT/BOOL | Language help needed |
| `settlement_need_flag` | INT/BOOL | Settlement help needed |
| `indigenous_specific_need_flag` | INT/BOOL | Indigenous-specific need |
| `source_type` | TEXT | `synthetic_demonstration`, `partner_encounter`, or `web_behavior` |
| `area_id` | TEXT | Direct area for web aggregate rows |
| `weighted_demand_total` | REAL | Accumulated web-event weights; not a person count |
| `service_impression_count` | INT | Web exposure denominator |
| `intent_rate_per_100_impressions` | REAL | Exposure-normalized web demand rate |
| `digital_demand_score` | REAL | Coverage-gated web observed score, 0–100 |
| `coverage_status`, `scoring_version` | TEXT | Quality state and reproducible formula version |

#### `v_visit_needs_by_center` (VIEW) — 1,408 rows.
Joins `database_visitor_tag` to `database_center` for "visits by center" queries.
Columns: `center_id`, `center_name`, `service_categories`,
`indigenous_led_or_specific`, `key_need`, `population_group`, `k_anon_count`,
`severity`.

#### `observed_need_index` — 12 rows.
Per-area demand summary. It is built from the synthetic fixture locally and is
atomically replaced by the real web-observed pipeline when published.

| Column | Type | Description |
| --- | --- | --- |
| `area_id` | TEXT | Area (FK to area_profile) |
| `rolling_window_days` | INT | Length of the rolling window |
| `rolling_visit_count` | INT | Total visits in the window |
| `visit_volume_per_1000` | REAL | Visits per 1,000 residents |
| `observed_visit_volume_score` | REAL | Scaled visit-volume score |
| `top_need_category` | TEXT | Most common need in the area |
| `top_need_count` | INT | Visits for the top need |
| `top_need_share_pct` | REAL | Top need as % of visits |
| `top_category_rate_per_1000` | REAL | Top-need rate per 1,000 |
| `top_category_pressure_score` | REAL | Scaled top-category pressure |
| `v1_demand_score` | REAL | V1 demand (0.7 volume + 0.3 top-category pressure) |
| `data_through_date` | TEXT | Data-through date |
| `observed_immigrant_need_score`, `observed_indigenous_need_score` | REAL | Group-focused observed sub-scores |
| `focus_category_share_score`, `observed_severity_breadth_score`, `observed_recency_score` | REAL | Observed sub-scores |
| `v2_observed_score` | REAL | Combined observed score |
| `observed_focus_need_score` | REAL | Observed MVP-focus need |
| `observed_data_basis` | TEXT | Data-basis note |
| `insufficient_visit_data` | INT/BOOL | Sparse-data flag |
| `observed_data_basis` | TEXT | Explicitly labels the committed input as synthetic demonstration data; must change when an approved production export replaces it |
| `top_key_needs` | TEXT | Top needs list (used by the chatbot) |
| `observed_need_rank` | INT | Rank among the 12 areas |

#### `observed_need_category_summary`
Per-area, per-need breakdown. The committed fixture has 110 synthetic rows;
web publication atomically replaces it with variable-count, k-anonymized
`source_type=web_behavior` rows.

| Column | Type | Description |
| --- | --- | --- |
| `area_id` | TEXT | Area (FK to area_profile) |
| `key_need` | TEXT | Need category |
| `encounter_count` | INT | Visits for that need in that area |
| `encounter_share_pct` | REAL | Share of the area's visits |
| `category_rank` | INT | Rank of the need within the area |
| `weighted_demand_total` | REAL | Accumulated web-event weight; not a person count |
| `weighted_demand_share_pct` | REAL | Category share of accumulated web demand |
| `source_type` | TEXT | `web_behavior` for real published website aggregates |

### 4.5 Accessibility and gap (MVP / mixed)

#### `accessibility` — 108 rows (12 areas x 9 categories). Source: processing pipeline.
Service accessibility per area and category.

| Column | Type | Description |
| --- | --- | --- |
| `area_id` | TEXT | Area (FK to area_profile) |
| `service_category` | TEXT | Service category |
| `nearest_service_distance_km` | REAL | Distance to nearest service of that category |
| `service_count_within_threshold` | INT | Services within the distance threshold |
| `accessibility_score` | REAL | Accessibility score for the area/category |
| `accessibility_method` | TEXT | Method note |

#### `gap_score` — 12 rows. Source: processing pipeline (need vs access).
The headline gap map: high need + low access = high gap.

| Column | Type | Description |
| --- | --- | --- |
| `area_id`, `area_name`, `borough_name` | TEXT | Area keys |
| `latitude` / `longitude` | REAL | Area centroid |
| `vulnerability_score` | REAL | Need side (structural vulnerability) |
| `overall_accessibility_score` | REAL | Access side |
| `gap_score` | REAL | Combined gap |
| `gap_rank` | INT | Rank (1 = largest gap) |
| `priority_flag` | TEXT | Priority label (e.g. High priority / Watch / Lower priority) |
| `gap_drivers` | TEXT | Main drivers of the gap |
| `summary_en` / `summary_fr` | TEXT | Plain-language summary (English / French) |

### 4.6 Reference data (REAL, not used by the app yet)

#### `cisv_reference` — 5,555 rows. Source: StatCan Canadian Index of Social Vulnerability 2021.
Dissemination-area vulnerability scores, kept for validation cross-checks only
(no DA-to-CT crosswalk, so not blended). Original StatCan column names are
preserved plus a normalized key.

| Column | Type | Description |
| --- | --- | --- |
| `Dissemination Area (DA)` | INT | DA identifier (original header) |
| `Province or territory` | TEXT | Province |
| `Dimension 1..4 Scores` | REAL | The four CISV dimension scores |
| `CISV Scores` | REAL | Overall CISV score |
| `CISV Quintiles` | INT | Quintile (1-5) |
| `CISV Most Vulnerable Dimension` | TEXT | Dimension driving vulnerability |
| `da_str` | INT | Normalized DA key |

#### `stm_stop` — 9,188 rows. Source: STM GTFS.
Transit stops, for future walking/transit reachability; not used in the current
accessibility score.

| Column | Type | Description |
| --- | --- | --- |
| `stop_id` | TEXT | GTFS stop id |
| `stop_name` | TEXT | Stop name |
| `stop_lat` / `stop_lon` | REAL | Stop coordinates |

### 4.7 Operational / demo tables

#### `flyer_examples` — 20 rows.
Sample printable service-flyer rows for the V1 frontline feature (denormalized
service details). Columns: `selected_area_id`, `area_label`,
`selected_service_category`, `service_name`, `address`, `phone`, `website`,
`language`, `distance_km`, `generated_date`, `disclaimer`.

#### `monitoring_summary` — 11 rows.
Data-quality/monitoring checks. Columns: `check_name`, `status`, `value`,
`details`.

#### `role_activity_log` — 11 rows.
Team activity/collaboration log (project management, not project data). Columns:
`date`, `owner`, `role`, `activity`, `output`, `decision_or_blocker`, `next_step`.

---

## 5. Notes on provenance and honesty

- The **211 directory data is licensed** (© 211 Grand Montreal / Centraide,
  academic use). The raw PDF is kept out of the public repo (gitignored);
  `service_directory_211.csv` and the derived `services_master.csv` are committed
  processed artifacts.
- The committed **visit / usage fixture is synthetic**. A reviewed web-observed
  publication replaces the observed materializations with
  `source_type=web_behavior` aggregates; synthetic and web records are explicitly
  labelled and never blended.
- **Accessibility and gap** currently run on the earlier `database_center`
  inputs. Migrating them onto the reviewed, normalized `services_master`
  contract is a separate future decision; `area_id` is present only when a
  service falls within the current review geography.
- Coordinates for the 211 organizations were geocoded free with OpenStreetMap and
  quality-filtered; `geocode_precision` distinguishes exact from approximate.
