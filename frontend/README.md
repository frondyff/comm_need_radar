# Community Radar — Frontend / Dashboard

A React web app for social workers and planners to find community services and generate printable flyers in Montréal.

---

## Quick start

**Requirements:** Node.js 18+ (download at [nodejs.org](https://nodejs.org))

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
```

---

## What's in here

```
frontend/
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
