# Data Inventory — Community Needs Radar

A complete breakdown of every dataset obtained for the project: what it is, where
it comes from, its licence, grain, size, key fields, and limitations. All data is
public and openly licensed except where noted. Study area: the **Montréal Census
Metropolitan Area (CMA 462)**, 2021 vintage.

Reproduce everything with `scripts/data_pipeline/` (see its README). Provenance for
each file is also machine-readable in `data/raw/source_metadata.csv`.

---

## 1. Census & vulnerability

### `data/raw/statcan_2021_montreal_ct_variables.csv`
- **Source:** Statistics Canada, 2021 Census Profile, catalogue **98-401-X2021007**.
- **Licence:** Open Government Licence – Canada.
- **Grain / size:** one row per census tract · **1,004 CTs**.
- **Key fields:** `ct_code`, `dguid`, `geo_name`, `population_2021`, `low_income_pct`,
  `seniors_65plus_pct`, `recent_immigrant_pct`, `no_official_language_pct`,
  `shelter_cost_burden_pct`, `indigenous_identity_pct` (+ count + universe).
- **Characteristics:** the 5 locked vulnerability variables (income, age,
  immigration, language, housing) from `docs/census-variable-dictionary.md`, plus the
  immigrant/Indigenous MVP-focus inputs.
- **Limitations:** Indigenous identity populated for **986/1,004** CTs (18 suppressed
  by StatCan for confidentiality). Values are base-5 rounded by StatCan.

### `data/processed/cisv_reference_montreal.csv`
- **Source:** Canadian Index of Social Vulnerability (CISV), 2021 — Statistics Canada.
- **Licence:** Open Government Licence – Canada.
- **Grain / size:** one row per dissemination area · **5,555 DAs**.
- **Characteristics:** an externally-built vulnerability index (4 dimensions + overall
  score + quintile). Used as an **independent validation cross-check** of our
  census-based index.
- **Limitations:** DA-level; not blended into the index (no DA→CT crosswalk bundled).

---

## 2. Geography

### `data/raw/boundaries/ct_centroids_montreal.csv`
- **Source:** StatCan 2021 cartographic CT boundary file (`lct_000b21a_e`).
- **Licence:** Open Government Licence – Canada.
- **Grain / size:** one row per CT · **1,004 centroids** (`ct_code, dguid, centroid_lon, centroid_lat`, EPSG:4326).
- **Use:** assigns each CT to a borough / MVP area (spatial join).

### `data/raw/boundaries/montreal_boroughs.geojson`
- **Source:** Ville de Montréal Open Data — administrative boundaries.
- **Licence:** CC BY 4.0.
- **Grain / size:** **11 boroughs** (polygon + `NOM`).
- **Use:** aggregation target for the 12 MVP areas.

---

## 3. Service locations (`data/raw/database_centers.csv` — 4,255 centers)

Unified schema: `center_id, center_name, latitude, longitude, address,
service_categories, hours, languages, indigenous_led_or_specific`.

| Category | Count | Source(s) | Licence |
|---|--:|---|---|
| Recreation & Sport | 3,476 | Ville de Montréal — *Installations récréatives* (shapefile) | CC BY 4.0 |
| Community & Social Services | 653 | MSSS M02 (215) + OpenStreetMap (412) + curated (36) + INDex (24) | mixed |
| Library & Culture | 100 | Ville de Montréal — *Lieux culturels* | CC BY 4.0 |
| Food Support | 26 | Moisson Montréal network (curated) + OSM | public/ODbL |

### Underlying service sources (`data/raw/service_sources/`)
| File | Rows | Source | Notes |
|---|--:|---|---|
| `lieux_culturels.csv` | 100 | Ville de Montréal | Libraries, maisons de la culture, museums |
| `installations_recreatives_shp.zip` | 3,476 | Ville de Montréal | Parks, pools, rinks, playgrounds (point geometry) |
| `msss_montreal.csv` | 215 | MSSS M02 (Données Québec) | CLSCs, hospitals, psychiatric, addiction, youth, disability |
| `osm_social_services.csv` | 412 | OpenStreetMap (Overpass) | Community centres, shelters, outreach, charities, food banks (ODbL) |
| `community_services_curated.csv` | 36 | Public directories | Shelters, newcomer, women's/youth services — coords approximate |
| `indigenous_services_index.csv` | 42 (24 geocoded) | INDex (reseaumtlnetwork.com) | Indigenous orgs; 18 confidential/no street address |
| `foodbanks_montreal.csv` | 12 | Moisson Montréal network | Curated fallback (no open export) |

**Dedup:** exact (same name + ~1 m) for all categories, plus coincident (~11 m)
within the social categories to merge the same facility listed by multiple sources.
**Indigenous-led/specific:** 23 centers flagged.

### `data/processed/service_table_real.csv`
- The 4,255 centers re-shaped to the `docs/interfaces.md` service-table contract
  (real counterpart to the synthetic `service_table.csv`).

**Service-layer limitations:** ~82% of points are recreation/sport (activity proxies,
not social services). True social services number **679** — strong for open data, but
the *preferred* 211 directory is unavailable (see `docs/211-data-request.md`). OSM
coverage/tagging is crowd-sourced and uneven; curated/INDex coordinates are
street-level approximate.

---

## 4. Transit

### `data/processed/stm_stops.csv`
- **Source:** STM GTFS feed.
- **Licence:** Open (STM).
- **Grain / size:** **9,188 stops** (`stop_id, stop_name, stop_lat, stop_lon`).
- **Use:** reserved for future walking/transit reachability zones (proposal stretch
  goal). **Not yet used** in the distance-based accessibility score.

---

## 5. Provenance & contracts

| File | Purpose |
|---|---|
| `data/raw/source_metadata.csv` | Machine-readable provenance/licence/limitations for every dataset (incl. the verified 211 gap) |
| `data/raw/database_visitor_tags.csv` | **SYNTHETIC** k-anonymized observed-need data (1,408 rows across the 679 real social centers) — grounded in real `center_id`s so the v2 observed index can be built. No public source exists; replace with a real partner export when available. |

---

## 6. Known gaps (documented, not oversights)

| Gap | Why | Path |
|---|---|---|
| **211 Quebec directory** | Not open data; site blocks scraping; licence-gated | Email request — `docs/211-data-request.md` |
| **Observed/visitor needs** | Privacy-protected; no public source | **Synthetic stand-in in place** (`database_visitor_tags.csv`); swap in a real partner export when available |
| **Travel-time accessibility** | A computation, not missing data | Build a routing engine over `stm_stops.csv` |

---

## 7. More data worth adding (future enrichment)

Grouped by theme, with relevance and obtainability.

### Vulnerability depth (census / StatCan — OGL, easy)
- **Visible-minority %, mother-tongue, dwelling needing major repair, mobility/disability** — extra CISV-style dimensions already in 98-401-X2021007.
- **2016 Census** equivalents → **temporal vulnerability trends** (the proposal's "temporal trends" item).
- **Dissemination-area (DA) census** → finer granularity than CT for hotspots.

### Service access (mostly open data)
- **211 Grand Montréal** (request) — the priority enrichment for social services.
- **Childcare / CPE** (Ministère de la Famille open data) — early-childhood access.
- **Schools** (Quebec education open data) and **public libraries** (have culture).
- **Pharmacies & GMFs** (health access beyond CLSCs/hospitals).
- **Employment centres** — Services Québec / Carrefours jeunesse-emploi.
- **Social/affordable housing (HLM, OMHM)** locations.
- **Community fridges / collective kitchens** (food security depth).

### Demand / unmet-need signals
- **Montréal 311 service requests** (open data) — proxy for neighbourhood issues/unmet needs.
- **SPVM crime/safety data** (open data) — neighbourhood safety dimension.
- **Eviction / housing-pressure indicators** (TAL data where available).

### Accessibility realism
- **GTFS travel-time engine** (we have stops) → 15/30/45-min reachability zones.
- **BIXI stations** and **metro entrances** — micro-mobility access.
- **Pedestrian network / WalkScore** — walkability weighting.

### Equity / governance
- **Newcomer settlement services** (IRCC-funded) — newcomer focus.
- **Digital-access / broadband** indicators — relevant for hard-to-reach residents.

> Highest leverage next steps: (1) the 211 request, (2) childcare + housing + 311 as
> open-data social layers, (3) the GTFS reachability engine.

---

## 8. The database

All of the above is loaded into a single database so the team queries one shared,
consistent source instead of passing CSVs around. It is **regenerable from the
committed CSVs** (the CSVs remain the source of truth).

- **Local:** `data/community_radar.sqlite` — built by `scripts/data_pipeline/build_database.py`
  (free, file-based, no server). 18 tables with primary keys, foreign keys, indexes,
  and views; **0 foreign-key violations**.
- **Shared (cloud):** a free **Supabase** Postgres instance loaded by
  `scripts/data_pipeline/load_to_cloud.py`. The whole team queries it in the browser
  (Table editor / SQL editor) or via any Postgres client. Setup: `docs/shared-database-setup.md`.

### What's in it — 18 tables

**Inputs (raw material):**

| Table | Rows | Holds |
|-------|-----:|-------|
| `census_tract` | 1,004 | Vulnerability indicators per CT (income, age, immigration, language, housing, Indigenous) |
| `ct_centroid` | 1,004 | CT locations for mapping / area joins |
| `database_center` | 4,255 | Every service location |
| `database_visitor_tag` | 1,408 | Observed needs per centre — **synthetic** (no real source yet) |
| `cisv_reference` | 5,555 | External vulnerability index (validation) |
| `stm_stop` | 9,188 | Transit stops (future reachability) |

**Results (analysis outputs):**

| Table | Answers |
|-------|---------|
| `area_vulnerability_index_real`, `area_profile` | How vulnerable is each MVP area? |
| `accessibility`, `service_table` | How well-served is each area? |
| `gap_score` | Which areas are top priority (high need + low access)? |
| `observed_need_index`, `observed_need_category_summary` | What are people actually asking for? |
| `vulnerability_index_v2` | Combined structural + observed picture |
| `center_area_lookup`, `flyer_examples`, `monitoring_summary`, `role_activity_log` | Joins, handout rows, project tracking |

### Views
- `v_visit_needs_by_center` — observed needs joined to their service centre.
- `v_ct_vulnerability` — census tracts joined to their centroids.

The database is the **data layer**: the scoring scripts and the Streamlit dashboard
read from it; it stores every input and every computed result the project needs.
