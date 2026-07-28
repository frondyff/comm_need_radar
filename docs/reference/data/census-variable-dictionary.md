# Census Variable Dictionary — Vulnerability Index

Deliverable for action-plan item "Lock down specific Census variables" (owners: Laura + Frondy, due W3).
Selects 5 variables from the categories in the project proposal (income, age, immigration, language,
household type, housing) and maps each to a real 2021 Census Profile source table, per the professor's
feedback to narrow the variable set before building the index.

| # | Variable name | Category | Source table (2021 Census Profile) | Definition | Rationale |
|---|---|---|---|---|---|
| 1 | `low_income_pct` | Income | Income of individuals in 2020 | % of population in private households below the Low-Income Measure, after tax (LIM-AT) | Income is the strongest predictor of vulnerability in the CISV framework; LIM-AT is StatCan's standard low-income line for the 2021 Census. |
| 2 | `seniors_65plus_pct` | Age | Age characteristics | % of population aged 65 and older | Older residents face higher service-access barriers (mobility, digital access); a standard CISV age-vulnerability indicator. |
| 3 | `recent_immigrant_pct` | Immigration | Immigrant status and period of immigration | % of population who immigrated to Canada between 2016 and 2021 | Recent immigrants face settlement, language, and service-navigation barriers; directly maps to the "newcomer support need" driver already used in the dashboard. |
| 4 | `no_official_language_pct` | Language | Knowledge of official languages | % of population with no knowledge of English or French | Captures language access barriers independent of immigration status (e.g., long-resident non-official-language speakers). |
| 5 | `shelter_cost_burden_pct` | Housing | Housing | % of households spending 30% or more of income on shelter costs | Standard CMHC/StatCan housing-affordability threshold; proxies housing precarity for the CISV housing-adequacy dimension. |

**Variable considered but not selected (kept for sensitivity testing):**

| Variable name | Category | Source table | Rationale for exclusion |
|---|---|---|---|
| `lone_parent_pct` | Household type | Household and dwelling characteristics | Action plan caps the index at 3–5 variables; lone-parent share correlates strongly with `low_income_pct` in StatCan data, so it was deferred to avoid double-counting income vulnerability. Can be added back if the team wants a household-type dimension explicitly. |

## Methodology (CISV-aligned)

1. Pull each variable at the census tract (CT) or dissemination area (DA) level once the W3 download task is complete.
2. Min-max scale each raw variable to 0–100 within the study area (Montreal), per the Canadian Index of Social
   Vulnerability (CISV) approach.
3. Combine the 5 scaled variables with **equal weights** into a single Vulnerability Index (0–100).
4. Document any missing-data handling and final geography level in the data dictionary before the index is finalized.

## MVP Focus-Group Census Layer

Recent meeting notes narrowed the MVP focus to two groups: immigrants and
Indigenous communities. The general CISV-style `vulnerability_index` remains the
main structural index, but the processed census outputs now add a separate focus
layer:

| Output field | Inputs | Meaning |
|---|---|---|
| `immigrant_census_concern_score` | Average of `recent_immigrant_pct_scaled` and `no_official_language_pct_scaled` | Structural concern proxy for newcomer and language-access barriers. |
| `indigenous_census_concern_score` | `indigenous_identity_pct_scaled` | Structural concern proxy for Indigenous-specific service planning. Populated for all 12 areas from the current census extract. |
| `mvp_focus_census_index` | Average of available focus concern scores | MVP focus score. Now combines immigrant and Indigenous concern, since both census inputs are available. |
| `mvp_focus_data_basis` | Generated flag | Explains whether the focus score used immigrant-only or immigrant-plus-Indigenous census inputs. |
| `mvp_focus_top_concern` | Generated label | Plain-language top focus concern for the row. |

Current real census extract status: all five index variables plus
`indigenous_identity_pct` are available in the StatCan CT extract (986 of the
1,004 tracts carry Indigenous identity; 18 are StatCan-suppressed). As a result
`indigenous_census_concern_score` is populated for all 12 areas and
`mvp_focus_data_basis` is `immigrant_and_indigenous_census`.

The implemented observed layer can carry Indigenous-specific service needs via
k-anonymized `Database_Visitor` tags when the subgroup count meets `k >= 5`.
Missing or suppressed observed values remain blank rather than zero. Do not
infer or report person-level Indigenous vulnerability from either area-level
score.

## Status

The core variables above are locked per the professor's feedback. The repo now
contains both the illustrative sample census output and a real StatCan CT extract
aggregated to the MVP areas. The focus-group census layer is implemented in:

- `scripts/build_census_vulnerability_index.py`
- `scripts/build_statcan_vulnerability_index.py`
- `scripts/aggregate_ct_to_areas.py`
- `data/processed/census_vulnerability_index.csv`
- `data/processed/statcan_census_vulnerability_index.csv`
- `data/processed/area_vulnerability_index_real.csv`
