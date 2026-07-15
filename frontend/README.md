# Community Radar — Frontend / Dashboard

A React web app for social workers and planners to find community services and generate printable flyers in Montréal.

---

## Quick start

**Requirements:** Node.js 22.12+ (download at [nodejs.org](https://nodejs.org))

```bash
cd frontend
npm install
npm run dev
```

Then open **http://localhost:5173** in your browser.

The Planner map loads the committed `public/geo/areas.geojson` artifact. Validate
its feature IDs, geometry types, attribution, and payload size before publishing:

```bash
npm run validate:boundaries
npm run validate:dashboard-adapter
npm run validate:supabase-dashboard
```

Copy `.env.example` to `.env` and set the public Supabase project URL and
publishable key. The dashboard then loads services and planner scores from the
public tables; missing configuration or a failed query falls back to demo data.

Vercel server routes live under `api/`. `/api/events` is the dashboard's
same-origin telemetry boundary and currently acknowledges events without
persisting personal data. `/api/chat` is a server-side, evidence-validated
chatbot scaffold with a deterministic fallback. It is not yet connected to the
dashboard chat input or validated in a Vercel preview, so it does not complete
issue #14 by itself. Configure its non-`VITE_*` variables only in the Vercel
server environment.

Typecheck the server routes before deployment:

```bash
npm run typecheck:api
```

---

## What's in here

```
frontend/
├── api/                     ← Vercel server routes
├── public/geo/areas.geojson  ← Versioned planning-area boundaries
├── scripts/validate-boundaries.mjs
├── src/
    ├── main.jsx
│   └── App.jsx        ← All UI logic lives here (single file)
├── index.html
├── package.json
└── vite.config.js
```

You only need to edit **`App.jsx`** for most changes.

---

## Features

### V1 — Community View (Social Workers)
- Search and filter nearby services by group, gender, age, and category
- View services on a real Montréal map (Leaflet)
- Select a distribution point (TBC)
- Generate and download a printable PDF flyer with a real map and "You are here" marker
- EN / FR language toggle

### V2 — Planner View (Funders / Policymakers)
- Real Montréal borough choropleth map colored by Gap Score
- Click a borough to see its area profile (income, housing, immigration)
- Top priority areas ranking
- Service locations map
- Chatbot input for area-specific questions

---

## Updating the service data (TBC)

Replace the data with real data once it's available.

---

## Updating distribution points (TBC)

Add or remove entries here once the actual distribution sites are confirmed.

---

## Dependencies

| Package | Purpose |
|---|---|
| `react` + `react-dom` | UI framework |
| `react-leaflet` + `leaflet` | Maps (V1 service map, V2 choropleth, flyer preview) |
| `jspdf` | PDF generation |
| `html2canvas` | Screenshot-based PDF flyer export |
| `lucide-react` | Icons (e.g., Radar, LocateFixed) |

Install everything with `npm install`.

---

## McGill University · BUSA 649 · Team Next Level
