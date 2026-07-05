# Laura Data Request — Real Vulnerability Index

Owner requesting data: Frondy  
Data owner: Laura  
Date: 2026-06-23  
Purpose: let Frondy build the real immigrant/Indigenous MVP vulnerability index
and the v2 observed-needs index.

## Delivery Status — 2026-06-23 (Laura)

| Priority | Item | Status |
| --- | --- | --- |
| P1 | `indigenous_identity_pct` (+ `indigenous_identity_count`, `total_indigenous_identity_universe`) added to the census file | ✅ Delivered — 986/1004 CTs populated, 18 blank where suppressed; existing columns byte-for-byte unchanged |
| P2 | `ct_centroids_montreal.csv`, `montreal_boroughs.geojson` | ✅ Already present and used by `aggregate_ct_to_areas.py` |
| P3 | `database_centers.csv` | ✅ Delivered — 3,699 real service points; 24 flagged `indigenous_led_or_specific` |
| P4 | `database_visitor_tags.csv` | 🟡 SYNTHETIC stand-in — 1,408 k-anonymized (k>=5) rows across the 679 real social centers (`generate_synthetic_visitor_tags.py`), grounded in real `center_id`s so the observed index can be built. Replace with a real partner export when available. |
| P5 | `source_metadata.csv` | ✅ Delivered — provenance for every dataset above |

Verified end-to-end: `build_statcan_vulnerability_index.py` + `aggregate_ct_to_areas.py`
now produce `mvp_focus_data_basis = immigrant_and_indigenous_census` across all 12 MVP
areas, and `python -m pytest tests/` passes (8/8).

## Immediate Need

The census layer now supports immigrant and Indigenous focus columns, but the
current raw StatCan extract is missing `indigenous_identity_pct`. Because of
that, the real processed output currently says:

```text
mvp_focus_data_basis = immigrant_census_only_indigenous_missing
```

Frondy can calculate the immigrant concern score now. To calculate the complete
MVP focus index, Laura needs to provide the missing Indigenous census field and
the observed frontline/service datasets listed below.

## Priority 1 — Census Fields

File target:

```text
data/raw/statcan_2021_montreal_ct_variables.csv
```

Current grain:

```text
one row per census tract
```

Required existing fields:

| Field | Status | Used for |
| --- | --- | --- |
| `ct_code` | present | census tract key |
| `dguid` | present | StatCan geography key |
| `geo_name` | present | readable geography label |
| `population_2021` | present | weighted aggregation and observed-rate denominator |
| `low_income_pct` | present | general structural vulnerability |
| `seniors_65plus_pct` | present | general structural vulnerability |
| `recent_immigrant_pct` | present | immigrant concern score |
| `no_official_language_pct` | present | immigrant/language concern score |
| `shelter_cost_burden_pct` | present | general structural vulnerability |

Required missing field:

| Field | Required | Definition | Why Frondy needs it |
| --- | --- | --- | --- |
| `indigenous_identity_pct` | yes | Percent of population reporting Indigenous identity | Completes `indigenous_census_concern_score` and prevents the MVP focus index from being immigrant-only. |

Optional sensitivity fields:

| Field | Definition | Why useful |
| --- | --- | --- |
| `indigenous_identity_count` | Count of residents reporting Indigenous identity | Lets Frondy QA percentages and avoid over-interpreting tiny denominators. |
| `total_indigenous_identity_universe` | Denominator used for the percentage | Confirms whether denominator matches total population or a specific census universe. |
| `recent_immigrant_count` | Count of recent immigrants | QA for `recent_immigrant_pct`. |
| `no_official_language_count` | Count with no English/French knowledge | QA for `no_official_language_pct`. |

Acceptance criteria:

- File still has 1 row per census tract.
- Existing columns remain unchanged.
- `indigenous_identity_pct` is numeric or blank when suppressed.
- Laura documents suppressed/missing values.
- Frondy can run:

```bash
python3 scripts/build_statcan_vulnerability_index.py
.venv/bin/python scripts/aggregate_ct_to_areas.py
```

Expected output after this data arrives:

```text
indigenous_census_concern_score = populated
mvp_focus_data_basis = immigrant_and_indigenous_census
```

## Priority 2 — Geography Join Inputs

Frondy needs stable geography files so CTs, centers, and MVP areas can join
cleanly.

Required files:

| File | Required fields | Why needed |
| --- | --- | --- |
| `data/raw/boundaries/ct_centroids_montreal.csv` | `ct_code`, `dguid`, `centroid_lon`, `centroid_lat` | Assign CT data to boroughs/MVP areas. |
| `data/raw/boundaries/montreal_boroughs.geojson` | official borough name, polygon geometry | Current real aggregation target. |
| future real area boundary GeoJSON | `area_id`, `area_name`, polygon geometry | Replace synthetic frontend polygons and avoid borough-level approximation. |

Important QA note:

- CT keys must be normalized consistently. The repo now handles `4620001` and
  `4620001.00`, but Laura should still preserve both `ct_code` and `dguid` where
  possible.

## Priority 3 — Service Center Data

File target:

```text
data/raw/database_centers.csv
```

Grain:

```text
one row per center/service provider location
```

Required fields:

| Field | Required | Why Frondy needs it |
| --- | --- | --- |
| `center_id` | yes | Join key from visitor records to center location. |
| `center_name` | yes | Dashboard label and QA. |
| `latitude` | yes | Spatial join to `area_id`. |
| `longitude` | yes | Spatial join to `area_id`. |
| `address` | recommended | QA and handout display. |
| `service_categories` | recommended | Compare needs to service availability. |
| `hours` | optional | Future capacity/access adjustment. |
| `languages` | recommended | Immigrant/language-access analysis. |
| `indigenous_led_or_specific` | recommended | Identifies Indigenous-led or Indigenous-specific service capacity. |

Acceptance criteria:

- Every row has a stable `center_id`.
- Coordinates are valid WGS84 lat/lon.
- Coordinates fall inside the Greater Montreal study area.
- No personal visitor data is included in this file.

## Priority 4 — Visitor / Observed Need Tags

File target:

```text
data/raw/database_visitor_tags.csv
```

Grain:

```text
k-anonymized aggregate record, not person-level raw data
```

Required fields:

| Field | Required | Why Frondy needs it |
| --- | --- | --- |
| `visit_group_id` | yes | Stable aggregate row ID. |
| `center_id` | yes | Join observed needs to area through `database_centers.csv`. |
| `period_start` | yes | Rolling-window calculation. |
| `period_end` | yes | Rolling-window calculation. |
| `key_need` | yes | Key Needs Ranking and observed index. |
| `k_anon_count` | yes | Visit volume, privacy floor, and rates. |
| `severity` | recommended | Need severity component. |
| `population_group` | recommended | Should allow `immigrant_newcomer`, `indigenous`, `general`, or blank/unknown. |
| `language_need_flag` | recommended | Immigrant/language observed score. |
| `settlement_need_flag` | recommended | Newcomer observed score. |
| `indigenous_specific_need_flag` | recommended | Indigenous observed score without person-level disclosure. |

Privacy requirements:

- Do not provide person-level raw visitor records.
- Every row must satisfy `k_anon_count >= 5`.
- If a group/need/location/time bucket has fewer than 5 records, suppress or
  roll it up before sharing.
- Do not include names, phone numbers, exact birthdates, case notes, free-text
  narratives, or immigration/legal status details.

Recommended `key_need` values:

```text
Housing & Shelter
Mental Health
Health & Wellness
Food Support
Employment
Legal Aid
Settlement Navigation
Language Access
Indigenous Cultural Support
Indigenous-Led Referral
Family Services
General Support
```

## Priority 5 — Metadata / Provenance

Laura should provide one small metadata file for every dataset delivered.

File target:

```text
data/raw/source_metadata.csv
```

Required fields:

| Field | Meaning |
| --- | --- |
| `dataset_name` | Source file name |
| `source_url` | Where it came from |
| `downloaded_by` | Person who downloaded/exported it |
| `downloaded_date` | Date obtained |
| `license_or_use_note` | Usage constraints |
| `geography_level` | CT, borough, center, area, aggregate visit group |
| `known_limitations` | Missingness, suppression, approximation notes |

## Minimum Package For Frondy To Start

Laura can unblock Frondy with this smallest useful package:

1. Updated `statcan_2021_montreal_ct_variables.csv` including
   `indigenous_identity_pct`.
2. Confirmed `ct_code`/`dguid` key format.
3. `database_centers.csv` with `center_id`, lat/lon, and service categories.
4. K-anonymized `database_visitor_tags.csv` with `center_id`, `key_need`,
   `k_anon_count`, and date window.

With those four items, Frondy can build:

- `indigenous_census_concern_score`
- complete `mvp_focus_census_index`
- `center_id -> area_id` spatial lookup
- `observed_need_index.csv`
- future `vulnerability_index_v2`

## Open Questions For Laura

- Can the StatCan extract include Indigenous identity at the same CT grain, or is
  suppression too high?
- Should Indigenous observed needs be represented through
  `population_group = indigenous`, through Indigenous-specific need tags, or both?
- What time window should the observed index use first: trailing 30, 90, or 180
  days?
- Are center/service coordinates approved for public map display?
- Are any visitor aggregates restricted from being shown in a public demo even
  after k-anonymization?
