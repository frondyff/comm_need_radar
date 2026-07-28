# Production Scoring Contract

Status: **candidate — not deployed**

| Metadata | Value |
| --- | --- |
| Current production formula set | `GAP-PROD-01` |
| Candidate formula set | `GAP-CANON-02` |
| Candidate formula-set version | `scoring-contract-02` |
| Candidate taxonomy | `planning-needs-9-v1` |
| Approval owner and date | Pending |
| Effective production date | Pending |
| Implementation commit | Pending |
| Supabase snapshot | Pending |
| Vercel deployment | Pending |

This is the authoritative entry point for scoring status, formulas, lineage,
and allowed interpretation. The candidate must not be called official
production until the approval, Supabase snapshot, test, commit, and deployment
fields above are populated.

## What Production Uses Today

The deployed application does not currently have one consistent vulnerability
contract:

| Surface | Formula | Current input basis |
| --- | --- | --- |
| Area Profile and guided chatbot | `PROFILE-LEGACY-01` | Synthetic five-indicator demonstration profile |
| Planner gap vulnerability | `STRUCT-01` | Statistics Canada 2021 equal-weight structural index |
| Planner accessibility | `ACCESS-LEGACY-01` | Fourteen synthetic service locations |
| Planner gap | `GAP-PROD-01` | `STRUCT-01` plus `ACCESS-LEGACY-01` |
| Planner priority label | `CLASS-LEGACY-01` | Unvalidated fixed cutoffs |
| Stored V2 | `V2-COMP-EXP-01` | Experimental; does not feed the production gap |
| Web-observed demand | `WEB-DEMAND-EXP-01` | Experimental; does not feed the production gap |

All 12 deployed areas have different vulnerability values between
`area_profile` and `gap_score`. The current gap arithmetic itself reconciles;
the inconsistency is the duplicated name and mixed input lineage.

## Formula Registry

| Formula ID | Formula or purpose | Status |
| --- | --- | --- |
| `PROFILE-LEGACY-01` | Mean of five synthetic area indicators | Legacy; deployed profile/chatbot |
| `STRUCT-01` | Mean of five normalized StatCan 2021 indicators | Production component; candidate canonical score |
| `ACCESS-LEGACY-01` | Synthetic distance plus capped count | Legacy; deployed gap input |
| `GAP-PROD-01` | `STRUCT-01 × (100 − ACCESS-LEGACY-01) / 100` | Current production |
| `CLASS-LEGACY-01` | High ≥45; Watch ≥28; otherwise Lower | Legacy and unvalidated |
| `FOCUS-EXP-01` | Immigrant and language Census concern | Experimental |
| `FOCUS-EXP-02` | Immigrant/Indigenous focus composite | Experimental |
| `V1-DEMAND-EXP-01` | 70% volume plus 30% top-category pressure | Experimental |
| `V2-OBS-EXP-01` | Fixed 30/20/20/20/10 observed components | Experimental |
| `V2-COMP-EXP-01` | 60% focus structural plus 40% observed | Experimental |
| `WEB-DEMAND-EXP-01` | Coverage-gated anonymous web intent | Experimental |
| `ACCESS-REAL-02` | Relative access from `services_master` | Candidate |
| `GAP-CANON-02` | `STRUCT-01 × (100 − ACCESS-REAL-02) / 100` | Candidate |

The machine-readable registry is
[`scoring_formula_manifest.json`](../../../data/processed/scoring_formula_manifest.json).

## Candidate Structural Score — `STRUCT-01`

```text
structural_vulnerability_score =
  mean(
    low_income_pct_scaled,
    seniors_65plus_pct_scaled,
    recent_immigrant_pct_scaled,
    no_official_language_pct_scaled,
    shelter_cost_burden_pct_scaled
  )
```

The five dimensions have equal weight. Scaling is relative to the 11 source
boroughs. Parc Extension and Saint-Michel inherit the same borough-level
structural value and must display that limitation.

Candidate invariants:

- `area_profile.structural_vulnerability_score`
- `area_profile.vulnerability_score`
- `gap_score.structural_vulnerability_score`
- `gap_score.vulnerability_score`
- `area_vulnerability_index_real.vulnerability_index`

must agree within 0.01 for every area.

The compatibility `population` field remains synthetic and is tagged
`synthetic_demo_not_for_scoring`. It must not be presented as a Census
population or used by `STRUCT-01` or `GAP-CANON-02`.

## Candidate Accessibility — `ACCESS-REAL-02`

The candidate uses the 3,664-row deduplicated `services_master`; 3,200 records
with usable coordinates contribute to scoring. Each source category maps once
into nine planning categories under `planning-needs-9-v1`.

For every area and planning category:

```text
radius_km = 2.5

distance_component =
  100 × max(0, 1 − min(nearest_distance_km, radius_km) / radius_km)

availability_component =
  100 × log1p(area_category_count)
      / log1p(max_category_count_across_12_areas)

category_accessibility =
  0.50 × distance_component
  + 0.50 × availability_component

service_accessibility_score =
  equal-weight mean of the nine category scores
```

The source crosswalk is stored in the machine-readable registry. Original
service categories remain on every service row.

Interpretation limits:

- straight-line distance is not travel time;
- directory presence is not capacity or availability;
- the formula does not measure language match, eligibility, quality, hours, or
  successful service receipt;
- availability is relative to these 12 areas and this service snapshot.

## Candidate Gap — `GAP-CANON-02`

```text
gap_score =
  structural_vulnerability_score
  × (100 − service_accessibility_score)
  / 100
```

The public label is **POC relative service-gap index**. Display the score and
rank out of 12 only. While `classification_status = unvalidated_poc`, the UI,
chatbot, exports, and API narratives must not assign High, Watch, Lower, or an
equivalent policy priority.

The experimental focus score, V1, V2, `page_events`, and `flyer_downloads` do
not enter this calculation.

## Candidate Review

The generated
[12-area comparison and sensitivity report](scoring-candidate-comparison-2026-07-28.md)
shows:

- the deployed profile and gap inputs side by side;
- current synthetic accessibility;
- saturation when the old access formula is naively applied to real services;
- `ACCESS-REAL-02` and `GAP-CANON-02`;
- rank changes;
- 1.5, 2.5, and 5 km sensitivity;
- 25/75, 50/50, and 75/25 distance/count sensitivity.

Production remains `GAP-PROD-01` until that report records approve, defer, or
reject.

## Promotion Checklist

Change this document to `Status: official production` only after all items pass:

- approval record is complete;
- migrations are applied;
- Supabase is transactionally refreshed with candidate formula IDs;
- structural aliases and all gap rows reconcile;
- public RLS remains read-only for scoring tables;
- frontend, chatbot, PDF, accessibility, analytics-write, and grill tests pass;
- the deployed app reports `GAP-CANON-02`;
- implementation commit, snapshot ID, Vercel deployment, and effective date are
  recorded.

On promotion, mark `GAP-PROD-01`, `ACCESS-LEGACY-01`, and
`CLASS-LEGACY-01` historical. Formula IDs themselves never change.
