# Custom Frontend Audit And Roadmap

Date: 2026-06-12

## Scope Audited

This audit covers the new customizable frontend under `frontend/`. The existing
Streamlit MVP remains intact and cloud-ready.

Implemented frontend stack:

- Vite, React, TypeScript, and Tailwind CSS.
- MapLibre GL JS for interactive maps.
- deck.gl dependencies available for future advanced map layers.
- Papa Parse for browser-side CSV loading.
- Processed CSV files copied into `frontend/public/data/`.

Implemented product surface:

- Planner mode with filters, priority metrics, clickable area map, access table,
  priority ranking, and local policymaker assistant.
- Frontline mode with postal/community search, vulnerability cards, Card Detail,
  nearby-service map, selected-service detail, and printable flyer text.
- Shared data utilities for score labels, distance calculation, postal lookup,
  vulnerability metadata, and deterministic assistant responses.

## Audit Score

| Area | Score | Notes |
| --- | ---: | --- |
| UX customizability | 8.3/10 | React structure gives much more control than Streamlit. UI is mode-specific and componentized. |
| Frontline workflow | 8.5/10 | Search, vulnerability cards, card detail, services, PDF handout flow, and radius service map are present. |
| Planner workflow | 8/10 | Planner now includes polygon choropleth controls, priority ranking, policy chat, and scenario analysis. |
| Geospatial capability | 7/10 | Synthetic polygon layer, polygon clicks, radius catchment, walk-time estimate, and scenario uplift are present. Still needs real boundaries and network travel time. |
| Data architecture | 6.5/10 | CSV plus GeoJSON contract is clear for MVP. Production should move toward GeoParquet/PMTiles plus validated API or static data build step. |
| Production readiness | 6/10 | Typecheck/build/audit pass. Still missing E2E tests, deployment config, auth, observability, and real data source governance. |

Overall: 7.4/10 for a custom frontend MVP. It is a good base for UX iteration,
but the next production lift should focus on geospatial depth, exports, and data
contracts.

## Current Gaps

- Area maps now include polygons, but the current polygons are synthetic
  envelopes. They must be replaced with real community or dissemination-area
  boundaries.
- Service access is still straight-line distance plus estimated walk time. It
  does not account for road network, transit, rivers, highways, or service
  capacity.
- PDF handout generation uses browser print/save-as-PDF. A future backend or
  `@react-pdf/renderer` flow can create files directly.
- The frontend reads CSV directly in the browser. This is fine for the current
  synthetic MVP, but real datasets will need stronger validation and versioning.
- No E2E tests currently verify mode switching, search, card click behavior, or
  map-marker selection.
- Map tiles depend on live OpenStreetMap raster tiles. For demos this is fine;
  production should consider tile caching or a documented tile provider policy.

## Feature Suggestions

### 1. PDF Handout Generator

Goal: let frontline users generate a polished referral handout from the selected
area, vulnerability type, radius, language, and nearby services.

Implemented:

- Frontline `Generate PDF` action uses browser print/save-as-PDF.
- Handout includes area, borough, selected vulnerability type, gap score,
  analysis focus, top services, contact fields, distance, generated date, and
  synthetic-data disclaimer.

Future upgrades:

- Add English/French templates as structured objects instead of inline strings.
- Add a QR code later for the selected service list or public page URL.
- Add direct PDF file generation if browser print is not enough.

Acceptance criteria:

- User can click `Generate PDF`.
- PDF includes the selected area and selected vulnerability detail.
- PDF includes no more than 5 nearby services sorted by distance.
- PDF displays the synthetic-data disclaimer.
- PDF can be generated without a backend.

### 2. Polygonal Map Layer

Goal: replace centroid-only area display with real polygon boundaries and
choropleth styling.

Implemented:

- Added `frontend/public/geo/areas.geojson` with one feature per `area_id`.
- Planner map renders MapLibre fill and line layers.
- Polygon clicks select an area and update the analysis panel.
- Choropleth can switch between gap score, vulnerability, and access deficit.
- Centroid markers remain as fallback anchors.

Future upgrades:

- Replace synthetic envelopes with real public boundary data.
- Add PMTiles if polygons become large.
- Add hover tooltip and legend bins by data quantile.

Open-source zero-cost options:

- GeoJSON for the first version.
- PMTiles later if polygons become large.
- Tippecanoe or `pmtiles` tooling for vector-tile packaging.
- Turf.js for client-side point-in-polygon, bbox, centroid, and buffer logic.

Acceptance criteria:

- Planner mode shows a colored polygon layer.
- Clicking a polygon selects the area and updates the analysis panel.
- Frontline search zooms to the matching polygon.
- Legend explains the selected metric and score ranges.
- Missing polygon data fails gracefully and still shows centroid markers.

### 3. Advanced Geospatial Analysis

Goal: move beyond straight-line distance and add analysis that supports better
policy decisions.

Implemented:

- Radius catchment overlay on the frontline service map.
- Catchment service count and service-category coverage.
- Nearest-service estimated walking time and travel-burden label.
- Low-access row count for the selected planner filter.
- Scenario estimate for adding a service point near the selected area centroid.

Future analysis upgrades:

- Network distance and travel time using OSRM, Valhalla, or OpenTripPlanner.
- Walking/transit catchments rather than fixed radius circles.
- Service capacity weighting, such as hours, eligibility, intake load, and
  language coverage.
- Spatial joins between real census geography, service points, and boundaries.
- H3 grid aggregation for privacy-preserving density and hotspot analysis.
- Scenario planning: simulate adding a service point and recalculate access
  impact.
- Equity diagnostics: compare high-vulnerability polygons with low-access
  service categories.

Suggested open-source stack:

- Python: GeoPandas, Shapely, PyProj, OSMnx, DuckDB Spatial.
- Database when needed: PostgreSQL + PostGIS.
- Frontend: MapLibre GL JS, deck.gl, Turf.js, PMTiles.
- Routing: OSRM or Valhalla for road-network travel time; OpenTripPlanner if
  transit schedules become available.
- Data format: GeoJSON for MVP, GeoParquet for processing, PMTiles for web map
  delivery.

Acceptance criteria:

- Accessibility scores can use travel time, not only haversine distance.
- Analysis can compare service categories by area and vulnerability type.
- A selected polygon shows nearest services, travel-time estimates, and score
  drivers.
- Scenario mode can estimate impact from a proposed service location.

## Suggested Build Order

1. Add PDF handout generation first. It is high value, low geospatial risk, and
   directly supports frontline workflows.
2. Add polygon GeoJSON support next. This unlocks better map UX and click-inside
   boundary behavior.
3. Add Turf.js spatial helpers for click, bbox, centroid, and simple buffers.
4. Add GeoPandas/DuckDB Spatial processing scripts to prepare real boundaries
   and polygon metrics.
5. Add network travel-time analysis after boundary joins are stable.
6. Add E2E tests for search, card clicks, map clicks, and PDF generation.

## Production Notes

- Keep Streamlit as the fast MVP/demo path.
- Use the custom React frontend as the production UX path.
- Do not put real private client data in browser-readable CSV files.
- Treat public boundary and census files as versioned data artifacts.
- Add a data dictionary for every new geospatial layer.
- Add provenance fields: source, date downloaded, license, transform script, and
  QA status.

## Immediate Next Tasks

- Replace synthetic `areas.geojson` envelopes with real public boundary data.
- Add a geospatial processing plan for real polygon joins and travel-time
  scoring.
- Add direct PDF generation or multilingual PDF templates if browser print is
  not enough.
- Add Playwright tests once PDF and polygon interactions exist.
