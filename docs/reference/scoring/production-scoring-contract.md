# Production Scoring Contract

Status: **official POC production**

| Metadata | Value |
| --- | --- |
| Production numeric formula | `GAP-CANON-02` |
| Formula-set version | `scoring-contract-03` |
| Production classification | `CLASS-TOP5-02` |
| Production taxonomy | `planning-needs-9-v1` |
| Approval owner and date | Repository maintainer; approved 2026-07-28 in the implementation thread |
| Effective production date | 2026-07-28 |
| Implementation commit | `cc050f6a5e662b02723e885180e961db7b0f32ea` |
| Supabase snapshot | `97c29b249d986c4ffa5de6fe21400dc99dd5121f6026bda0a779116869806c1b` |
| Previous contract-02 publication | Run `30406140070`; 12 / 108 / 12 rows |
| Supabase publication | Release run `30412101978`; 12 / 108 / 12 rows; exactly 5 candidate rows |
| Vercel activation deployment | `dpl_9qNZZxNYpKFyLFkePzR3BXdAFd69` |
| Production release | Run `30412101978`; https://comm-need-radar.vercel.app |

This is the authoritative entry point for scoring status, formulas, lineage,
allowed interpretation, and the initial controlled release evidence.

## What Production Uses

The deployed application uses one consistent structural, service-gap, and
relative-classification contract:

| Surface | Formula | Current input basis |
| --- | --- | --- |
| Area Profile and guided chatbot | `STRUCT-01` | Statistics Canada 2021 equal-weight structural index |
| Planner gap vulnerability | `STRUCT-01` | Statistics Canada 2021 equal-weight structural index |
| Planner accessibility | `ACCESS-REAL-02` | 3,200 mappable rows from the 3,664-row `services_master` snapshot |
| Planner gap | `GAP-CANON-02` | `STRUCT-01` plus `ACCESS-REAL-02` |
| Planner interpretation | `CLASS-TOP5-02` | Ranks 1–5 are relative **High-priority candidates (POC)**; ranks 6–12 have no priority label |
| Stored V2 | `V2-COMP-EXP-01` | Experimental; does not feed the production gap |
| Web-observed demand | `WEB-DEMAND-EXP-01` | Experimental; does not feed the production gap |

For all 12 areas, the compatibility `vulnerability_score` fields equal
`structural_vulnerability_score` within 0.01, and every stored gap reconciles
to the formula below.

## Formula Registry

| Formula ID | Formula or purpose | Status |
| --- | --- | --- |
| `PROFILE-LEGACY-01` | Mean of five synthetic area indicators | Historical; no production use |
| `STRUCT-01` | Mean of five normalized StatCan 2021 indicators | Production structural score |
| `ACCESS-LEGACY-01` | Synthetic distance plus capped count | Historical; no production use |
| `GAP-PROD-01` | `STRUCT-01 × (100 − ACCESS-LEGACY-01) / 100` | Historical; superseded |
| `CLASS-LEGACY-01` | High ≥45; Watch ≥28; otherwise Lower | Historical, unvalidated, and retired |
| `CLASS-TOP5-02` | Ranks 1–5 of the fixed 12-area set | Production POC interpretation; relative candidate, not a policy threshold |
| `FOCUS-EXP-01` | Immigrant and language Census concern | Experimental |
| `FOCUS-EXP-02` | Immigrant/Indigenous focus composite | Experimental |
| `V1-DEMAND-EXP-01` | 70% volume plus 30% top-category pressure | Experimental |
| `V2-OBS-EXP-01` | Fixed 30/20/20/20/10 observed components | Experimental |
| `V2-COMP-EXP-01` | 60% focus structural plus 40% observed | Experimental |
| `WEB-DEMAND-EXP-01` | Coverage-gated anonymous web intent | Experimental |
| `ACCESS-REAL-02` | Relative access from `services_master` | Production accessibility |
| `GAP-CANON-02` | `STRUCT-01 × (100 − ACCESS-REAL-02) / 100` | Production gap |

The machine-readable registry is
[`scoring_formula_manifest.json`](../../../data/processed/scoring_formula_manifest.json).

## Production Structural Score — `STRUCT-01`

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

Production invariants:

- `area_profile.structural_vulnerability_score`
- `area_profile.vulnerability_score`
- `gap_score.structural_vulnerability_score`
- `gap_score.vulnerability_score`
- `area_vulnerability_index_real.vulnerability_index`

must agree within 0.01 for every area.

The compatibility `population` field remains synthetic and is tagged
`synthetic_demo_not_for_scoring`. It must not be presented as a Census
population or used by `STRUCT-01` or `GAP-CANON-02`.

## Production Accessibility — `ACCESS-REAL-02`

Production uses the 3,664-row deduplicated `services_master`; 3,200 records
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

## Production Gap — `GAP-CANON-02`

```text
gap_score =
  structural_vulnerability_score
  × (100 − service_accessibility_score)
  / 100
```

The score remains the **POC relative service-gap index**. `CLASS-TOP5-02`
adds a separate interpretation layer:

```text
comparison_set_size = 12
priority_cutoff_rank = 5

if gap_rank <= 5:
  priority_band = high_candidate
  priority_flag = High-priority candidate (POC)
else:
  priority_band = null
  priority_flag = null
```

This is a relative top-five label, not an absolute threshold. It does not mean
that an area is eligible for funding, has been approved for intervention, or
has crossed a validated policy boundary. Ranks are deterministic: descending
gap score, descending structural vulnerability, ascending accessibility, then
ascending `area_id`.

The experimental focus score, V1, V2, `page_events`, and `flyer_downloads` do
not enter this calculation.

## Review And Release Record

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

The contract was approved on 2026-07-28 and released through these gates:

- [x] additive migration and private atomic publisher applied;
- [x] 12 `area_profile`, 108 `accessibility`, and 12 `gap_score` rows
  published in one transaction;
- [x] structural aliases, access components, taxonomy, snapshot, and all gap
  rows reconciled;
- [x] public scoring access remained read-only, private objects remained
  unreadable, and anonymous execution of the publisher was denied;
- [x] repository tests, deterministic rebuild, spatial joins, bias validation,
  frontend build, and dependency audit passed;
- [x] staged candidate smoke plus 10 desktop/mobile browser tests passed;
- [x] canonical production smoke plus the same 10 browser tests passed in
  enforce mode after promotion.

The first safe-update attempt failed before any row changed, and the first
candidate grill caught a stale legacy expectation before promotion. Both
failures were corrected and rerun. The successful release evidence is recorded
in the metadata table above.

`GAP-CANON-02` and all numeric values remain unchanged in contract 03. The
version change records the new classification semantics and prevents a
contract-02 client from silently interpreting the new fields.

`GAP-PROD-01`, `ACCESS-LEGACY-01`, and `CLASS-LEGACY-01` are historical.
Formula IDs themselves never change. Any future formula, taxonomy, source
snapshot, or interpretation change requires a new version and controlled
release record.
