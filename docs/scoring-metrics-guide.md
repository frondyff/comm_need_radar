# Scoring And Metrics Guide

Owner: Frondy (geospatial / analytics lead)
Last updated: 2026-07-02
Source of truth: `src/comm_need_radar/scoring/metrics.py`

Example area used throughout: **Parc Extension (A001)** — the top-ranked priority
area. All example values come from the synthetic pipeline run on 2026-07-02.

All scores are in the range **0–100** unless noted.

---

## 1. Overall Pipeline

```mermaid
flowchart TD
    subgraph RAW["── Raw inputs ──"]
        SYNTH["synthetic_area_profiles.csv\nincome · age · language · immigration · housing"]
        STATCAN["statcan_2021_montreal_ct_variables.csv\nlow_income · seniors · immigrant · language · shelter"]
        SERVICES["synthetic_services.csv\nservice lat/lon per category"]
        CENTERS["database_centers.csv\ncenter lat/lon · service categories"]
        VISITS["database_visitor_tags.csv\nk-anonymized aggregate visit records  (k ≥ 5)"]
    end

    subgraph S1["① Synthetic vulnerability  ·  build_processed_data.py"]
        VS["vulnerability_score()\naverage of 5 indicators\nA001 → 78.2"]
        AP["area_profile.csv"]
    end

    subgraph S2["② Service accessibility  ·  build_processed_data.py"]
        ACC["haversine_km()  +  accessibility_score()\ndistance component + count component\nA001 Food Support → 98.4 · overall avg → 12.28"]
        AT["accessibility_table.csv\n(1 row per area × service category)"]
    end

    subgraph S3["③ Gap score & priority  ·  build_processed_data.py"]
        GS["gap_score()\nvulnerability × access_deficit / 100\nA001 → 62.87 × 87.72 / 100 = 55.15"]
        PF["priority_flag()\n≥45 High · ≥28 Watch · else Lower\nA001 → High priority  (rank 3)"]
        GT["gap_score_table.csv"]
    end

    subgraph S4["④ Real census structural index  ·  build_statcan_vulnerability_index.py\n                                      aggregate_ct_to_areas.py"]
        CENSUS["min_max_scale()  across 11 boroughs\nCISV equal-weight average\nVilleray → vulnerability_index = 62.87"]
        IMM["immigrant_census_concern_score\navg(recent_immigrant_scaled, no_lang_scaled)\nVilleray → 78.84"]
        INDIG["indigenous_census_concern_score\nindigenous_identity_pct_scaled\nblank — awaiting Laura"]
        FOCUS["mvp_focus_census_index\navg(immigrant [+ indigenous])\nA001 → 78.84"]
        REAL["area_vulnerability_index_real.csv\n↳ feeds back into ③ gap score"]
    end

    subgraph S5["⑤ Center–area spatial join  ·  map_centers_to_areas.py"]
        MAP["point-in-polygon → borough\nthen nearest area centroid\nC001 → A001 · C002 → A002 · … 8 centers mapped"]
        LOOKUP["center_area_lookup.csv"]
    end

    subgraph S6["⑥ Observed needs index  ·  build_observed_need_index.py"]
        KFLOOR["k-anonymity floor  (k ≥ 5)\ndrop rows below threshold"]
        V1["v1_demand_score()\n70% visit volume + 30% top-category pressure\nA001 → 16.17"]
        OBS["v2_observed_need_score()\nfixed volume · category · focus · severity · recency weights\nA001 → 39.62"]
        OI["observed_need_index.csv + category summary\n8 areas sufficient · 4 fallback"]
    end

    subgraph S7["⑦ V2 composite index  ·  build_vulnerability_index_v2.py"]
        COMP["composite_vulnerability_index()\n0.6 × structural + 0.4 × V2 observed\nA001 → 0.6×78.84 + 0.4×39.62 = 63.15  (rank 1)"]
        FALL["fallback: v2 = structural only\nwhen observed insufficient\nA009 Westmount → 21.34  (drops from gap rank 5 → v2 rank 9)"]
        V2["vulnerability_index_v2.csv"]
    end

    SYNTH -->|"1 — area indicators"| S1
    S1 --> AP

    SERVICES -->|"2 — service locations"| S2
    S2 --> AT

    AP -->|"3a — vulnerability score"| S3
    AT -->|"3b — accessibility scores"| S3
    S3 --> GT

    STATCAN -->|"4 — census tract variables"| S4
    S4 --> REAL
    REAL -->|"4→3 — replaces synthetic\nvulnerability in gap score"| GT

    CENTERS -->|"5 — center coordinates"| S5
    S5 --> LOOKUP

    LOOKUP -->|"6a — center→area mapping"| S6
    VISITS -->|"6b — visitor tag records"| S6
    S6 --> OI

    REAL -->|"7a — structural layer"| S7
    OI -->|"7b — observed layer"| S7
    S7 --> V2
```

---

## 2. Synthetic Vulnerability Score

Used in `area_profile.csv`. Replaced by the real census index in
`gap_score_table.csv` when `area_vulnerability_index_real.csv` is present.

```mermaid
flowchart LR
    I1["income_indicator\nA001 = 82"] --> AVG
    I2["age_indicator\nA001 = 54"] --> AVG
    I3["language_indicator\nA001 = 88"] --> AVG
    I4["immigration_indicator\nA001 = 91"] --> AVG
    I5["housing_indicator\nA001 = 76"] --> AVG
    AVG["average\n(82+54+88+91+76)/5"] --> VS["vulnerability_score\nA001 = 78.2"]
    VS --> TD["top_drivers\nA001: newcomer support;\nlanguage access;\nincome pressure"]
```

**Formula:**

```
vulnerability_score = average(income, age, language, immigration, housing)
top_drivers         = top 3 indicator labels sorted descending
```

**Example — all 12 areas:**

| area_id | Area | income | age | language | immigration | housing | vulnerability_score | top drivers |
|---|---|---:|---:|---:|---:|---:|---:|---|
| A001 | Parc Extension | 82 | 54 | 88 | **91** | 76 | **78.2** | newcomer; language; income |
| A002 | Saint-Michel | 78 | 62 | 72 | **84** | 69 | 73.0 | newcomer; income; language |
| A003 | Cote-des-Neiges | 74 | 58 | 83 | **87** | 71 | 74.6 | newcomer; language; income |
| A004 | Montreal-Nord | **86** | 65 | 69 | 78 | **82** | 76.0 | income; housing; newcomer |
| A005 | Hochelaga | 67 | 50 | 32 | 28 | 73 | 50.0 | income; housing; age |
| A006 | Verdun | 48 | 45 | 26 | 31 | 52 | 40.4 | housing; income; age |
| A007 | Ahuntsic | 42 | **72** | 38 | 44 | 40 | 47.2 | age; newcomer; language |
| A008 | Lachine | 53 | 57 | 29 | 35 | 55 | 45.8 | housing; age; income |
| A009 | Westmount | 15 | 46 | 18 | 24 | 20 | 24.6 | age; newcomer; housing |
| A010 | Plateau | 35 | 34 | 22 | 29 | 45 | 33.0 | housing; income; newcomer |
| A011 | Pointe-Saint-Charles | 61 | 48 | 25 | 30 | 68 | 46.4 | housing; income; newcomer |
| A012 | Riviere-des-Prairies | 58 | 63 | 45 | 50 | 47 | 52.6 | age; income; newcomer |

---

## 3. Haversine Distance And Accessibility Score

```mermaid
flowchart LR
    A["area centroid\nA001: 45.529, -73.633"] --> HAV["haversine_km()\ngreat-circle distance"]
    S["service location\nFood Hub: 45.531, -73.635"] --> HAV
    HAV --> D["nearest_distance_km\nA001 Food Support = 0.27 km"]
    HAV --> C["service_count within 2.5 km\nA001 Food Support = 1"]

    D --> DC["distance_component\nmax(0, 100 − 0.27/2.5 × 70)\n= max(0, 92.44) = 92.44"]
    C --> CC["count_component\nmin(1, 5) × 6 = 6"]
    DC --> AS["accessibility_score\nmin(100, 92.44 + 6) = 98.4"]
    CC --> AS
```

**Formula:**

```
distance_component  = max(0,  100 − (nearest_km / 2.5) × 70)
count_component     = min(service_count_within_2.5km, 5) × 6
accessibility_score = min(100, distance_component + count_component)
```

**Example — A001 Parc Extension, all service categories:**

| Service category | Nearest (km) | Count ≤2.5 km | distance_comp | count_comp | accessibility_score |
|---|---:|---:|---:|---:|---:|
| Food Support | 0.27 | 1 | 92.44 | 6 | **98.4** |
| Newcomer Support | 3.14 | 0 | 12.14 | 0 | 12.1 |
| Housing | 3.85 | 0 | 0.00 | 0 | 0.0 |
| Mental Health | 4.59 | 0 | 0.00 | 0 | 0.0 |
| Family Services | 4.18 | 0 | 0.00 | 0 | 0.0 |
| Legal Aid | 5.87 | 0 | 0.00 | 0 | 0.0 |
| Employment | 9.33 | 0 | 0.00 | 0 | 0.0 |
| General Support | 10.93 | 0 | 0.00 | 0 | 0.0 |
| **Overall average** | | | | | **12.28** |

**Scale reference:**

| Nearest (km) | Count ≤2.5 km | Score | Interpretation |
|---:|---:|---:|---|
| 0 | 5+ | 100 | Service at door, abundant |
| 1.25 | 3 | 68 | Moderate walk, some choice |
| 2.5 | 1 | 36 | At threshold, scarce |
| 5.0 | 0 | 0 | Beyond threshold, none nearby |

**Threshold:** `ACCESS_THRESHOLD_KM = 2.5` km. One row per `area_id × service_category`.

---

## 4. Gap Score And Priority Flag

```mermaid
flowchart LR
    VUL["vulnerability_score\nA001 = 62.87\n(real census replaces synthetic 78.2)"] --> GS
    AVG["average accessibility_score\nA001 = 12.28"] --> DEF["access_deficit\n= 100 − 12.28 = 87.72"]
    DEF --> GS["gap_score\n= 62.87 × 87.72 / 100\n= 55.15"]
    GS --> PF{"priority_flag"}
    PF -->|"≥ 45 → A001 qualifies"| HP["High priority"]
    PF -->|"28 – 44"| WA["Watch"]
    PF -->|"< 28"| LP["Lower priority"]
```

**Formula:**

```
access_deficit = 100 − overall_accessibility_score
gap_score      = vulnerability_score × access_deficit / 100
```

The gap score is highest when an area is both **highly vulnerable** and has
**poor service access**. An area with perfect access (score 100) has gap = 0.

**Example — all 12 areas, gap score ranking:**

| Rank | Area | vulnerability (real) | avg access | access_deficit | gap_score | priority |
|---:|---|---:|---:|---:|---:|---|
| 1 | Cote-des-Neiges | 64.39 | 11.49 | 88.51 | **57.0** | High |
| 2 | Saint-Michel | 62.87 | 10.59 | 89.41 | **56.2** | High |
| 3 | Parc Extension | 62.87 | 12.28 | 87.72 | **55.2** | High |
| 4 | Montreal-Nord | 53.72 | 10.93 | 89.07 | **47.9** | High |
| 5 | Westmount | 52.06 | 11.57 | 88.43 | **46.0** | High |
| 6 | Ahuntsic | 49.75 | 11.61 | 88.39 | **44.0** | Watch |
| 7 | Plateau | 50.94 | 18.02 | 81.98 | **41.8** | Watch |
| 8 | Verdun | 36.89 | 14.23 | 85.77 | **31.6** | Watch |
| 9 | Pointe-Saint-Charles | 35.90 | 19.04 | 80.96 | **29.1** | Watch |
| 10 | Lachine | 32.03 | 10.36 | 89.64 | **28.7** | Watch |
| 11 | Hochelaga | 30.24 | 10.51 | 89.49 | **27.1** | Lower |
| 12 | Riviere-des-Prairies | 11.06 | 10.18 | 89.82 | **9.9** | Lower |

---

## 5. Real Census Vulnerability Index (Structural Layer)

Built by `build_statcan_vulnerability_index.py` and `aggregate_ct_to_areas.py`.
Replaces the synthetic `vulnerability_score` in `gap_score_table.csv`.

```mermaid
flowchart TD
    subgraph VARS["StatCan 2021 census variables per census tract"]
        V1["low_income_pct\nVilleray avg = 21.23"] 
        V2["seniors_65plus_pct\nVilleray avg = 13.69"]
        V3["recent_immigrant_pct\nVilleray avg = 6.13"]
        V4["no_official_language_pct\nVilleray avg = 5.49"]
        V5["shelter_cost_burden_pct\nVilleray avg = 22.72"]
        V6["indigenous_identity_pct\nMISSING — awaiting Laura"]
    end

    subgraph SCALE["min_max_scale() across 11 boroughs\n(worst borough = 100, best = 0)"]
        S1["low_income_pct_scaled\nVilleray = 100.0"]
        S2["seniors_65plus_pct_scaled\nVilleray = 12.21"]
        S3["recent_immigrant_pct_scaled\nVilleray = 57.67"]
        S4["no_official_language_pct_scaled\nVilleray = 100.0"]
        S5["shelter_cost_burden_pct_scaled\nVilleray = 44.45"]
        S6["indigenous_identity_pct_scaled\nblank"]
    end

    subgraph OUT["Borough-level scores → mapped to A001/A002"]
        VI["vulnerability_index\n= avg(100+12.21+57.67+100+44.45)/5\n= 62.87"]
        ICS["immigrant_census_concern_score\n= avg(57.67 + 100.0) / 2\n= 78.84"]
        INDS["indigenous_census_concern_score\nblank — source missing"]
        FOCUS["mvp_focus_census_index\n= 78.84\n(immigrant only, Indigenous missing)"]
        BASIS["mvp_focus_data_basis\n= immigrant_census_only_indigenous_missing"]
    end

    V1 --> S1 --> VI
    V2 --> S2 --> VI
    V3 --> S3 --> VI & ICS
    V4 --> S4 --> VI & ICS
    V5 --> S5 --> VI
    V6 --> S6 --> INDS
    ICS --> FOCUS
    INDS -.->|"not available"| FOCUS
    FOCUS --> BASIS
```

**min_max_scale formula:**

```
scaled = (value − borough_min) / (borough_max − borough_min) × 100
```

Scaling happens across the 11 boroughs after borough-level aggregation, so
the single most-pressured borough always scores 100 and the least always 0.

**Example — all 12 areas, real census index:**

| Rank | Area | vulnerability_index | immigrant_score | mvp_focus_census_index | data_basis |
|---:|---|---:|---:|---:|---|
| 1 | Cote-des-Neiges | 64.39 | 61.39 | 61.39 | immigrant_only |
| 2 | Parc Extension | 62.87 | **78.84** | **78.84** | immigrant_only |
| 3 | Saint-Michel | 62.87 | **78.84** | **78.84** | immigrant_only |
| 4 | Montreal-Nord | 53.72 | 43.00 | 43.00 | immigrant_only |
| 5 | Westmount | 52.06 | 21.34 | 21.34 | immigrant_only |
| 6 | Plateau | 50.94 | 28.57 | 28.57 | immigrant_only |
| 7 | Ahuntsic | 49.75 | 55.77 | 55.77 | immigrant_only |
| 8 | Verdun | 36.89 | 26.54 | 26.54 | immigrant_only |
| 9 | Pointe-Saint-Charles | 35.90 | 24.48 | 24.48 | immigrant_only |
| 10 | Lachine | 32.03 | 17.99 | 17.99 | immigrant_only |
| 11 | Hochelaga | 30.24 | 17.36 | 17.36 | immigrant_only |
| 12 | Riviere-des-Prairies | 11.06 | 4.33 | 4.33 | immigrant_only |

Note: Parc Extension and Saint-Michel share the same row because they sit
inside the same borough (Villeray–Saint-Michel–Parc-Extension). Sub-borough
boundaries are needed to differentiate them.

---

## 6. Observed Needs Layer

Built by `map_centers_to_areas.py` + `build_observed_need_index.py`.
Requires `database_centers.csv` and `database_visitor_tags.csv`.

```mermaid
flowchart TD
    VT["database_visitor_tags.csv\n29 k-anonymized aggregate records\nacross 8 centers"] --> KFLOOR
    CA["center_area_lookup.csv\nC001→A001 · C002→A002 · C003→A003\nC004→A004 · C005→A006 · C006→A007\nC007→A008 · C008→A012"] --> JOIN

    KFLOOR{"k_anon_count ≥ 5\nKANON_FLOOR = 5"}
    KFLOOR -->|"No — suppress"| DROP["row dropped\n(no rows dropped in\nthis synthetic run)"]
    KFLOOR -->|"Yes — all 29 rows pass"| JOIN["join to area_id\nvia center_area_lookup"]

    JOIN --> VOL["visit volume\nA001 = 635 encounters = 20.35 per 1,000"]
    JOIN --> TOP["top category\nSettlement Navigation = 200\n31.5% share · pressure score 6.41"]
    VOL --> V1["V1 demand score\n0.7×20.35 + 0.3×6.41 = 16.17"]
    TOP --> V1
    JOIN --> SUB1["focus category share\nA001 = 81.10"]
    JOIN --> SUB3["observed_severity_breadth_score\nA001 = 45.31\nhigh_sev_count/total×70 + unique_needs×3\n275/635×70 + 5×3"]
    JOIN --> SUB4["observed_recency_score\nA001 = 69.47\nrecency-weighted sum / total × 100\nhalf-life = 30 days"]

    VOL --> OFS["V2 observed score\n30% volume + 20% top-category pressure\n+ 20% focus + 20% severity + 10% recency\nA001 = 39.62"]
    TOP --> OFS
    SUB1 --> OFS
    SUB3 --> OFS
    SUB4 --> OFS

    OFS --> INSUF{"area total\nvisit count ≥ 5?"}
    INSUF -->|"A005/A009/A010/A011:\nno center assigned"| STUB["insufficient_visit_data = True\nfallback to structural"]
    INSUF -->|"8 areas pass"| IDX["observed_need_index.csv"]
```

**V1 and V2 separation:**

| Metric | Audience | Inputs | Purpose |
|---|---|---|---|
| `v1_demand_score` | Frontline workers | 70% visit volume + 30% top-category pressure | Summarize current operational demand |
| `v2_observed_score` | Planners/research | Volume, top-category pressure, focus share, severity/breadth, recency | Add current observed evidence to structural vulnerability |
| `vulnerability_index_v2` | Planners/research | 60% structural + 40% V2 observed | Experimental area-level planning rank |

`top_need_share_pct` is displayed but does not enter either score. Counts mean
service encounters, not deduplicated people.

**Tags that drive V2 components:**

| Sub-score | Counted when |
|---|---|
| `immigrant_need` | `key_need` in {Settlement Navigation, Language Access, Immigration Legal Need, Newcomer Support} OR `language_need_flag=1` OR `settlement_need_flag=1` |
| `indigenous_need` | `key_need` in {Indigenous Cultural Support, Indigenous-Led Referral, Indigenous-Specific Service Need} OR `indigenous_specific_need_flag=1` OR `population_group=indigenous` |
| `severity_breadth` | `key_need` in {Housing & Shelter, Mental Health, Health & Wellness, Legal Aid} (high-severity share × 70) + distinct need category count × 3 |
| `recency` | Exponential decay: weight = 0.5^(days_since_period_end / 30) |

**Recency decay examples (today = 2026-07-02):**

| period_end | days ago | decay weight |
|---|---:|---:|
| 2026-06-20 | 12 | **0.758** |
| 2026-04-20 | 73 | **0.185** |
| 2026-03-28 | 96 | **0.109** |

**Example — all areas, observed demand:**

| Area | encounters | top category | V1 demand | V2 observed | sufficient |
|---|---:|---|---:|---:|---|
| Parc Extension (A001) | 635 | Settlement Navigation | **16.17** | **39.62** | yes |
| Saint-Michel (A002) | 553 | Settlement Navigation | 8.95 | 33.30 | yes |
| Cote-des-Neiges (A003) | 850 | Newcomer Support | 13.07 | 34.04 | yes |
| Montreal-Nord (A004) | 445 | Housing & Shelter | 8.18 | 23.76 | yes |
| Verdun (A006) | 270 | General Support | 3.16 | 19.14 | yes |
| Ahuntsic (A007) | 310 | Senior Support | 6.69 | 20.57 | yes |
| Lachine (A008) | 135 | General Support | 4.27 | 16.52 | yes |
| Riviere-des-Prairies (A012) | 12 | General Support | 0.37 | 8.36 | yes |
| Hochelaga (A005) | 0 | — | — | — | — | — | **no** |
| Westmount (A009) | 0 | — | — | — | — | — | **no** |
| Plateau (A010) | 0 | — | — | — | — | — | **no** |
| Pointe-Saint-Charles (A011) | 0 | — | — | — | — | — | **no** |

---

## 7. Vulnerability Index V2 (Composite)

Built by `build_vulnerability_index_v2.py`.

```mermaid
flowchart TD
    STRUCT["mvp_focus_census_index\n(structural layer)\nA001 = 78.84\nA002 = 78.84\nA003 = 61.39"]
    OBS["v2_observed_score\n(fixed observed layer)\nA001 = 39.62\nA002 = 33.30\nA003 = 34.04"]

    INSUF{"observed data\nsufficient?\nA001/A002/A003: yes\nA005/A009/A010/A011: no"}
    OBS --> INSUF
    STRUCT --> INSUF

    INSUF -->|"Yes"| COMP["composite_vulnerability_index()\nweights: 0.6 structural + 0.4 observed\nA001: 0.6×78.84 + 0.4×39.62 = 63.15\nA002: 0.6×78.84 + 0.4×33.30 = 60.62\nA003: 0.6×61.39 + 0.4×34.04 = 50.45"]
    INSUF -->|"No"| FALL["v2 = structural score\nA005 = 17.36\nA009 = 21.34\nA010 = 28.57\nA011 = 24.48"]

    COMP --> V2["vulnerability_index_v2 · ranked"]
    FALL --> V2
    V2 --> BASIS["v2_data_basis"]
    BASIS -->|"observed ran"| B1["immigrant_census_plus_observed_focus"]
    BASIS -->|"no observed"| B2["structural_focus_only_observed_insufficient"]
```

**Composite formula:**

```
vulnerability_index_v2 = 0.6 × mvp_focus_census_index
                       + 0.4 × v2_observed_score
```

The V1-derived inputs contribute 12% visit volume and 8% top-category pressure
to the final V2 score. Focus-category share and severity/breadth contribute 8%
each, and recency contributes 4%.

**Fallback decision logic:**

```
if observed insufficient (no center or visit_count < 5):
    v2 = mvp_focus_census_index
    basis = structural_focus_only_observed_insufficient

elif indigenous census missing but observed ran successfully:
    v2 = 0.6 × immigrant_census_focus + 0.4 × observed_score
    basis = immigrant_census_plus_observed_focus        ← current state (all 8 areas with observed)

else (both census layers complete):
    v2 = 0.6 × mvp_focus_census_index + 0.4 × observed_score
    basis = structural_and_observed_focus
```

**Example — all 12 areas, v2 vs gap ranking:**

| v2 rank | Area | structural | observed | v2_score | gap rank | Δ rank | data_basis |
|---:|---|---:|---:|---:|---:|---:|---|
| 1 | Parc Extension | 78.84 | 39.62 | **63.15** | 3 | +2 | census+observed |
| 2 | Saint-Michel | 78.84 | 33.30 | **60.62** | 2 | 0 | census+observed |
| 3 | Cote-des-Neiges | 61.39 | 34.04 | **50.45** | 1 | −2 | census+observed |
| 4 | Ahuntsic | 55.77 | 20.57 | **41.69** | 6 | +2 | census+observed |
| 5 | Montreal-Nord | 43.00 | 23.76 | **35.30** | 4 | −1 | census+observed |
| 6 | Plateau | 28.57 | — | **28.57** | 7 | +1 | structural only |
| 7 | Pointe-Saint-Charles | 24.48 | — | **24.48** | 9 | +2 | structural only |
| 8 | Verdun | 26.54 | 19.14 | **23.58** | 8 | 0 | census+observed |
| 9 | Westmount | 21.34 | — | **21.34** | 5 | **−4** | structural only |
| 10 | Lachine | 17.99 | 16.52 | **17.40** | 10 | 0 | census+observed |
| 11 | Hochelaga | 17.36 | — | **17.36** | 11 | 0 | structural only |
| 12 | Riviere-des-Prairies | 4.33 | 8.36 | **5.94** | 12 | 0 | census+observed |

Key shifts: **Westmount drops 4 places**, but its structural-only fallback means
the system lacks observed coverage there; it is not evidence of low demand.
**Parc Extension rises 2 places** because its observed focus-category share and
encounter volume are stronger than Saint-Michel's.

---

## 8. Worked Example — Parc Extension (A001), Full Pipeline

```mermaid
flowchart TD
    subgraph INPUT["Inputs"]
        IND["Synthetic indicators\nincome=82 · age=54 · language=88\nimmigration=91 · housing=76"]
        CEN["Real census (Villeray borough)\nlow_income=21.23% · seniors=13.69%\nimmigrant=6.13% · no_lang=5.49%\nshelter=22.72%"]
        SVC["Nearest service (Food Hub)\ndistance = 0.27 km · count within 2.5km = 1"]
        VIS["Visitor tags (C001, 5 records)\nSettlement Nav k=200, Language k=160\nHousing k=120, Legal Aid k=85\nMental Health k=70 (older period)"]
    end

    subgraph STAGE1["Stage 1 — Synthetic vulnerability"]
        VS1["vulnerability_score\n(82+54+88+91+76)/5 = 78.2\n→ rank 1 of 12 synthetic"]
    end

    subgraph STAGE2["Stage 2 — Accessibility"]
        AS1["Food Support accessibility\ndist_comp=92.44 + count_comp=6 = 98.4"]
        AS2["All other categories\nall services > 2.5 km → 0 to 12.1"]
        AVG1["overall avg = 12.28\naccess_deficit = 87.72"]
    end

    subgraph STAGE3["Stage 3 — Real census replaces synthetic"]
        VI1["min_max_scale across 11 boroughs\nvulnerability_index = 62.87\nimmigrant_census_concern = 78.84\nmvp_focus_census_index = 78.84"]
    end

    subgraph STAGE4["Stage 4 — Gap score"]
        GS1["gap_score\n= 62.87 × 87.72 / 100\n= 55.15 → rank 3 of 12\n→ High priority"]
    end

    subgraph STAGE5["Stage 5 — Observed layer"]
        OB1["visit_count = 635 · volume score = 20.35\ntop category = 200 · pressure score = 6.41\nV1 demand = 16.17"]
        OB2["focus=81.10 · severity=45.31 · recency=69.47\nV2 observed score = 39.62"]
    end

    subgraph STAGE6["Stage 6 — V2 composite"]
        V21["vulnerability_index_v2\n= 0.6×78.84 + 0.4×39.62\n= 47.30 + 15.85 = 63.15\n→ rank 1 of 12"]
    end

    IND --> STAGE1
    CEN --> STAGE3
    SVC --> STAGE2
    VIS --> STAGE5
    STAGE1 --> STAGE4
    STAGE2 --> STAGE4
    STAGE3 --> STAGE4
    STAGE3 --> STAGE6
    STAGE5 --> STAGE6
```

**Step-by-step values:**

| Step | Input | Computation | Result |
|---|---|---|---|
| Synthetic score | indicators: 82, 54, 88, 91, 76 | avg(82+54+88+91+76)/5 | **78.2** |
| Food Support access | nearest=0.27 km, count=1 | (100−0.27/2.5×70) + 1×6 | **98.4** |
| Overall access | 8 category scores | average across categories | **12.28** |
| Census scaling | Villeray recent_immigrant=6.13% | min_max across 11 boroughs | 57.67 scaled |
| Census scaling | Villeray no_official_lang=5.49% | min_max across 11 boroughs | 100.0 scaled |
| Real census index | 5 scaled variables | equal-weight average | **62.87** |
| Immigrant concern | recent_immigrant + no_lang scaled | avg(57.67, 100.0) | **78.84** |
| Gap score | vuln=62.87, access=12.28 | 62.87 × (100−12.28) / 100 | **55.15** |
| Visit volume | 635 encounters / 31,200 population | encounters per 1,000 | **20.35** |
| Top category pressure | 200 Settlement Navigation encounters / population | encounters per 1,000 | **6.41** |
| V1 demand | volume=20.35, top pressure=6.41 | 0.7×20.35 + 0.3×6.41 | **16.17** |
| Immigrant need | 515 immigrant-tagged visits / 635 total | 515/635×100 | **81.10** |
| Severity breadth | 275 high-sev / 635 total, 5 unique needs | 275/635×70 + 5×3 | **45.31** |
| Recency score | recent visits × 0.758, older × 0.185 | decay-weighted total / total × 100 | **69.47** |
| V2 observed | volume, top pressure, focus, severity, recency | fixed 30/20/20/20/10 weights | **39.62** |
| V2 composite | structural=78.84, observed=39.62 | 0.6×78.84 + 0.4×39.62 | **63.15** |

---

## 9. Score Ranges Reference

| Score | Range | "100" means | "0" means |
|---|---|---|---|
| `vulnerability_score` (synthetic) | 0–100 | All five indicators at maximum | All five at minimum |
| `vulnerability_index` (real census) | 0–100 | Worst borough across 11 boroughs | Best borough |
| `immigrant_census_concern_score` | 0–100 | Highest immigrant + language-barrier share | Lowest shares |
| `indigenous_census_concern_score` | 0–100 | Highest Indigenous identity share | Lowest |
| `mvp_focus_census_index` | 0–100 | Worst focus-group structural concern | Lowest concern |
| `accessibility_score` | 0–100 | Service at door, 5+ within 2.5 km | No service within 7.2 km |
| `gap_score` | 0–100 | Max vulnerability + zero access | Either dimension is zero |
| `observed_immigrant_need_score` | 0–100 | All visits are immigrant/language/settlement-focused | None |
| `observed_indigenous_need_score` | 0–100 | All visits are Indigenous-specific | None |
| `observed_severity_breadth_score` | 0–100 | All visits are high-severity, 10+ distinct need categories | Zero |
| `observed_recency_score` | 0–100 | All visits happened today | All visits > 5 months old |
| `v1_demand_score` | 0–100 | Maximum visit volume and top-category pressure | No observed demand |
| `v2_observed_score` | 0–100 | Maximum across all five fixed observed components | All components at zero |
| `observed_focus_need_score` | 0–100 | Compatibility alias for `v2_observed_score` | All components at zero |
| `vulnerability_index_v2` | 0–100 | Worst structural + observed concern | Lowest across both |

---

## 10. Script Run Order

```bash
# Rebuild synthetic pipeline
python3 scripts/generate_synthetic_data.py
python3 scripts/build_processed_data.py          # wires real census if present

# Real census structural layer
python3 scripts/build_statcan_vulnerability_index.py
python3 scripts/aggregate_ct_to_areas.py         # requires shapely; use .venv

# V2 observed + composite layer
python3 scripts/map_centers_to_areas.py
python3 scripts/build_observed_need_index.py [--window-days 90]
python3 scripts/build_vulnerability_index_v2.py

# Tests
python3 -m unittest discover -s tests
```

---

## 11. Constants Quick Reference

| Constant | Value | Where used |
|---|---|---|
| `ACCESS_THRESHOLD_KM` | 2.5 km | `accessibility_score`, `build_accessibility` |
| `K_ANON_FLOOR` | 5 | `has_sufficient_observed_data`, `build_observed_need_index` |
| `STRUCTURAL_WEIGHT` | 0.6 | `composite_vulnerability_index` |
| `OBSERVED_WEIGHT` | 0.4 | `composite_vulnerability_index` |
| `V1_VOLUME_WEIGHT` | 0.7 | `v1_demand_score` |
| `V1_TOP_CATEGORY_WEIGHT` | 0.3 | `v1_demand_score` |
| `V2_OBSERVED_WEIGHTS` | 0.3 / 0.2 / 0.2 / 0.2 / 0.1 | `v2_observed_need_score` |
