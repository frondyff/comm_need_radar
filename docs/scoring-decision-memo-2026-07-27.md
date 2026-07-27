# V1/V2 Scoring Decision Memo — 2026-07-27

**Decision: DEFER V2 application integration.**

V2 remains a valid experimental planning calculation and the intended formula
remains 60% structural focus plus 40% observed demand. It must not feed the
production `gap_score` or change application priority views until observed-data
coverage, source authorization, and owner review are complete.

## Decision statement

- `page_events` and `flyer_downloads` are anonymous digital-demand signals only.
  They are not resident need, 211 encounters, partner encounters, or a measure
  of unique people.
- The production application continues to use the real Census-derived
  structural data and existing `gap_score`.
- The web-observed pipeline remains dry-run/no-publish by default.
- The structural-only fallback remains active whenever any study area fails the
  observed-data coverage gate.
- No raw session identifier is persisted, and no visitor aggregate below
  `k >= 5` may be stored.
- Reconsider V2 application integration only after an approved/reusable
  observed-needs source, representative domain review, and a complete 12-area
  coverage review.

## Compared score layers

| Layer | Definition | Current status | Application effect |
| --- | --- | --- | --- |
| Structural-only | `mvp_focus_census_index` from real Statistics Canada-derived area indicators | Reviewable for all 12 areas | Current production planning basis; structural fallback |
| Current synthetic V2 | `0.60 × structural + 0.40 × synthetic observed` | Demonstration fixture only; all 12 rows have synthetic observed values | Not used by production `gap_score` |
| Web-observed candidate | Version-2 `page_events` and `flyer_downloads`, exposure-normalized and coverage-gated | 16 eligible events; 0/12 reviewable areas; candidate falls back to structural-only | Not published; no production score change |

## Score and rank comparison

Structural-only and the current web candidate have the same score because the
web candidate did not pass the all-area gate. The synthetic fixture produces
material rank movement relative to that structural baseline.

| Area | Structural-only | Structural rank | Synthetic V2 | Synthetic rank | Synthetic rank shift |
| --- | ---: | ---: | ---: | ---: | ---: |
| A008 Lachine | 58.99 | 1 | 50.75 | 1 | 0 |
| A001 Parc Extension | 48.81 | 2 | 43.38 | 7 | +5 |
| A002 Saint-Michel | 48.81 | 3 | 44.49 | 4 | +1 |
| A011 Pointe-Saint-Charles | 42.08 | 4 | 49.78 | 2 | -2 |
| A006 Verdun | 42.00 | 5 | 39.88 | 8 | +3 |
| A003 Cote-des-Neiges | 39.81 | 6 | 43.97 | 5 | -1 |
| A004 Montreal-Nord | 38.62 | 7 | 37.26 | 9 | +2 |
| A005 Hochelaga | 38.52 | 8 | 46.51 | 3 | -5 |
| A010 Plateau Mont-Royal | 34.17 | 9 | 33.54 | 10 | +1 |
| A007 Ahuntsic | 33.96 | 10 | 43.67 | 6 | -4 |
| A012 Riviere-des-Prairies | 19.29 | 11 | 28.89 | 11 | 0 |
| A009 Westmount | 10.67 | 12 | 17.89 | 12 | 0 |

Synthetic V2 has a mean absolute rank shift of 2.0 places and a maximum shift
of 5 places versus the structural baseline. The web candidate has zero observed
component and therefore no score movement; its deterministic tie ordering keeps
the same practical ranking as structural-only.

## Coverage and bias limitations

The latest no-publish dry run (`2026-07-27`) reported:

- 97 `page_events` and 3 `flyer_downloads` in the 90-day input window;
- 16 eligible version-2 events;
- 74 legacy/unversioned rows excluded;
- 10 rows excluded for missing or unknown area;
- activity represented only A001 and A003;
- 0 of 12 study areas reviewable;
- 0 persisted `database_visitor_tag` rows because privacy and coverage floors
  were not met;
- quality status `experimental` and `publish_requested=false`.

These events describe anonymous website interaction and exposure, not resident
prevalence. The observed layer can be biased by device access, language,
awareness of the site, repeat browsing, service discoverability, and uneven
area attribution. The synthetic fixture is not evidence of current community
demand and its rank movement is demonstration sensitivity only.

## Required re-review gate

Re-open the V2 integration decision after all of the following are documented:

1. an authorized/reusable observed-needs source or an approved structured
   first-party collection design;
2. representative domain review of weights and thresholds;
3. every study area meets at least 20 unique sessions, 7 active days, and 20
   service impressions for the web signal, with `k >= 5` persistence;
4. score/rank sensitivity and coverage bias are reviewed;
5. Chloe records a new approve, defer, or reject decision.

Until then, production `gap_score` and application priorities remain unchanged.
