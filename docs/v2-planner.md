# V2 Planner View and scoring

## Purpose

The Planner View compares structural vulnerability with nearby service access
across 12 Greater Montréal review areas. It supports transparent prioritization
and discussion; it does not claim to measure individual vulnerability, total
community need, or service effectiveness.

The label **V2 Planner View** describes the product surface. It must not be
confused with the separate experimental table `vulnerability_index_v2`.
Production cards, map colours, and priority rankings currently use
`gap_score`.

## What the production view shows

| Interface element | Runtime source |
| --- | --- |
| Area profile and structural score | `area_profile` |
| Gap score, gap rank, priority, and explanation | `gap_score` |
| Service-access details | `accessibility` |
| Service locations | `services_master` |
| Low-income, housing-cost-burden, and recent-immigration detail bars | `/api/area-vulnerability`, backed by `area_vulnerability_index_real` |
| Area geometry | `frontend/public/geo/areas.geojson` |

The detail bars are real Census-derived fields. They are not the older
synthetic demonstration indicators.

## Production scoring

### Structural vulnerability

Five area-level 2021 Census dimensions are normalized to 0–100 across the
comparison areas and averaged with equal weight:

```text
vulnerability_score =
  mean(
    income pressure,
    age-related support pressure,
    language-access pressure,
    recent-immigration pressure,
    housing-cost pressure
  )
```

Equal weights keep the proof-of-concept method explainable and avoid implying
empirical precision that has not been established.

### Accessibility

For each service category:

```text
distance_component =
  max(0, 100 - (nearest_service_km / 2.5) × 70)

count_component =
  min(service_count_within_2.5_km, 5) × 6

accessibility_score =
  min(100, distance_component + count_component)
```

The production area accessibility value is the average across service
categories.

### Gap and priority

```text
gap_score =
  vulnerability_score × (100 - overall_accessibility_score) / 100
```

| Gap score | Label |
| ---: | --- |
| 45 or greater | High priority |
| 28 to less than 45 | Watch |
| Less than 28 | Lower priority |

This makes the gap high only when structural pressure is high and the
accessibility proxy is low. The calculation runs in the data pipeline, not in
the browser.

## Scoring decision memo

Decision as of 2026-07-28: keep the production gap score unchanged and keep
the experimental observed-demand composite in structural-only fallback.

| Candidate | Inputs | Current status | Appropriate use |
| --- | --- | --- | --- |
| Structural-only focus score | Census-based immigrant/language and Indigenous-specific concern dimensions | Active fallback for experimental V2 | Transparent comparison when observed coverage is insufficient |
| Historical synthetic V2 | 60% structural focus + 40% generated visitor-tag indicators | Reproducible demonstration only | Test formulas, schemas, and sensitivity; never production evidence |
| Web-observed candidate | Intended 60% structural focus + 40% exposure-normalized anonymous web behavior | 0 of 12 areas reviewable; observed weight forced to zero | Continue no-publish measurement until coverage and governance gates pass |
| Production gap score | Five-dimension structural vulnerability × accessibility deficit | Active in the Planner View | Current production prioritization |

The structural-only and 2026-07-28 web-candidate results are identical because
the coverage gate failed. The historical synthetic composite demonstrates how
materially ranks could move if an unrepresentative observed layer were used.

| Area | Structural-only score / rank | Synthetic V2 score / rank | Web candidate score / rank | Synthetic rank change |
| --- | ---: | ---: | ---: | ---: |
| Lachine | 58.99 / 1 | 50.75 / 1 | 58.99 / 1 | 0 |
| Parc Extension | 48.81 / 2 | 43.38 / 7 | 48.81 / 2 | -5 |
| Saint-Michel | 48.81 / 3 | 44.49 / 4 | 48.81 / 3 | -1 |
| Pointe-Saint-Charles | 42.08 / 4 | 49.78 / 2 | 42.08 / 4 | +2 |
| Verdun | 42.00 / 5 | 39.88 / 8 | 42.00 / 5 | -3 |
| Côte-des-Neiges | 39.81 / 6 | 43.97 / 5 | 39.81 / 6 | +1 |
| Montréal-Nord | 38.62 / 7 | 37.26 / 9 | 38.62 / 7 | -2 |
| Hochelaga | 38.52 / 8 | 46.51 / 3 | 38.52 / 8 | +5 |
| Plateau Mont-Royal | 34.17 / 9 | 33.54 / 10 | 34.17 / 9 | -1 |
| Ahuntsic | 33.96 / 10 | 43.67 / 6 | 33.96 / 10 | +4 |
| Rivière-des-Prairies | 19.29 / 11 | 28.89 / 11 | 19.29 / 11 | 0 |
| Westmount | 10.67 / 12 | 17.89 / 12 | 10.67 / 12 | 0 |

The synthetic run's mean absolute rank movement was 4.42 places when compared
with its structural reference in the full validation, with a maximum movement
of nine places. That material sensitivity is why generated encounters cannot
be used to set priorities.

## Web-observed candidate

Eligible version-2 events in `page_events` and `flyer_downloads` are
deduplicated and converted to an intent rate per 100 service impressions.
Publication requires every study area to have at least:

- 20 unique anonymous sessions;
- seven active days; and
- 20 service impressions.

Aggregates must also satisfy `k >= 5`. Raw session IDs are never written to the
private `database_visitor_tag` snapshot.

The no-publish workflow run on 2026-07-28 examined a 90-day window:

| Check | Result |
| --- | ---: |
| Input `page_events` | 2,681 |
| Input `flyer_downloads` | 115 |
| Eligible events before deduplication | 1,026 |
| Deduplicated demand rows | 32 |
| Reviewable areas | **0 of 12** |
| Production `gap_score` modified | **No** |
| Synthetic visitor tags used | **No** |
| Raw session IDs persisted | **No** |

Some events have strong volume but only one or two active days; several areas
have no qualifying exposure. Therefore `digital_demand_score` and
`v2_observed_score` remain null, `observed_weight` remains zero, and all
experimental rows use `structural_focus_only_web_observed_insufficient`.

Evidence:
[GitHub Actions run 30379195442](https://github.com/frondyff/comm_need_radar/actions/runs/30379195442).

## Coverage and bias limitations

- Website users are a self-selected subset of people who know about, can
  access, and choose to use this proof of concept.
- A service impression measures interface exposure, not service availability
  or unmet need.
- A download can reflect staff workflow, training, repeated testing, or
  interest on behalf of someone else.
- Low-volume areas are more sensitive to a few sessions and must remain
  suppressed.
- Area coverage, device access, language, referral practices, and outreach can
  systematically affect event volume.
- Current accessibility uses a centre layer and straight-line distance. It does
  not yet use transit time, capacity, waitlists, eligibility, hours, quality,
  or the full `services_master` directory in the score.
- The 12 areas are a review set, not a complete regional model.

## Publication decision required

Before any observed signal can affect the application, owners must separately
approve or reject:

1. the purpose and wording of the signal;
2. the event weights and coverage thresholds;
3. privacy authority, retention, and access controls;
4. a representative collection period and bias review;
5. how, if at all, the candidate changes a displayed score; and
6. a rebuilt production review with documented score and rank changes.

Until then, dry runs remain no-publish, production `gap_score` remains
unchanged, and structural-only fallback remains active.

Implementation and methodology details are in
[`scoring-metrics-guide.md`](reference/scoring/scoring-metrics-guide.md),
[`web-observed-demand-scoring.md`](reference/scoring/web-observed-demand-scoring.md), and
`scripts/build_web_observed_demand.py`.
