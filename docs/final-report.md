# Community Needs Radar — Final Technical Report

## Outcome

Community Needs Radar provides a production React/Vite dashboard for frontline
service discovery and area-level planning across 12 Montreal study areas. It
combines real census indicators, real administrative geometry, a canonical
3,664-row deduplicated service directory, transparent gap scoring, flyer
generation, a grounded assistant boundary, and automated production checks.

Production URL: https://comm-need-radar.vercel.app

## Architecture

- React/Vite browser application with Community and Planner views.
- Supabase read-only browser contract for app-ready area, gap, accessibility,
  and service tables.
- Server-only Vercel routes for grounded chatbot behavior and detailed private
  aggregate census retrieval.
- Python data, scoring, geospatial, and cloud-loading pipelines.
- GitHub Actions for unit, contract, browser, accessibility, visual,
  performance, security, load, deployment, promotion, and rollback checks.

## Real Data

- Statistics Canada 2021 Census Profile structural indicators.
- Ville de Montréal administrative boundaries, with a documented centroid
  partition for the two stable areas sharing one official borough.
- Public/open service sources consolidated into 4,255 source records and a
  canonical 3,664-row `services_master` frontend layer.
- Supabase `page_events` and `flyer_downloads` anonymous workflow analytics.

## Synthetic Or Experimental Data

- `database_visitor_tags.csv` contains synthetic, k-anonymized demonstration
  encounters.
- `observed_need_index` and `vulnerability_index_v2` therefore remain
  experimental.
- V2 does not feed the production gap score.
- Demo frontend constants remain only as a clearly labeled outage/offline
  fallback.

## Validation Results

- Real geometry: 12/12 scored areas match once; zero positive-area overlaps.
- Privacy: zero synthetic visitor-tag rows below `k >= 5`.
- Frontend: unit tests cover parsing, search, scoring labels, and invalid data.
- Browser tests cover role flows, search, card/service selection, real polygon
  selection, flyer/PDF, fallback, analytics, accessibility, and visual state.
- Production dependencies have no known high or critical vulnerabilities.
- The map chunk is approximately 155 KB; the 576 KB PDF engine is lazy-loaded
  and has a documented 600 KB budget.

## Known Limitations

- Observed-needs inputs are synthetic and must not drive operational decisions.
- V1/V2 weights require representative user/domain review.
- The 2.5 km accessibility threshold is straight-line distance, not travel
  time, capacity, eligibility, or availability.
- The study area is not the full Montreal CMA; unmatched out-of-study points
  are reported explicitly.
- Service details can change and should be confirmed with providers.
- Formal issue #12 user testing and workstream-owner handoff approval remain
  external completion gates.

## Recommended Next Decision

Keep the real structural census gap score in production and defer V2
integration until approved partner observed-needs data and representative
review are available.
