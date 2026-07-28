# V1 Community View

## Purpose

V1 helps a frontline worker or resident find relevant community services and
leave with a printable referral flyer. It is a discovery aid, not a
case-management, eligibility, or emergency-response system.

Production: [comm-need-radar.vercel.app](https://comm-need-radar.vercel.app)

## User flow

1. Open **Community View**.
2. Choose one of the nine curated distribution locations.
3. Filter services by category, population group, gender, or age.
4. Review the matching list and Montréal map.
5. Open a service card and confirm its contact details.
6. Generate an English or French flyer.
7. Download the PDF, which includes the selected service, the distribution
   location, a map, and nearby alternatives.

The interface marks content that does not have a French translation rather
than silently presenting it as translated.

## Runtime data

| Source | Use in V1 |
| --- | --- |
| `services_master` | Service name, category, address, contact details, coordinates, area, and audience filters |
| Curated distribution locations in the frontend | Starting locations for referral and flyer context; not treated as residence |
| `page_events` | Anonymous interaction events and service impressions |
| `flyer_downloads` | One anonymous event for a completed flyer download |

`services_master` contains 3,664 deduplicated records assembled by the project
pipeline from the publicly distributed 211 Greater Montréal directory PDF and
other public/open service sources. A listing should still be confirmed directly
with its provider before making a referral.

## Analytics contract

The browser uses the public Supabase key and can only insert analytics rows. It
cannot read the analytics tables. A random `anonymous_session_id` is scoped to
the browser session and is used for deduplication; it is not a user account or
a persistent resident identifier.

`page_events` records supported interaction types such as:

- service impressions;
- category-filter selections with explicit area context;
- map opens;
- service-card opens; and
- distribution-location selections with explicit area context.

`flyer_downloads` records the selected service, active filters, flyer language,
source view, explicit area fields, anonymous session, contract version, and
test flag. Downloads continue even if analytics writing fails.

Neither table should contain client names, contact details, free text, precise
home locations, protected case details, or authentication data. Version-1,
test, unsupported, sessionless, and unknown-area rows are excluded from the
experimental observed-demand pipeline.

## What analytics mean

These rows measure use of this website. They may indicate interest in a service
category, but they are not resident need, service-provider encounters, 211
calls, waitlists, or population prevalence.

The offline web-observed candidate weights eligible events as follows:

| Event | Weight |
| --- | ---: |
| Service impression | 0.00 (exposure denominator) |
| Category filter | 0.25 |
| Map opened | 0.25 |
| Service card opened | 1.00 |
| Distribution location selected | 1.50 |
| Flyer downloaded | 3.00 |

The candidate pipeline applies daily deduplication, `k >= 5`, and minimum
coverage gates. Its output is private and experimental. V1 actions do not
change the production `gap_score`.

## Run and validate V1

```bash
cd frontend
npm ci
npm run dev
```

For the real Supabase-backed mode, set the public variables shown in
[`frontend/.env.example`](../frontend/.env.example). Never expose
`SUPABASE_SECRET_KEY` to browser code.

Relevant automated checks:

```bash
npm run test:unit
npm run test:flyer
npm run validate:dashboard-adapter
npm run validate:supabase-dashboard
npm run validate:supabase-analytics-writes
npm run build
```

The Supabase validations require the documented environment variables and
appropriate test credentials. Production browser coverage is described in
[`reference/operations/production-testing.md`](reference/operations/production-testing.md).

## Assumptions and limitations

- Search results are only as current and complete as `services_master`.
- Category and audience labels are project classifications and may simplify a
  provider's actual mandate.
- Straight-line proximity is not the same as a practical trip.
- Distribution locations are referral starting points, not inferred homes.
- A flyer is informational; the user must confirm availability, eligibility,
  hours, accessibility, language, and emergency suitability.
- Current usage coverage is too limited and potentially biased to be treated as
  area-level community demand.

Implementation entrypoints:
`frontend/src/App.jsx`, `frontend/src/lib/supabaseData.js`,
`frontend/src/lib/analytics.js`, and `frontend/src/flyer/`.
