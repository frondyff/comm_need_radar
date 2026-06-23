# Community Needs Radar Frontend

Custom React frontend for the Community Needs Radar MVP.

## Stack

- Vite + React + TypeScript
- Tailwind CSS with shadcn-style primitives
- MapLibre GL JS using OpenStreetMap raster tiles
- deck.gl dependency reserved for advanced overlays such as hexbin, density, and route layers
- Papa Parse for browser-side CSV loading

## Run Locally

```bash
cd frontend
npm install
npm run dev
```

Open the localhost URL printed by Vite, usually `http://localhost:5173`.

## Data Contract

The frontend reads generated CSV files from `frontend/public/data/`:

- `area_profile.csv`
- `gap_score_table.csv`
- `accessibility_table.csv`
- `service_table.csv`
- `../geo/areas.geojson`

Regenerate the Python data pipeline first, then copy updated processed CSVs into
`frontend/public/data/` before deploying the frontend.

## Implemented Advanced Features

- Planner polygon choropleth layer with selectable gap, vulnerability, and
  access-deficit metrics.
- Polygon and marker click selection on the Planner map.
- Frontline radius catchment overlay on the nearby-service map.
- Frontline PDF handout flow through browser print/save-as-PDF.
- Geospatial analysis panel with catchment coverage, nearest walk-time estimate,
  low-access counts, and a service-point scenario uplift estimate.

The current polygon layer uses synthetic envelopes. Swap
`public/geo/areas.geojson` with real boundaries while preserving `area_id` to
keep joins working.
