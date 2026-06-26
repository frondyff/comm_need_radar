# Scoring And Metrics Guide

Owner: Frondy (geospatial / analytics lead)  
Last updated: 2026-06-26  
Source of truth: `src/comm_need_radar/scoring/metrics.py`

This document explains every scoring function used in the pipeline, the
formulas behind them, and how they connect into the final outputs. All scores
are in the range **0–100** unless noted.

---

## 1. Overall Pipeline

```mermaid
flowchart TD
    subgraph RAW["Raw inputs"]
        SYNTH["synthetic_area_profiles.csv\n(income/age/language/immigration/housing indicators)"]
        STATCAN["statcan_2021_montreal_ct_variables.csv\n(census tract: low_income, seniors, immigrant, language, shelter)"]
        SERVICES["synthetic_services.csv\n(lat/lon per service category)"]
        CENTERS["database_centers.csv\n(center lat/lon) — awaiting Laura"]
        VISITS["database_visitor_tags.csv\n(k-anonymized aggregates) — awaiting Laura"]
    end

    subgraph SCORING["Scoring layer  ·  metrics.py"]
        VS["vulnerability_score()\naverage of 5 synthetic indicators"]
        ACC["accessibility_score()\ndistance + count within 2.5 km"]
        GS["gap_score()\nvulnerability × access_deficit / 100"]
        PF["priority_flag()\n≥45 High · ≥28 Watch · else Lower"]
        CENSUS["min_max_scale() + CISV equal-weight average\n→ vulnerability_index (real census)"]
        IMM["immigrant_census_concern_score\naverage(recent_immigrant_scaled, no_lang_scaled)"]
        INDIG["indigenous_census_concern_score\nindigenous_identity_pct_scaled — missing until Laura"]
        FOCUS["mvp_focus_census_index\naverage(immigrant_score [+ indigenous_score])"]
        OBS["observed_focus_need_score()\naverage(immigrant_need, severity_breadth, recency [+ indigenous_need])"]
        COMP["composite_vulnerability_index()\n0.6 × structural + 0.4 × observed"]
    end

    subgraph OUT["Processed outputs"]
        AP["area_profile.csv"]
        AT["accessibility_table.csv"]
        GT["gap_score_table.csv\n(uses real census vulnerability_index)"]
        REAL["area_vulnerability_index_real.csv"]
        OI["observed_need_index.csv"]
        V2["vulnerability_index_v2.csv"]
    end

    SYNTH --> VS --> AP
    SYNTH --> GS
    SERVICES --> ACC --> AT
    ACC --> GS --> GT
    GS --> PF --> GT
    STATCAN --> CENSUS --> REAL
    CENSUS --> IMM --> FOCUS
    CENSUS --> INDIG --> FOCUS
    FOCUS --> REAL
    REAL --> GT

    CENTERS --> OBS
    VISITS --> OBS --> OI
    FOCUS --> COMP
    OBS --> COMP --> V2
```

---

## 2. Synthetic Vulnerability Score

Used in `area_profile.csv`. Replaced by the real census index in
`gap_score_table.csv` when `area_vulnerability_index_real.csv` is present.

```mermaid
flowchart LR
    I1["income_indicator"] --> AVG
    I2["age_indicator"] --> AVG
    I3["language_indicator"] --> AVG
    I4["immigration_indicator"] --> AVG
    I5["housing_indicator"] --> AVG
    AVG["average\n0–100 each"] --> VS["vulnerability_score\n0–100"]
    VS --> TD["top_drivers\ntop 3 indicators by value"]
```

**Formula:**

```
vulnerability_score = average(income, age, language, immigration, housing)
top_drivers         = top 3 indicator labels sorted descending
```

---

## 3. Haversine Distance And Accessibility Score

```mermaid
flowchart LR
    A["area centroid\n(lat, lon)"] --> HAV["haversine_km()\ngreat-circle distance"]
    S["service location\n(lat, lon)"] --> HAV
    HAV --> D["nearest_distance_km"]
    HAV --> C["service_count\nwithin 2.5 km"]

    D --> DC["distance_component\nmax(0, 100 − distance/2.5 × 70)"]
    C --> CC["count_component\nmin(count, 5) × 6"]
    DC --> AS["accessibility_score\nmin(100, distance_component + count_component)"]
    CC --> AS
```

**Formula:**

```
distance_component = max(0,  100 − (nearest_km / 2.5) × 70)
count_component    = min(service_count_within_2.5km, 5) × 6
accessibility_score = min(100, distance_component + count_component)
```

| Nearest service | Count within 2.5 km | Score |
|----------------:|--------------------:|------:|
| 0 km (at door)  | 5+                  | 100   |
| 1.25 km         | 3                   | 68    |
| 2.5 km          | 1                   | 36    |
| 5 km            | 0                   | 0     |

**Threshold:** `ACCESS_THRESHOLD_KM = 2.5` km. One accessibility row is
produced per `area_id × service_category`.

---

## 4. Gap Score And Priority Flag

```mermaid
flowchart LR
    VUL["vulnerability_score\n(real census index if available,\nelse synthetic)"] --> GS
    AVG["average accessibility_score\nacross all service categories"] --> DEF["access_deficit\n= 100 − avg_access"]
    DEF --> GS["gap_score\n= vulnerability × access_deficit / 100"]
    GS --> PF{"priority_flag"}
    PF -->|"≥ 45"| HP["High priority"]
    PF -->|"28 – 44"| WA["Watch"]
    PF -->|"< 28"| LP["Lower priority"]
```

**Formula:**

```
access_deficit = 100 − overall_accessibility_score
gap_score      = vulnerability_score × access_deficit / 100
```

The gap score is highest when an area is both highly vulnerable **and** has
poor service access. An area with a perfect accessibility score (100) would
have a gap score of 0 regardless of vulnerability.

---

## 5. Real Census Vulnerability Index (Structural Layer)

Built by `build_statcan_vulnerability_index.py` and
`aggregate_ct_to_areas.py`. Replaces the synthetic vulnerability in
`gap_score_table.csv`.

```mermaid
flowchart TD
    subgraph VARS["5 StatCan census variables (per CT)"]
        V1["low_income_pct"]
        V2["seniors_65plus_pct"]
        V3["recent_immigrant_pct"]
        V4["no_official_language_pct"]
        V5["shelter_cost_burden_pct"]
        V6["indigenous_identity_pct\n(missing — awaiting Laura)"]
    end

    subgraph SCALE["min_max_scale() across all CTs"]
        S1["low_income_pct_scaled"]
        S2["seniors_65plus_pct_scaled"]
        S3["recent_immigrant_pct_scaled"]
        S4["no_official_language_pct_scaled"]
        S5["shelter_cost_burden_pct_scaled"]
        S6["indigenous_identity_pct_scaled\n(when available)"]
    end

    subgraph SCORES["Area-level scores (after borough aggregation)"]
        VI["vulnerability_index\nequal-weight average of 5 scaled vars"]
        ICS["immigrant_census_concern_score\naverage(recent_immigrant_scaled,\nno_official_language_scaled)"]
        INDS["indigenous_census_concern_score\nindigenous_identity_pct_scaled\n(blank until data arrives)"]
        FOCUS["mvp_focus_census_index\naverage(immigrant_score [+ indigenous_score])"]
        BASIS["mvp_focus_data_basis\nflags which inputs are available"]
    end

    V1 --> S1 --> VI
    V2 --> S2 --> VI
    V3 --> S3 --> VI & ICS
    V4 --> S4 --> VI & ICS
    V5 --> S5 --> VI
    V6 --> S6 --> INDS
    ICS --> FOCUS
    INDS --> FOCUS
    FOCUS --> BASIS
```

**min_max_scale formula:**

```
scaled = (value − min) / (max − min) × 100
```

Scaling is applied across the full set of census tracts (CT level) or across
the 11 boroughs (after aggregation), so the worst-performing area always
scores 100 and the best always scores 0.

**Current data-basis flags:**

| `mvp_focus_data_basis` | Meaning |
|---|---|
| `immigrant_census_only_indigenous_missing` | Only immigrant scores available (current state) |
| `immigrant_and_indigenous_census` | Both scores computed (requires `indigenous_identity_pct`) |

---

## 6. Observed Needs Layer (V2 — Awaiting Laura's Data)

Built by `build_observed_need_index.py` once `database_visitor_tags.csv` and
`center_area_lookup.csv` exist.

```mermaid
flowchart TD
    VT["database_visitor_tags.csv\n(k-anonymized aggregates, per center × need × period)"]
    CA["center_area_lookup.csv\n(center_id → area_id)"]
    KFLOOR{"k_anon_count >= 5?"}

    VT --> KFLOOR
    KFLOOR -->|"No — suppress"| DROP["row dropped"]
    KFLOOR -->|"Yes"| JOIN["join to area_id via center_area_lookup"]

    JOIN --> SUB1["observed_immigrant_need_score\nshare of immigrant/language/settlement tags"]
    JOIN --> SUB2["observed_indigenous_need_score\nshare of Indigenous-specific tags\n(only when group count >= 5)"]
    JOIN --> SUB3["observed_severity_breadth_score\nhigh-severity share × 70 + unique_needs × 3"]
    JOIN --> SUB4["observed_recency_score\nrecency-decayed visit sum\nhalf-life = 30 days"]

    SUB1 --> OFS["observed_focus_need_score()\naverage of available components"]
    SUB2 -.->|"included only when\ngroup count >= k=5"| OFS
    SUB3 --> OFS
    SUB4 --> OFS

    OFS --> INSUF{"area total\nvisit count >= 5?"}
    INSUF -->|"No"| STUB["insufficient_visit_data = True\nfallback to structural only"]
    INSUF -->|"Yes"| IDX["observed_need_index.csv"]
```

**High-severity tags** (weight observed_severity_breadth_score):

```
Housing & Shelter · Mental Health · Health & Wellness · Legal Aid
```

**Immigrant focus tags:**

```
Settlement Navigation · Language Access · Immigration Legal Need · Newcomer Support
```

**Indigenous focus tags** (suppressed if group count < k=5):

```
Indigenous Cultural Support · Indigenous-Led Referral · Indigenous-Specific Service Need
```

**Recency decay formula:**

```
weight = 0.5 ^ (days_since_period_end / 30)
```

---

## 7. Vulnerability Index V2 (Composite)

Built by `build_vulnerability_index_v2.py`. Combines the structural census
layer with the observed needs layer.

```mermaid
flowchart TD
    STRUCT["mvp_focus_census_index\n(structural layer, 0–100)"]
    OBS["observed_focus_need_score\n(observed layer, 0–100)"]

    INSUF{"observed data\nsufficient?"}
    OBS --> INSUF
    STRUCT --> INSUF

    INSUF -->|"Yes"| COMP["composite_vulnerability_index()\n0.6 × structural + 0.4 × observed"]
    INSUF -->|"No"| FALL["v2 = structural\nbasis: structural_focus_only_observed_insufficient"]

    COMP --> V2["vulnerability_index_v2\n0–100"]
    FALL --> V2

    V2 --> RANK["vulnerability_rank_v2\n1 = highest"]
    V2 --> BASIS2["v2_data_basis\nflags which layers contributed"]
    V2 --> CONCERN["v2_top_concern\nplain-language label"]
```

**Composite formula:**

```
vulnerability_index_v2 = 0.6 × mvp_focus_census_index
                       + 0.4 × observed_focus_need_score
```

**Fallback decision tree:**

```
if observed insufficient:
    v2 = mvp_focus_census_index
    basis = structural_focus_only_observed_insufficient

elif indigenous census missing but observed indigenous >= k=5:
    v2 = 0.6 × immigrant_census_score + 0.4 × observed_focus_need_score
    basis = immigrant_census_plus_observed_focus

else (both layers fully available):
    v2 = 0.6 × mvp_focus_census_index + 0.4 × observed_focus_need_score
    basis = structural_and_observed_focus
```

**Current state (2026-06-26):** all 12 areas use
`structural_focus_only_observed_insufficient` because `database_visitor_tags.csv`
has not been delivered yet.

---

## 8. Score Ranges Reference

| Score | Range | What "100" means | What "0" means |
|---|---|---|---|
| `vulnerability_score` (synthetic) | 0–100 | All five indicators at maximum | All five at minimum |
| `vulnerability_index` (real census) | 0–100 | Worst borough in the study area | Best borough |
| `immigrant_census_concern_score` | 0–100 | Highest recent-immigrant and language-barrier share | Lowest shares |
| `indigenous_census_concern_score` | 0–100 | Highest Indigenous identity share | Lowest share |
| `mvp_focus_census_index` | 0–100 | Worst focus-group structural concern | Lowest concern |
| `accessibility_score` | 0–100 | Service at door, 5+ within 2.5 km | No services within 7.2 km |
| `gap_score` | 0–100 | Max vulnerability + zero access | Either dimension is zero |
| `observed_focus_need_score` | 0–100 | All visits are high-severity, recent, immigrant/Indigenous-focused | No qualifying visits |
| `vulnerability_index_v2` | 0–100 | Worst structural + observed concern | Lowest concern across both layers |

---

## 9. Script Run Order

```
# Rebuild synthetic pipeline (Frondy + Laura contracts)
python3 scripts/generate_synthetic_data.py
python3 scripts/build_processed_data.py          ← wires real census if available

# Real census structural layer (Frondy)
python3 scripts/build_statcan_vulnerability_index.py
.venv/bin/python scripts/aggregate_ct_to_areas.py

# V2 observed + composite layer (unblocked once Laura delivers data)
python3 scripts/map_centers_to_areas.py
python3 scripts/build_observed_need_index.py [--window-days 90]
python3 scripts/build_vulnerability_index_v2.py

# Tests
python3 -m unittest discover -s tests
```

---

## 10. Constants Quick Reference

| Constant | Value | Where used |
|---|---|---|
| `ACCESS_THRESHOLD_KM` | 2.5 km | `accessibility_score`, `build_accessibility` |
| `K_ANON_FLOOR` | 5 | `has_sufficient_observed_data`, `build_observed_need_index` |
| `STRUCTURAL_WEIGHT` | 0.6 | `composite_vulnerability_index` |
| `OBSERVED_WEIGHT` | 0.4 | `composite_vulnerability_index` |
