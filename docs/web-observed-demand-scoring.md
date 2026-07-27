# Web-Observed Demand Scoring

Status: experimental observed-needs input. It uses real anonymous website
behavior, replaces the synthetic observed materialization when published, and
does not modify the production `gap_score` or Census structural index.

## Data Flow

```text
page_events + flyer_downloads
  -> version/window/test/area validation
  -> daily session/service/category deduplication
  -> exposure-normalized digital demand
  -> k-anonymized database_visitor_tag snapshots
  -> observed_need_index.v2_observed_score
  -> vulnerability_index_v2 (60% structural + 40% observed)
```

`database_visitor_tag` stores one aggregate snapshot per area and reporting
window. For a web row:

- `k_anon_count` is the distinct anonymous-session count, never weighted points;
- `weighted_demand_total` is the accumulated event-weight total;
- `service_impression_count` is the exposure denominator;
- `digital_demand_score` is the coverage-gated 0–100 observed score;
- `source_type` is `web_behavior`;
- no raw session identifier is persisted.

The final area score remains in `observed_need_index.v2_observed_score`, and the
60/40 composite remains in `vulnerability_index_v2`.

## Eligible Signals

| Event | Weight | Interpretation |
| --- | ---: | --- |
| `service_impression` | 0 | Exposure denominator |
| `category_filter` | 0.25 | Eligible only with explicit area context |
| `map_opened` | 0.25 | Weak service engagement |
| `service_card_opened` | 1.00 | Service interest |
| `dist_location_selected` | 1.50 | Eligible only with explicit area context |
| `flyer_download` | 3.00 | Strong service-information intent |

`page_view`, demographic filters, raw search text, tests, version-1 events,
unknown areas, unsupported events, and rows without a session are excluded.
Area attribution uses `selected_area_id`, then `service_area_id`.

## Demand Calculation

```text
weighted_demand_total =
    0.25 × category filters
  + 0.25 × map opens
  + 1.00 × service-card opens
  + 1.50 × distribution selections
  + 3.00 × flyer downloads

intent_rate_per_100_impressions =
    weighted_demand_total / service impressions × 100
```

Only after every study area has at least 20 unique sessions, seven active days,
and 20 service impressions are area rates min-max scaled to the 0–100
`digital_demand_score`. That value becomes `v2_observed_score`.

```text
vulnerability_index_v2 =
    0.60 × mvp_focus_census_index
  + 0.40 × v2_observed_score
```

If any area fails coverage, every `v2_observed_score` is null and every V2 row
falls back to the structural focus score with an observed weight of zero.

## Privacy And Publication

- Analytics tables are insert-only for browser roles.
- `database_visitor_tag` remains private.
- Visitor-tag and category rows below `k=5` are never persisted.
- Repeated events count once per UTC day, source, event type, session, area,
  service, and category.
- Existing synthetic visitor tags are marked `synthetic_demonstration` and are
  never read or blended into this pipeline.
- The private `publish_web_observed_demand` database function atomically
  replaces the web visitor-tag snapshot, category materialization,
  `observed_need_index`, and `vulnerability_index_v2`.
- The browser-facing `gap_score` remains unchanged until a separate application
  integration decision is approved.

## Run

Secure CSV export:

```bash
python3 scripts/build_web_observed_demand.py \
  --page-events-csv /secure/page_events.csv \
  --flyer-downloads-csv /secure/flyer_downloads.csv \
  --as-of-date 2026-07-27
```

Supabase read and atomic publication:

```bash
VITE_SUPABASE_URL=... SUPABASE_SECRET_KEY=... \
python3 scripts/build_web_observed_demand.py \
  --from-supabase \
  --publish
```

Outputs are gitignored under `data/derived/web_observed_demand/`.

The migration is
`supabase/migrations/202607270001_web_observed_demand.sql`. The scheduled
workflow runs only when `WEB_OBSERVED_DEMAND_ENABLED` is exactly `true`; manual
dispatch remains available for a reviewed pilot run.
