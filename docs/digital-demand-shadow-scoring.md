# Digital Demand Shadow Scoring

Status: private experimental pipeline. It does not modify the production
`gap_score`, Census vulnerability index, map ranks, chatbot facts, or flyers.

## Purpose

The application records anonymous workflow analytics in `page_events` and
`flyer_downloads`. Version 2 adds short-lived session, service, area, category,
and source-view context so real product use can be evaluated as a digital
service-interest signal.

This signal measures behavior in this website. It is not a population estimate,
resident vulnerability measure, unique-client count, or substitute for an
approved partner encounter dataset.

## Eligible Signals

| Event | Weight | Interpretation |
| --- | ---: | --- |
| `service_impression` | 0 | Exposure denominator |
| `category_filter` | 0.25 | Weak category interest; eligible only with explicit area context |
| `map_opened` | 0.25 | Weak engagement with an area-attributed service result |
| `service_card_opened` | 1.00 | Service interest |
| `dist_location_selected` | 1.50 | Workflow intent; normally excluded because a distribution point is not a residence |
| `flyer_download` | 3.00 | Strong service-information intent |

`page_view`, role selection, demographic filters, raw search text, legacy
version-1 events, tests, unsupported events, unknown areas, and events without
an anonymous session do not contribute.

Area attribution uses explicit `selected_area_id` first and `service_area_id`
second. A distribution location is never treated as the user's home area.

## Privacy And Bias Controls

- The browser writes but cannot read either analytics table.
- The browser cannot read the dataset, area aggregate, or shadow-score tables.
- Session IDs are random, session-scoped, and contain no account or client ID.
- Search logging records `query_entered` or `query_empty`, not the query text.
- Repeated events are counted once per UTC day, source, event type, session,
  area, service, and category.
- Test rows and version-1 rows are excluded.
- Service impressions provide the exposure denominator.
- Areas without sufficient coverage fall back to the structural score.
- The digital weight is capped at 25%; the initial value is 15%.
- Published approval requires an owner and timestamp at the database level.

The default reviewable threshold is 20 unique sessions, seven active days, and
20 service impressions in each area. These are pilot thresholds, not proof of
statistical representativeness.

## Calculation

For each area in the rolling window:

```text
weighted_intent =
    0.25 × category filters
  + 0.25 × map opens
  + 1.00 × service-card opens
  + 1.50 × distribution selections
  + 3.00 × flyer downloads

intent_rate_per_100_impressions =
    weighted_intent / service_impressions × 100
```

Only after all 12 study areas are reviewable are their intent rates min-max
scaled to a 0–100 `digital_demand_score`. A partial geography produces
diagnostic counts and rates but no digital scores, preventing low-coverage
areas from changing the normalization range. The score then affects the
private shadow composite:

```text
priority_score_v2_shadow =
    0.85 × structural_vulnerability_score
  + 0.15 × digital_demand_score
```

Otherwise:

```text
priority_score_v2_shadow = structural_vulnerability_score
digital_weight = 0
```

## Data Flow

```text
page_events + flyer_downloads
  -> window/schema/test/area validation
  -> daily session/service/category deduplication
  -> exposure-normalized area aggregates
  -> coverage status
  -> private shadow composite
  -> quality artifact and optional private Supabase upsert
```

The migration is
`supabase/migrations/202607270001_digital_demand_shadow.sql`. It owns analytics
versioning, insert-only browser access, private provenance, aggregate, and
shadow-score tables.

## Run Locally From Secure Exports

Do not commit analytics exports.

```bash
python3 scripts/build_digital_demand_shadow.py \
  --page-events-csv /secure/page_events.csv \
  --flyer-downloads-csv /secure/flyer_downloads.csv \
  --as-of-date 2026-07-27
```

Outputs are gitignored under `data/derived/digital_demand/`:

- `digital_demand_area.csv`
- `priority_score_v2_shadow.csv`
- `quality_report.json`

## Run Against Supabase

After applying the migration:

```bash
VITE_SUPABASE_URL=https://PROJECT.supabase.co \
SUPABASE_SECRET_KEY=... \
python3 scripts/build_digital_demand_shadow.py \
  --from-supabase \
  --publish
```

The secret key remains server-only. The command performs deterministic upserts
using a dataset ID derived from the scoring version, reporting window, and
label. It never writes `gap_score`.

The `Digital Demand Shadow` workflow can be dispatched manually. Its weekly
schedule remains skipped until the repository variable
`DIGITAL_DEMAND_SHADOW_ENABLED` is exactly `true`.

## Promotion Decision

Issue #9 remains open. Before any application view uses this composite, owners
must review the quality artifact, geographic/exposure imbalance, rank changes,
weights, user interpretation, and collection duration, then record
approve/defer/reject.

Issue #10 also remains open. Web behavior is not an approved partner encounter
export and must not be described as visits, residents, clients, or total
community need.
