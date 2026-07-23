# Production Deployment Verification — 2026-07-23

## Deployment

- Vercel project: `frondy-s-projects/comm-mvp`
- Production alias: https://comm-mvp.vercel.app
- Deployment ID: `dpl_7PPEZZM6UuqaJ1Q9XYdxXDjj6sF7`
- Immutable deployment URL:
  https://comm-2ovl2ubth-frondy-s-projects.vercel.app
- Vercel status: `READY`
- Region: `iad1`

## Release Gates

- `npm ci`: passed with a regenerated lockfile.
- `npm run build`: passed.
- `npm run typecheck:api`: passed.
- Boundary, dashboard-adapter, and chatbot client validators: passed.
- Production dependency audit: zero vulnerabilities.
- Python unit tests: 41 passed.
- Spatial validation: passed with 12/12 scored areas, zero multiple matches,
  and zero polygon overlaps.
- Live Supabase dashboard contract: 12 areas, 12 scores, 108 accessibility
  rows, 3,664 canonical services, and 12 covered boundary features.
- Live Supabase security contract: anonymous writes denied and raw/source
  objects inaccessible.

## Production Smoke Tests

- `GET /`: HTTP 200.
- `GET /api/chat`: HTTP 405, confirming the POST-only boundary.
- `POST /api/chat`: HTTP 200 with verified `A001` area context, bounded service
  IDs, calculated distances, and deterministic fallback metadata.
- Vercel functions deployed: `api/chat` and `api/events`.

## Environment And Limitations

- Browser configuration uses the public Supabase URL and publishable key.
- Server chatbot retrieval uses server-named Supabase variables.
- `LLM_API_KEY` is not configured. The assistant intentionally uses the
  deterministic grounded fallback and states this in its response metadata.
- Formal user testing under issue #12 is not yet complete.
- The V1/V2 product-label decision under issue #9 remains open.
- Production observed-needs replacement under issue #10 remains blocked on an
  approved privacy-protected partner dataset.
