# Data Extraction, Sources, and Processing

The data-engineering work for Community Needs Radar (owner: Laura): the datasets,
their sources, the processing, and how it supports the V1 and V2 scoring.

> The public service directory used by the app, maps, and chatbot is
> `services_master` (3,664 deduplicated organizations), which merges the licensed
> 211 Grand Montréal directory with the open-data service sources. "V1" and "V2"
> below refer to the scoring layers (`v1_demand_score` and `vulnerability_index_v2`),
> not the product's V1 Community View and V2 Planner View.

## Does the database have everything needed for V1 and V2? — Yes

- **V1 (frontline demand)** is built from `database_center` + `database_visitor_tag`
  → `center_area_lookup` → `observed_need_index`. **All 12 MVP areas have a
  `v1_demand_score` (0 missing).**
- **V2 (composite vulnerability)** = `0.6 × structural (area_vulnerability_index_real)`
  + `0.4 × observed (observed_need_index)` → `vulnerability_index_v2`. **All 12 areas
  have a V2 score (0 missing).**

Every input and output table for both layers is present and populated. The only
caveat: the visitor data feeding the observed (V1/V2) layer is **synthetic** (no
public source exists yet); it is clearly labelled and swappable for real data.

## 1. Data and sources

| Dataset | Source | Licence | Table |
|---|---|---|---|
| Census vulnerability (1,004 CTs) | Statistics Canada 2021 Census Profile (98-401-X2021007) | OGL–Canada | `census_tract` |
| CT centroids (1,004) | StatCan 2021 CT boundary file | OGL–Canada | `ct_centroid` |
| Boroughs (11) | Ville de Montréal Open Data | CC BY 4.0 | `montreal_boroughs.geojson` *(file — used for spatial joins, not a DB table)* |
| **Services — 4,255** | **7 sources (below, all merged into one table)** | mixed | `database_center` |
| · Cultural venues (100) | Ville de Montréal — Lieux culturels | CC BY 4.0 | → `database_center` |
| · Recreation/sport (3,476) | Ville de Montréal — Installations récréatives | CC BY 4.0 | → `database_center` |
| · Health/social facilities (215) | MSSS M02 (Données Québec) | OGL–Québec | → `database_center` |
| · Social facilities (412) | OpenStreetMap (Overpass) | ODbL | → `database_center` |
| · Indigenous orgs (24) | INDex / Réseau Montréal (scraped + geocoded) | research use | → `database_center` |
| · Shelters + food banks (48) | Curated public directories | public | → `database_center` |
| **211 directory** | **211 Grand Montréal / Centraide** (licensed PDF, kept out of the repo) | © 211 GM / Centraide, academic use | **`services_master`** |
| CISV validation (5,555 DAs) | StatCan Canadian Index of Social Vulnerability 2021 | OGL–Canada | `cisv_reference` |
| Transit stops (9,188) | STM GTFS | open | `stm_stop` |
| Visitor / observed needs (1,408) | **Synthetic** (no public source) | model-generated | `database_visitor_tag` |

`services_master` (3,664 organizations) is the canonical, deduplicated service
directory used by V1, the maps, and the chatbot: it merges the 211 directory with
the open-data services above. `database_center` (4,255) is the earlier open-data
centre layer, retained as the input to the current accessibility and gap scoring.

## 2. Processing done

- **Extraction:** a reproducible pipeline (`scripts/data_pipeline/`) that downloads
  and parses every source into the team's exact schemas.
- **211 integration:** `extract_211_directory.py` parses the licensed 211 PDF;
  `geocode_211_directory.py` (+ `geocode_211_retry.py`) geocodes it free with
  OpenStreetMap Nominatim; `service_taxonomy.py` and `classify_service_audience.py`
  classify each organization's category and audience; `build_services_master.py`
  merges and de-duplicates it with the open-data services into `services_master`.
- **Cleaning:** fixed French text encoding, normalised all services to one unified
  schema, geocoded addresses (OpenStreetMap Nominatim), validated coordinates to the
  Montréal bounding box, and de-duplicated across sources.
- **Integration:** spatial joins — census tracts → MVP areas, and service centres →
  areas (`center_area_lookup`).
- **Synthetic fill:** generated k-anonymized (k≥5) visitor records grounded in the
  real centres, so V1/V2 could be built despite having no real visitor source.
- **Scoring inputs:** delivered the raw schemas Frondy's structural + observed/V1/V2
  pipeline consumes — verified consistent (32/32 tests pass, ERD-aligned, 0
  foreign-key violations).
- **Database:** loaded all 18 tables + 2 views into a local **SQLite**
  (`data/community_radar.sqlite`) and a shared **Supabase** cloud database the whole
  team can query.

## 3. What it produces

Vulnerability index → service accessibility → **gap score / priority areas**, plus
the observed-need (V1 demand) and composite (V2) layers. See `docs/reference/data/DATA_INVENTORY.md`
for the full table-by-table breakdown and `docs/reference/operations/shared-database-setup.md` for team
access.

## Reproduce

```bash
python scripts/data_pipeline/download_sources.py          # large public sources
python scripts/data_pipeline/build_census_ct_variables.py
python scripts/data_pipeline/build_geography.py
python scripts/data_pipeline/build_service_centers.py
python scripts/data_pipeline/build_services_master.py     # 211 + open data -> services_master (3,664)
python scripts/data_pipeline/generate_synthetic_visitor_tags.py
python scripts/data_pipeline/build_database.py            # -> SQLite (18 tables + views)
python scripts/data_pipeline/load_to_cloud.py             # -> shared Supabase
```
