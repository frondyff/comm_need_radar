# Community Radar — Frontend / Dashboard

A React web app for social workers and planners to find community services and generate printable flyers in Montréal.

---

**Production:** https://comm-need-radar.vercel.app

## Quick start

**Requirements:** Node.js 22+ (download at [nodejs.org](https://nodejs.org))

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
publishable key:

```
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your-anon-key
```

`.env` is gitignored, every teammate needs their own local copy. The dashboard
loads real services and planner scores from Supabase; missing configuration or
a failed query silently falls back to demo data so the app never shows a blank
screen. The header shows **"Supabase"** or **"Demo data"** depending on which
source is actually active.

---

## What's in here

```
frontend/
├── public/geo/areas.geojson         ← Versioned planning-area boundaries (V2 choropleth)
├── scripts/validate-boundaries.mjs
├── src/
│   ├── main.jsx
│   ├── App.jsx                      ← Main UI: V1 (Community View) + V2 (Planner View)
│   ├── components/
│   │   └── serviceVisuals.jsx       ← Category colors/icons, map marker builders
│   ├── flyer/
│   │   ├── FlyerPreview.jsx         ← The flyer's on-screen layout
│   │   ├── FlyerPdfExporter.js      ← Screenshots the preview into a PDF
│   │   ├── flyerData.js             ← "Also nearby" sorting, PDF filename
│   │   └── flyerStyles.js           ← Shared flyer colors/dimensions
│   └── lib/
│       ├── supabaseData.js          ← Supabase client + raw table loading
│       ├── dashboardAdapter.js      ← Maps raw Supabase rows → the shapes the UI uses
│       └── analytics.js             ← Writes to flyer_downloads / page_events
├── index.html
├── package.json
└── vite.config.js
```

Most feature work happens in **`App.jsx`**, but data-shape changes (new
columns, renamed tables, new filters) usually start in **`lib/dashboardAdapter.js`**.

---

## Features

### V1 — Community View (Social Workers)
- Search and filter nearby services by group, gender, age, and category
  (Shelter / Food / Medical / Legal / Translation are quick chips; everything
  else (~15 more real categories) is in the "Other" dropdown, searchable)
- View services on a real Montréal map (Leaflet), with a distinct "You are
  here" pin marking the selected distribution point
- Select a distribution point from 9 real locations (see below)
- Generate and download a printable PDF flyer with a real map, "You are here"
  marker, and the 2 nearest other services (sorted by actual distance)
- EN / FR language toggle (content without a French translation in the DB is
  clearly flagged, not silently shown in English)

### V2 — Planner View (Funders / Policymakers)
- Real Montréal borough choropleth map colored by Gap Score
- Click a borough (or an area in the Top Priority list) to see its full
  profile: income/housing/immigration breakdown, rank, priority flag, a
  bilingual plain-language summary, and key drivers
- Top priority areas ranked by real Gap Score
- Service locations map, filtered to the selected area (falls back to the
  whole borough if that specific area has no services tagged yet)
- Chatbot input for area-specific questions (UI only — not wired to a backend yet)

---

## Data sources (Supabase)

| Table | Used for |
|---|---|
| `services_master` | V1 service directory — name, category, address, contact info, filters (group/gender/age) |
| `gap_score` | V2 choropleth + area profiles — gap score, rank, priority flag, drivers, bilingual summary |
| `area_profile` | Income / housing / immigration indicators per area |
| `accessibility` | Service-access metrics per area |
| `flyer_downloads` | Analytics — one row per flyer download, with the filters active at the time |
| `page_events` | Analytics — passive events (page view, filter clicked, map opened, etc.) |

All tables need Row Level Security policies granting the `anon` role `SELECT`
(for the four data tables) or `INSERT` (for the two analytics tables), plus a
matching `GRANT` — RLS policies alone aren't enough on tables where the
default privilege grants were revoked. See `lib/supabaseData.js` and
`lib/analytics.js` for the exact table/column names expected.

---

## Data collection / Analytics

Two Supabase tables passively log usage, both are **insert-only from the
front end** (no personal or identifying data about the social worker or any
client is ever recorded, and the app can't read its own analytics back).

### Table `flyer_downloads` — one row every time someone clicks "Download flyer"

| Column | What it captures |
|---|---|
| `created_at` | Timestamp (auto) |
| `group_filter` | Active Group filter(s) at time of download, e.g. `["Indigenous"]` |
| `gender_filter` | Active Gender filter |
| `age_filter` | Active Age filter(s) |
| `category_filter` | Active Category filter(s) (both the 5 quick chips and any picked from "Other") |
| `service_id` / `service_name` / `service_category` | Which service the flyer was for |
| `distribution_location` | Which of the 9 distribution points was selected |
| `flyer_language` | EN or FR |

This is what lets us answer "which groups are social workers prioritizing
when they hand out flyers" — e.g. filtering `flyer_downloads` by
`group_filter` over time.

### Table `page_events` — one row per interaction, including browse-only sessions

Captures visitors who never click "Generate flyer" (e.g. someone just
scrolling/screenshotting), via the existing `logEvent()` calls already spread
through `App.jsx` — no new call sites needed when adding an event, since every
existing `logEvent(type, detail, meta)` call now writes here automatically.

| Column | What it captures |
|---|---|
| `created_at` | Timestamp (auto) |
| `event_type` | `page_view`, `group_filter`, `age_filter`, `category_filter`, `other_category_filter`, `search`, `map_opened`, `role_selected`, `service_card_opened`, `dist_location_selected` |
| `detail` | The specific value for that event (e.g. which category was clicked) |
| `location` | Distribution point selected at the time, if any |

`page_view` fires once per app load (on mount), before the person has clicked
anything.

### Implementation

Both write through `src/lib/analytics.js` (`logFlyerDownload()` /
`logPageEvent()`), reusing the single shared Supabase client from
`src/lib/supabaseData.js` (`getSupabaseClient()`). Failures are caught and
logged to the console only — a broken analytics write never blocks a flyer
download or breaks the UI.

### Required Supabase setup

```sql
create table public.flyer_downloads (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  group_filter text[] default '{}',
  gender_filter text,
  age_filter text[] default '{}',
  category_filter text[] default '{}',
  service_id text,
  service_name text,
  service_category text,
  distribution_location text,
  flyer_language text
);

create table public.page_events (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  event_type text not null,
  detail text,
  location text
);

alter table public.flyer_downloads enable row level security;
alter table public.page_events enable row level security;

create policy "Allow public insert" on public.flyer_downloads for insert to anon with check (true);
create policy "Allow public insert" on public.page_events for insert to anon with check (true);

grant insert on public.flyer_downloads to anon, authenticated;
grant insert on public.page_events to anon, authenticated;
```

Deliberately **no `SELECT` policy** for `anon` on either table — the front
end should only ever be able to write analytics, never read them back. To
actually analyze the data, query these tables directly in the Supabase
dashboard (or with the `service_role` key from a trusted backend), not
through the public client used by the app.

---



`DIST_LOCATIONS` in `App.jsx` holds the flyer drop-off points shown in the
"select a location" screen and used as the "You are here" pin.

**How they were picked:** we pulled the live Top 5 highest-Gap-Score areas
from `gap_score` and chose one to two real, currently-operating
service/government locations in or near each one — mixing CLSCs, borough/
federal government offices, and community organizations rather than one
single type:

| Gap Score rank | Area | Distribution point(s) |
|---|---|---|
| 1 | Côte-des-Neiges | CLSC de Côte-des-Neiges · CLSC Côte-des-Neiges (Outremont site) |
| 2 | Saint-Michel | Carrefour populaire de Saint-Michel |
| 3 | Parc-Extension | Maison de la culture de Parc-Extension · Service Canada Centre — Parc-Extension |
| 4 | Montréal-Nord | CLSC de Montréal-Nord (Nord-Est) · Carrefour jeunesse-emploi Bourassa-Sauvé |
| 5 | Westmount | Contactivity Centre · Westmount Public Library |

That's 9 points total (Bureau Accès Montréal — VSP was considered for
Saint-Michel but removed to avoid duplicating the borough hall's coverage of
Parc-Extension). Coordinates were confirmed manually via Google Maps for
accuracy — the pin address is only as good as the lat/lng, so always verify
new entries the same way rather than approximating from memory.

**To add or change a location**, edit the `DIST_LOCATIONS` array in `App.jsx`:

```js
{ id:"unique-id", name:"Display name", org:"Organization type", address:"Full street address", lat:xx.xxxxx, lng:xx.xxxxx }
```

If the Top 5 Gap Score areas change as more rows are added to `gap_score`,
revisit this list, it's a manual/curated set, not auto-generated from the
live data.

---

## Dependencies

| Package | Purpose |
|---|---|
| `react` + `react-dom` | UI framework |
| `react-leaflet` + `leaflet` | Maps (V1 service map, V2 choropleth, flyer preview) |
| `@supabase/supabase-js` | Supabase client (data loading + analytics writes) |
| `jspdf` | PDF generation |
| `html2canvas` | Screenshot-based PDF flyer export |
| `lucide-react` | Icons (e.g., Radar, LocateFixed) |

Install everything with `npm install`.

The production build splits maps, Supabase, and PDF generation into separate
chunks. The PDF engine has a 600 KB budget and is loaded only when a user asks
to download a flyer; it is not part of the initial application bundle.

---

## McGill University · BUSA 649 · Team Next Level
