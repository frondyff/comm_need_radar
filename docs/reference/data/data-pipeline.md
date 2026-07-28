# Real-data pipeline

Reproducible extraction + processing that replaces the synthetic MVP inputs with
real Greater-Montreal public data, in the exact schemas the team contract expects
(`docs/archive/data-requirements.md`, `docs/reference/data/interfaces.md`, `docs/archive/laura-data-request-real-index.md`).
Owner: Laura (data engineering). It produces the raw inputs consumed by the
versioned scoring pipeline. Formula definitions live in
[`production-scoring-contract.md`](../scoring/production-scoring-contract.md).

## What it produces

| Output | Built by | Grain |
|--------|----------|-------|
| `data/raw/statcan_2021_montreal_ct_variables.csv` | `build_census_ct_variables.py` | census tract |
| `data/raw/boundaries/ct_centroids_montreal.csv` | `build_geography.py` | census tract |
| `data/raw/boundaries/montreal_boroughs.geojson` | `build_geography.py` | borough (11) |
| `data/raw/database_centers.csv` | `build_service_centers.py` | service location |
| `data/processed/services_master.csv` | `build_services_master.py` | organization (3,664, canonical) |
| `data/processed/service_table_real.csv` | `build_service_table.py` | service location |
| `data/processed/cisv_reference_montreal.csv` | `build_cisv_reference.py` | dissemination area |
| `data/processed/stm_stops.csv` | `build_transit_stops.py` | transit stop |
| `data/raw/source_metadata.csv` | (committed) | dataset |
| `frontend/public/geo/areas.geojson` | `scripts/build_area_boundaries.py` | project area (12) |
| `data/processed/spatial_join_*.csv` | `scripts/validate_spatial_joins.py` | QA result / issue |

Service sources are fetched by `fetch_community_services.py` (MSSS health/social
facilities), `fetch_osm_services.py` (OpenStreetMap social facilities), and
`fetch_indigenous_services.py` (INDex Indigenous directory).

The licensed 211 Grand Montréal directory is added by `extract_211_directory.py`,
geocoded by `geocode_211_directory.py` (+ `geocode_211_retry.py`), classified by
`service_taxonomy.py` (category) and `classify_service_audience.py` (audience), and
merged with the open-data services into `services_master` (3,664 deduplicated
organizations) by `build_services_master.py`. `services_master` is the canonical
service directory used by the app, the maps, and the chatbot.

## Inputs

- **`data/raw/_sources/`** — large downloadable files (**gitignored**), fetched by
  `download_sources.py`: the StatCan Census Profile bulk file, the cartographic CT
  boundary file, and Montreal administrative boundaries.
- **`data/raw/service_sources/`** — small, committed service inputs: cultural
  venues + recreation shapefile (Ville de Montreal Open Data), CLSCs (MSSS M02),
  curated shelters/newcomer/food-bank lists, and the geocoded INDex Indigenous
  directory. The CLSC and INDex CSVs are refreshed by `fetch_community_services.py`
  and `fetch_indigenous_services.py`.

## Run order

```bash
# 1. (optional) refresh service CSVs
python scripts/data_pipeline/fetch_community_services.py
python scripts/data_pipeline/fetch_indigenous_services.py

# 2. download the large sources (into data/raw/_sources/, gitignored)
python scripts/data_pipeline/download_sources.py

# 3. build the real raw data
python scripts/data_pipeline/build_census_ct_variables.py
python scripts/data_pipeline/build_geography.py
python scripts/data_pipeline/build_service_centers.py

# 4. build the real processed service table
python scripts/data_pipeline/build_service_table.py

# 4a. add the licensed 211 directory and merge into the canonical services table
python scripts/data_pipeline/extract_211_directory.py
python scripts/data_pipeline/geocode_211_directory.py
python scripts/data_pipeline/build_services_master.py   # -> services_master (3,664 orgs)

# 4b. CISV validation reference + transit stops + SYNTHETIC observed-need data
python scripts/data_pipeline/build_cisv_reference.py
python scripts/data_pipeline/build_transit_stops.py
python scripts/data_pipeline/generate_synthetic_visitor_tags.py   # synthetic (no real source)

# 5. build the real structural inputs
python scripts/build_statcan_vulnerability_index.py
python scripts/aggregate_ct_to_areas.py

# 5b. build stable frontend polygons and validate all spatial joins
python scripts/build_area_boundaries.py
python scripts/map_centers_to_areas.py
python scripts/validate_spatial_joins.py

# 5c. build candidate STRUCT-01 / ACCESS-REAL-02 / GAP-CANON-02 artifacts
python scripts/build_processed_data.py
python scripts/compare_scoring_contracts.py

# 6. (optional) load everything into a single SQLite database
python scripts/data_pipeline/build_database.py   # -> data/community_radar.sqlite
```

## SQLite database

`build_database.py` loads its declared core and auxiliary project tables into
`data/community_radar.sqlite` (free, file-based, no server), adding the primary
keys, foreign keys, indexes, and views defined by the builder. It is
**regenerable** (gitignored) — the CSVs are the source of truth. Query it with
any SQLite client, or:

```python
import sqlite3, pandas as pd
con = sqlite3.connect("data/community_radar.sqlite")
pd.read_sql("SELECT * FROM v_visit_needs_by_center WHERE indigenous_led_or_specific=1", con)
```

Tables: `census_tract`, `ct_centroid`, `services_master`, `database_center`,
`database_visitor_tag`, `service_table`, `cisv_reference`, `stm_stop`, plus the MVP
area tables (`area_profile`, `gap_score`, `accessibility`,
`area_vulnerability_index_real`).

`build_*` scripts read sources from `$SOURCES_DIR` (default `data/raw/_sources`).
The committed real data files are canonical; the scripts reproduce them
value-for-value (verified) so any teammate can regenerate them from public sources.

## Coverage

- **1,004** Montreal CMA census tracts (986 with Indigenous identity; 18 suppressed).
- **3,664** organizations in `services_master`, the canonical directory used by the
  app, maps, and chatbot: the licensed 211 Grand Montréal directory merged and
  de-duplicated with the open-data services below. Of these, 3,200 are mappable
  and 1,676 currently fall within one of the 12 review areas.
- **4,255** service centers (the earlier open-data centre layer, retained for
  compatibility and historical analysis): 3,476 recreation · 100 cultural ·
  **653 community/social** (MSSS facilities, OpenStreetMap, curated
  shelters/newcomer/women's-youth, and Indigenous-led INDex orgs) · 26 food banks.
- **5,555** dissemination areas of CISV (validation reference).
- **9,188** STM transit stops (for future reachability zones).
